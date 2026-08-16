'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Navbar from '../components/Navbar'
import BiwengerAvatar from '../components/BiwengerAvatar'

const FORMACIONS = {
    '4-4-2':  { Porter: 1, Defensa: 4, Migcampista: 4, Davanter: 2 },
    '4-3-3':  { Porter: 1, Defensa: 4, Migcampista: 3, Davanter: 3 },
    '4-5-1':  { Porter: 1, Defensa: 4, Migcampista: 5, Davanter: 1 },
    '3-4-3':  { Porter: 1, Defensa: 3, Migcampista: 4, Davanter: 3 },
    '3-5-2':  { Porter: 1, Defensa: 3, Migcampista: 5, Davanter: 2 },
    '5-4-1':  { Porter: 1, Defensa: 5, Migcampista: 4, Davanter: 1 },
    '5-3-2':  { Porter: 1, Defensa: 5, Migcampista: 3, Davanter: 2 },
}

const POS_COLORS = {
    Porter:      { bg: 'bg-yellow-400', text: 'text-yellow-900', border: 'border-yellow-300' },
    Defensa:     { bg: 'bg-blue-500',   text: 'text-blue-900',   border: 'border-blue-400'   },
    Migcampista: { bg: 'bg-green-400',  text: 'text-green-900',  border: 'border-green-400'  },
    Davanter:    { bg: 'bg-red-500',    text: 'text-red-900',    border: 'border-red-400'    },
}

const BANQUETA_SLOTS = {
    Davanter: 1,
    Migcampista: 1,
    Defensa: 1,
    Porter: 1,
}

function normalitzarSuplents(suplentsRaw) {
    if (!suplentsRaw) return {}
    if (!Array.isArray(suplentsRaw)) return suplentsRaw

    const slots = {}
    let idx = 0
    Object.entries(BANQUETA_SLOTS).forEach(([posicio, total]) => {
        for (let i = 0; i < total; i += 1) {
            const id = suplentsRaw[idx]
            if (id) slots[`${posicio}_${i}`] = id
            idx += 1
        }
    })
    return slots
}

function nomCurt(nom) {
    if (!nom) return ''
    const parts = nom.trim().split(' ')
    const cognom = parts[parts.length - 1]
    return cognom.length > 9 ? cognom.slice(0, 9) : cognom
}

function formatLockedAt(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('ca-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date)
}

function teRegistrePunts(mapaPunts, playerId) {
    return Object.prototype.hasOwnProperty.call(mapaPunts, String(playerId))
}

function aplicarSubstitucionsAutomatiques(alineacio = {}, suplents = {}, mapaPunts = {}) {
    const resultat = { ...alineacio }
    const canvis = []
    const suplentsUsats = new Set()

    Object.entries(alineacio || {}).forEach(([slotKey, titularId]) => {
        if (!titularId || teRegistrePunts(mapaPunts, titularId)) return

        const [posicio] = slotKey.split('_')
        const suplent1 = suplents?.[`${posicio}_0`]
        if (!suplent1 || suplentsUsats.has(suplent1)) return

        resultat[slotKey] = suplent1
        suplentsUsats.add(suplent1)
        canvis.push({ slotKey, titularOut: titularId, suplentIn: suplent1 })
    })

    return { alineacioFinal: resultat, canvis }
}

function potAplicarBanqueta({ jornada, estatJornada, tePuntsOficials }) {
    if (!tePuntsOficials) return false
    const activeWeek = Number(estatJornada?.activeWeek)
    if (!Number.isInteger(activeWeek)) return false

    if (jornada < activeWeek) return true
    if (jornada === activeWeek) return estatJornada?.mode === 'season_finished'
    return false
}

// ── Camp read-only (fora del component principal) ───────────────
function CampEquip({ userId, teamsData, allPlayers, puntsByPlayer }) {
    const team = teamsData.find(t => t.user_id === userId)
    if (!team) return <div className="text-gray-500 text-sm text-center py-10">Sense equip configurat</div>

    const formacio    = team.formacio || team.formacioGuardada || '4-4-2'
    const alineacio   = team.alineacio || team.alineacioGuardada || {}
    const suplents    = normalitzarSuplents(team.suplents || team.suplentsGuardats || {})
    const formacioObj = FORMACIONS[formacio] || FORMACIONS['4-4-2']
    const substitutes = Array.isArray(team.substitucions) ? team.substitucions : []

    const getPuntsJugador = (playerId) => Number(puntsByPlayer[String(playerId)] ?? 0)

    function getBanquetaJugador(posicio, index) {
        const id = suplents[`${posicio}_${index}`]
        return allPlayers.find((p) => p.id === id) || null
    }

    function renderSlotLlegible(posicio, index) {
        const key      = `${posicio}_${index}`
        const playerId = alineacio[key]
        const jugador  = allPlayers.find(p => p.id === playerId)
        const colors   = POS_COLORS[posicio]
        const pts      = playerId ? getPuntsJugador(playerId) : null

        return (
            <div key={key} className="flex flex-col items-center" style={{ width: 76 }}>
                <div className={`w-16 h-16 border-2 relative overflow-hidden
                    ${jugador ? `${colors.bg} ${colors.border}` : 'border-dashed border-white/20 bg-black/20'}`}>
                    {jugador ? (
                        <BiwengerAvatar
                            key={`cls_${jugador.id}_${jugador.foto || ''}`}
                            player={jugador}
                            alt={jugador.nombre}
                            className="w-full h-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
                            fallbackClassName={`w-full h-full rounded-full flex items-center justify-center ${colors.bg}`}
                            initialClassName={`text-[10px] font-bold ${colors.text}`}
                        />
                    ) : (
                        <span className="text-white/20 text-lg absolute inset-0 flex items-center justify-center">+</span>
                    )}
                </div>
                <span className="text-white/90 text-xs mt-1 text-center w-20 truncate font-semibold">
                    {jugador ? nomCurt(jugador.nombre) : ''}
                </span>
                {jugador && (
                    <span className="text-green-400 text-[11px] font-bold mt-0.5 bg-black/35 rounded-full px-1.5 py-[1px]">
                        {pts} pts
                    </span>
                )}
            </div>
        )
    }

    function renderBanquetaSlot(posicio, index) {
        const jugador = getBanquetaJugador(posicio, index)
        const colors = POS_COLORS[posicio]
        const pts = jugador ? getPuntsJugador(jugador.id) : null

        return (
            <div key={`${posicio}_${index}`} className="flex flex-col items-center" style={{ width: 82 }}>
                <div className={`w-16 h-16 border-2 flex items-center justify-center relative transition-all ${jugador ? `${colors.bg} ${colors.border}` : 'bg-black/20 border-dashed border-white/20'}`}>
                    {jugador ? (
                        <BiwengerAvatar
                            key={`cls_banq_${jugador.id}_${jugador.foto || ''}`}
                            player={jugador}
                            alt={jugador.nombre}
                            className="w-full h-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
                            fallbackClassName={`w-full h-full rounded-full flex items-center justify-center ${colors.bg}`}
                            initialClassName={`text-[10px] font-bold ${colors.text}`}
                        />
                    ) : (
                        <span className="text-white/25 text-base">{index + 1}</span>
                    )}
                </div>
                <span className="text-[10px] text-gray-500 mt-1 font-semibold">{posicio.slice(0, 3).toUpperCase()} · #{index + 1}</span>
                <span className="text-white text-xs mt-0.5 text-center truncate w-full font-semibold">
                    {jugador ? nomCurt(jugador.nombre) : '---'}
                </span>
                {jugador && <span className="text-green-400 text-[11px] font-bold">{pts} pts</span>}
            </div>
        )
    }

    return (
        <div>
            <div className="bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2 mb-3">
                <p className="text-[11px] font-semibold text-cyan-300">Titulars guardats per la jornada</p>
                <p className="text-gray-400 text-[11px] mt-1">
                    Formació {formacio}
                    {team.lockedAt && <span className="ml-2 text-gray-500">· Bloquejada {formatLockedAt(team.lockedAt)}</span>}
                </p>
                {substitutes.length > 0 && (
                    <p className="text-amber-300 text-[11px] mt-1">
                        Substitucions automàtiques aplicades: {substitutes.length}
                    </p>
                )}
            </div>

            <div className="flex gap-4 items-start flex-col xl:flex-row">
                {/* Camp */}
                <div className="w-[380px] max-w-full flex-shrink-0">
                    <div className="relative rounded-xl overflow-hidden"
                         style={{
                             width: 380,
                             maxWidth: '100%',
                             height: 560,
                             backgroundImage: `repeating-linear-gradient(180deg,rgba(255,255,255,0.04) 0px,rgba(255,255,255,0.04) 40px,transparent 40px,transparent 80px),
                             linear-gradient(180deg,#1e5c1e 0%,#246b24 14%,#1e5c1e 28%,#246b24 42%,#1e5c1e 56%,#246b24 70%,#1e5c1e 84%,#246b24 100%)`,
                             border: '3px solid #14401a',
                             boxShadow: 'inset 0 0 40px rgba(0,0,0,0.4), 0 4px 20px rgba(0,0,0,0.5)'
                         }}>
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 480" preserveAspectRatio="none">
                            <rect x="8" y="8" width="304" height="464" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
                            <line x1="8" y1="240" x2="312" y2="240" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
                            <circle cx="160" cy="240" r="40" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
                            <circle cx="160" cy="240" r="2" fill="rgba(255,255,255,0.5)"/>
                            <rect x="60" y="8" width="200" height="65" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                            <rect x="100" y="8" width="120" height="28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                            <rect x="60" y="407" width="200" height="65" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                            <rect x="100" y="444" width="120" height="28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                            <rect x="120" y="2" width="80" height="10" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
                            <rect x="120" y="468" width="80" height="10" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
                            <circle cx="160" cy="55" r="2.5" fill="rgba(255,255,255,0.4)"/>
                            <circle cx="160" cy="425" r="2.5" fill="rgba(255,255,255,0.4)"/>
                        </svg>
                        <div className="absolute inset-0 flex flex-col justify-between" style={{ padding: '24px 18px' }}>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioObj.Davanter }).map((_, i) => renderSlotLlegible('Davanter', i))}
                            </div>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioObj.Migcampista }).map((_, i) => renderSlotLlegible('Migcampista', i))}
                            </div>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioObj.Defensa }).map((_, i) => renderSlotLlegible('Defensa', i))}
                            </div>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioObj.Porter }).map((_, i) => renderSlotLlegible('Porter', i))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Banqueta */}
                <div className="w-[430px] max-w-full flex-shrink-0 min-w-0">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 overflow-y-auto" style={{ maxHeight: 560 }}>
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                            Banqueta ({Object.values(suplents).filter(Boolean).length})
                        </p>
                        {Object.entries(BANQUETA_SLOTS).map(([posicio, totalSlots]) => (
                            <div key={posicio} className="mb-3 last:mb-0">
                                <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-2">{posicio}</p>
                                <div className="flex gap-3 flex-wrap justify-center w-full">
                                    {Array.from({ length: totalSlots }).map((_, index) => renderBanquetaSlot(posicio, index))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function Classificacio() {
    const [ranking, setRanking]                           = useState([])
    const [loading, setLoading]                           = useState(true)
    const [tabActiva, setTabActiva]                       = useState('jornada')
    const [importantPunts, setImportantPunts]             = useState(false)
    const [darreraImportacioAt, setDarreraImportacioAt]   = useState(null)
    const [refreshKey, setRefreshKey]                     = useState(0)

    // Jornada actual
    const [jornadaActual, setJornadaActual]               = useState(1)
    const [rankingJornadaActual, setRankingJornadaActual] = useState([])
    const [carregantActual, setCarregantActual]           = useState(false)
    const [participantSel, setParticipantSel]             = useState(null)
    const [teamsData, setTeamsData]                       = useState([])
    const [allPlayers, setAllPlayers]                     = useState([])
    const [puntsByPlayer, setPuntsByPlayer]               = useState({})

    // Jornades passades
    const [jornadaSeleccionada, setJornadaSeleccionada]   = useState(1)
    const [rankingJornada, setRankingJornada]             = useState([])
    const [carregantJornada, setCarregantJornada]         = useState(false)

    const jornades = Array.from({ length: 38 }, (_, i) => i + 1)

    const TABS = [
        { id: 'jornada',  label: '📅 Jornada actual' },
        { id: 'passades', label: '📋 Jornades passades' },
        { id: 'general',  label: '🏆 Classificació general' },
    ]

    async function importarPuntsJornada() {
        if (importantPunts) return
        setImportantPunts(true)
        try {
            const res = await fetch('/api/admin/import-futmondo-points', { cache: 'no-store' })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json?.ok) {
                alert(json?.error || 'No s\'ha pogut importar els punts')
                return
            }

            setDarreraImportacioAt(json.importedAt || null)
            setRefreshKey((prev) => prev + 1)
        } catch (error) {
            alert(error?.message || 'Error important punts')
        } finally {
            setImportantPunts(false)
        }
    }

    useEffect(() => {
        let actiu = true

        async function syncJornadaActual() {
            const estat = await fetch('/api/gameweek-status', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
            if (!actiu || !estat?.ok) return

            const activeWeek = Number(estat.activeWeek)
            if (!Number.isInteger(activeWeek) || activeWeek <= 0) return

            const jornadaRanking = estat.mode === 'countdown' && activeWeek > 1 ? activeWeek - 1 : activeWeek
            setJornadaActual(jornadaRanking)
            setJornadaSeleccionada((prev) => (prev === 1 ? jornadaRanking : prev))
        }

        void syncJornadaActual()
        return () => { actiu = false }
    }, [])

    useEffect(() => {
        let actiu = true

        async function loadDarreraImportacio() {
            const jornada = Number(jornadaActual)
            if (!Number.isInteger(jornada) || jornada <= 0) {
                setDarreraImportacioAt(null)
                return
            }

            const res = await fetch(`/api/admin/gameweek-points?jornada=${jornada}`, { cache: 'no-store' })
            const json = await res.json().catch(() => ({}))
            if (!actiu || !res.ok || !json?.ok) return
            setDarreraImportacioAt(json.lastImportAt || null)
        }

        void loadDarreraImportacio()
        return () => { actiu = false }
    }, [jornadaActual, refreshKey])

    // Carrega dades generals (per ranking general)
    useEffect(() => {
        let actiu = true

        async function loadRanking() {
            try {
                const [{ data: punts }, { data: teams }, { data: perfils }, { data: picks }] = await Promise.all([
                    supabase.from('player_punts').select('player_id, punts'),
                    supabase.from('teams').select('user_id, alineacio'),
                    supabase.from('profiles').select('id, nom, email'),
                    supabase.from('draft_picks').select('user_id'),
                ])
                if (!actiu) return

                const draftedUserIds = new Set((picks || []).map((pick) => pick?.user_id).filter(Boolean))
                const perfilsDraft = (perfils || []).filter((perfil) => draftedUserIds.has(perfil.id))
                const puntsMapa = {}
                punts?.forEach((p) => {
                    const key = String(p.player_id)
                    puntsMapa[key] = (puntsMapa[key] || 0) + Number(p.punts || 0)
                })

                const llista = perfilsDraft.map((perfil) => {
                    const team = teams?.find(t => t.user_id === perfil.id)
                    const alineacio = team?.alineacio || {}
                    const total = Object.values(alineacio).reduce((sum, pid) => sum + (puntsMapa[pid] || 0), 0)
                    return {
                        userId: perfil.id,
                        total,
                        nom: perfil.nom || perfil.email || `${perfil.id.slice(0, 8)}...`,
                    }
                }).sort((a, b) => b.total - a.total)

                setRanking(llista)
            } finally {
                if (actiu) setLoading(false)
            }
        }

        void loadRanking()
        return () => { actiu = false }
    }, [])

    // Carrega dades de la jornada actual (tab 1)
    useEffect(() => {
        if (tabActiva !== 'jornada') return
        let actiu = true

        async function loadActual() {
            setCarregantActual(true)
            const res = await fetch(`/api/classificacio/jornada?jornada=${jornadaActual}`, { cache: 'no-store' })
            const json = await res.json().catch(() => ({}))

            if (!actiu || !res.ok || !json?.ok) {
                setCarregantActual(false)
                return
            }

            setRankingJornadaActual(json.rankingJornadaActual || [])
            setTeamsData(json.teamsData || [])
            setAllPlayers(json.allPlayers || [])
            setPuntsByPlayer(json.puntsByPlayer || {})

            const selected = json.participantSel || json.rankingJornadaActual?.[0]?.userId || null
            setParticipantSel(selected)
            setCarregantActual(false)
        }

        void loadActual()
        return () => { actiu = false }
    }, [tabActiva, jornadaActual])

    // Carrega ranking d'una jornada passada (tab 2)
    useEffect(() => {
        if (tabActiva !== 'passades') return
        let actiu = true
        async function loadJornada() {
            setCarregantJornada(true)
            setRankingJornada([])
            const [
                { data: punts },
                { data: teams },
                { data: perfils },
                { data: snapshots },
                { data: picks },
                estatJornadaRes,
            ] = await Promise.all([
                supabase.from('player_punts').select('player_id, punts').eq('jornada', jornadaSeleccionada),
                supabase.from('teams').select('user_id, alineacio, suplents'),
                supabase.from('profiles').select('id, nom, email'),
                supabase.from('gameweek_lineups').select('user_id, jornada, alineacio, suplents').eq('jornada', jornadaSeleccionada),
                supabase.from('draft_picks').select('user_id'),
                fetch('/api/gameweek-status', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
            ])
            if (!actiu) return
            const draftedUserIds = new Set((picks || []).map((pick) => pick?.user_id).filter(Boolean))
            const perfilsDraft = (perfils || []).filter((perfil) => draftedUserIds.has(perfil.id))
            const puntsMapa = {}
            punts?.forEach((p) => {
                const key = String(p.player_id)
                puntsMapa[key] = (puntsMapa[key] || 0) + Number(p.punts || 0)
            })

            const substitutionsActives = potAplicarBanqueta({
                jornada: jornadaSeleccionada,
                estatJornada: estatJornadaRes,
                tePuntsOficials: (punts || []).length > 0,
            })

            const snapshotByUser = new Map((snapshots || []).map(s => [s.user_id, s]))
            const teamsAplicats = (teams || []).filter((team) => draftedUserIds.has(team.user_id)).map((team) => {
                const snap = snapshotByUser.get(team.user_id)
                const alineacioBase = snap?.alineacio || team.alineacio || {}
                const suplentsBase = snap?.suplents || team.suplents || {}
                const { alineacioFinal } = substitutionsActives
                    ? aplicarSubstitucionsAutomatiques(alineacioBase, suplentsBase, puntsMapa)
                    : { alineacioFinal: alineacioBase }
                return { ...team, alineacio: alineacioFinal }
            })

            const rankingCalculat = perfilsDraft.map(perfil => {
                const team = teamsAplicats.find(t => t.user_id === perfil.id)
                const alineacio = team?.alineacio || {}
                const totalPunts = Object.values(alineacio).reduce((sum, pid) => sum + (puntsMapa[pid] || 0), 0)
                return { userId: perfil.id, nom: perfil.nom || perfil.email || '...', punts: totalPunts }
            }).sort((a, b) => b.punts - a.punts)
            setRankingJornada(rankingCalculat)
            setCarregantJornada(false)
        }
        void loadJornada()
        return () => { actiu = false }
    }, [jornadaSeleccionada, tabActiva, refreshKey])

    // ── Render ──────────────────────────────────────────────────────
    if (loading) return (
        <>
            <Navbar />
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Carregant...</div>
        </>
    )

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
                <div className="max-w-6xl mx-auto">

                    {/* Capçalera */}
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-green-400">🏆 Classificació</h1>
                        <div className="flex flex-col items-end gap-1">
                            <button
                                onClick={importarPuntsJornada}
                                disabled={importantPunts}
                                className="bg-green-500 hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm transition font-semibold"
                            >
                                {importantPunts ? 'Important punts...' : '📥 Importar punts'}
                            </button>
                            <p className="text-[11px] text-gray-400">
                                {darreraImportacioAt
                                    ? `Darrera importació feta: ${formatLockedAt(darreraImportacioAt)}`
                                    : 'Darrera importació feta: --'}
                            </p>
                        </div>
                    </div>

                    {/* Botons de tab */}
                    <div className="flex rounded-xl overflow-hidden border border-gray-700 mb-6">
                        {TABS.map((tab, i) => (
                            <button key={tab.id} onClick={() => setTabActiva(tab.id)}
                                    className={`flex-1 py-2.5 px-2 text-xs md:text-sm font-semibold transition
                                        ${tabActiva === tab.id ? 'bg-green-500 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}
                                        ${i > 0 ? 'border-l border-gray-700' : ''}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* ── TAB 1: Jornada actual ── */}
                    {tabActiva === 'jornada' && (
                        <section>
                            <p className="text-gray-400 text-sm mb-4">Jornada {jornadaActual}</p>
                            {carregantActual ? (
                                <p className="text-gray-500 text-center py-12 animate-pulse">Carregant...</p>
                            ) : (
                                <div className="flex gap-4 items-start flex-col lg:flex-row">

                                    {/* ESQUERRA: Ranking */}
                                    <div className="w-full lg:w-72 flex-shrink-0">
                                        <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2">Classificació</p>
                                        {rankingJornadaActual.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-8 bg-gray-900 border border-gray-800 rounded-xl">
                                                Sense puntuacions per la jornada {jornadaActual}
                                            </p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {rankingJornadaActual.map((p, i) => {
                                                    const esSel = participantSel === p.userId
                                                    const medalles = ['🥇', '🥈', '🥉']
                                                    return (
                                                        <button key={p.userId} onClick={() => setParticipantSel(p.userId)}
                                                                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition border text-left
                                                                    ${esSel
                                                                        ? 'bg-green-500/20 border-green-500 shadow-lg shadow-green-900/30'
                                                                        : 'bg-gray-900 border-gray-800 hover:bg-gray-800'}`}>
                                                            <div className="text-base w-8 text-center font-bold">
                                                                {i < 3 ? medalles[i] : <span className="text-gray-400 text-sm">{i + 1}</span>}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`font-semibold truncate text-sm ${esSel ? 'text-green-300' : 'text-white'}`}>
                                                                    {p.nom}
                                                                </div>
                                                            </div>
                                                            <div className={`font-bold text-sm ${esSel ? 'text-green-300' : 'text-green-400'}`}>
                                                                {p.punts} pts
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* DRETA: Camp de l'equip seleccionat */}
                                    <div className="flex-1 min-w-0">
                                        {participantSel ? (
                                            <>
                                                <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2">
                                                    Equip de {rankingJornadaActual.find(p => p.userId === participantSel)?.nom}
                                                </p>
                                                <CampEquip
                                                    userId={participantSel}
                                                    teamsData={teamsData}
                                                    allPlayers={allPlayers}
                                                    puntsByPlayer={puntsByPlayer}
                                                />
                                            </>
                                        ) : (
                                            <p className="text-gray-600 text-sm text-center py-12">
                                                Carregant equip titular i reserves...
                                            </p>
                                        )}
                                    </div>

                                </div>
                            )}
                        </section>
                    )}

                    {/* ── TAB 2: Jornades passades ── */}
                    {tabActiva === 'passades' && (
                        <section className="max-w-2xl">
                            <p className="text-gray-400 text-sm mb-3">Selecciona una jornada:</p>
                            <div className="grid grid-cols-7 md:grid-cols-10 gap-1.5 mb-5">
                                {jornades.map(j => (
                                    <button key={j} onClick={() => setJornadaSeleccionada(j)}
                                            className={`text-xs rounded-lg py-1.5 border transition font-mono
                                                ${jornadaSeleccionada === j
                                                    ? 'bg-green-500 border-green-400 text-white font-bold'
                                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                        {j}
                                    </button>
                                ))}
                            </div>
                            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                                <p className="text-white font-semibold mb-3">Classificació — Jornada {jornadaSeleccionada}</p>
                                {carregantJornada ? (
                                    <p className="text-gray-500 text-sm text-center py-6 animate-pulse">Carregant...</p>
                                ) : rankingJornada.length === 0 ? (
                                    <p className="text-gray-500 text-sm text-center py-6">
                                        Encara no hi ha puntuacions per la jornada {jornadaSeleccionada}.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {rankingJornada.map((p, i) => (
                                            <div key={p.userId} className="flex items-center gap-3 bg-gray-950/70 border border-gray-800 rounded-lg p-3">
                                                <div className="text-lg w-9 text-center font-bold">
                                                    {i < 3 ? ['🥇','🥈','🥉'][i] : <span className="text-gray-400 text-sm">{i + 1}</span>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-white truncate">{p.nom}</div>
                                                </div>
                                                <div className="text-green-400 font-bold">{p.punts} pts</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* ── TAB 3: Classificació general ── */}
                    {tabActiva === 'general' && (
                        <section className="max-w-2xl">
                            <p className="text-gray-400 text-sm mb-4">Acumulat de tota la temporada</p>
                            {ranking.length === 0 ? (
                                <p className="text-gray-500 text-center py-12">Encara no hi ha dades generals.</p>
                            ) : (
                                <div className="space-y-2">
                                    {ranking.map((p, i) => (
                                        <div key={p.userId} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
                                            <div className="text-lg w-9 text-center font-bold">
                                                {i < 3 ? ['🥇','🥈','🥉'][i] : <span className="text-gray-400 text-sm">{i + 1}</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-white truncate">{p.nom}</div>
                                                <div className="text-gray-500 text-xs">{p.total} punts totals</div>
                                            </div>
                                            <div className="text-green-400 font-bold">{p.total} pts</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                </div>
            </main>
        </>
    )
}