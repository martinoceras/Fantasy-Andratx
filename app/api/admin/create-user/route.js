import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    const { nom, email, password } = await request.json()

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: nom }
    })

    if (error) return Response.json({ error: error.message }, { status: 400 })

    await supabaseAdmin.from('profiles').insert({
        id: data.user.id,
        email,
        nom
    })

    return Response.json({ ok: true, userId: data.user.id })
}