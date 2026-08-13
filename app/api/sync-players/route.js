import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const BIWENGER_URL  = 'https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=ca&score=2'
const FOTO_BASE     = 'https://cdn.biwenger.com/i/p/'   // + id + .png
const ESCUDO_BASE   = 'https://biwenger.as.com/res/images/clubs/badge_'    // + teamId + .png

const POS_MAP = { 1: 'Porter', 2: 'Defensa', 3: 'Migcampista', 4: 'Davanter' }

function normalizeText(value, fallback = '') {
    const text = typeof value === 'string' ? value.trim() : ''
    return text || fallback
}

function optionalText(value) {
    const text = typeof value === 'string' ? value.trim() : ''
    return text || null
}

function calcValor(price) {
    if (!price) return 6
    if (price >= 70_000_000) return 10
    if (price >= 40_000_000) return 9
    if (price >= 20_000_000) return 8
    if (price >= 10_000_000) return 7
    return 6
}

async function doSync() {
    const url = `${BIWENGER_URL}&_ts=${Date.now()}`
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store'
    })
    if (!res.ok) throw new Error(`Biwenger API error: ${res.status}`)
    const json = await res.json()

    const teamsRaw   = json.data?.teams   || {}
    const playersRaw = json.data?.players || {}

    if (!Object.keys(teamsRaw).length || !Object.keys(playersRaw).length) {
        throw new Error('Resposta de Biwenger incompleta: sense equips o jugadors')
    }

    const { data: previousPlayers, error: previousError } = await supabaseAdmin
        .from('players')
        .select('id, nombre, equipo_real, posicion')
    if (previousError) throw new Error(previousError.message)

    // Mapa equips id → nom
    const teamNames = {}
    Object.values(teamsRaw).forEach(t => {
        if (!t?.id) return
        teamNames[t.id] = normalizeText(t.name, 'Desconegut')
    })

    // Mapeig jugadors — camps correctes: team (no teamID), price (no fantasyPrice)
    const jugadors = Object.values(playersRaw)
        .filter(p => POS_MAP[p?.position] && Number.isInteger(Number(p?.id)))
        .map(p => {
            // El camp equip pot venir com a p.team o p.teamID
            const teamId = p.team ?? p.teamID ?? null
            return {
                id:            Number(p.id),
                nombre:        normalizeText(p.name, `Jugador ${p.id}`),
                posicion:      POS_MAP[p.position],
                equipo_real:   teamNames[teamId] || normalizeText(p.teamName, 'Transferits'),
                valor:         calcValor(p.price ?? p.fantasyPrice),
                precio:        p.price ?? p.fantasyPrice ?? 0,
                punts_totals:  p.points ?? 0,
                status:        typeof p.status === 'string' ? p.status : 'ok',
                status_info:   optionalText(p.statusInfo),
                // Foto principal via CDN actual.
                foto:          `${FOTO_BASE}${p.id}.png`,
                escudo_equip:  teamId ? `${ESCUDO_BASE}${teamId}.png` : null,
            }
        })

    if (!jugadors.length) {
        throw new Error('Biwenger no ha retornat jugadors vàlids')
    }

    const previousById = new Map((previousPlayers || []).map((p) => [Number(p.id), p]))
    const currentIdSet = new Set(jugadors.map((p) => p.id))
    const altes = jugadors
        .filter((p) => !previousById.has(p.id))
        .map((p) => ({ id: p.id, nombre: p.nombre, equipo_real: p.equipo_real, posicion: p.posicion }))

    const baixes = (previousPlayers || [])
        .filter((p) => !currentIdSet.has(Number(p.id)))
        .map((p) => ({
            id: Number(p.id),
            nombre: normalizeText(p.nombre, `Jugador ${p.id}`),
            equipo_real: normalizeText(p.equipo_real, 'Sense equip'),
            posicion: normalizeText(p.posicion, '-'),
        }))

    // Upsert — usa 'id' com a clau de conflicte
    const { error } = await supabaseAdmin
        .from('players')
        .upsert(jugadors, { onConflict: 'id' })

    if (error) {
        // Backward compatibility: if status_info column does not exist yet, sync still works.
        if (String(error.message || '').toLowerCase().includes('status_info')) {
            const jugadorsFallback = jugadors.map(({ status_info, ...rest }) => rest)
            const { error: fallbackError } = await supabaseAdmin
                .from('players')
                .upsert(jugadorsFallback, { onConflict: 'id' })
            if (fallbackError) throw new Error(fallbackError.message)
        } else {
            throw new Error(error.message)
        }
    }

    // Sincronització estricta: la taula local ha de reflectir exactament Biwenger
    const { data: totsPlayers, error: errPlayers } = await supabaseAdmin.from('players').select('id')
    if (errPlayers) throw new Error(errPlayers.message)

    const idsBorrar = (totsPlayers || [])
        .map((p) => Number(p.id))
        .filter((id) => Number.isInteger(id) && !currentIdSet.has(id))

    if (idsBorrar.length) {
        const { error: deleteError } = await supabaseAdmin
            .from('players')
            .delete()
            .in('id', idsBorrar)
        if (deleteError) throw new Error(deleteError.message)
    }

    return { total: jugadors.length, eliminats: idsBorrar.length, altes, baixes }
}

export async function POST(request) {
    const { secret } = await request.json().catch(() => ({}))
    if (process.env.SYNC_SECRET && secret !== process.env.SYNC_SECRET) {
        return Response.json({ error: 'No autoritzat' }, { status: 401 })
    }
    try {
        const result = await doSync()
        return Response.json({
            ok: true,
            total: result.total,
            eliminats: result.eliminats,
            altes: result.altes,
            baixes: result.baixes,
            message: `${result.total} jugadors actius sincronitzats · ${result.eliminats} obsolets eliminats`
        })
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
        const result = await doSync()
        return Response.json({
            ok: true,
            total: result.total,
            eliminats: result.eliminats,
            altes: result.altes,
            baixes: result.baixes,
            message: `Cron: ${result.total} actius · ${result.eliminats} eliminats`
        })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}


