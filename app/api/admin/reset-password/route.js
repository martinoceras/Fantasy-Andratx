import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    const { userId, novaContrasenya } = await request.json()

    if (!userId || !novaContrasenya) {
        return Response.json({ error: 'Falten camps obligatoris (userId, novaContrasenya)' }, { status: 400 })
    }

    if (novaContrasenya.length < 6) {
        return Response.json({ error: 'La contrasenya ha de tenir almenys 6 caràcters' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: novaContrasenya
    })

    if (error) return Response.json({ error: error.message }, { status: 400 })

    return Response.json({ ok: true })
}

