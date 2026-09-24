export const FUTBOLFANTASY_OFFICIAL_POINTS_URL = 'https://www.futbolfantasy.com/analytics/futmondo-prensa/puntos'
export const FUTBOLFANTASY_BASE_URL = 'https://www.futbolfantasy.com'
export const FUTBOLFANTASY_OFFICIAL_GAME_KEY = 'futmondo-prensa'

const POSITION_MAP = {
  portero: 'Porter',
  defensa: 'Defensa',
  mediocampista: 'Migcampista',
  delantero: 'Davanter',
}

const SYNTHETIC_LOCAL_ID_BASE = 9_000_000

export function stripHtml(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&Ntilde;/gi, 'Ñ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&Aacute;/gi, 'Á')
    .replace(/&Eacute;/gi, 'É')
    .replace(/&Iacute;/gi, 'Í')
    .replace(/&Oacute;/gi, 'Ó')
    .replace(/&Uacute;/gi, 'Ú')
    .replace(/&Uuml;/gi, 'Ü')
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
}

export function normalizeText(value = '') {
  return decodeHtml(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseNumber(value) {
  const cleaned = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

function absolutizeUrl(value) {
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  return value
}

function parseAttributes(tagHtml = '') {
  const attrs = {}
  for (const match of tagHtml.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g)) {
    attrs[match[1]] = decodeHtml(match[3])
  }
  return attrs
}

function mapPosition(rawPosition) {
  const normalized = normalizeText(rawPosition)
  return POSITION_MAP[normalized] || null
}

function extractTextBySelector(rowHtml, className) {
  const regex = new RegExp(`<[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i')
  const match = rowHtml.match(regex)
  return decodeHtml(stripHtml(match?.[1] || ''))
}

function extractPlayerName(rowHtml) {
  const desktop = rowHtml.match(/<a[^>]*class=["'][^"']*player-name[^"']*["'][^>]*>[\s\S]*?<span[^>]*d-none d-md-inline[^>]*>([\s\S]*?)<\/span>/i)
  if (desktop?.[1]) return decodeHtml(stripHtml(desktop[1]))

  const anchor = rowHtml.match(/<a[^>]*class=["'][^"']*player-name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
  return decodeHtml(stripHtml(anchor?.[1] || ''))
}

function extractImageSrc(fragmentHtml, className) {
  const regex = new RegExp(`<img\\b[^>]*class=["'][^"']*${className}[^"']*["'][^>]*?\\bsrc=["']([^"']+)["']`, 'i')
  const match = fragmentHtml.match(regex)
  return absolutizeUrl(match?.[1] || null)
}

function extractSourceId(rowHtml, attrs) {
  const onclickValue = attrs.onclick || ''
  const fromOnclick = onclickValue.match(/openPlayerPointsStats\((\d+)/i)?.[1]
  if (fromOnclick) return Number(fromOnclick)

  const fromPhoto = rowHtml.match(/\/ficha\/(\d+)\.(?:png|webp|jpg|jpeg)/i)?.[1]
  if (fromPhoto) return Number(fromPhoto)

  return null
}

export function extractOfficialPlayerRows(html) {
  const tbodyMatch = html.match(/<tbody[^>]*class=["'][^"']*lista_elementos[^"']*["'][^>]*>([\s\S]*?)<\/tbody>/i)
  const sectionHtml = tbodyMatch?.[1] || html
  const rows = []

  for (const match of sectionHtml.matchAll(/(<tr[^>]*class=["'][^"']*elemento_jugador[^"']*["'][^>]*>)([\s\S]*?)<\/tr>/gi)) {
    const [_, openingTag, innerHtml] = match
    const attrs = parseAttributes(openingTag)
    const nombre = extractPlayerName(innerHtml)
    const equipoBlockMatch = innerHtml.match(/<div[^>]*class=["'][^"']*player-equipo[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    const equipoBlock = equipoBlockMatch?.[1] || ''
    const equipoReal = extractTextBySelector(equipoBlock, 'player-equipo') || decodeHtml(stripHtml(equipoBlock))
    const equipoSpan = equipoBlock.match(/<span>([\s\S]*?)<\/span>/i)
    const nombreEquipo = decodeHtml(stripHtml(equipoSpan?.[1] || equipoReal))
    const foto = extractImageSrc(innerHtml, 'player-foto')
    const escudoEquip = extractImageSrc(equipoBlock, 'escudo') || extractImageSrc(equipoBlock, 'img-fluid') || absolutizeUrl(equipoBlock.match(/<img[^>]*src=["']([^"']+)["']/i)?.[1] || null)
    const puntsTotals = parseNumber(attrs['data-puntostemporada']) ?? 0
    const posicionRaw = attrs['data-posicion'] || ''
    const posicion = mapPosition(posicionRaw)
    const equipoId = parseNumber(attrs['data-equipo'])
    const sourceId = extractSourceId(innerHtml, attrs)

    if (!sourceId || !nombre || !posicion) continue

    rows.push({
      sourceId,
      nombre,
      posicion,
      posicionRaw,
      equipoId: Number.isFinite(equipoId) ? Number(equipoId) : null,
      equipoReal: nombreEquipo || 'Desconegut',
      puntsTotals,
      foto,
      escudoEquip,
    })
  }

  const deduped = new Map()
  for (const row of rows) {
    const key = row.sourceId || `${normalizeText(row.nombre)}|${normalizeText(row.equipoReal)}`
    if (!deduped.has(key)) deduped.set(key, row)
  }
  return [...deduped.values()]
}

export function extractOfficialSeasonId(html = '') {
  const selectedMatch = html.match(/<option[^>]*value=["']https?:\/\/www\.futbolfantasy\.com\/analytics\/futmondo-prensa\/puntos\/(\d+)["'][^>]*selected/i)
  if (selectedMatch?.[1]) return Number(selectedMatch[1])

  const anyMatch = html.match(/https?:\/\/www\.futbolfantasy\.com\/analytics\/futmondo-prensa\/puntos\/(\d+)/i)
  if (anyMatch?.[1]) return Number(anyMatch[1])

  return null
}

export function buildOfficialPlayerDetailUrl(sourceId, seasonId, game = FUTBOLFANTASY_OFFICIAL_GAME_KEY) {
  const params = new URLSearchParams({ stat: 'puntuacion', game })
  return `${FUTBOLFANTASY_BASE_URL}/analytics/stats/detalle/${encodeURIComponent(sourceId)}/${encodeURIComponent(seasonId)}?${params.toString()}`
}

export function extractOfficialPlayerGameweekPoints(detailHtml, game = FUTBOLFANTASY_OFFICIAL_GAME_KEY) {
  const rows = []

  for (const match of detailHtml.matchAll(/<div[^>]*class=["'][^"']*sd-row[^"']*["'][^>]*>/gi)) {
    const attrs = parseAttributes(match[0])
    const jornadaLabel = String(attrs['data-jornada'] || '')
    const jornada = Number(jornadaLabel.replace(/[^0-9]/g, ''))
    if (!Number.isInteger(jornada) || jornada <= 0) continue

    let punts = 0
    try {
      const parsed = JSON.parse(attrs['data-puntos'] || '{}')
      const rawPoints = parsed?.[game]
      punts = Number.isFinite(Number(rawPoints)) ? Number(rawPoints) : 0
    } catch {
      punts = 0
    }

    rows.push({
      jornada,
      punts,
      notPlayed: attrs['data-not-played'] === '1',
      injured: attrs['data-lesionado'] === '1',
      suspended: attrs['data-sancionado'] === '1',
      unavailable: attrs['data-no-jugador'] === '1',
    })
  }

  rows.sort((a, b) => a.jornada - b.jornada)
  return rows
}

export function extractOfficialSourceIdFromPlayer(player) {
  const photo = String(player?.foto || '')
  const match = photo.match(/\/ficha\/(\d+)\.(?:png|webp|jpg|jpeg)/i)
  return match?.[1] ? Number(match[1]) : null
}

function buildAliases(player) {
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

function scoreCandidate(player, row, rowTokens) {
  const normalizedPlayer = normalizeText(player?.nombre)
  if (!normalizedPlayer) return -1

  const normalizedRowName = normalizeText(row?.nombre)
  if (normalizedPlayer === normalizedRowName) {
    let exactScore = 1000
    if (normalizeText(player?.equipo_real) === normalizeText(row?.equipoReal)) exactScore += 100
    if (player?.posicion === row?.posicion) exactScore += 50
    return exactScore
  }

  const playerTokens = normalizedPlayer.split(' ').filter(Boolean)
  const rowTokenSet = new Set(rowTokens)
  const shared = playerTokens.filter((token) => rowTokenSet.has(token)).length
  const exactLastName = playerTokens[playerTokens.length - 1] && playerTokens[playerTokens.length - 1] === rowTokens[rowTokens.length - 1]
  const includes = normalizedPlayer.includes(normalizedRowName) || normalizedRowName.includes(normalizedPlayer)
  const sameTeam = normalizeText(player?.equipo_real) === normalizeText(row?.equipoReal)
  const samePosition = player?.posicion && row?.posicion && player.posicion === row.posicion

  return (shared * 10) + (exactLastName ? 8 : 0) + (includes ? 5 : 0) + (sameTeam ? 25 : 0) + (samePosition ? 15 : 0)
}

export function createOfficialPlayerMatcher(players = []) {
  const officialIdMap = new Map()
  const exactMap = new Map()
  const aliasMap = new Map()

  for (const player of players) {
    const officialId = extractOfficialSourceIdFromPlayer(player)
    if (officialId) officialIdMap.set(officialId, player)

    const exactKey = `${normalizeText(player?.nombre)}|${normalizeText(player?.equipo_real)}`
    const exactList = exactMap.get(exactKey) || []
    exactList.push(player)
    exactMap.set(exactKey, exactList)

    for (const alias of buildAliases(player)) {
      const list = aliasMap.get(alias) || []
      list.push(player)
      aliasMap.set(alias, list)
    }
  }

  function firstUnused(candidates = [], usedIds = new Set(), row = null) {
    const available = candidates.filter((player) => !usedIds.has(Number(player.id)))
    if (available.length <= 1) return available[0] || null

    const sameTeam = row ? available.filter((player) => normalizeText(player?.equipo_real) === normalizeText(row?.equipoReal)) : []
    if (sameTeam.length === 1) return sameTeam[0]

    const samePos = row ? available.filter((player) => player?.posicion === row?.posicion) : []
    if (samePos.length === 1) return samePos[0]

    return null
  }

  return {
    matchRow(row, usedIds = new Set()) {
      if (row?.sourceId && officialIdMap.has(row.sourceId)) {
        const player = officialIdMap.get(row.sourceId)
        if (!usedIds.has(Number(player.id))) return player
      }

      const exactKey = `${normalizeText(row?.nombre)}|${normalizeText(row?.equipoReal)}`
      const exact = firstUnused(exactMap.get(exactKey) || [], usedIds, row)
      if (exact) return exact

      const normalizedRow = normalizeText(row?.nombre)
      const aliasMatches = firstUnused(aliasMap.get(normalizedRow) || [], usedIds, row)
      if (aliasMatches) return aliasMatches

      const rowTokens = normalizedRow.split(' ').filter(Boolean)
      let best = null
      let bestScore = 0
      let tie = false

      for (const player of players) {
        if (usedIds.has(Number(player.id))) continue
        const score = scoreCandidate(player, row, rowTokens)
        if (score > bestScore) {
          best = player
          bestScore = score
          tie = false
        } else if (score === bestScore && score > 0) {
          tie = true
        }
      }

      if (!best || bestScore < 25 || tie) return null
      return best
    },
  }
}

export function allocateSyntheticLocalId(sourceId, usedIds = new Set()) {
  let candidate = Number.isInteger(Number(sourceId))
    ? SYNTHETIC_LOCAL_ID_BASE + Number(sourceId)
    : SYNTHETIC_LOCAL_ID_BASE

  while (usedIds.has(candidate)) {
    candidate += 1
  }

  usedIds.add(candidate)
  return candidate
}





