import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    try {
        const { userId } = await request.json()
        if (!userId) {
            return Response.json({ error: 'Falta userId' }, { status: 400 })
        }

        const ignoreMissingTable = (message = '') =>
            /could not find the table|does not exist|schema cache/i.test(message)

        const cleanupTable = async (table, match = 'user_id') => {
            const { error } = await supabaseAdmin.from(table).delete().eq(match, userId)
            if (error && !ignoreMissingTable(error.message)) return error
            return null
        }

        // Eliminam dades relacionades abans d'esborrar perfil/auth per evitar errors de FK.
        for (const [table, match] of [
            ['draft_picks', 'user_id'],
            ['teams', 'user_id'],
            ['canvi_bomba', 'user_id'],
        ]) {
            const error = await cleanupTable(table, match)
            if (error) return Response.json({ error: error.message }, { status: 400 })
        }

        const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
        if (profileError) return Response.json({ error: profileError.message }, { status: 400 })

        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (authError) return Response.json({ error: authError.message }, { status: 400 })

        return Response.json({ ok: true })
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 })
    }
}