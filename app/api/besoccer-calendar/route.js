// Endpoint experimental para intentar obtener datos de beSoccer
// Fallback a LaLiga si no está disponible

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BESOCCER_URLS = [
    'https://www.besoccer.com/tournament/spain_laliga_2026_2027/table',
    'https://www.besoccer.com/api/tournament/spain-laliga-2026-2027'
]

const LALIGA_RESULTS_URL = 'https://www.laliga.com/laliga-easports/resultados'
const COMPETITION = 'laliga-easports'

function parseJsonSafe(text) {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

function extractNextData(html) {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
    return match ? parseJsonSafe(match[1]) : null
}

function toNumber(value) {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
}

function getScoreFromMatch(match, side) {
    const keys = side === 'home'
        ? ['home_score', 'homeScore', 'home_goals', 'homeGoals']
        : ['away_score', 'awayScore', 'away_goals', 'awayGoals']

    for (const key of keys) {
        if (match[key] !== undefined && match[key] !== null) {
            const num = toNumber(match[key])
            if (num !== null) return num
        }
    }

    const teamKey = side === 'home' ? 'home_team' : 'away_team'
    if (match[teamKey] && typeof match[teamKey] === 'object') {
        for (const nestedKey of ['score', 'goals', 'result']) {
            const num = toNumber(match[teamKey][nestedKey])
            if (num !== null) return num
        }
    }

    return null
}

function resultIsOfficial(match, home, away) {
    if (home !== null && away !== null) return true
    const status = String(match?.status || '').toLowerCase()
    return ['postmatch', 'finished', 'ended', 'played', 'fulltime'].includes(status)
}

function formatDateLabel(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('ca-ES', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date)
}

function getMinuteFromMatch(match) {
    const keys = ['minute', 'min', 'elapsed', 'time']
    for (const key of keys) {
        const val = match[key]
        if (val !== undefined && val !== null) {
            const num = toNumber(val)
            if (num !== null && num >= 0) return num
        }
    }
    return null
}

function normalizeMatch(match, index) {
    const home = getScoreFromMatch(match, 'home')
    const away = getScoreFromMatch(match, 'away')
    const status = String(match?.status || '').toLowerCase()
    const isLive = ['live', 'inprogress', 'playing', 'en directo'].includes(status)
    const minute = isLive ? getMinuteFromMatch(match) : null

    return {
        id: match.id || match.slug || `${match.date || 'na'}-${index}`,
        date: match.date || null,
        dateLabel: formatDateLabel(match.date),
        homeTeam: match.home_team?.nickname || match.home_team?.name || 'Local',
        awayTeam: match.away_team?.nickname || match.away_team?.name || 'Visitant',
        resultat: resultIsOfficial(match, home, away) && home !== null && away !== null ? `${home} - ${away}` : null,
        status: match.status || null,
        isLive,
        minute,
        homeScore: home,
        awayScore: away,
    }
}

function findMatchesArray(payload) {
    if (!payload || typeof payload !== 'object') return null

    if (Array.isArray(payload.matches) && payload.matches.length > 0) return payload.matches
    if (payload.data && Array.isArray(payload.data.matches) && payload.data.matches.length > 0) return payload.data.matches

    const queue = [payload]
    while (queue.length > 0) {
        const current = queue.shift()
        if (!current || typeof current !== 'object') continue
        for (const value of Object.values(current)) {
            if (Array.isArray(value) && value.length > 0 && value[0]?.home_team && value[0]?.away_team) {
                return value
            }
            if (value && typeof value === 'object') queue.push(value)
        }
    }

    return null
}

async function fetchFromLaLiga(weekParam) {
    try {
        const pageRes = await fetch(LALIGA_RESULTS_URL, {
            cache: 'no-store',
            headers: { 'User-Agent': 'Mozilla/5.0' },
        })

        if (!pageRes.ok) return null

        const html = await pageRes.text()
        const nextData = extractNextData(html)
        const pageProps = nextData?.props?.pageProps || {}

        const jornades = (pageProps.gameweekList || []).map((j) => ({
            week: j.week,
            name: j.name,
            date: j.date,
        }))

        const currentWeek = pageProps.currentGameweek?.week || pageProps.gameweek?.week || jornades[0]?.week || 1
        const selectedWeek = weekParam && weekParam > 0 ? weekParam : currentWeek

        let rawMatches = pageProps.matches || []

        const matches = (rawMatches || [])
            .map((match, index) => normalizeMatch(match, index))
            .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())

        return {
            ok: true,
            selectedWeek,
            jornades,
            matches,
            updatedAt: new Date().toISOString(),
            source: 'LaLiga'
        }
    } catch (error) {
        return null
    }
}

export async function GET(request) {
    const reqUrl = new URL(request.url)
    const weekParam = toNumber(reqUrl.searchParams.get('week'))

    try {
        // Intenta LaLiga primero (fuente oficial con datos más completos)
        const laligaData = await fetchFromLaLiga(weekParam)

        if (laligaData?.ok) {
            return Response.json(laligaData, {
                headers: { 'Cache-Control': 'no-store' },
            })
        }

        return Response.json({
            ok: false,
            error: 'No s\'ha pogut carregar els resultats. Torna a provar més tard.'
        }, { status: 503 })
    } catch (error) {
        return Response.json({
            ok: false,
            error: error.message || 'Error intern carregant el calendari'
        }, { status: 500 })
    }
}

