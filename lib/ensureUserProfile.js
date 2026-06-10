import { supabase } from './supabase'

function extreureNom(user) {
    const meta = user?.user_metadata || {}
    return (
        meta.full_name ||
        meta.name ||
        user?.email?.split('@')[0] ||
        'Usuari'
    )
}

export async function ensureUserProfile(user) {
    if (!user?.id) return

    const { data: existent, error: errFind } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (errFind || existent) return

    await supabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        nom: extreureNom(user),
    })
}
