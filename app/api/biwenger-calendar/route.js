export const dynamic = 'force-dynamic'
export const revalidate = 0

const BIWENGER_URL = 'https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=ca&score=2'

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
    'finished',
    'postmatch',
    'ended',
    'fulltime',
    'ft',
])

function toNumber(value) {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
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

function normalizeStatus(status) {
    return String(status || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function readNumber(value) {
    const num = toNumber(value)
    if (num !== null) return num
    if (typeof value === 'string') {
        const match = value.match(/\d+/)
        if (match) return toNumber(match[0])
    }
    return null
}

function getMinute(game) {
    const candidates = [
        game?.minute,
        game?.elapsed,
        game?.time,
        game?.currentMinute,
        game?.current_minute,
        game?.liveClock,
        game?.live_clock,
        game?.liveData?.minute,
        game?.liveData?.elapsed,
    ]

    for (const value of candidates) {
        const num = readNumber(value)
        if (num !== null && num >= 0) return num
    }

    return null
}

function getScore(team) {
    if (!team || typeof team !== 'object') return null
    for (const key of ['score', 'goals', 'result']) {
        const num = toNumber(team[key])
        if (num !== null) return num
    }
    return null
}

function getGameLabel(game) {
    if (!game?.round) return 'Jornada'
    return game.round.name || game.round.short || 'Jornada'
}

function mapGame(game, index) {
    const dateTs = toNumber(game?.date)
    const dateIso = dateTs ? new Date(dateTs * 1000).toISOString() : null
    const statusRaw = game?.status ?? game?.matchStatus ?? game?.state ?? null
    const status = normalizeStatus(statusRaw)
    const minute = getMinute(game)
    const homeScore = getScore(game?.home)
    const awayScore = getScore(game?.away)
    const isFinished = FINISHED_STATUSES.has(status) || game?.finished === true
    const isLive = !isFinished && (LIVE_STATUSES.has(status) || (minute !== null && minute > 0))

    return {
        id: game?.id || `${game?.round?.id || 'round'}-${index}`,
        date: dateIso,
        dateLabel: formatDateLabel(dateIso),
        homeTeam: game?.home?.name || 'Local',
        awayTeam: game?.away?.name || 'Visitant',
        homeShield: null,
        awayShield: null,
        resultat: homeScore !== null && awayScore !== null
            ? `${homeScore} - ${awayScore}`
            : null,
        status: statusRaw,
        isLive,
        isFinished,
        minute: isLive ? minute : null,
        homeScore,
        awayScore,
        roundId: game?.round?.id || null,
        roundName: getGameLabel(game),
        roundShort: game?.round?.short || null,
        roundPart: game?.round?.part || null,
    }
}

function buildJornades(activeEvents) {
    return (activeEvents || []).map((event, index) => {
        const games = Array.isArray(event?.games) ? event.games : []
        const firstGameDate = games.find(Boolean)?.date || event?.start || null
        const week = toNumber(String(event?.short || '').replace(/\D/g, '')) || index + 1
        return {
            week,
            id: event?.id || week,
            name: event?.name || `Jornada ${week}`,
            short: event?.short || `J${week}`,
            date: firstGameDate ? new Date(firstGameDate * 1000).toISOString() : null,
            gamesCount: games.length,
        }
    })
}

function findSelectedEvent(activeEvents, weekParam) {
    if (!Array.isArray(activeEvents) || activeEvents.length === 0) return null
    if (!Number.isFinite(weekParam)) return activeEvents[0]

    const byShort = activeEvents.find((event) => {
        const week = toNumber(String(event?.short || '').replace(/\D/g, ''))
        return week === weekParam
    })
    if (byShort) return byShort

    const byName = activeEvents.find((event) => String(event?.name || '').includes(String(weekParam)))
    if (byName) return byName

    return activeEvents[0]
}

export async function GET(request) {
    try {
        const reqUrl = new URL(request.url)
        const weekParam = toNumber(reqUrl.searchParams.get('week'))

        const res = await fetch(BIWENGER_URL, {
            cache: 'no-store',
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        })

        if (!res.ok) {
            return Response.json({ ok: false, error: `Error carregant Biwenger (${res.status})` }, { status: 502 })
        }

        const payload = await res.json()
        const data = payload?.data || {}
        const activeEvents = Array.isArray(data.activeEvents) ? data.activeEvents : []
        const jornades = buildJornades(activeEvents)
        const selectedEvent = findSelectedEvent(activeEvents, weekParam)
        const selectedWeek = jornades.find((j) => j.id === selectedEvent?.id)?.week || jornades[0]?.week || 1
        const games = Array.isArray(selectedEvent?.games) ? selectedEvent.games : []
        const matches = games
            .map(mapGame)
            .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())

        return Response.json({
            ok: true,
            source: 'biwenger',
            selectedWeek,
            jornades,
            matches,
            updatedAt: new Date().toISOString(),
        }, {
            headers: { 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        return Response.json({ ok: false, error: error?.message || 'Error intern carregant calendari Biwenger' }, { status: 500 })
    }
}







