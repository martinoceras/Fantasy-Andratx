import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    try {
        const { userId, nom } = await request.json()

        if (!userId || !nom?.trim()) {
            return Response.json({ error: 'Falten dades (userId, nom)' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ nom: nom.trim() })
            .eq('id', userId)

        if (error) return Response.json({ error: error.message }, { status: 400 })

        return Response.json({ ok: true })
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 })
    }
}

