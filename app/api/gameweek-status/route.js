export const dynamic = 'force-dynamic'
export const revalidate = 0

const FINAL_STATUSES = new Set(['postmatch', 'finished', 'ended', 'played', 'fulltime'])

function toTs(value) {
    if (!value) return null
    const ts = new Date(value).getTime()
    return Number.isNaN(ts) ? null : ts
}

function getWeekWindow(matches = []) {
    const timestamps = matches
        .map((m) => toTs(m.date))
        .filter((ts) => typeof ts === 'number')

    if (!timestamps.length) {
        return { firstStartTs: null, lastStartTs: null }
    }

    return {
        firstStartTs: Math.min(...timestamps),
        lastStartTs: Math.max(...timestamps),
    }
}

function isMatchFinished(match) {
    if (match?.isLive) return false
    if (match?.resultat) return true
    const status = String(match?.status || '').toLowerCase()
    return FINAL_STATUSES.has(status)
}

function buildCountdownPayload({ activeWeek, targetTs, nowTs }) {
    return {
        ok: true,
        mode: 'countdown',
        lockEditing: false,
        activeWeek,
        targetDate: new Date(targetTs).toISOString(),
        serverNow: new Date(nowTs).toISOString(),
        message: `Falten pocs segons per a la Jornada ${activeWeek}`,
    }
}

export async function GET(request) {
    try {
        const origin = new URL(request.url).origin
        const nowTs = Date.now()

        const currentRes = await fetch(`${origin}/api/laliga-calendar`, { cache: 'no-store' })
        const currentJson = await currentRes.json().catch(() => ({}))

        if (!currentRes.ok || !currentJson?.ok) {
            return Response.json({ ok: false, error: currentJson?.error || 'No s\'ha pogut calcular l\'estat de jornada' }, { status: 502 })
        }

        const jornadas = Array.isArray(currentJson.jornades) ? currentJson.jornades : []
        const currentWeek = Number(currentJson.selectedWeek) || Number(jornadas[0]?.week) || 1
        const currentMatches = Array.isArray(currentJson.matches) ? currentJson.matches : []
        const { firstStartTs } = getWeekWindow(currentMatches)

        if (!firstStartTs) {
            return Response.json({
                ok: true,
                mode: 'unknown',
                lockEditing: false,
                activeWeek: currentWeek,
                targetDate: null,
                serverNow: new Date(nowTs).toISOString(),
                message: 'No hi ha partits disponibles per calcular la jornada',
            })
        }

        const anyLive = currentMatches.some((m) => m?.isLive)
        const allFinished = currentMatches.length > 0 && currentMatches.every(isMatchFinished)

        if (anyLive || (nowTs >= firstStartTs && !allFinished)) {
            return Response.json({
                ok: true,
                mode: 'in_game',
                lockEditing: true,
                activeWeek: currentWeek,
                targetDate: null,
                serverNow: new Date(nowTs).toISOString(),
                message: `JORNADA ${currentWeek} EN JOC`,
            })
        }

        if (nowTs < firstStartTs) {
            return Response.json(buildCountdownPayload({
                activeWeek: currentWeek,
                targetTs: firstStartTs,
                nowTs,
            }))
        }

        const sortedWeeks = [...jornadas]
            .map((j) => Number(j.week))
            .filter((w) => Number.isInteger(w) && w > 0)
            .sort((a, b) => a - b)

        const nextWeek = sortedWeeks.find((week) => week > currentWeek)
        if (!nextWeek) {
            return Response.json({
                ok: true,
                mode: 'season_finished',
                lockEditing: false,
                activeWeek: currentWeek,
                targetDate: null,
                serverNow: new Date(nowTs).toISOString(),
                message: 'Temporada finalitzada',
            })
        }

        const nextRes = await fetch(`${origin}/api/laliga-calendar?week=${nextWeek}`, { cache: 'no-store' })
        const nextJson = await nextRes.json().catch(() => ({}))
        const nextMatches = nextRes.ok && nextJson?.ok && Array.isArray(nextJson.matches) ? nextJson.matches : []
        const { firstStartTs: nextFirstStartTs } = getWeekWindow(nextMatches)

        if (!nextFirstStartTs) {
            return Response.json({
                ok: true,
                mode: 'unknown',
                lockEditing: false,
                activeWeek: nextWeek,
                targetDate: null,
                serverNow: new Date(nowTs).toISOString(),
                message: `No s\'ha pogut obtenir l\'hora d\'inici de la Jornada ${nextWeek}`,
            })
        }

        return Response.json(buildCountdownPayload({
            activeWeek: nextWeek,
            targetTs: nextFirstStartTs,
            nowTs,
        }))
    } catch (error) {
        return Response.json({ ok: false, error: error.message || 'Error intern calculant l\'estat de jornada' }, { status: 500 })
    }
}

