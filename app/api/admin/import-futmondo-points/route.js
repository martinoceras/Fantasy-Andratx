import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const FUTBOLFANTASY_URL = 'https://www.futbolfantasy.com/laliga/estadisticas-puntos/jugador'
const TARGET_COLUMN_LABEL = 'Puntos Futmondo (Prensa)'

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

function stripHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseNumber(value) {
  const cleaned = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

function extractTableSection(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return match?.[1] || ''
}

function extractRows(sectionHtml = '') {
  return [...sectionHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1])
}

function extractCells(rowHtml = '') {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1])
}

function buildPlayerAliases(player) {
  const aliases = new Set()
  const base = normalizeText(player?.nombre)
  if (!base) return aliases

  aliases.add(base)
  const parts = base.split(' ').filter(Boolean)
  if (parts.length >= 2) {
    aliases.add(parts.slice(-2).join(' '))
    aliases.add(parts.slice(0, 2).join(' '))
    aliases.add(parts[0])
    aliases.add(parts[parts.length - 1])
  }
  if (parts.length >= 3) {
    aliases.add(parts.slice(-3).join(' '))
  }
  return aliases
}

function scoreCandidate(player, normalizedRow, rowTokens) {
  const normalizedPlayer = normalizeText(player?.nombre)
  if (!normalizedPlayer) return -1
  if (normalizedPlayer === normalizedRow) return 1000

  const playerTokens = normalizedPlayer.split(' ').filter(Boolean)
  const rowTokenSet = new Set(rowTokens)
  const shared = playerTokens.filter((token) => rowTokenSet.has(token)).length
  const exactLastName = playerTokens[playerTokens.length - 1] && playerTokens[playerTokens.length - 1] === rowTokens[rowTokens.length - 1]
  const includes = normalizedPlayer.includes(normalizedRow) || normalizedRow.includes(normalizedPlayer)

  return (shared * 10) + (exactLastName ? 5 : 0) + (includes ? 3 : 0)
}

function findBestPlayer(players, aliasMap, rowName) {
  const normalizedRow = normalizeText(rowName)
  if (!normalizedRow) return null

  const directMatches = aliasMap.get(normalizedRow) || []
  if (directMatches.length === 1) return directMatches[0]
  if (directMatches.length > 1) {
    const exact = directMatches.find((player) => normalizeText(player?.nombre) === normalizedRow)
    if (exact) return exact
  }

  const rowTokens = normalizedRow.split(' ').filter(Boolean)
  let best = null
  let bestScore = 0
  let tie = false

  for (const player of players) {
    const score = scoreCandidate(player, normalizedRow, rowTokens)
    if (score > bestScore) {
      best = player
      bestScore = score
      tie = false
    } else if (score === bestScore && score > 0) {
      tie = true
    }
  }

  if (!best || bestScore < 10 || tie) return null
  return best
}

function parseFutbolFantasyRows(html) {
  const thead = extractTableSection(html, 'thead')
  const tbody = extractTableSection(html, 'tbody')
  const headerRow = extractRows(thead)[0] || ''
  const headerCells = extractCells(headerRow)
  const targetIndex = headerCells.findIndex((cell) => {
    const htmlNormalized = normalizeText(cell)
    const textNormalized = normalizeText(stripHtml(cell))
    return htmlNormalized.includes(normalizeText(TARGET_COLUMN_LABEL)) || textNormalized === 'ptos fp'
  })

  if (targetIndex < 0) {
    throw new Error('No s\'ha trobat la columna de punts Futmondo (Prensa)')
  }

  return extractRows(tbody)
    .map((row) => extractCells(row))
    .filter((cells) => cells.length > targetIndex)
    .map((cells) => ({
      nom: stripHtml(cells[0]),
      punts: parseNumber(stripHtml(cells[targetIndex])),
    }))
    .filter((row) => row.nom && row.punts !== null)
}

export async function GET(request) {
  try {
    const reqUrl = new URL(request.url)
    const jornadaQuery = Number(reqUrl.searchParams.get('jornada'))
    const jornada = Number.isInteger(jornadaQuery) && jornadaQuery > 0
      ? jornadaQuery
      : await getActiveJornada(reqUrl.origin)

    const [pageRes, playersRes] = await Promise.all([
      fetch(FUTBOLFANTASY_URL, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml' },
      }),
      supabaseAdmin.from('players').select('id, nombre, posicion, equipo_real').order('nombre'),
    ])

    if (!pageRes.ok) {
      return Response.json({ ok: false, error: `Error carregant FutbolFantasy (${pageRes.status})` }, { status: 502 })
    }

    if (playersRes.error) {
      return Response.json({ ok: false, error: playersRes.error.message }, { status: 500 })
    }

    const html = await pageRes.text()
    const rows = parseFutbolFantasyRows(html)
    const players = playersRes.data || []
    const aliasMap = new Map()

    for (const player of players) {
      for (const alias of buildPlayerAliases(player)) {
        const list = aliasMap.get(alias) || []
        list.push(player)
        aliasMap.set(alias, list)
      }
    }

    const puntsMapa = Object.fromEntries(players.map((player) => [player.id, 0]))
    const unmatched = []
    const matchedRows = []

    for (const row of rows) {
      const player = findBestPlayer(players, aliasMap, row.nom)
      if (!player) {
        unmatched.push(row.nom)
        continue
      }
      puntsMapa[player.id] = row.punts
      matchedRows.push({ playerId: player.id, nom: player.nombre, punts: row.punts, source: row.nom })
    }

    const files = Object.entries(puntsMapa).map(([player_id, punts]) => ({
      player_id: Number(player_id),
      jornada,
      punts: Number(punts || 0),
    }))

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
          imported_by: 'import-futmondo',
          source: 'futbolfantasy',
        }, { onConflict: 'jornada' })

      if (logError) {
        console.warn('[import-futmondo-points] No s\'ha pogut registrar la darrera importació:', logError.message)
      }
    } catch (logErr) {
      console.warn('[import-futmondo-points] Error registrant darrera importació:', logErr?.message || logErr)
    }

    return Response.json({
      ok: true,
      source: 'futbolfantasy',
      column: TARGET_COLUMN_LABEL,
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
    return Response.json({ ok: false, error: error?.message || 'Error important punts Futmondo' }, { status: 500 })
  }
}





