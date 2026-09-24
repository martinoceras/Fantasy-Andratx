import { createClient } from '@supabase/supabase-js'
import {
  FUTBOLFANTASY_OFFICIAL_POINTS_URL,
  FUTBOLFANTASY_OFFICIAL_GAME_KEY,
  extractOfficialPlayerRows,
  extractOfficialSeasonId,
  createOfficialPlayerMatcher,
  buildOfficialPlayerDetailUrl,
  extractOfficialPlayerGameweekPoints,
} from '../../../../lib/futbolfantasyAnalytics.js'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const DETAIL_CONCURRENCY = 1
const DETAIL_RETRIES = 4
const DETAIL_PAUSE_MS = 220
const DETAIL_TIMEOUT_MS = 15000

async function getActiveJornada(origin) {
  try {
    const res = await fetch(`${origin}/api/gameweek-status`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    const activeWeek = Number(json?.activeWeek)
    if (res.ok && json?.ok && Number.isInteger(activeWeek) && activeWeek > 0) return activeWeek
  } catch {
    // fallback abajo
  }
  return 1
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const totalWorkers = Math.max(1, Math.min(limit, items.length || 1))
  await Promise.all(Array.from({ length: totalWorkers }, () => worker()))
  return results
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOfficialDetail(sourceId, seasonId) {
  let lastError = null

  for (let attempt = 0; attempt <= DETAIL_RETRIES; attempt += 1) {
    try {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(DETAIL_TIMEOUT_MS)
        : undefined

      const res = await fetch(buildOfficialPlayerDetailUrl(sourceId, seasonId, FUTBOLFANTASY_OFFICIAL_GAME_KEY), {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html,application/xhtml+xml',
          Referer: FUTBOLFANTASY_OFFICIAL_POINTS_URL,
          'Accept-Language': 'es-ES,es;q=0.9,ca;q=0.8,en;q=0.7',
        },
        ...(signal ? { signal } : {}),
      })

      if (!res.ok) {
        const retryAfter = Number(res.headers.get('retry-after'))
        if (res.status === 429 && attempt < DETAIL_RETRIES) {
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1000 * Math.min(8, 2 ** attempt)
          await sleep(waitMs)
          throw new Error(`Detall jugador ${sourceId}: HTTP 429, reintentant`)
        }
        throw new Error(`Detall jugador ${sourceId}: HTTP ${res.status}`)
      }

      const html = await res.text()
      const rows = extractOfficialPlayerGameweekPoints(html, FUTBOLFANTASY_OFFICIAL_GAME_KEY)
      if (!rows.length) {
        throw new Error(`Detall jugador ${sourceId}: sense jornades vàlides`)
      }

      if (attempt > 0) await sleep(DETAIL_PAUSE_MS)
      return rows
    } catch (error) {
      lastError = error
      if (attempt < DETAIL_RETRIES) {
        await sleep(DETAIL_PAUSE_MS * (attempt + 1))
      }
    }
  }

  throw lastError || new Error(`No s'ha pogut carregar el detall del jugador ${sourceId}`)
}

export async function GET(request) {
  try {
    const reqUrl = new URL(request.url)
    const jornadaQuery = Number(reqUrl.searchParams.get('jornada'))
    const jornada = Number.isInteger(jornadaQuery) && jornadaQuery > 0
      ? jornadaQuery
      : await getActiveJornada(reqUrl.origin)

    const [pageRes, playersRes] = await Promise.all([
      fetch(FUTBOLFANTASY_OFFICIAL_POINTS_URL, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'text/html,application/xhtml+xml',
          Referer: FUTBOLFANTASY_OFFICIAL_POINTS_URL,
          'Accept-Language': 'es-ES,es;q=0.9,ca;q=0.8,en;q=0.7',
        },
      }),
      supabaseAdmin.from('players').select('id, nombre, posicion, equipo_real, foto').order('nombre'),
    ])

    if (!pageRes.ok) {
      return Response.json({ ok: false, error: `Error carregant FutbolFantasy oficial (${pageRes.status})` }, { status: 502 })
    }

    if (playersRes.error) {
      return Response.json({ ok: false, error: playersRes.error.message }, { status: 500 })
    }

    const html = await pageRes.text()
    const rows = extractOfficialPlayerRows(html)
    const seasonId = extractOfficialSeasonId(html)
    const players = playersRes.data || []
    const matcher = createOfficialPlayerMatcher(players)
    const usedIds = new Set()

    if (!rows.length) {
      return Response.json({ ok: false, error: 'La font oficial no ha retornat cap jugador vàlid' }, { status: 502 })
    }

    if (!Number.isInteger(seasonId) || seasonId <= 0) {
      return Response.json({ ok: false, error: 'No s\'ha pogut detectar la temporada oficial de FutbolFantasy' }, { status: 502 })
    }

    const puntsMapa = Object.fromEntries(players.map((player) => [player.id, 0]))
    const unmatched = []
    const matchedRows = []

    for (const row of rows) {
      const player = matcher.matchRow(row, usedIds)
      if (!player) {
        unmatched.push(`${row.nombre}${row.equipoReal ? ` (${row.equipoReal})` : ''}`)
        continue
      }
      usedIds.add(Number(player.id))
      matchedRows.push({
        playerId: player.id,
        nom: player.nombre,
        puntsTotals: Number(row.puntsTotals || 0),
        source: row.nombre,
        sourceId: row.sourceId,
      })
    }

    const detailErrors = []
    const detailResults = await mapWithConcurrency(matchedRows, DETAIL_CONCURRENCY, async (matchedRow) => {
      try {
        const detailRows = await fetchOfficialDetail(matchedRow.sourceId, seasonId)
        const selectedJornadaRow = detailRows.find((detailRow) => detailRow.jornada === jornada)
        puntsMapa[matchedRow.playerId] = Number(selectedJornadaRow?.punts || 0)
        return {
          ...matchedRow,
          detailRows,
        }
      } catch (error) {
        detailErrors.push({
          playerId: matchedRow.playerId,
          sourceId: matchedRow.sourceId,
          nom: matchedRow.nom,
          error: error?.message || 'Error desconegut carregant detall',
        })
        await sleep(DETAIL_PAUSE_MS)
        return {
          ...matchedRow,
          detailRows: [],
        }
      }
    })

    const filesMap = new Map()
    const jornadesImportades = new Set()
    for (const result of detailResults) {
      for (const detailRow of result.detailRows || []) {
        const key = `${result.playerId}:${detailRow.jornada}`
        filesMap.set(key, {
          player_id: Number(result.playerId),
          jornada: Number(detailRow.jornada),
          punts: Number.isFinite(Number(detailRow.punts)) ? Number(detailRow.punts) : 0,
        })
        jornadesImportades.add(Number(detailRow.jornada))
      }
    }

    const files = [...filesMap.values()]

    if (!files.length) {
      return Response.json({
        ok: false,
        error: detailErrors[0]?.error || 'No s\'ha pogut importar cap puntuació per jornada',
        detailErrors: detailErrors.slice(0, 20),
      }, { status: 502 })
    }

    const { error: puntsError } = await supabaseAdmin
      .from('player_punts')
      .upsert(files, { onConflict: 'player_id,jornada' })

    if (puntsError) {
      return Response.json({ ok: false, error: puntsError.message }, { status: 500 })
    }

    const importedAt = new Date().toISOString()
    try {
      const logs = [...jornadesImportades].map((jornadaItem) => ({
        jornada: jornadaItem,
        imported_at: importedAt,
        imported_by: 'import-futbolfantasy-official',
        source: 'futbolfantasy-official',
      }))

      const { error: logError } = await supabaseAdmin
        .from('gameweek_points_import_log')
        .upsert(logs, { onConflict: 'jornada' })

      if (logError) {
        console.warn('[import-futmondo-points] No s\'ha pogut registrar la darrera importació:', logError.message)
      }
    } catch (logErr) {
      console.warn('[import-futmondo-points] Error registrant darrera importació:', logErr?.message || logErr)
    }

    return Response.json({
      ok: true,
      source: 'futbolfantasy-official',
      column: 'Punts per jornada Futmondo Prensa',
      seasonId,
      jornada,
      importedAt,
      saved: files.length,
      matched: matchedRows.length,
      playersWithDetail: detailResults.filter((item) => (item.detailRows || []).length > 0).length,
      importedJornades: [...jornadesImportades].sort((a, b) => a - b),
      totalRows: rows.length,
      totalPlayers: players.length,
      defaultedToZero: Math.max(0, players.length - detailResults.filter((item) => (item.detailRows || []).some((detailRow) => detailRow.jornada === jornada)).length),
      unmatched: unmatched.length,
      unmatchedSample: unmatched.slice(0, 20),
      detailErrors: detailErrors.length,
      detailErrorsSample: detailErrors.slice(0, 20),
      puntsMapa,
      matchedRows,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'Error important punts des de FutbolFantasy oficial' }, { status: 500 })
  }
}












