import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    const { nom, email, password } = await request.json()

    if (!nom || !email || !password) {
        return Response.json({ error: 'Falten camps obligatoris (nom, email, password)' }, { status: 400 })
    }

    if (!process.env.SUPABASE_SERVICE_KEY) {
        return Response.json({ error: 'Clau de servei de Supabase no configurada al servidor' }, { status: 500 })
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: nom }
    })

    if (error) return Response.json({ error: error.message }, { status: 400 })

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: data.user.id,
        email,
        nom
    })

    if (profileError) {
        // L'usuari s'ha creat a auth però no s'ha pogut crear el perfil
        // Intentem eliminar l'usuari d'auth per mantenir consistència
        await supabaseAdmin.auth.admin.deleteUser(data.user.id)
        return Response.json({ error: 'Error creant el perfil: ' + profileError.message }, { status: 400 })
    }

    return Response.json({ ok: true, userId: data.user.id })
}