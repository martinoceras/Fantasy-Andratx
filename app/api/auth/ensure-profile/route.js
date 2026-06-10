import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    try {
        const { id, email, nom } = await request.json()

        if (!id || !email) {
            return Response.json({ error: 'Falten dades (id, email)' }, { status: 400 })
        }

        if (!process.env.SUPABASE_SERVICE_KEY) {
            console.error('[ensure-profile] SUPABASE_SERVICE_KEY no està configurat!')
            return Response.json({ error: 'Configuració del servidor incorrecta' }, { status: 500 })
        }

        // Comprova si ja existeix
        const { data: existent, error: errSelect } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', id)
            .maybeSingle()

        if (errSelect) {
            console.error('[ensure-profile] error al fer SELECT:', errSelect)
        }

        if (existent) {
            return Response.json({ ok: true, action: 'already_exists' })
        }

        // No existeix: inserim
        const { error: errInsert } = await supabaseAdmin
            .from('profiles')
            .insert({ id, email, nom })

        if (errInsert) {
            console.error('[ensure-profile] error al fer INSERT:', errInsert)
            return Response.json({ error: errInsert.message }, { status: 500 })
        }

        console.log(`[ensure-profile] Perfil creat: ${email}`)
        return Response.json({ ok: true, action: 'created' })

    } catch (e) {
        console.error('[ensure-profile] exception:', e)
        return Response.json({ error: e.message }, { status: 500 })
    }
}
