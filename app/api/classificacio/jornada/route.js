import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const TEMPORADA = '2026-27'
const FORMACIO_DEFAULT = '4-4-2'
const FORMACIONS = {
    '4-4-2':  { Porter: 1, Defensa: 4, Migcampista: 4, Davanter: 2 },
    '4-3-3':  { Porter: 1, Defensa: 4, Migcampista: 3, Davanter: 3 },
    '4-5-1':  { Porter: 1, Defensa: 4, Migcampista: 5, Davanter: 1 },
    '3-4-3':  { Porter: 1, Defensa: 3, Migcampista: 4, Davanter: 3 },
    '3-5-2':  { Porter: 1, Defensa: 3, Migcampista: 5, Davanter: 2 },
    '5-4-1':  { Porter: 1, Defensa: 5, Migcampista: 4, Davanter: 1 },
    '5-3-2':  { Porter: 1, Defensa: 5, Migcampista: 3, Davanter: 2 },
}
const BANQUETA_SLOTS = {
    Davanter: 3,
    Migcampista: 3,
    Defensa: 3,
    Porter: 1,
}
// Mateix ordre que equip/page.js
const ORDRE_POSICIONS = ['Porter', 'Defensa', 'Migcampista', 'Davanter']

function toNumber(value) {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
}

function tePunts(mapa, playerId) {
    return Object.prototype.hasOwnProperty.call(mapa, String(playerId))
}

function aplicarSubstitucionsAutomatiques(alineacio = {}, suplents = {}, mapaPunts = {}) {
    const resultat = { ...alineacio }
    const canvis = []
    const suplentsUsats = new Set()

    Object.entries(alineacio || {}).forEach(([slotKey, titularId]) => {
        if (!titularId || tePunts(mapaPunts, titularId)) return
        const [posicio] = slotKey.split('_')
        const suplent1 = suplents?.[`${posicio}_0`]
        if (!suplent1 || suplentsUsats.has(suplent1)) return
        resultat[slotKey] = suplent1
        suplentsUsats.add(suplent1)
        canvis.push({ slotKey, titularOut: titularId, suplentIn: suplent1 })
    })

    return { alineacioFinal: resultat, canvis }
}

function isEmptyObject(value) {
    return !value || typeof value !== 'object' || Object.keys(value).length === 0
}

/**
 * Genera alineació automàtica des de la llista de jugadors de l'usuari.
 * Usa el mateix algoritme i ordre que autoOmplirPlantilla a equip/page.js:
 * - Players ordenats per id (igual que Supabase retorna per defecte)
 * - Ordre de posicions: Porter, Defensa, Migcampista, Davanter
 */
function autoOmplirDesdePlantilla(players = [], formacioActiva = FORMACIO_DEFAULT) {
    const formacioObj = FORMACIONS[formacioActiva] || FORMACIONS[FORMACIO_DEFAULT]
    const alineacio = {}
    const suplents = {}
    const idsUtilitzats = new Set()

    // Ordena per id (igual que Supabase .in() retorna per defecte)
    const playersSorted = [...players].sort((a, b) => a.id - b.id)

    const byPos = {
        Porter: playersSorted.filter((p) => p?.posicion === 'Porter'),
        Defensa: playersSorted.filter((p) => p?.posicion === 'Defensa'),
        Migcampista: playersSorted.filter((p) => p?.posicion === 'Migcampista'),
        Davanter: playersSorted.filter((p) => p?.posicion === 'Davanter'),
    }

    // Titulars
    for (const posicio of ORDRE_POSICIONS) {
        const required = formacioObj[posicio] || 0
        for (let i = 0; i < required; i += 1) {
            const next = byPos[posicio].find((p) => !idsUtilitzats.has(p.id))
            if (!next) continue
            alineacio[`${posicio}_${i}`] = next.id
            idsUtilitzats.add(next.id)
        }
    }

    // Suplents
    for (const [posicio, count] of Object.entries(BANQUETA_SLOTS)) {
        for (let i = 0; i < count; i += 1) {
            const next = byPos[posicio].find((p) => !idsUtilitzats.has(p.id))
            if (!next) continue
            suplents[`${posicio}_${i}`] = next.id
            idsUtilitzats.add(next.id)
        }
    }

    return { alineacio, suplents, formacio: formacioActiva }
}

export async function GET(request) {
    try {
        const reqUrl = new URL(request.url)
        const jornadaParam = toNumber(reqUrl.searchParams.get('jornada'))
        const jornada = Number.isInteger(jornadaParam) && jornadaParam > 0 ? jornadaParam : 1

        // Llegim totes les dades en paral·lel. Picks ordenats per torn per consistència.
        const [
            { data: punts },
            { data: teams },
            { data: perfils },
            { data: players },
            { data: snapshots },
            { data: picks },
            { data: estatJornada },
        ] = await Promise.all([
            supabaseAdmin.from('player_punts').select('player_id, punts').eq('jornada', jornada),
            supabaseAdmin.from('teams').select('user_id, alineacio, suplents, formacio, temporada'),
            supabaseAdmin.from('profiles').select('id, nom, email'),
            supabaseAdmin.from('players').select('*').order('id', { ascending: true }),
            supabaseAdmin.from('gameweek_lineups').select('user_id, jornada, alineacio, suplents, formacio, locked_at').eq('jornada', jornada),
            supabaseAdmin.from('draft_picks').select('user_id, player_id, torn').order('torn', { ascending: true }),
            fetch(`${reqUrl.origin}/api/gameweek-status`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
        ])

        // Mapa de punts per jornada
        const puntsMapa = {}
        ;(punts || []).forEach((p) => {
            const key = String(p.player_id)
            puntsMapa[key] = (puntsMapa[key] || 0) + Number(p.punts || 0)
        })

        // Index de jugadors i de snapshots
        const snapshotByUser = new Map((snapshots || []).map(s => [s.user_id, s]))
        const playerById = new Map((players || []).map((p) => [p.id, p]))

        // Roster per usuari (players ordenats per torn de draft)
        const rosterByUser = new Map()
        for (const pick of picks || []) {
            if (!pick?.user_id || !pick?.player_id) continue
            const pl = playerById.get(pick.player_id)
            if (!pl) continue
            const roster = rosterByUser.get(pick.user_id) || []
            roster.push(pl)
            rosterByUser.set(pick.user_id, roster)
        }

        // Millor team per usuari (prioritat: temporada actual amb alineació)
        const teamByUser = new Map()
        ;(teams || []).forEach((team) => {
            if (!team?.user_id) return
            const prev = teamByUser.get(team.user_id)
            const prevFilled = !isEmptyObject(prev?.alineacio)
            const currFilled = !isEmptyObject(team?.alineacio)
            const prevIsCurrentSeason = prev?.temporada === TEMPORADA
            const currIsCurrentSeason = team?.temporada === TEMPORADA

            if (!prev) { teamByUser.set(team.user_id, team); return }
            if (currIsCurrentSeason && currFilled && (!prevIsCurrentSeason || !prevFilled)) { teamByUser.set(team.user_id, team); return }
            if (currFilled && !prevFilled) { teamByUser.set(team.user_id, team); return }
            if (currIsCurrentSeason && !prevIsCurrentSeason) { teamByUser.set(team.user_id, team) }
        })

        // Usuaris amb draft
        const draftedUserIds = new Set((picks || []).map((p) => p?.user_id).filter(Boolean))
        const perfilsDraft = (perfils || []).filter((perfil) => draftedUserIds.has(perfil.id))
        const userIds = Array.from(draftedUserIds).filter((uid) =>
            perfilsDraft.some((p) => p.id === uid)
        )
        const perfilById = new Map(perfilsDraft.map((perfil) => [perfil.id, perfil]))

        // Auto-guardar teams que manquen a la BD (perquè El meu equip i Classificació vegin el mateix)
        const teamsAGuardar = []
        for (const userId of userIds) {
            if (teamByUser.has(userId)) continue // ja té team guardat
            const roster = rosterByUser.get(userId) || []
            if (roster.length === 0) continue
            const generated = autoOmplirDesdePlantilla(roster, FORMACIO_DEFAULT)
            const payload = {
                user_id: userId,
                temporada: TEMPORADA,
                formacio: generated.formacio,
                alineacio: generated.alineacio,
                suplents: generated.suplents,
            }
            teamsAGuardar.push(payload)
            teamByUser.set(userId, payload)
        }

        if (teamsAGuardar.length > 0) {
            // Upsert silenciós: no bloqueja la resposta si falla
            supabaseAdmin
                .from('teams')
                .upsert(teamsAGuardar, { onConflict: 'user_id,temporada' })
                .then(({ error }) => {
                    if (error) console.error('[classificacio/jornada] Error guardant teams:', error.message)
                })
                .catch(() => {})
        }

        // Snapshot de jornada si cal bloquejar
        const activeWeekNum = Number(estatJornada?.activeWeek)
        const shouldLockSnapshotNow =
            estatJornada?.lockEditing === true &&
            Number.isInteger(activeWeekNum) &&
            activeWeekNum === jornada

        if (shouldLockSnapshotNow) {
            const rowsToSnapshot = []
            for (const userId of userIds) {
                if (snapshotByUser.has(userId)) continue
                const team = teamByUser.get(userId)
                if (!team || isEmptyObject(team.alineacio)) continue
                rowsToSnapshot.push({
                    user_id: userId,
                    jornada,
                    alineacio: team.alineacio || {},
                    suplents: team.suplents || {},
                    formacio: team.formacio || FORMACIO_DEFAULT,
                    locked_at: new Date().toISOString(),
                })
            }
            if (rowsToSnapshot.length > 0) {
                await supabaseAdmin
                    .from('gameweek_lineups')
                    .upsert(rowsToSnapshot, { onConflict: 'user_id,jornada' })
                    .then(({ error }) => {
                        if (error) console.warn('[classificacio/jornada] gameweek_lineups upsert:', error.message)
                    })
                    .catch(() => {})
                rowsToSnapshot.forEach((row) => snapshotByUser.set(row.user_id, row))
            }
        }

        // Substitucions automàtiques (si la jornada ja ha acabat i hi ha punts)
        const substitutionsActives = (() => {
            const tePuntsOficials = (punts || []).length > 0
            if (!tePuntsOficials || !Number.isInteger(activeWeekNum)) return false
            if (jornada < activeWeekNum) return true
            if (jornada === activeWeekNum) return estatJornada?.mode === 'season_finished'
            return false
        })()

        // Construïm el team efectiu per cada usuari
        const teamsAplicats = userIds.map((userId) => {
            const snap = snapshotByUser.get(userId)
            const team = teamByUser.get(userId) || {}

            let alineacioBase = snap?.alineacio || team.alineacio || {}
            let suplentsBase = snap?.suplents || team.suplents || {}
            let formacioBase = snap?.formacio || team.formacio || FORMACIO_DEFAULT

            // Fallback de seguretat
            if (isEmptyObject(alineacioBase)) {
                const roster = rosterByUser.get(userId) || []
                const generated = autoOmplirDesdePlantilla(roster, FORMACIO_DEFAULT)
                alineacioBase = generated.alineacio
                if (isEmptyObject(suplentsBase)) suplentsBase = generated.suplents
            }

            const { alineacioFinal, canvis } = substitutionsActives
                ? aplicarSubstitucionsAutomatiques(alineacioBase, suplentsBase, puntsMapa)
                : { alineacioFinal: alineacioBase, canvis: [] }

            const perfil = perfilById.get(userId)
            return {
                user_id: userId,
                nom: perfil?.nom || perfil?.email || userId,
                email: perfil?.email || null,
                alineacio: alineacioFinal,
                suplents: suplentsBase,
                suplentsGuardats: suplentsBase,
                formacio: formacioBase,
                formacioGuardada: formacioBase,
                lockedAt: snap?.locked_at || null,
                substitucions: canvis,
            }
        })

        // Ranking ordenat per punts
        const rankingJornadaActual = teamsAplicats.map((team) => {
            const alineacio = team?.alineacio || {}
            const totalPunts = Object.values(alineacio).reduce(
                (sum, pid) => sum + (puntsMapa[String(pid)] || 0),
                0
            )
            return { userId: team.user_id, nom: team.nom, punts: totalPunts }
        }).sort((a, b) => b.punts - a.punts)

        const allPlayers = (players || []).map((p) => ({
            ...p,
            equipo_real: p.equipo_real === 'Desconegut' ? 'Transferits' : p.equipo_real,
        }))

        return Response.json({
            ok: true,
            jornada,
            rankingJornadaActual,
            teamsData: teamsAplicats,
            allPlayers,
            puntsByPlayer: puntsMapa,
            participantSel: rankingJornadaActual[0]?.userId || null,
            estatJornada,
        }, {
            headers: { 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        return Response.json(
            { ok: false, error: error?.message || 'Error carregant classificació de la jornada' },
            { status: 500 }
        )
    }
}

