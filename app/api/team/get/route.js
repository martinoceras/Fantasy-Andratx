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

export async function GET(request) {
    try {
        const authHeader = request.headers.get('authorization')
        const supabaseUser = createUserClient(authHeader)
        const { data: userData } = await supabaseUser.auth.getUser()

        if (!userData?.user) {
            return Response.json({ ok: false, error: 'No autoritzat' }, { status: 401 })
        }

        const reqUrl = new URL(request.url)
        const temporada = reqUrl.searchParams.get('temporada') || TEMPORADA_DEFAULT

        const { data, error } = await supabaseAdmin
            .from('teams')
            .select('user_id, temporada, formacio, alineacio, suplents')
            .eq('user_id', userData.user.id)
            .eq('temporada', temporada)
            .limit(1)

        if (error) {
            return Response.json({ ok: false, error: error.message }, { status: 500 })
        }

        return Response.json({ ok: true, team: data?.[0] || null })
    } catch (error) {
        return Response.json({ ok: false, error: error?.message || 'Error carregant equip' }, { status: 500 })
    }
}

