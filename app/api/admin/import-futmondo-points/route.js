import { createClient } from '@supabase/supabase-js'
import {
  FUTBOLFANTASY_OFFICIAL_POINTS_URL,
  extractOfficialPlayerRows,
  createOfficialPlayerMatcher,
} from '../../../../lib/futbolfantasyAnalytics.js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

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
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml' },
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
    const players = playersRes.data || []
    const matcher = createOfficialPlayerMatcher(players)
    const usedIds = new Set()

    if (!rows.length) {
      return Response.json({ ok: false, error: 'La font oficial no ha retornat cap jugador vàlid' }, { status: 502 })
    }

    const puntsMapa = Object.fromEntries(players.map((player) => [player.id, null]))
    const unmatched = []
    const matchedRows = []

    for (const row of rows) {
      const player = matcher.matchRow(row, usedIds)
      if (!player) {
        unmatched.push(`${row.nombre}${row.equipoReal ? ` (${row.equipoReal})` : ''}`)
        continue
      }
      usedIds.add(Number(player.id))
      puntsMapa[player.id] = Number(row.puntsTotals || 0)
      matchedRows.push({
        playerId: player.id,
        nom: player.nombre,
        punts: Number(row.puntsTotals || 0),
        source: row.nombre,
        sourceId: row.sourceId,
      })
    }

    // FutbolFantasy exposa punts acumulats de temporada. Per guardar punts de jornada,
    // restem el que el jugador ja portava acumulat fins la jornada anterior.
    const acumulatAnteriorPerPlayer = {}
    if (jornada > 1) {
      const { data: puntsAnteriors } = await supabaseAdmin
        .from('player_punts')
        .select('player_id, punts')
        .lt('jornada', jornada)

      ;(puntsAnteriors || []).forEach((row) => {
        const key = String(row.player_id)
        acumulatAnteriorPerPlayer[key] = Number(acumulatAnteriorPerPlayer[key] || 0) + Number(row.punts || 0)
      })
    }

    const files = Object.entries(puntsMapa).map(([player_id, puntsAcumulats]) => {
      const key = String(player_id)
      const acumulatAnterior = Number(acumulatAnteriorPerPlayer[key] || 0)
      const acumulatActual = puntsAcumulats === null ? acumulatAnterior : Number(puntsAcumulats || 0)
      const puntsJornada = acumulatActual - acumulatAnterior
      return {
        player_id: Number(player_id),
        jornada,
        punts: Number.isFinite(puntsJornada) ? puntsJornada : 0,
      }
    })

    const { error: puntsError } = await supabaseAdmin
      .from('player_punts')
      .upsert(files, { onConflict: 'player_id,jornada' })

    if (puntsError) {
      return Response.json({ ok: false, error: puntsError.message }, { status: 500 })
    }

    const importedAt = new Date().toISOString()
    try {
      const { error: logError } = await supabaseAdmin
        .from('gameweek_points_import_log')
        .upsert({
          jornada,
          imported_at: importedAt,
          imported_by: 'import-futbolfantasy-official',
          source: 'futbolfantasy-official',
        }, { onConflict: 'jornada' })

      if (logError) {
        console.warn('[import-futmondo-points] No s\'ha pogut registrar la darrera importació:', logError.message)
      }
    } catch (logErr) {
      console.warn('[import-futmondo-points] Error registrant darrera importació:', logErr?.message || logErr)
    }

    return Response.json({
      ok: true,
      source: 'futbolfantasy-official',
      column: 'Punts totals Futmondo Prensa',
      jornada,
      importedAt,
      saved: files.length,
      matched: matchedRows.length,
      totalRows: rows.length,
      totalPlayers: players.length,
      defaultedToZero: Math.max(0, players.length - matchedRows.length),
      unmatched: unmatched.length,
      unmatchedSample: unmatched.slice(0, 20),
      puntsMapa,
      matchedRows,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'Error important punts des de FutbolFantasy oficial' }, { status: 500 })
  }
}









