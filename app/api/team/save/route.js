import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TEMPORADA_DEFAULT = '2026-27'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

function createUserClient(authHeader) {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: authHeader || '',
                },
            },
        }
    )
}

function normalitzarObjecte(data) {
    if (!data || typeof data !== 'object') return {}
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== null && value !== undefined)
    )
}

async function mirrorToActiveGameweek({ origin, payload }) {
    if (!origin) return

    try {
        const statusRes = await fetch(`${origin}/api/gameweek-status`, { cache: 'no-store' })
        const statusJson = await statusRes.json().catch(() => ({}))
        if (!statusRes.ok || !statusJson?.ok) return

        const activeWeek = Number(statusJson.activeWeek)
        const lockEditing = statusJson.lockEditing === true
        if (!Number.isInteger(activeWeek) || activeWeek <= 0 || lockEditing) return

        const snapshotPayload = {
            user_id: payload.user_id,
            jornada: activeWeek,
            alineacio: payload.alineacio,
            suplents: payload.suplents,
            formacio: payload.formacio,
            locked_at: new Date().toISOString(),
        }

        const { error } = await supabaseAdmin
            .from('gameweek_lineups')
            .upsert(snapshotPayload, { onConflict: 'user_id,jornada' })

        if (error) {
            console.warn('[team/save] No s\'ha pogut mirroritzar a gameweek_lineups:', error.message)
        }
    } catch (error) {
        console.warn('[team/save] Error mirroritzant a gameweek_lineups:', error?.message || error)
    }
}

export async function POST(request) {
    try {
        const reqUrl = new URL(request.url)
        const authHeader = request.headers.get('authorization')
        const supabaseUser = createUserClient(authHeader)
        const { data: userData } = await supabaseUser.auth.getUser()

        if (!userData?.user) {
            return Response.json({ ok: false, error: 'No autoritzat' }, { status: 401 })
        }

        const body = await request.json().catch(() => ({}))
        const temporada = body?.temporada || TEMPORADA_DEFAULT
        const payload = {
            user_id: userData.user.id,
            temporada,
            formacio: body?.formacio || '4-4-2',
            alineacio: normalitzarObjecte(body?.alineacio),
            suplents: normalitzarObjecte(body?.suplents),
        }

        const { data: existent, error: errSelect } = await supabaseAdmin
            .from('teams')
            .select('user_id')
            .eq('user_id', userData.user.id)
            .eq('temporada', temporada)
            .limit(1)

        if (errSelect) {
            return Response.json({ ok: false, error: errSelect.message }, { status: 500 })
        }

        if (Array.isArray(existent) && existent.length > 0) {
            const { data: updated, error: errUpdate } = await supabaseAdmin
                .from('teams')
                .update(payload)
                .eq('user_id', userData.user.id)
                .eq('temporada', temporada)
                .select('user_id, temporada, formacio, alineacio, suplents')
                .limit(1)

            if (errUpdate) {
                return Response.json({ ok: false, error: errUpdate.message }, { status: 500 })
            }

            await mirrorToActiveGameweek({ origin: reqUrl.origin, payload })

            return Response.json({ ok: true, team: updated?.[0] || payload })
        }

        const { data: inserted, error: errInsert } = await supabaseAdmin
            .from('teams')
            .insert(payload)
            .select('user_id, temporada, formacio, alineacio, suplents')
            .limit(1)

        if (errInsert) {
            return Response.json({ ok: false, error: errInsert.message }, { status: 500 })
        }

        await mirrorToActiveGameweek({ origin: reqUrl.origin, payload })

        return Response.json({ ok: true, team: inserted?.[0] || payload })
    } catch (error) {
        return Response.json({ ok: false, error: error?.message || 'Error desant equip' }, { status: 500 })
    }
}


