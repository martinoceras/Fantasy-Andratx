'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Navbar from '../components/Navbar'

const POS_COLORS = {
    Porter:      { bg: 'bg-yellow-400', text: 'text-yellow-900' },
    Defensa:     { bg: 'bg-blue-500',   text: 'text-blue-900'   },
    Migcampista: { bg: 'bg-green-400',  text: 'text-green-900'  },
    Davanter:    { bg: 'bg-red-500',    text: 'text-red-900'    },
}

const posicions = ['Porter', 'Defensa', 'Migcampista', 'Davanter']

function obtenirMetadadesSerpentina(ordre) {
    if (!ordre.length) return { midaRonda: 0, totalRondes: 0 }

    for (let midaRonda = 1; midaRonda <= ordre.length; midaRonda++) {
        if (ordre.length % midaRonda !== 0) continue

        const base = ordre.slice(0, midaRonda)
        if (new Set(base).size !== base.length) continue

        let valid = true
        for (let start = 0; start < ordre.length; start += midaRonda) {
            const chunk = ordre.slice(start, start + midaRonda)
            const expected = (start / midaRonda) % 2 === 0 ? base : [...base].reverse()
            if (chunk.length !== midaRonda || chunk.some((v, i) => v !== expected[i])) {
                valid = false
                break
            }
        }

        if (valid) return { midaRonda, totalRondes: ordre.length / midaRonda }
    }

    return { midaRonda: ordre.length, totalRondes: 1 }
}

function HistorialCanvis({ canvisPicks, players, participants }) {
    if (!canvisPicks.length) return null
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mt-5">
            <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Canvis realitzats</p>
            <div className="space-y-2">
                {canvisPicks.map(c => {
                    const out  = players.find(p => p.id === c.player_out)
                    const inn  = players.find(p => p.id === c.player_in)
                    const part = participants.find(p => p.id === c.user_id)
                    return (
                        <div key={c.id} className="flex items-center gap-2 bg-gray-800 rounded-lg p-2.5 text-sm flex-wrap">
                            <span className="text-gray-300 font-semibold w-28 truncate flex-shrink-0">{part?.nom || '?'}</span>
                            <span className="text-red-400 flex-1 truncate min-w-0">↑ {out?.nombre || '?'}</span>
                            <span className="text-gray-600">→</span>
                            <span className="text-green-400 flex-1 truncate min-w-0">↓ {inn?.nombre || '?'}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default function Canvis() {
    const [user, setUser]                 = useState(null)
    const [loading, setLoading]           = useState(true)
    const [canvisData, setCanvisData]     = useState(null)
    const [participants, setParticipants] = useState([])
    const [meusPicks, setMeusPicks]       = useState([])
    const [totsElsPicks, setTotsElsPicks] = useState([])
    const [players, setPlayers]           = useState([])
    const [canvisPicks, setCanvisPicks]   = useState([])

    const [playerOut, setPlayerOut]       = useState(null)
    const [playerIn, setPlayerIn]         = useState(null)
    const [confirmant, setConfirmant]     = useState(false)
    const [showConfirm, setShowConfirm]   = useState(false)
    const [cerca, setCerca]               = useState('')
    const [posicioFiltro, setPosicioFiltro] = useState('Tots')

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) return
            setUser(data.user)
            fetchTot(data.user.id)
        })
        const canal = supabase.channel('canvis-canal')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'canvis' }, () => fetchCanvis())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'canvis_picks' }, () => {
                fetchCanvisPicks()
                supabase.auth.getUser().then(({ data }) => data.user && fetchMeusPicks(data.user.id))
            })
            .subscribe()
        return () => supabase.removeChannel(canal)
    }, [])

    async function fetchTot(userId) {
        await Promise.all([
            fetchCanvis(), fetchParticipants(), fetchPlayers(),
            fetchMeusPicks(userId), fetchTotsElsPicks(), fetchCanvisPicks()
        ])
        setLoading(false)
    }

    async function fetchCanvis() {
        const { data } = await supabase.from('canvis').select('*')
            .order('created_at', { ascending: false }).limit(1).single()
        setCanvisData(data)
    }
    async function fetchParticipants() {
        const { data } = await supabase.from('profiles').select('id, nom, email')
        setParticipants(data || [])
    }
    async function fetchPlayers() {
        const { data } = await supabase.from('players').select('*').order('posicion').order('nombre')
        setPlayers(data || [])
    }
    async function fetchMeusPicks(userId) {
        const { data } = await supabase.from('draft_picks').select('player_id').eq('user_id', userId)
        setMeusPicks(data?.map(p => p.player_id) || [])
    }
    async function fetchTotsElsPicks() {
        const { data } = await supabase.from('draft_picks').select('player_id, user_id')
        setTotsElsPicks(data || [])
    }
    async function fetchCanvisPicks() {
        const { data } = await supabase.from('canvis_picks').select('*').order('torn')
        setCanvisPicks(data || [])
    }

    async function ferCanvi() {
        if (!playerOut || !playerIn || !canvisData || !user) return
        setConfirmant(true)
        try {
            await supabase.from('canvis_picks').insert({
                canvi_id: canvisData.id, user_id: user.id,
                player_out: playerOut.id, player_in: playerIn.id,
                torn: canvisData.torn_actual
            })
            await supabase.from('draft_picks').delete().eq('user_id', user.id).eq('player_id', playerOut.id)
            await supabase.from('draft_picks').insert({ user_id: user.id, player_id: playerIn.id, torn: -1 })

            const { data: team } = await supabase.from('teams').select('alineacio').eq('user_id', user.id).single()
            if (team?.alineacio) {
                const nova = { ...team.alineacio }
                const keyOut = Object.entries(nova).find(([, v]) => v === playerOut.id)?.[0]
                if (keyOut) {
                    if (playerIn.posicion === playerOut.posicion) nova[keyOut] = playerIn.id
                    else delete nova[keyOut]
                    await supabase.from('teams').update({ alineacio: nova }).eq('user_id', user.id)
                }
            }

            const ordre = canvisData.ordre_participants || []
            const nouTorn = canvisData.torn_actual + 1
            await supabase.from('canvis').update({
                torn_actual: nouTorn,
                estat: nouTorn >= ordre.length ? 'finalitzat' : 'actiu'
            }).eq('id', canvisData.id)

            setPlayerOut(null); setPlayerIn(null); setShowConfirm(false)
            await fetchTot(user.id)
        } catch (e) { console.error(e) }
        setConfirmant(false)
    }

    const ordre      = canvisData?.ordre_participants || []
    const { midaRonda, totalRondes } = obtenirMetadadesSerpentina(ordre)
    const tornActual = canvisData?.torn_actual ?? 0
    const rondaActual = midaRonda ? Math.floor(tornActual / midaRonda) : 0
    const ordreRondaActual = midaRonda ? ordre.slice(rondaActual * midaRonda, (rondaActual + 1) * midaRonda) : ordre
    const posActual = midaRonda ? tornActual % midaRonda : 0
    const userActual = ordreRondaActual[posActual]
    const esMeuTorn  = userActual === user?.id
    const nomActual  = participants.find(p => p.id === userActual)?.nom || '...'
    const jaHeCanviat = canvisPicks.some(c => c.torn === tornActual && c.user_id === user?.id)

    const pickIds      = new Set(totsElsPicks.map(p => p.player_id))
    const meusPickIds  = new Set(meusPicks)
    const meusJugadors = players.filter(p => meusPickIds.has(p.id))
    const disponibles  = players.filter(p => {
        if (pickIds.has(p.id)) return false
        const okC = cerca === '' || p.nombre.toLowerCase().includes(cerca.toLowerCase()) ||
            (p.equipo_real || '').toLowerCase().includes(cerca.toLowerCase())
        return okC && (posicioFiltro === 'Tots' || p.posicion === posicioFiltro)
    })

    if (loading) return (<><Navbar /><div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Carregant...</div></>)

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-5">
                        <h1 className="text-2xl font-bold text-blue-400">🔄 Ronda de Canvis</h1>
                        <p className="text-gray-400 text-sm">Canvia un jugador del teu equip per un de disponible al mercat</p>
                    </div>

                    {/* PENDENT */}
                    {(!canvisData || canvisData.estat === 'pendent') && (
                        <div className="max-w-md mx-auto text-center bg-gray-900 border border-gray-700 rounded-xl p-10">
                            <div className="text-5xl mb-4">⏳</div>
                            <h2 className="text-white font-bold text-xl mb-2">Ronda de canvis no iniciada</h2>
                            <p className="text-gray-400 text-sm">L&apos;administrador iniciarà la ronda. L&apos;ordre serà l&apos;invers de la classificació general.</p>
                        </div>
                    )}

                    {/* ACTIU */}
                    {canvisData?.estat === 'actiu' && (
                        <>
                            {/* Banner */}
                            <div className={`rounded-xl p-3 mb-5 text-center border ${esMeuTorn && !jaHeCanviat ? 'bg-blue-900/50 border-blue-500 animate-pulse' : 'bg-gray-900 border-gray-700'}`}>
                                <p className="text-xs text-gray-400 mb-0.5">
                                    Torn {tornActual + 1} de {ordre.length}
                                    {totalRondes > 1 && midaRonda ? ` · Ronda ${rondaActual + 1} de ${totalRondes}` : ''}
                                </p>
                                {esMeuTorn && !jaHeCanviat
                                    ? <p className="text-blue-300 font-bold text-lg">🔄 És el teu torn! Selecciona el teu canvi</p>
                                    : jaHeCanviat
                                        ? <p className="text-green-400 font-semibold">✅ Ja has realitzat el teu canvi aquesta ronda</p>
                                        : <p className="text-white font-semibold">⏳ Esperant que <span className="text-yellow-400">{nomActual}</span> faci el seu canvi...</p>
                                }
                            </div>

                            {/* Progrés */}
                            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-5">
                                <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 font-semibold">
                                    Ordre {totalRondes > 1 ? `(serpentina ${totalRondes} rondes)` : '(invers classificació general)'}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {ordre.map((uid, idx) => {
                                        const part = participants.find(p => p.id === uid)
                                        const fet = canvisPicks.some(c => c.torn === idx)
                                        const cur = idx === tornActual
                                        const rondaBadge = midaRonda ? Math.floor(idx / midaRonda) + 1 : 1
                                        return (
                                            <span key={uid} className={`text-xs px-3 py-1.5 rounded-full font-medium border
                                                ${fet ? 'bg-green-900/40 border-green-700 text-green-300' :
                                                  cur ? 'bg-blue-600 border-blue-400 text-white' :
                                                        'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                                {fet ? '✓ ' : cur ? '→ ' : ''}
                                                {part?.nom || uid.slice(0, 8)}{totalRondes > 1 ? ` · R${rondaBadge}` : ''}{uid === user?.id ? ' (tu)' : ''}
                                            </span>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Selecció (només si és el meu torn) */}
                            {esMeuTorn && !jaHeCanviat && (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                                        {/* MEU EQUIP */}
                                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                                            <p className="text-white font-semibold mb-3 flex items-center gap-2 flex-wrap">
                                                <span className="bg-red-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">1</span>
                                                Qui <span className="text-red-400 font-bold">surt</span> del teu equip?
                                                {playerOut && <span className="text-red-400 text-xs ml-auto">↑ {playerOut.nombre}</span>}
                                            </p>
                                            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                                                {posicions.map(pos => {
                                                    const del = meusJugadors.filter(j => j.posicion === pos)
                                                    if (!del.length) return null
                                                    const colors = POS_COLORS[pos]
                                                    return (
                                                        <div key={pos}>
                                                            <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-2 mb-1">{pos}s</p>
                                                            {del.map(j => (
                                                                <button key={j.id} onClick={() => setPlayerOut(playerOut?.id === j.id ? null : j)}
                                                                        className={`w-full flex items-center gap-2 p-2.5 rounded-lg border transition mb-1 text-left
                                                                            ${playerOut?.id === j.id ? 'bg-red-900/50 border-red-500 ring-1 ring-red-400' : 'bg-gray-800 border-gray-700 hover:bg-red-900/20 hover:border-red-900'}`}>
                                                                    {j.foto
                                                                        ? <img src={j.foto} alt={j.nombre} className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-gray-700" onError={e => { e.target.style.display = 'none' }} />
                                                                        : <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${colors.bg} ${colors.text}`}>{j.nombre?.charAt(0)}</div>
                                                                    }
                                                                    <span className="text-white text-sm flex-1 truncate font-medium">{j.nombre}</span>
                                                                    <span className="text-gray-500 text-xs hidden md:block truncate max-w-20">{j.equipo_real}</span>
                                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>{pos.slice(0,3).toUpperCase()}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* DISPONIBLES */}
                                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                                            <p className="text-white font-semibold mb-3 flex items-center gap-2 flex-wrap">
                                                <span className="bg-green-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">2</span>
                                                Qui <span className="text-green-400 font-bold">entra</span> al teu equip?
                                                {playerIn && <span className="text-green-400 text-xs ml-auto">↓ {playerIn.nombre}</span>}
                                            </p>
                                            <div className="flex gap-1.5 mb-3 flex-wrap">
                                                <input type="text" placeholder="🔍 Cercar..." value={cerca} onChange={e => setCerca(e.target.value)}
                                                       className="flex-1 min-w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                                                {['Tots', ...posicions].map(pos => (
                                                    <button key={pos} onClick={() => setPosicioFiltro(pos)}
                                                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition ${posicioFiltro === pos ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                                                        {pos === 'Tots' ? 'Tots' : pos.slice(0, 3).toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                                {disponibles.length === 0
                                                    ? <p className="text-gray-500 text-sm text-center py-8">Cap jugador disponible{cerca ? ` per &ldquo;${cerca}&rdquo;` : ''}</p>
                                                    : disponibles.map(j => {
                                                        const colors = POS_COLORS[j.posicion]
                                                        return (
                                                            <button key={j.id} onClick={() => setPlayerIn(playerIn?.id === j.id ? null : j)}
                                                                    className={`w-full flex items-center gap-2 p-2.5 rounded-lg border transition mb-1 text-left
                                                                        ${playerIn?.id === j.id ? 'bg-green-900/50 border-green-500 ring-1 ring-green-400' : 'bg-gray-800 border-gray-700 hover:bg-green-900/20 hover:border-green-900'}`}>
                                                                {j.foto
                                                                    ? <img src={j.foto} alt={j.nombre} className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-gray-700" onError={e => { e.target.style.display = 'none' }} />
                                                                    : <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${colors.bg} ${colors.text}`}>{j.nombre?.charAt(0)}</div>
                                                                }
                                                                <span className="text-white text-sm flex-1 truncate font-medium">{j.nombre}</span>
                                                                <span className="text-green-400 text-xs flex-shrink-0">{j.precio ? (j.precio/1_000_000).toFixed(1)+'M' : ''}</span>
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>{j.posicion?.slice(0,3).toUpperCase()}</span>
                                                            </button>
                                                        )
                                                    })
                                                }
                                            </div>
                                        </div>
                                    </div>

                                    <button onClick={() => playerOut && playerIn && setShowConfirm(true)}
                                            disabled={!playerOut || !playerIn}
                                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition text-sm">
                                        {playerOut && playerIn
                                            ? `🔄 Confirmar canvi: ${playerOut.nombre} → ${playerIn.nombre}`
                                            : 'Selecciona primer el jugador que surt i el que entra'}
                                    </button>
                                </>
                            )}

                            <HistorialCanvis canvisPicks={canvisPicks} players={players} participants={participants} />
                        </>
                    )}

                    {/* FINALITZAT */}
                    {canvisData?.estat === 'finalitzat' && (
                        <>
                            <div className="bg-green-900/30 border border-green-700 rounded-xl p-5 mb-5 text-center">
                                <div className="text-3xl mb-2">✅</div>
                                <p className="text-green-300 font-bold text-lg">Ronda de canvis completada</p>
                                <p className="text-gray-400 text-sm mt-1">Tots els participants han realitzat el seu canvi</p>
                            </div>
                            <HistorialCanvis canvisPicks={canvisPicks} players={players} participants={participants} />
                        </>
                    )}
                </div>
            </main>

            {/* Modal confirmació */}
            {showConfirm && playerOut && playerIn && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <div className="text-center mb-4">
                            <div className="text-3xl mb-1">🔄</div>
                            <h3 className="text-white font-bold text-lg">Confirmar canvi</h3>
                        </div>
                        <div className="space-y-2.5 mb-5">
                            <div className="flex items-center gap-3 bg-red-950/60 border border-red-800 rounded-xl p-3">
                                {playerOut.foto && <img src={playerOut.foto} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-700" onError={e => { e.target.style.display = 'none' }} />}
                                <div>
                                    <p className="text-red-400 text-[10px] font-bold uppercase">Surt ↑</p>
                                    <p className="text-white font-semibold text-sm">{playerOut.nombre}</p>
                                    <p className="text-gray-400 text-xs">{playerOut.equipo_real} · {playerOut.posicion}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-green-950/60 border border-green-800 rounded-xl p-3">
                                {playerIn.foto && <img src={playerIn.foto} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-700" onError={e => { e.target.style.display = 'none' }} />}
                                <div>
                                    <p className="text-green-400 text-[10px] font-bold uppercase">Entra ↓</p>
                                    <p className="text-white font-semibold text-sm">{playerIn.nombre}</p>
                                    <p className="text-gray-400 text-xs">{playerIn.equipo_real} · {playerIn.posicion} · {playerIn.precio ? (playerIn.precio/1_000_000).toFixed(1)+'M' : ''}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowConfirm(false)} disabled={confirmant}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-medium transition disabled:opacity-50">
                                Cancel·lar
                            </button>
                            <button onClick={ferCanvi} disabled={confirmant}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold transition disabled:opacity-50">
                                {confirmant ? 'Processant...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}






