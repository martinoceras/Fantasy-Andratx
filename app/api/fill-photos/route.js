import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const BIWENGER_URL = 'https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=ca&score=2'
const CDN_BASE     = 'https://cdn.biwenger.com/'

async function doFillPhotos() {
    // 1. Obtenir jugadors sense foto de Supabase
    const { data: jugadorsSenseFoto, error: errFetch } = await supabaseAdmin
        .from('players')
        .select('id, nombre')
        .is('foto', null)

    if (errFetch) throw new Error(errFetch.message)
    if (!jugadorsSenseFoto || jugadorsSenseFoto.length === 0) {
        return { actualitzats: 0, message: 'Tots els jugadors ja tenen foto!' }
    }

    const idsSenseFoto = new Set(jugadorsSenseFoto.map(j => j.id))

    // 2. Descarregar dades de Biwenger
    const res = await fetch(BIWENGER_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store'
    })
    if (!res.ok) throw new Error(`Biwenger API error: ${res.status}`)
    const json = await res.json()

    const playersRaw = json.data?.players || {}

    // 3. Per a cada jugador sense foto, buscar-la a Biwenger
    //    Prioritat: iconHero > icon > iconURL > slug-based URL
    const updates = []
    Object.values(playersRaw).forEach(p => {
        if (!idsSenseFoto.has(p.id)) return

        let foto = null
        if (p.iconHero)   foto = CDN_BASE + p.iconHero
        else if (p.icon)  foto = CDN_BASE + p.icon
        else if (p.iconURL) foto = p.iconURL  // URL absoluta ocasional

        if (foto) updates.push({ id: p.id, foto })
    })

    if (updates.length === 0) {
        return {
            actualitzats: 0,
            senseFoto: jugadorsSenseFoto.length,
            message: `Cap foto nova trobada per als ${jugadorsSenseFoto.length} jugadors sense foto.`
        }
    }

    // 4. Actualitzar a Supabase
    const { error: errUpdate } = await supabaseAdmin
        .from('players')
        .upsert(updates, { onConflict: 'id' })

    if (errUpdate) throw new Error(errUpdate.message)

    return {
        actualitzats: updates.length,
        senseFoto: jugadorsSenseFoto.length,
        message: `${updates.length} fotos afegides de ${jugadorsSenseFoto.length} jugadors que no en tenien.`
    }
}

export async function POST(request) {
    const { secret } = await request.json().catch(() => ({}))
    if (process.env.SYNC_SECRET && secret !== process.env.SYNC_SECRET) {
        return Response.json({ error: 'No autoritzat' }, { status: 401 })
    }
    try {
        const result = await doFillPhotos()
        return Response.json({ ok: true, ...result })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

