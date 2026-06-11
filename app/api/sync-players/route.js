import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const BIWENGER_URL  = 'https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=ca&score=2'
const FOTO_BASE     = 'https://cdn.biwenger.com/i/p/'   // + id + .png
const ESCUDO_BASE   = 'https://biwenger.as.com/res/images/clubs/badge_'    // + teamId + .png

const POS_MAP = { 1: 'Porter', 2: 'Defensa', 3: 'Migcampista', 4: 'Davanter' }

function calcValor(price) {
    if (!price) return 6
    if (price >= 70_000_000) return 10
    if (price >= 40_000_000) return 9
    if (price >= 20_000_000) return 8
    if (price >= 10_000_000) return 7
    return 6
}

async function doSync() {
    const res = await fetch(BIWENGER_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store'
    })
    if (!res.ok) throw new Error(`Biwenger API error: ${res.status}`)
    const json = await res.json()

    const teamsRaw   = json.data?.teams   || {}
    const playersRaw = json.data?.players || {}

    // Mapa equips id → nom
    const teamNames = {}
    Object.values(teamsRaw).forEach(t => { teamNames[t.id] = t.name })

    // Mapeig jugadors — camps correctes: team (no teamID), price (no fantasyPrice)
    const jugadors = Object.values(playersRaw)
        .filter(p => POS_MAP[p.position])
        .map(p => {
            // El camp equip pot venir com a p.team o p.teamID
            const teamId = p.team ?? p.teamID ?? null
            return {
                id:            p.id,
                nombre:        p.name,
                posicion:      POS_MAP[p.position],
                equipo_real:   teamNames[teamId] || 'Desconegut',
                valor:         calcValor(p.price ?? p.fantasyPrice),
                precio:        p.price ?? p.fantasyPrice ?? 0,
                punts_totals:  p.points ?? 0,
                status:        typeof p.status === 'string' ? p.status : 'ok',
                // Foto principal via CDN actual.
                foto:          `${FOTO_BASE}${p.id}.png`,
                escudo_equip:  teamId ? `${ESCUDO_BASE}${teamId}.png` : null,
            }
        })

    // Upsert — usa 'id' com a clau de conflicte
    const { error } = await supabaseAdmin
        .from('players')
        .upsert(jugadors, { onConflict: 'id' })

    if (error) throw new Error(error.message)
    return jugadors.length
}

export async function POST(request) {
    const { secret } = await request.json().catch(() => ({}))
    if (process.env.SYNC_SECRET && secret !== process.env.SYNC_SECRET) {
        return Response.json({ error: 'No autoritzat' }, { status: 401 })
    }
    try {
        const total = await doSync()
        return Response.json({ ok: true, total, message: `${total} jugadors sincronitzats correctament` })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

// Vercel Cron crida GET
export async function GET(request) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'No autoritzat' }, { status: 401 })
    }
    try {
        const total = await doSync()
        return Response.json({ ok: true, total, message: `Cron: ${total} jugadors sincronitzats` })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}


