import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    try {
        const { id, email, nom } = await request.json()

        if (!id || !email) {
            return Response.json({ error: 'Falten dades' }, { status: 400 })
        }

        // Upsert: crea el perfil si no existeix, no fa res si ja existeix
        const { error } = await supabaseAdmin
            .from('profiles')
            .upsert({ id, email, nom }, { onConflict: 'id', ignoreDuplicates: true })

        if (error) {
            console.error('[ensure-profile] error:', error)
            return Response.json({ error: error.message }, { status: 500 })
        }

        return Response.json({ ok: true })
    } catch (e) {
        console.error('[ensure-profile] exception:', e)
        return Response.json({ error: e.message }, { status: 500 })
    }
}

