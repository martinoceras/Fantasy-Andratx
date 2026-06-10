'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import Navbar from '../components/Navbar'

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

function nomCurt(nom) {
    if (!nom) return ''
    const parts = nom.trim().split(' ')
    const cognom = parts[parts.length - 1]
    return cognom.length > 9 ? cognom.slice(0, 9) : cognom
}

// ── Camp read-only (fora del component principal) ───────────────
function CampEquip({ userId, teamsData, allPlayers, puntsByPlayer }) {
    const team = teamsData.find(t => t.user_id === userId)
    if (!team) return <div className="text-gray-500 text-sm text-center py-10">Sense equip configurat</div>

    const formacio    = team.formacio || '4-4-2'
    const alineacio   = team.alineacio || {}
    const formacioObj = FORMACIONS[formacio] || FORMACIONS['4-4-2']

    const titularJugadors = Object.entries(alineacio).map(([key, pid]) => ({
        key, player: allPlayers.find(p => p.id === pid)
    })).filter(x => x.player)

    function renderSlotLlegible(posicio, index) {
        const key      = `${posicio}_${index}`
        const playerId = alineacio[key]
        const jugador  = allPlayers.find(p => p.id === playerId)
        const colors   = POS_COLORS[posicio]
        const pts      = playerId ? (puntsByPlayer[playerId] ?? null) : null

        return (
            <div key={key} className="flex flex-col items-center" style={{ width: 56 }}>
                <div className={`w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center
                    ${jugador ? `${colors.bg} ${colors.border}` : 'border-dashed border-white/20 bg-black/20'}`}>
                    {jugador ? (
                        <>
                            <span className={`text-[9px] font-bold ${colors.text} leading-tight text-center px-0.5`}>
                                {nomCurt(jugador.nombre)}
                            </span>
                            {pts !== null && (
                                <span className={`text-[8px] font-bold ${colors.text} opacity-80`}>{pts}p</span>
                            )}
                        </>
                    ) : (
                        <span className="text-white/20 text-lg">·</span>
                    )}
                </div>
                <span className="text-white/60 text-[9px] mt-0.5 text-center w-14 truncate">
                    {jugador ? nomCurt(jugador.nombre) : ''}
                </span>
            </div>
        )
    }

    return (
        <div>
            {/* Camp */}
            <div className="relative rounded-xl overflow-hidden mb-3"
                 style={{
                     width: '100%', maxWidth: 280, margin: '0 auto',
                     height: 380,
                     backgroundImage: `repeating-linear-gradient(180deg,rgba(255,255,255,0.04) 0px,rgba(255,255,255,0.04) 40px,transparent 40px,transparent 80px),
                     linear-gradient(180deg,#1e5c1e 0%,#246b24 14%,#1e5c1e 28%,#246b24 42%,#1e5c1e 56%,#246b24 70%,#1e5c1e 84%,#246b24 100%)`,
                     border: '2px solid #14401a',
                     boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4)'
                 }}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 280 380" preserveAspectRatio="none">
                    <rect x="6" y="6" width="268" height="368" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                    <line x1="6" y1="190" x2="274" y2="190" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                    <circle cx="140" cy="190" r="35" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
                </svg>
                <div className="absolute inset-0 flex flex-col justify-between" style={{ padding: '14px 8px' }}>
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

            {/* Llista titulars amb punts */}
            {titularJugadors.length > 0 && (
                <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-2">
                    <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1.5 font-semibold">
                        Formació: {formacio}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                        {titularJugadors.map(({ key, player }) => {
                            const colors = POS_COLORS[player.posicion]
                            const pts    = puntsByPlayer[player.id] ?? null
                            return (
                                <div key={key} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2 py-1">
                                    <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                                        {player.posicion.slice(0, 3).toUpperCase()}
                                    </span>
                                    <span className="text-white text-[10px] flex-1 truncate">{player.nombre}</span>
                                    {pts !== null && (
                                        <span className="text-green-400 text-[10px] font-bold">{pts}p</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function Classificacio() {
    const [ranking, setRanking]                           = useState([])
    const [loading, setLoading]                           = useState(true)
    const [tabActiva, setTabActiva]                       = useState('jornada')

    // Jornada actual
    const [jornadaActual]                                 = useState(1)
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

    // Carrega dades generals (per ranking general)
    useEffect(() => {
        let actiu = true
        async function loadRanking() {
            const [{ data: punts }, { data: teams }, { data: perfils }] = await Promise.all([
                supabase.from('player_punts').select('player_id, punts'),
                supabase.from('teams').select('user_id, alineacio'),
                supabase.from('profiles').select('id, nom, email'),
            ])
            if (!actiu) return
            const puntsMapa = {}
            punts?.forEach(p => { puntsMapa[p.player_id] = (puntsMapa[p.player_id] || 0) + Number(p.punts) })

            const llista = (perfils || []).map(perfil => {
                const team = teams?.find(t => t.user_id === perfil.id)
                const alineacio = team?.alineacio || {}
                const total = Object.values(alineacio).reduce((sum, pid) => sum + (puntsMapa[pid] || 0), 0)
                return {
                    userId: perfil.id,
                    total,
                    nom: perfil.nom || perfil.email || perfil.id.slice(0, 8) + '...'
                }
            }).sort((a, b) => b.total - a.total)
            setRanking(llista)
            setLoading(false)
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
            const [{ data: punts }, { data: teams }, { data: perfils }, { data: playersAll }] = await Promise.all([
                supabase.from('player_punts').select('player_id, punts').eq('jornada', jornadaActual),
                supabase.from('teams').select('user_id, alineacio, formacio'),
                supabase.from('profiles').select('id, nom, email'),
                supabase.from('players').select('*'),
            ])
            if (!actiu) return

            setAllPlayers(playersAll || [])
            setTeamsData(teams || [])

            const mapa = {}
            punts?.forEach(p => { mapa[p.player_id] = Number(p.punts) })
            setPuntsByPlayer(mapa)

            const calc = (perfils || []).map(perfil => {
                const team = teams?.find(t => t.user_id === perfil.id)
                const alineacio = team?.alineacio || {}
                const totalPunts = Object.values(alineacio).reduce((sum, pid) => sum + (mapa[pid] || 0), 0)
                return { userId: perfil.id, nom: perfil.nom || perfil.email || '...', punts: totalPunts }
            }).sort((a, b) => b.punts - a.punts)

            setRankingJornadaActual(calc)
            if (calc.length > 0) setParticipantSel(sel => sel ?? calc[0].userId)
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
            const [{ data: punts }, { data: teams }, { data: perfils }] = await Promise.all([
                supabase.from('player_punts').select('player_id, punts').eq('jornada', jornadaSeleccionada),
                supabase.from('teams').select('user_id, alineacio'),
                supabase.from('profiles').select('id, nom, email'),
            ])
            if (!actiu) return
            const puntsMapa = {}
            punts?.forEach(p => { puntsMapa[p.player_id] = Number(p.punts) })
            const rankingCalculat = (perfils || []).map(perfil => {
                const team = teams?.find(t => t.user_id === perfil.id)
                const alineacio = team?.alineacio || {}
                const totalPunts = Object.values(alineacio).reduce((sum, pid) => sum + (puntsMapa[pid] || 0), 0)
                return { userId: perfil.id, nom: perfil.nom || perfil.email || '...', punts: totalPunts }
            }).sort((a, b) => b.punts - a.punts)
            setRankingJornada(rankingCalculat)
            setCarregantJornada(false)
        }
        void loadJornada()
        return () => { actiu = false }
    }, [jornadaSeleccionada, tabActiva])

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
                        <Link href="/draft" className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg text-sm transition">
                            Anar al Draft
                        </Link>
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
                                                Selecciona un participant per veure el seu equip
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