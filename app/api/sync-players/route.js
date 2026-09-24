import { createClient } from '@supabase/supabase-js'
import {
    FUTBOLFANTASY_OFFICIAL_POINTS_URL,
    extractOfficialPlayerRows,
    createOfficialPlayerMatcher,
    allocateSyntheticLocalId,
} from '../../../lib/futbolfantasyAnalytics.js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

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
    const url = `${FUTBOLFANTASY_OFFICIAL_POINTS_URL}?_ts=${Date.now()}`
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store'
    })
    if (!res.ok) throw new Error(`FutbolFantasy oficial error: ${res.status}`)
    const html = await res.text()
    const sourceRows = extractOfficialPlayerRows(html)

    if (!sourceRows.length) {
        throw new Error('Resposta de FutbolFantasy incompleta: sense jugadors vàlids')
    }

    const { data: previousPlayers, error: previousError } = await supabaseAdmin
        .from('players')
        .select('id, nombre, equipo_real, posicion, valor, precio, punts_totals, status, status_info, foto, escudo_equip')
    if (previousError) throw new Error(previousError.message)

    const matcher = createOfficialPlayerMatcher(previousPlayers || [])
    const usedIds = new Set()
    const jugadors = sourceRows.map((row) => {
        const previous = matcher.matchRow(row, usedIds)
        const localId = previous
            ? Number(previous.id)
            : allocateSyntheticLocalId(row.sourceId, usedIds)

        usedIds.add(localId)

        const precio = Number(previous?.precio || 0)
        const valor = Number(previous?.valor ?? calcValor(precio))

        return {
            id: localId,
            nombre: normalizeText(row.nombre, previous?.nombre || `Jugador ${localId}`),
            posicion: row.posicion || normalizeText(previous?.posicion, 'Migcampista'),
            equipo_real: normalizeText(row.equipoReal, previous?.equipo_real || 'Desconegut'),
            valor: Number.isFinite(valor) ? valor : calcValor(precio),
            precio,
            punts_totals: Number(row.puntsTotals || 0),
            status: typeof previous?.status === 'string' ? previous.status : 'ok',
            status_info: optionalText(previous?.status_info),
            foto: row.foto || previous?.foto || null,
            escudo_equip: row.escudoEquip || previous?.escudo_equip || null,
        }
    })

    if (!jugadors.length) {
        throw new Error('FutbolFantasy no ha retornat jugadors vàlids')
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

    const jugadorsDescartats = (previousPlayers || [])
        .filter((p) => !currentIdSet.has(Number(p.id)))
        .map((p) => ({
            id: Number(p.id),
            nombre: normalizeText(p.nombre, `Jugador ${p.id}`),
            posicion: normalizeText(p.posicion, 'Migcampista'),
            equipo_real: 'Transferits',
            valor: Number(p.valor ?? calcValor(Number(p.precio || 0))),
            precio: Number(p.precio || 0),
            punts_totals: Number(p.punts_totals || 0),
            status: 'discarded',
            status_info: 'No present a la font oficial actual',
            foto: p.foto || null,
            escudo_equip: p.escudo_equip || null,
        }))

    const jugadorsFinals = [...jugadors, ...jugadorsDescartats]

    // Upsert — usa 'id' com a clau de conflicte
    const { error } = await supabaseAdmin
        .from('players')
        .upsert(jugadorsFinals, { onConflict: 'id' })

    if (error) {
        // Backward compatibility: if status_info column does not exist yet, sync still works.
        if (String(error.message || '').toLowerCase().includes('status_info')) {
            const jugadorsFallback = jugadorsFinals.map(({ status_info, ...rest }) => rest)
            const { error: fallbackError } = await supabaseAdmin
                .from('players')
                .upsert(jugadorsFallback, { onConflict: 'id' })
            if (fallbackError) throw new Error(fallbackError.message)
        } else {
            throw new Error(error.message)
        }
    }

    return { total: jugadors.length, eliminats: jugadorsDescartats.length, altes, baixes }
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
            message: `${result.total} jugadors actius sincronitzats · ${result.eliminats} obsolets marcats com a descartats`
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
            message: `Cron: ${result.total} actius · ${result.eliminats} descartats`
        })
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}


