import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TEMPORADA_DEFAULT = '2026-27'
const LOCK_LEAD_MS = 1000

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

function normalitzarNomEquip(value) {
    const nom = String(value || '').trim()
    return nom || null
}

function fallbackNomEquip(profile, user) {
    const fromProfile = normalitzarNomEquip(profile?.nom)
    if (fromProfile) return fromProfile

    const email = String(profile?.email || user?.email || '').trim()
    if (email) {
        const localPart = email.split('@')[0]?.replace(/[._-]+/g, ' ')?.trim()
        if (localPart) return localPart
        return email
    }

    return 'El meu equip'
}

async function mirrorToActiveGameweek({ origin, payload }) {
    if (!origin) return

    try {
        const statusRes = await fetch(`${origin}/api/gameweek-status`, { cache: 'no-store' })
        const statusJson = await statusRes.json().catch(() => ({}))
        if (!statusRes.ok || !statusJson?.ok) return

        const activeWeek = Number(statusJson.activeWeek)
        const targetTs = Date.parse(statusJson.targetDate)
        if (!Number.isInteger(activeWeek) || activeWeek <= 0 || !Number.isFinite(targetTs)) return

        const nowTs = Date.now()
        if (nowTs >= targetTs - LOCK_LEAD_MS) return

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
        const requestedTeamName = normalitzarNomEquip(body?.nombre_equipo)

        const { data: existent, error: errSelect } = await supabaseAdmin
            .from('teams')
            .select('user_id, nombre_equipo')
            .eq('user_id', userData.user.id)
            .eq('temporada', temporada)
            .limit(1)

        if (errSelect) {
            return Response.json({ ok: false, error: errSelect.message }, { status: 500 })
        }

        const existentTeam = Array.isArray(existent) && existent.length > 0 ? existent[0] : null

        let nombreEquipo = requestedTeamName || normalitzarNomEquip(existentTeam?.nombre_equipo)
        if (!nombreEquipo) {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('nom, email')
                .eq('id', userData.user.id)
                .maybeSingle()

            nombreEquipo = fallbackNomEquip(profile, userData.user)
        }

        const payload = {
            user_id: userData.user.id,
            temporada,
            nombre_equipo: nombreEquipo,
            formacio: body?.formacio || '4-4-2',
            alineacio: normalitzarObjecte(body?.alineacio),
            suplents: normalitzarObjecte(body?.suplents),
        }

        if (existentTeam) {
            const { data: updated, error: errUpdate } = await supabaseAdmin
                .from('teams')
                .update(payload)
                .eq('user_id', userData.user.id)
                .eq('temporada', temporada)
                .select('user_id, temporada, nombre_equipo, formacio, alineacio, suplents')
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
            .select('user_id, temporada, nombre_equipo, formacio, alineacio, suplents')
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




