import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

function normalitzarSnapshot(data) {
    if (!data || typeof data !== 'object') return {}
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== null && value !== undefined)
    )
}

export async function POST(request) {
    try {
        const authHeader = request.headers.get('authorization')
        const supabaseUser = createUserClient(authHeader)
        const { data: userData } = await supabaseUser.auth.getUser()

        if (!userData?.user) {
            return Response.json({ ok: false, error: 'No autoritzat' }, { status: 401 })
        }

        const body = await request.json().catch(() => ({}))
        const jornada = Number(body.jornada)

        if (!Number.isInteger(jornada) || jornada <= 0) {
            return Response.json({ ok: false, error: 'Jornada invàlida' }, { status: 400 })
        }

        const payload = {
            user_id: userData.user.id,
            jornada,
            alineacio: normalitzarSnapshot(body.alineacio),
            suplents: normalitzarSnapshot(body.suplents),
            formacio: body.formacio || '4-4-2',
            locked_at: new Date().toISOString(),
        }

        const { error } = await supabaseAdmin
            .from('gameweek_lineups')
            .upsert(payload, { onConflict: 'user_id,jornada' })

        if (error) {
            return Response.json({ ok: false, error: error.message }, { status: 500 })
        }

        return Response.json({ ok: true, saved: true })
    } catch (error) {
        return Response.json({ ok: false, error: error.message || 'Error guardant snapshot' }, { status: 500 })
    }
}

