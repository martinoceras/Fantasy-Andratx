export const dynamic = 'force-dynamic'
export const revalidate = 0

const BIWENGER_URL = 'https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=ca&score=2'

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
    return String(status || '').toLowerCase()
}

function getGameLabel(game) {
    if (!game?.round) return 'Jornada'
    return game.round.name || game.round.short || 'Jornada'
}

function mapGame(game, index) {
    const dateTs = toNumber(game?.date)
    const dateIso = dateTs ? new Date(dateTs * 1000).toISOString() : null
    const status = normalizeStatus(game?.status)
    const isLive = ['live', 'inprogress', 'playing', 'en directo'].includes(status)
    const isFinished = ['finished', 'postmatch', 'ended', 'fulltime'].includes(status)
    const minute = toNumber(game?.minute ?? game?.elapsed ?? game?.time)

    return {
        id: game?.id || `${game?.round?.id || 'round'}-${index}`,
        date: dateIso,
        dateLabel: formatDateLabel(dateIso),
        homeTeam: game?.home?.name || 'Local',
        awayTeam: game?.away?.name || 'Visitant',
        homeShield: null,
        awayShield: null,
        resultat: isFinished && game?.home?.score !== null && game?.away?.score !== null
            ? `${game.home.score} - ${game.away.score}`
            : null,
        status: game?.status || null,
        isLive,
        minute: isLive ? minute : null,
        homeScore: game?.home?.score ?? null,
        awayScore: game?.away?.score ?? null,
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





