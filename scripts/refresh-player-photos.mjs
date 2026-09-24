import { createClient } from '@supabase/supabase-js'
import { FUTBOLFANTASY_OFFICIAL_POINTS_URL, extractOfficialPlayerRows, createOfficialPlayerMatcher, allocateSyntheticLocalId } from '../lib/futbolfantasyAnalytics.js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const url = `${FUTBOLFANTASY_OFFICIAL_POINTS_URL}?_ts=${Date.now()}`
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const html = await res.text()
const sourceRows = extractOfficialPlayerRows(html)
if (!sourceRows.length) throw new Error('No source rows')

const { data: previousPlayers, error: previousError } = await supabase
  .from('players')
  .select('id, nombre, equipo_real, posicion, valor, precio, punts_totals, status, status_info, foto, escudo_equip')
if (previousError) throw previousError

const matcher = createOfficialPlayerMatcher(previousPlayers || [])
const usedIds = new Set()
const jugadors = sourceRows.map((row) => {
  const previous = matcher.matchRow(row, usedIds)
  const localId = previous ? Number(previous.id) : allocateSyntheticLocalId(row.sourceId, usedIds)
  usedIds.add(localId)
  const precio = Number(previous?.precio || 0)
  const valor = Number(previous?.valor ?? 6)
  return {
    id: localId,
    nombre: row.nombre?.trim() || previous?.nombre || `Jugador ${localId}`,
    posicion: row.posicion || previous?.posicion || 'Migcampista',
    equipo_real: row.equipoReal?.trim() || previous?.equipo_real || 'Desconegut',
    valor: Number.isFinite(valor) ? valor : 6,
    precio,
    punts_totals: Number(row.puntsTotals || 0),
    status: typeof previous?.status === 'string' ? previous.status : 'ok',
    status_info: previous?.status_info || null,
    foto: row.foto || previous?.foto || null,
    escudo_equip: row.escudoEquip || previous?.escudo_equip || null,
  }
})

const { error } = await supabase.from('players').upsert(jugadors, { onConflict: 'id' })
if (error) throw error
console.log(`Upserted ${jugadors.length} players`)

