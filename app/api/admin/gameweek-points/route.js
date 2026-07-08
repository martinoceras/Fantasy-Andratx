import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

function isAuthorized(requestSecret, authHeader) {
    if (requestSecret && process.env.ADMIN_SECRET && requestSecret === process.env.ADMIN_SECRET) return true
    if (authHeader && process.env.ADMIN_SECRET && authHeader === `Bearer ${process.env.ADMIN_SECRET}`) return true
    return false
}

function parseJornada(value) {
    const jornada = Number(value)
    return Number.isInteger(jornada) && jornada > 0 && jornada <= 38 ? jornada : null
}

export async function POST(request) {
    try {
        const authHeader = request.headers.get('authorization')
        const body = await request.json().catch(() => ({}))
        if (!isAuthorized(body?.secret, authHeader)) {
            return Response.json({ ok: false, error: 'No autoritzat' }, { status: 401 })
        }

        const action = body?.action
        const jornada = parseJornada(body?.jornada)

        if (!action || !jornada) {
            return Response.json({ ok: false, error: 'Falten camps obligatoris (action, jornada)' }, { status: 400 })
        }

        if (action === 'lock') {
            const { error } = await supabaseAdmin
                .from('gameweek_points_lock')
                .upsert({ jornada, locked: true, locked_at: new Date().toISOString(), locked_by: 'super_admin' }, { onConflict: 'jornada' })

            if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
            return Response.json({ ok: true, action, jornada })
        }

        if (action === 'unlock') {
            const { error } = await supabaseAdmin
                .from('gameweek_points_lock')
                .upsert({ jornada, locked: false, locked_at: null, locked_by: 'super_admin' }, { onConflict: 'jornada' })

            if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
            return Response.json({ ok: true, action, jornada })
        }

        if (action === 'set-player-points') {
            const playerId = Number(body?.player_id)
            const punts = Number(body?.punts)
            if (!Number.isInteger(playerId) || Number.isNaN(punts)) {
                return Response.json({ ok: false, error: 'player_id o punts invàlids' }, { status: 400 })
            }

            const { error } = await supabaseAdmin
                .from('player_punts')
                .upsert({
                    player_id: playerId,
                    jornada,
                    punts,
                }, { onConflict: 'player_id,jornada' })

            if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
            return Response.json({ ok: true, action, jornada, player_id: playerId, punts })
        }

        return Response.json({ ok: false, error: 'Acció no suportada' }, { status: 400 })
    } catch (error) {
        return Response.json({ ok: false, error: error.message || 'Error intern' }, { status: 500 })
    }
}

