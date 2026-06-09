'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import Navbar from '../components/Navbar'

const POS_COLORS = {
    Porter:      { bg: 'bg-yellow-500', text: 'text-yellow-900' },
    Defensa:     { bg: 'bg-blue-500',   text: 'text-blue-900'   },
    Migcampista: { bg: 'bg-green-500',  text: 'text-green-900'  },
    Davanter:    { bg: 'bg-red-500',    text: 'text-red-900'    },
}

export default function CanviBomba() {
    const [user, setUser]                   = useState(null)
    const [perfil, setPerfil]               = useState(null)
    const [loading, setLoading]             = useState(true)
    const [jornada, setJornada]             = useState(0)       // jornada actual detectada
    const [meusPicks, setMeusPicks]         = useState([])      // jugadors del meu equip (objectes)
    const [jugadorsDisponibles, setJugadorsDisponibles] = useState([]) // no triats per ningú
    const [usadaV1, setUsadaV1]             = useState(false)
    const [usadaV2, setUsadaV2]             = useState(false)
    const [historial, setHistorial]         = useState([])      // tots els canvis bomba de tots
    const [profiles, setProfiles]           = useState([])

    // Formulari actiu
    const [voltaActiva, setVoltaActiva]     = useState(null)    // 1 | 2 | null
    const [jugadorSurt, setJugadorSurt]     = useState(null)
    const [jugadorEntra, setJugadorEntra]   = useState(null)
    const [cercaDisp, setCercaDisp]         = useState('')
    const [posFiltre, setPosFiltre]         = useState('Tots')
    const [confirmant, setConfirmant]       = useState(false)
    const [missatge, setMissatge]           = useState('')

    const router = useRouter()

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) { router.push('/login'); return }
            setUser(data.user)
            fetchTot(data.user.id)
        })
    }, [])

    async function fetchTot(userId) {
        const [
            { data: perfilData },
            { data: puntsData },
            { data: picks },
            { data: allPlayers },
            { data: bombesData },
            { data: profilesData },
        ] = await Promise.all([
            supabase.from('profiles').select('id, nom, email').eq('id', userId).single(),
            supabase.from('player_punts').select('jornada').order('jornada', { ascending: false }).limit(1),
            supabase.from('draft_picks').select('player_id, user_id'),
            supabase.from('players').select('*').order('posicion').order('nombre'),
            supabase.from('canvi_bomba').select('*').order('created_at', { ascending: false }),
            supabase.from('profiles').select('id, nom, email'),
        ])

        setPerfil(perfilData)
        setProfiles(profilesData || [])

        // Jornada actual = màxima jornada amb punts registrats
        const jornadaActual = puntsData?.[0]?.jornada || 0
        setJornada(jornadaActual)

        // Jugadors de l'usuari
        const myPickIds = new Set((picks || []).filter(p => p.user_id === userId).map(p => p.player_id))
        const allPickIds = new Set((picks || []).map(p => p.player_id))
        const meus = (allPlayers || []).filter(p => myPickIds.has(p.id))
        const disp = (allPlayers || []).filter(p => !allPickIds.has(p.id))
        setMeusPicks(meus)
        setJugadorsDisponibles(disp)

        // Bombes usades per l'usuari
        const mesBombes = (bombesData || []).filter(b => b.user_id === userId)
        setUsadaV1(mesBombes.some(b => b.volta === 1))
        setUsadaV2(mesBombes.some(b => b.volta === 2))

        // Historial complet amb noms de jugadors i usuaris
        const allPlayersMap = {}
        ;(allPlayers || []).forEach(p => { allPlayersMap[p.id] = p })
        const hist = (bombesData || []).map(b => ({
            ...b,
            jugadorSurtObj:  allPlayersMap[b.jugador_surt],
            jugadorEntraObj: allPlayersMap[b.jugador_entra],
        }))
        setHistorial(hist)

        setLoading(false)
    }

    async function confirmarCanviBomba() {
        if (!jugadorSurt || !jugadorEntra || !voltaActiva) return
        setConfirmant(true)
        setMissatge('')

        // 1. Inserir a canvi_bomba
        const { error: errBomba } = await supabase.from('canvi_bomba').insert({
            user_id:       user.id,
            volta:         voltaActiva,
            jugador_surt:  jugadorSurt.id,
            jugador_entra: jugadorEntra.id,
        })
        if (errBomba) {
            setMissatge('❌ Error: ' + errBomba.message)
            setConfirmant(false)
            return
        }

        // 2. Actualitzar draft_picks: eliminar el que surt, afegir el nou
        await supabase.from('draft_picks').delete().eq('user_id', user.id).eq('player_id', jugadorSurt.id)
        await supabase.from('draft_picks').insert({ player_id: jugadorEntra.id, user_id: user.id, torn: -1 })

        // 3. Actualitzar teams.alineacio si el jugador sortint era titular
        const { data: teamData } = await supabase.from('teams').select('id, alineacio').eq('user_id', user.id).single()
        if (teamData?.alineacio) {
            const alineacio = { ...teamData.alineacio }
            let canviat = false
            Object.entries(alineacio).forEach(([key, val]) => {
                if (val === jugadorSurt.id) { alineacio[key] = jugadorEntra.id; canviat = true }
            })
            if (canviat) await supabase.from('teams').update({ alineacio }).eq('id', teamData.id)
        }

        setMissatge(`✅ Canvi BOMBA ${voltaActiva}a volta fet! ${jugadorSurt.nombre} → ${jugadorEntra.nombre}`)
        setVoltaActiva(null)
        setJugadorSurt(null)
        setJugadorEntra(null)
        setCercaDisp('')
        setConfirmant(false)
        await fetchTot(user.id)
        setTimeout(() => setMissatge(''), 5000)
    }

    // ── Helpers UI ───────────────────────────────────────────────────
    const disponiblesFiltrats = jugadorsDisponibles.filter(p => {
        const okCerca = cercaDisp === '' || p.nombre.toLowerCase().includes(cercaDisp.toLowerCase()) || (p.equipo_real || '').toLowerCase().includes(cercaDisp.toLowerCase())
        const okPos = posFiltre === 'Tots' || p.posicion === posFiltre
        return okCerca && okPos
    })

    function badgePos(pos) {
        const c = POS_COLORS[pos] || { bg: 'bg-gray-600', text: 'text-white' }
        return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>{pos?.slice(0,3).toUpperCase()}</span>
    }

    function formatPreu(precio) {
        if (!precio) return '—'
        if (precio >= 1_000_000) return (precio / 1_000_000).toFixed(1) + 'M'
        if (precio >= 1_000) return Math.round(precio / 1_000) + 'K'
        return precio.toString()
    }

    if (loading) return (
        <>
            <Navbar />
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Carregant...</div>
        </>
    )

    const pot1aVolta = !usadaV1 && jornada >= 1 && jornada <= 19
    const pot2aVolta = !usadaV2 && jornada >= 20 && jornada <= 38

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
                <div className="max-w-4xl mx-auto">

                    {/* Capçalera */}
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-red-400 mb-1">💣 Canvi BOMBA</h1>
                        <p className="text-gray-400 text-sm">
                            Canvia un jugador de la teva plantilla per un de disponible · Una sola vegada per volta
                        </p>
                        <p className="text-gray-600 text-xs mt-1">
                            Jornada actual detectada: <span className="text-white font-semibold">{jornada === 0 ? 'Sense dades' : `J${jornada}`}</span>
                        </p>
                    </div>

                    {missatge && (
                        <div className={`border px-4 py-3 rounded-xl mb-5 text-sm font-medium ${missatge.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                            {missatge}
                        </div>
                    )}

                    {/* ── Botons de volta ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        {/* 1a Volta */}
                        <div className={`rounded-2xl border p-5 ${usadaV1 ? 'bg-gray-900 border-gray-700 opacity-60' : jornada > 19 ? 'bg-gray-900 border-gray-700 opacity-50' : 'bg-red-950/40 border-red-700'}`}>
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-3xl">💣</span>
                                <div>
                                    <p className="text-white font-bold text-lg">1a Volta</p>
                                    <p className="text-gray-400 text-xs">Jornades 1 – 19</p>
                                </div>
                                {usadaV1 && <span className="ml-auto text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded-full">✓ Usada</span>}
                                {!usadaV1 && jornada > 19 && <span className="ml-auto text-xs bg-gray-700 text-gray-500 px-2 py-1 rounded-full">Expirada</span>}
                                {!usadaV1 && jornada >= 1 && jornada <= 19 && <span className="ml-auto text-xs bg-green-700 text-green-200 px-2 py-1 rounded-full">Disponible</span>}
                                {!usadaV1 && jornada === 0 && <span className="ml-auto text-xs bg-yellow-700/50 text-yellow-400 px-2 py-1 rounded-full">Pendent</span>}
                            </div>
                            <button
                                onClick={() => { setVoltaActiva(voltaActiva === 1 ? null : 1); setJugadorSurt(null); setJugadorEntra(null); setCercaDisp('') }}
                                disabled={!pot1aVolta}
                                className={`w-full py-3 rounded-xl font-bold text-sm transition
                                    ${!pot1aVolta
                                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                        : voltaActiva === 1
                                            ? 'bg-red-400 text-white'
                                            : 'bg-red-600 hover:bg-red-500 text-white'
                                    }`}>
                                {usadaV1 ? '✓ Canvi BOMBA 1a Volta ja usat' : voltaActiva === 1 ? '✕ Cancel·lar' : '💣 ACTIVAR CANVI BOMBA 1a Volta'}
                            </button>
                        </div>

                        {/* 2a Volta */}
                        <div className={`rounded-2xl border p-5 ${usadaV2 ? 'bg-gray-900 border-gray-700 opacity-60' : jornada < 20 ? 'bg-gray-900 border-gray-700 opacity-50' : 'bg-orange-950/40 border-orange-700'}`}>
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-3xl">💥</span>
                                <div>
                                    <p className="text-white font-bold text-lg">2a Volta</p>
                                    <p className="text-gray-400 text-xs">Jornades 20 – 38</p>
                                </div>
                                {usadaV2 && <span className="ml-auto text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded-full">✓ Usada</span>}
                                {!usadaV2 && jornada < 20 && <span className="ml-auto text-xs bg-gray-700 text-gray-500 px-2 py-1 rounded-full">No disponible</span>}
                                {!usadaV2 && jornada >= 20 && <span className="ml-auto text-xs bg-green-700 text-green-200 px-2 py-1 rounded-full">Disponible</span>}
                            </div>
                            <button
                                onClick={() => { setVoltaActiva(voltaActiva === 2 ? null : 2); setJugadorSurt(null); setJugadorEntra(null); setCercaDisp('') }}
                                disabled={!pot2aVolta}
                                className={`w-full py-3 rounded-xl font-bold text-sm transition
                                    ${!pot2aVolta
                                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                        : voltaActiva === 2
                                            ? 'bg-orange-400 text-white'
                                            : 'bg-orange-600 hover:bg-orange-500 text-white'
                                    }`}>
                                {usadaV2 ? '✓ Canvi BOMBA 2a Volta ja usat' : voltaActiva === 2 ? '✕ Cancel·lar' : '💥 ACTIVAR CANVI BOMBA 2a Volta'}
                            </button>
                        </div>
                    </div>

                    {/* ── Formulari de canvi ── */}
                    {voltaActiva && (
                        <div className="bg-gray-900 border border-red-700/50 rounded-2xl p-5 mb-8 animate-in">
                            <h2 className="text-white font-bold text-lg mb-4">
                                💣 Selecciona el canvi — {voltaActiva === 1 ? '1a' : '2a'} Volta
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* ── Esquerra: Jugador que SURT ── */}
                                <div>
                                    <p className="text-red-400 font-semibold text-sm mb-2">🔴 Jugador que SURT del teu equip</p>
                                    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                        {['Porter', 'Defensa', 'Migcampista', 'Davanter'].map(pos => {
                                            const del = meusPicks.filter(j => j.posicion === pos)
                                            if (!del.length) return null
                                            return (
                                                <div key={pos}>
                                                    <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-2 mb-1">{pos}s</p>
                                                    {del.map(j => (
                                                        <button
                                                            key={j.id}
                                                            onClick={() => setJugadorSurt(jugadorSurt?.id === j.id ? null : j)}
                                                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-1 transition text-left border
                                                                ${jugadorSurt?.id === j.id
                                                                    ? 'bg-red-900/60 border-red-500'
                                                                    : 'bg-gray-800 hover:bg-red-950/40 border-transparent hover:border-red-700'
                                                                }`}>
                                                            <div className="relative w-8 h-8 flex-shrink-0">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${POS_COLORS[j.posicion]?.bg} ${POS_COLORS[j.posicion]?.text}`}>
                                                                    {j.nombre?.charAt(0)}
                                                                </div>
                                                                {j.foto && <img src={j.foto} alt="" className="w-8 h-8 rounded-full object-cover absolute inset-0" onError={e => { e.target.style.display='none' }} />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-white text-xs font-medium truncate">{j.nombre}</p>
                                                                <div className="flex items-center gap-1">
                                                                    {j.escudo_equip && <img src={j.escudo_equip} alt="" className="w-3 h-3 object-contain" onError={e => { e.target.style.display='none' }} />}
                                                                    <p className="text-gray-500 text-[10px] truncate">{j.equipo_real}</p>
                                                                </div>
                                                            </div>
                                                            {badgePos(j.posicion)}
                                                            {jugadorSurt?.id === j.id && <span className="text-red-400 text-xs">✓</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* ── Dreta: Jugador que ENTRA ── */}
                                <div>
                                    <p className="text-green-400 font-semibold text-sm mb-2">🟢 Jugador que ENTRA a la teva plantilla</p>
                                    <input
                                        type="text"
                                        placeholder="🔍 Cercar jugador disponible..."
                                        value={cercaDisp}
                                        onChange={e => setCercaDisp(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-green-500 mb-2"
                                    />
                                    <div className="flex gap-1 mb-2 flex-wrap">
                                        {['Tots', 'Porter', 'Defensa', 'Migcampista', 'Davanter'].map(pos => (
                                            <button key={pos} onClick={() => setPosFiltre(pos)}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold transition
                                                        ${posFiltre === pos ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                                {pos === 'Tots' ? 'Tots' : pos.slice(0,3).toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                        {disponiblesFiltrats.length === 0 ? (
                                            <p className="text-gray-600 text-xs text-center py-4">Sense jugadors disponibles</p>
                                        ) : (
                                            disponiblesFiltrats.map(j => (
                                                <button
                                                    key={j.id}
                                                    onClick={() => setJugadorEntra(jugadorEntra?.id === j.id ? null : j)}
                                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 transition text-left border
                                                        ${jugadorEntra?.id === j.id
                                                            ? 'bg-green-900/60 border-green-500'
                                                            : 'bg-gray-800 hover:bg-green-950/40 border-transparent hover:border-green-700'
                                                        }`}>
                                                    <div className="relative w-8 h-8 flex-shrink-0">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${POS_COLORS[j.posicion]?.bg} ${POS_COLORS[j.posicion]?.text}`}>
                                                            {j.nombre?.charAt(0)}
                                                        </div>
                                                        {j.foto && <img src={j.foto} alt="" className="w-8 h-8 rounded-full object-cover absolute inset-0" onError={e => { e.target.style.display='none' }} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-xs font-medium truncate">{j.nombre}</p>
                                                        <div className="flex items-center gap-1">
                                                            {j.escudo_equip && <img src={j.escudo_equip} alt="" className="w-3 h-3 object-contain" onError={e => { e.target.style.display='none' }} />}
                                                            <p className="text-gray-500 text-[10px] truncate">{j.equipo_real}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        {badgePos(j.posicion)}
                                                        <p className="text-green-400 text-[10px] font-bold mt-0.5">{formatPreu(j.precio)}</p>
                                                    </div>
                                                    {jugadorEntra?.id === j.id && <span className="text-green-400 text-xs">✓</span>}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Resum + Confirmar */}
                            {jugadorSurt && jugadorEntra && (
                                <div className="mt-5 bg-gray-800 border border-gray-600 rounded-xl p-4">
                                    <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Resum del canvi BOMBA</p>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <div className="flex items-center gap-2 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                                            <span className="text-red-400 text-sm">🔴</span>
                                            <span className="text-white text-sm font-semibold">{jugadorSurt.nombre}</span>
                                            <span className="text-gray-500 text-xs">{jugadorSurt.equipo_real}</span>
                                        </div>
                                        <span className="text-gray-400 text-xl">→</span>
                                        <div className="flex items-center gap-2 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2">
                                            <span className="text-green-400 text-sm">🟢</span>
                                            <span className="text-white text-sm font-semibold">{jugadorEntra.nombre}</span>
                                            <span className="text-gray-500 text-xs">{jugadorEntra.equipo_real}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={confirmarCanviBomba}
                                        disabled={confirmant}
                                        className="mt-4 w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition">
                                        {confirmant ? '⏳ Confirmant...' : `💣 CONFIRMAR CANVI BOMBA ${voltaActiva === 1 ? '1a' : '2a'} VOLTA`}
                                    </button>
                                    <p className="text-gray-600 text-xs text-center mt-2">⚠️ Aquesta acció no es pot desfer i consumirà el Canvi BOMBA de la {voltaActiva === 1 ? '1a' : '2a'} volta</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Historial de tots els canvis BOMBA ── */}
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
                        <h2 className="text-white font-bold text-lg mb-4">📋 Historial de Canvis BOMBA</h2>
                        {historial.length === 0 ? (
                            <p className="text-gray-600 text-sm text-center py-6">Encara no hi ha canvis BOMBA registrats.</p>
                        ) : (
                            <div className="space-y-2">
                                {historial.map(b => {
                                    const propietari = profiles.find(p => p.id === b.user_id)
                                    const surt  = b.jugadorSurtObj
                                    const entra = b.jugadorEntraObj
                                    const data  = new Date(b.created_at).toLocaleDateString('ca-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                                    return (
                                        <div key={b.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 flex-wrap">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${b.volta === 1 ? 'bg-red-700 text-red-200' : 'bg-orange-700 text-orange-200'}`}>
                                                💣 {b.volta === 1 ? '1a' : '2a'} Volta
                                            </span>
                                            <span className="text-gray-300 text-sm font-semibold flex-shrink-0">
                                                {propietari?.nom || propietari?.email?.split('@')[0] || '?'}
                                            </span>
                                            <div className="flex items-center gap-2 flex-1 flex-wrap">
                                                <div className="flex items-center gap-1.5 bg-red-950/50 rounded-lg px-2 py-1">
                                                    {surt?.foto && <img src={surt.foto} alt="" className="w-5 h-5 rounded-full object-cover" onError={e => { e.target.style.display='none' }} />}
                                                    <span className="text-red-300 text-xs font-medium">{surt?.nombre || `ID:${b.jugador_surt}`}</span>
                                                    {surt && badgePos(surt.posicion)}
                                                </div>
                                                <span className="text-gray-500 text-sm">→</span>
                                                <div className="flex items-center gap-1.5 bg-green-950/50 rounded-lg px-2 py-1">
                                                    {entra?.foto && <img src={entra.foto} alt="" className="w-5 h-5 rounded-full object-cover" onError={e => { e.target.style.display='none' }} />}
                                                    <span className="text-green-300 text-xs font-medium">{entra?.nombre || `ID:${b.jugador_entra}`}</span>
                                                    {entra && badgePos(entra.posicion)}
                                                </div>
                                            </div>
                                            <span className="text-gray-600 text-xs flex-shrink-0">{data}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </>
    )
}

