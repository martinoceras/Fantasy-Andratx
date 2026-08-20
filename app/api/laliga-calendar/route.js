export const dynamic = 'force-dynamic'
export const revalidate = 0

const RESULTS_URL = 'https://www.laliga.com/laliga-easports/resultados'
const COMPETITION = 'laliga-easports'
const THESPORTSDB_EVENTSROUND_URL = 'https://www.thesportsdb.com/api/v1/json/123/eventsround.php'
const THESPORTSDB_LEAGUE_ID = '4335'
const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard'

const LIVE_STATUSES = new Set([
    'live',
    'inprogress',
    'playing',
    'en directo',
    'firsttime',
    'secondtime',
    'firsthalf',
    'secondhalf',
    'halftime',
    '1h',
    '2h',
    'ht',
])

const FINISHED_STATUSES = new Set([
    'postmatch',
    'finished',
    'ended',
    'played',
    'fulltime',
    'ft',
    'aet',
])

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

function normalizeStatus(status) {
    return String(status || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
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
    const status = normalizeStatus(match?.status)
    return FINISHED_STATUSES.has(status)
}

function formatDateLabel(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('ca-ES', {
        weekday: 'long',
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

function normalizeShieldUrl(raw) {
    if (!raw || typeof raw !== 'string') return null
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('/')) return `https://assets.laliga.com${raw}`
    return null
}

function normalizeTeamName(raw) {
    return String(raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\b(de|del|deportivo|club|cf|sad|ud|cd)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function teamNameMatches(a, b) {
    const na = normalizeTeamName(a)
    const nb = normalizeTeamName(b)
    if (!na || !nb) return false
    if (na === nb) return true
    if (na.includes(nb) || nb.includes(na)) return true
    const ta = new Set(na.split(' ').filter(Boolean))
    const tb = new Set(nb.split(' ').filter(Boolean))
    let shared = 0
    for (const token of ta) {
        if (tb.has(token)) shared += 1
    }
    return shared >= 1
}

function parseMinuteFromText(raw) {
    if (!raw) return null
    const match = String(raw).match(/(\d{1,3})/)
    if (!match) return null
    const num = Number(match[1])
    return Number.isFinite(num) ? num : null
}

function parseEspnEvent(event) {
    const comp = event?.competitions?.[0]
    const competitors = Array.isArray(comp?.competitors) ? comp.competitors : []
    const home = competitors.find((c) => c?.homeAway === 'home')
    const away = competitors.find((c) => c?.homeAway === 'away')
    if (!home?.team?.displayName || !away?.team?.displayName) return null

    const statusName = String(event?.status?.type?.name || '').toUpperCase()
    const statusDetail = String(event?.status?.type?.detail || event?.status?.displayClock || '').trim()
    const minute = parseMinuteFromText(statusDetail)
    const isLive = [
        'STATUS_FIRST_HALF',
        'STATUS_SECOND_HALF',
        'STATUS_HALFTIME',
        'STATUS_EXTRA_TIME',
        'STATUS_PENALTY_SHOOTOUT',
        'STATUS_IN_PROGRESS',
    ].includes(statusName)
    const isFinished = ['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_AFTER_EXTRA_TIME', 'STATUS_PENALTY'].includes(statusName)

    return {
        homeTeam: home.team.displayName,
        awayTeam: away.team.displayName,
        homeScore: toNumber(home.score),
        awayScore: toNumber(away.score),
        minute,
        isLive,
        isFinished,
        statusRaw: statusDetail || statusName || null,
    }
}

function applyEspnLiveOverrides(matches = [], espnEvents = []) {
    if (!Array.isArray(matches) || matches.length === 0) return matches
    if (!Array.isArray(espnEvents) || espnEvents.length === 0) return matches

    return matches.map((match) => {
        const espn = espnEvents.find((event) =>
            teamNameMatches(event.homeTeam, match.homeTeam) &&
            teamNameMatches(event.awayTeam, match.awayTeam)
        )

        if (!espn) return match

        const next = { ...match }
        if (espn.statusRaw) next.status = espn.statusRaw
        if (espn.isLive) next.isLive = true
        if (typeof espn.isFinished === 'boolean') next.isFinished = espn.isFinished
        if (espn.minute !== null && espn.minute >= 0) next.minute = espn.minute

        if (espn.homeScore !== null && espn.awayScore !== null) {
            next.homeScore = espn.homeScore
            next.awayScore = espn.awayScore
            next.resultat = `${espn.homeScore} - ${espn.awayScore}`
        }

        return next
    })
}

function getTeamName(team, fallback) {
    if (!team || typeof team !== 'object') return fallback
    return team.nickname || team.shortname || team.name || fallback
}

function getTeamShield(team) {
    if (!team || typeof team !== 'object') return null
    return normalizeShieldUrl(
        team?.shield?.url ||
        team?.shield ||
        team?.crest ||
        team?.logo ||
        team?.image ||
        null
    )
}

function normalizeMatch(match, index) {
    const home = getScoreFromMatch(match, 'home')
    const away = getScoreFromMatch(match, 'away')
    const statusRaw = match?.status || null
    const status = normalizeStatus(statusRaw)
    const minute = getMinuteFromMatch(match)
    const isFinished = FINISHED_STATUSES.has(status)
    const isLive = !isFinished && (LIVE_STATUSES.has(status) || (minute !== null && minute > 0))

    return {
        id: match.id || match.slug || `${match.date || 'na'}-${index}`,
        date: match.date || null,
        dateLabel: formatDateLabel(match.date),
        homeTeam: getTeamName(match.home_team, 'Local'),
        awayTeam: getTeamName(match.away_team, 'Visitant'),
        homeShield: getTeamShield(match.home_team),
        awayShield: getTeamShield(match.away_team),
        resultat: resultIsOfficial(match, home, away) && home !== null && away !== null ? `${home} - ${away}` : null,
        status: statusRaw,
        isLive,
        isFinished,
        minute,
        homeScore: home,
        awayScore: away,
    }
}

function normalizeSportsDbMatch(event, index) {
    const homeScore = toNumber(event?.intHomeScore)
    const awayScore = toNumber(event?.intAwayScore)
    const statusRaw = String(event?.strStatus || '').toUpperCase()
    const isLive = ['1H', '2H', 'HT', 'ET', 'PEN', 'LIVE'].includes(statusRaw)
    const isFinished = ['FT', 'AET', 'PEN'].includes(statusRaw)
    const hasRealResult = homeScore !== null && awayScore !== null && (isFinished || isLive)
    const dateIso = event?.strTimestamp
        ? `${event.strTimestamp}Z`
        : event?.dateEvent && event?.strTime
            ? `${event.dateEvent}T${event.strTime}Z`
            : null

    return {
        id: event?.idEvent || `sportsdb-${index}`,
        date: dateIso,
        dateLabel: formatDateLabel(dateIso),
        homeTeam: event?.strHomeTeam || 'Local',
        awayTeam: event?.strAwayTeam || 'Visitant',
        homeShield: normalizeShieldUrl(event?.strHomeTeamBadge),
        awayShield: normalizeShieldUrl(event?.strAwayTeamBadge),
        resultat: hasRealResult ? `${homeScore} - ${awayScore}` : null,
        status: event?.strStatus || null,
        isLive,
        isFinished,
        minute: null,
        homeScore,
        awayScore,
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

function seasonCandidates(seasonValue, gameweekList = []) {
    const values = []
    if (typeof seasonValue === 'string') values.push(seasonValue)

    if (seasonValue && typeof seasonValue === 'object') {
        for (const key of ['slug', 'name', 'id']) {
            if (seasonValue[key]) values.push(String(seasonValue[key]))
        }
        if (seasonValue.start && seasonValue.end) {
            values.push(`${seasonValue.start}-${seasonValue.end}`)
        }
    }

    if (gameweekList[0]?.date) {
        const year = new Date(gameweekList[0].date).getUTCFullYear()
        if (Number.isFinite(year)) values.push(`${year}-${year + 1}`)
    }

    values.push('2026-2027')
    return [...new Set(values.filter(Boolean))]
}

async function fetchFromBackend({ backendUrl, subscriptionKey, week, seasonList }) {
    if (!backendUrl) return null

    const base = backendUrl.replace(/\/$/, '')
    const endpoints = [
        '/api/v1/subhome/results',
        '/v1/subhome/results',
        '/api/v1/results',
        '/v1/results',
    ]

    for (const endpoint of endpoints) {
        for (const season of seasonList) {
            const params = new URLSearchParams({
                competition: COMPETITION,
                week: String(week),
                season: String(season),
                lang: 'es',
                country: 'es',
            })

            const headers = { Accept: 'application/json' }
            if (subscriptionKey) headers['Ocp-Apim-Subscription-Key'] = subscriptionKey

            try {
                const res = await fetch(`${base}${endpoint}?${params.toString()}`, { headers, cache: 'no-store' })
                if (!res.ok) continue
                const payload = await res.json().catch(() => null)
                const matches = findMatchesArray(payload)
                if (matches && matches.length > 0) return matches
            } catch {
                // Seguim provant altres endpoints
            }
        }
    }

    return null
}

async function fetchFromSportsDb({ week, seasonList }) {
    for (const season of seasonList) {
        try {
            const params = new URLSearchParams({
                id: THESPORTSDB_LEAGUE_ID,
                r: String(week),
                s: String(season),
            })

            const res = await fetch(`${THESPORTSDB_EVENTSROUND_URL}?${params.toString()}`, {
                cache: 'no-store',
                headers: { Accept: 'application/json' },
            })
            if (!res.ok) continue
            const payload = await res.json().catch(() => null)
            const events = payload?.events
            if (Array.isArray(events) && events.length > 0) {
                return events
                    .map((event, index) => normalizeSportsDbMatch(event, index))
                    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
            }
        } catch {
            // Seguim provant altres temporades candidates
        }
    }

    return null
}

export async function GET(request) {
    const reqUrl = new URL(request.url)
    const weekParam = toNumber(reqUrl.searchParams.get('week'))

    try {
        const pageRes = await fetch(RESULTS_URL, {
            cache: 'no-store',
            headers: { 'User-Agent': 'Mozilla/5.0' },
        })

        if (!pageRes.ok) {
            return Response.json({ ok: false, error: `Error carregant LaLiga (${pageRes.status})` }, { status: 502 })
        }

        const html = await pageRes.text()
        const nextData = extractNextData(html)
        const pageProps = nextData?.props?.pageProps || {}

        const jornades = (pageProps.gameweekList || []).map((j) => ({
            week: j.week,
            name: j.name,
            date: j.date,
        }))

        const currentWeek = pageProps.currentGameweek?.week || pageProps.gameweek?.week || jornades[0]?.week || 1
        const selectedWeek = Number.isInteger(weekParam) && weekParam > 0 ? weekParam : currentWeek

        let rawMatches = null

        if (selectedWeek === currentWeek) {
            rawMatches = pageProps.matches || []
        }

        const seasonList = seasonCandidates(pageProps.season, pageProps.gameweekList || [])

        if (!rawMatches || rawMatches.length === 0) {
            rawMatches = await fetchFromBackend({
                backendUrl: nextData?.runtimeConfig?.backendUrl,
                subscriptionKey: nextData?.runtimeConfig?.backendSubscription,
                week: selectedWeek,
                seasonList,
            })
        }

        let matches
        if (!rawMatches || rawMatches.length === 0) {
            matches = await fetchFromSportsDb({ week: selectedWeek, seasonList })
        } else {
            matches = rawMatches
                .map((match, index) => normalizeMatch(match, index))
                .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
        }

        if (selectedWeek === currentWeek && Array.isArray(matches) && matches.length > 0) {
            try {
                const espnRes = await fetch(ESPN_SCOREBOARD_URL, {
                    cache: 'no-store',
                    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
                })
                if (espnRes.ok) {
                    const espnJson = await espnRes.json().catch(() => null)
                    const espnEvents = (espnJson?.events || [])
                        .map(parseEspnEvent)
                        .filter(Boolean)
                    matches = applyEspnLiveOverrides(matches, espnEvents)
                }
            } catch {
                // Si ESPN falla, mantenim dades de LaLiga/SportsDB
            }
        }

        if (!matches) {
            matches = []
        }

        return Response.json({
            ok: true,
            selectedWeek,
            jornades,
            matches,
            updatedAt: new Date().toISOString(),
        }, {
            headers: { 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        return Response.json({ ok: false, error: error.message || 'Error intern carregant el calendari' }, { status: 500 })
    }
}









