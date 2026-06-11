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

export default function Draft() {
    const [players, setPlayers]           = useState([])
    const [picks, setPicks]               = useState([])         // [player_id]
    const [picksDetall, setPicksDetall]   = useState([])         // [{player_id, user_id}]
    const [meusPicks, setMeusPicks]       = useState([])
    const [user, setUser]                 = useState(null)
    const [loading, setLoading]           = useState(true)
    const [draft, setDraft]               = useState(null)
    const [participants, setParticipants] = useState([])
    const [cerca, setCerca]               = useState('')
    const [posicioFiltro, setPosicioFiltro] = useState('Tots')
    const [ordenar, setOrdenar]           = useState('posicio')  // 'posicio' | 'preu' | 'punts'
    const [vistaJugadors, setVistaJugadors] = useState('tots') // 'tots' | 'disponibles' | 'seleccionats'
    const [jugadorPreSel, setJugadorPreSel] = useState(null)
    const [confirmant, setConfirmant]       = useState(false)
    const [puntsByPlayer, setPuntsByPlayer] = useState({})     // {playerId: [{jornada, punts}]} — darreres 5
    const [araTs, setAraTs] = useState(() => Date.now())
    const router = useRouter()

    function segonsTornActual() {
        if (!draft?.torn_iniciat_at) return 0
        const inici = new Date(draft.torn_iniciat_at).getTime()
        if (Number.isNaN(inici)) return 0
        return Math.max(0, Math.floor((araTs - inici) / 1000))
    }

    function formatTemps(segonsTotals) {
        const segons = Math.max(0, Number(segonsTotals) || 0)
        const min = Math.floor(segons / 60)
        const sec = segons % 60
        return `${min}:${String(sec).padStart(2, '0')}`
    }

    function formatDuracio(segonsTotals) {
        const segons = Math.max(0, Number(segonsTotals) || 0)
        const mins = Math.floor(segons / 60)
        const sec = segons % 60
        if (mins >= 60) {
            const h = Math.floor(mins / 60)
            const m = mins % 60
            return `${h}h ${String(m).padStart(2, '0')}m`
        }
        return `${mins}m ${String(sec).padStart(2, '0')}s`
    }

    function classeTemps(mins) {
        if (mins > 60) return 'text-red-400'
        if (mins >= 21) return 'text-yellow-400'
        return 'text-green-400'
    }

    async function guardarPerfil(u) {
        const { data } = await supabase.from('profiles').select('id').eq('id', u.id).single()
        if (!data) {
            await supabase.from('profiles').insert({
                id: u.id, email: u.email,
                nom: u.user_metadata?.full_name || u.email.split('@')[0]
            })
        }
    }

    async function fetchTot(userId) {
        await Promise.all([fetchPlayers(), fetchPicks(userId), fetchDraft(), fetchParticipants(), fetchPuntsJornades()])
        setLoading(false)
    }

    async function fetchPlayers() {
        const { data } = await supabase.from('players').select('*').order('posicion').order('nombre')
        setPlayers(data || [])
    }

    async function fetchPuntsJornades() {
        const { data } = await supabase
            .from('player_punts')
            .select('player_id, jornada, punts')
            .order('jornada', { ascending: false })
        const mapa = {}
        data?.forEach(p => {
            if (!mapa[p.player_id]) mapa[p.player_id] = []
            if (mapa[p.player_id].length < 5) mapa[p.player_id].push({ jornada: p.jornada, punts: p.punts })
        })
        // Mostrar de més antiga a més recent
        Object.keys(mapa).forEach(k => { mapa[k] = mapa[k].reverse() })
        setPuntsByPlayer(mapa)
    }

    async function fetchPicks(userId) {
        const { data } = await supabase
            .from('draft_picks')
            .select('player_id, user_id, torn, temps_seleccio')
            .order('torn', { ascending: true })
        setPicksDetall(data || [])
        setPicks(data?.map(p => p.player_id) || [])
        if (userId) setMeusPicks(data?.filter(p => p.user_id === userId).map(p => p.player_id) || [])
    }

    async function fetchDraft() {
        const { data } = await supabase.from('drafts').select('*').single()
        setDraft(data)
    }

    async function fetchParticipants() {
        const { data } = await supabase.from('profiles').select('id, nom, email')
        setParticipants(data || [])
    }

    async function unirseAlDraft() {
        if (!draft || !user) return
        const ordre = draft.ordre_participants || []
        if (ordre.includes(user.id)) return
        const nouOrdre = [...ordre, user.id]
        await supabase.from('drafts').update({ ordre_participants: nouOrdre }).eq('id', draft.id)
        fetchDraft()
    }

    async function pickPlayer(playerId) {
        if (!user || !draft || !esMeuTorn) return
        const playerData = players.find(p => p.id === playerId)
        const tornSegons = segonsTornActual()

        // Validació límit equip real
        if (playerData && maxEquip < 999) {
            const comptActual = meusDeEquipReal(playerData.equipo_real)
            if (comptActual >= maxEquip) {
                alert(`Ja tens ${comptActual} jugadors de ${playerData.equipo_real}. Màxim permès: ${maxEquip}`)
                setJugadorPreSel(null)
                setConfirmant(false)
                return
            }
        }

        // Validació límit per posició
        if (playerData) {
            const maxPos   = LIMIT_POSICIO[playerData.posicion] ?? 99
            const comptPos = meusDePos(playerData.posicion)
            if (comptPos >= maxPos) {
                alert(`Ja tens ${comptPos} ${playerData.posicion}s. Màxim permès: ${maxPos}`)
                setJugadorPreSel(null)
                setConfirmant(false)
                return
            }
        }
        setConfirmant(true)
        const ordre = draft.ordre_participants || []
        const ronda = Math.floor(draft.torn_actual / ordre.length)
        const esParell = ronda % 2 === 0
        const ordenat = esParell ? ordre : [...ordre].reverse()
        const posActual = draft.torn_actual % ordre.length
        const posSeguent = (posActual + 1) % ordre.length
        const seguentUserId = ordenat[posSeguent]

        await supabase.from('draft_picks').insert({
            player_id: playerId,
            user_id: user.id,
            torn: draft.torn_actual,
            temps_seleccio: tornSegons,
        })
        await supabase.from('drafts').update({
            torn_actual: draft.torn_actual + 1,
            torn_iniciat_at: new Date().toISOString(),
        }).eq('id', draft.id)

        const seguent = participants.find(p => p.id === seguentUserId)
        if (seguent?.email) {
            await fetch('/api/notify-torn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: seguent.email, nom: seguent.nom || seguent.email,
                    torn: draft.torn_actual + 2, jugadorsTriats: picks.length + 1
                })
            })
        }
        setJugadorPreSel(null)
        setConfirmant(false)
    }

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) router.push('/login')
            else { setUser(data.user); guardarPerfil(data.user); fetchTot(data.user.id) }
        })

        const canal = supabase.channel('draft-canal')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks' }, () => {
                supabase.auth.getUser().then(({ data }) => fetchPicks(data.user?.id))
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drafts' }, () => {
                fetchDraft()
            })
            .subscribe()

        return () => { void supabase.removeChannel(canal) }
    }, [])

    useEffect(() => {
        const id = setInterval(() => setAraTs(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

    // ── Derived state ────────────────────────────────────────────────
    const ordre = draft?.ordre_participants || []
    const n = ordre.length || 1
    const rondaActual = draft ? Math.floor(draft.torn_actual / n) : 0
    const ordenatActual = rondaActual % 2 === 0 ? ordre : [...ordre].reverse()
    const posActual = draft ? draft.torn_actual % n : 0
    const userActual = ordenatActual[posActual]
    const esMeuTorn = userActual === user?.id
    const nomActual = participants.find(p => p.id === userActual)?.nom || '...'
    const jaEstic = ordre.includes(user?.id)
    const segonsTurn = segonsTornActual()
    const minutsTurn = Math.floor(segonsTurn / 60)
    const colorTemps = classeTemps(minutsTurn)

    function propietari(playerId) {
        const pick = picksDetall.find(p => p.player_id === playerId)
        if (!pick) return null
        const part = participants.find(p => p.id === pick.user_id)
        return part?.nom || part?.email?.split('@')[0] || '?'
    }

    // Genera llista de torns per al panell dret
    function generarTorns() {
        if (!ordre.length || !draft) return []
        const total = draft.max_jugadors * ordre.length
        const result = []
        const inici = Math.max(0, draft.torn_actual - 3)
        const fi = Math.min(total, draft.torn_actual + 15)
        for (let t = inici; t < fi; t++) {
            const r = Math.floor(t / n)
            const ord = r % 2 === 0 ? ordre : [...ordre].reverse()
            const uid = ord[t % n]
            const part = participants.find(p => p.id === uid)
            result.push({
                t, uid,
                nom: part?.nom || part?.email?.split('@')[0] || '...',
                esCurrent: t === draft.torn_actual,
                esPassat: t < draft.torn_actual,
                esMeu: uid === user?.id,
            })
        }
        return result
    }

    // Filtre jugadors
    const maxEquip = draft?.max_jugadors_equip || 999  // límit per equip real
    const maxJugadorsDraft = draft?.max_jugadors || 15

    // Límits per posició (fixes de la lliga)
    const LIMIT_POSICIO = { Porter: 2, Defensa: 6, Migcampista: 6, Davanter: 4 }

    // Compte quants jugadors meus hi ha per cada equip real
    function meusDeEquipReal(equipReal) {
        return meusPicks.filter(pid => {
            const p = players.find(pl => pl.id === pid)
            return p?.equipo_real === equipReal
        }).length
    }

    // Compte quants jugadors meus per posició
    function meusDePos(posicio) {
        return meusPicks.filter(pid => {
            const p = players.find(pl => pl.id === pid)
            return p?.posicion === posicio
        }).length
    }

    const posicions = ['Porter', 'Defensa', 'Migcampista', 'Davanter']
    const jugadorsFiltrats = players
        .filter(p => {
            const okCerca = cerca === '' || p.nombre.toLowerCase().includes(cerca.toLowerCase()) ||
                (p.equipo_real || '').toLowerCase().includes(cerca.toLowerCase())
            const okPos = posicioFiltro === 'Tots' || p.posicion === posicioFiltro
            return okCerca && okPos
        })
        .sort((a, b) => {
            if (ordenar === 'preu')  return (b.precio || 0) - (a.precio || 0)
            if (ordenar === 'punts') return (b.punts_totals || 0) - (a.punts_totals || 0)
            return 0  // 'posicio': l'agrupació ja gestiona l'ordre
        })
    const jugadorsDisponibles = jugadorsFiltrats.filter(p => !picks.includes(p.id))
    const jugadorsVista = vistaJugadors === 'disponibles' ? jugadorsDisponibles : jugadorsFiltrats
    const seleccionsPerUsuari = participants
        .map(part => {
            const picksUser = picksDetall.filter(pk => pk.user_id === part.id)
            const jugadorsUser = picksUser
                .map(pk => players.find(pl => pl.id === pk.player_id))
                .filter(Boolean)
            const totalSegons = picksUser.reduce((sum, pk) => sum + (Number(pk.temps_seleccio) || 0), 0)
            return {
                userId: part.id,
                nom: part.nom || part.email?.split('@')[0] || 'Usuari',
                jugadors: jugadorsUser,
                totalSegons,
            }
        })
        .filter(grup => grup.jugadors.length > 0)

    // ── Format preu ─────────────────────────────────────────────────
    function formatPreu(precio) {
        if (!precio) return '—'
        if (precio >= 1_000_000) return (precio / 1_000_000).toFixed(1) + 'M'
        if (precio >= 1_000)     return Math.round(precio / 1_000) + 'K'
        return precio.toString()
    }

    // ── Targeta jugador reutilitzable ────────────────────────────────
    function renderCard(player, { agafat, meu, owner, comptEquip, limitEquip, limitPosicio, pot, colors }) {
        const jornadesJugador = puntsByPlayer[player.id] || []
        const maxPos = LIMIT_POSICIO[player.posicion] ?? 99
        const comptPos = meusDePos(player.posicion)
        return (
            <button
                key={player.id}
                onClick={() => pot && setJugadorPreSel(jugadorPreSel?.id === player.id ? null : player)}
                disabled={agafat || !esMeuTorn || limitEquip || limitPosicio}
                className={`p-3 rounded-xl text-left transition border relative overflow-hidden w-full
                    ${meu
                        ? 'bg-green-900/60 border-green-500'
                        : agafat
                            ? 'bg-gray-900 border-gray-800 opacity-50 cursor-not-allowed'
                            : limitEquip || limitPosicio
                                ? 'bg-orange-950/40 border-orange-900 opacity-60 cursor-not-allowed'
                                : jugadorPreSel?.id === player.id
                                    ? 'bg-green-700/60 border-green-400 ring-2 ring-green-400 scale-[1.02]'
                                    : pot
                                        ? 'bg-gray-800 hover:bg-green-900/40 hover:border-green-500 border-gray-700 cursor-pointer hover:scale-[1.02]'
                                        : 'bg-gray-900 border-gray-800 cursor-not-allowed opacity-70'
                    }`}
            >
                {/* Foto + nom + equip */}
                <div className="flex items-center gap-3 mb-2">
                    {/* Foto jugador: fallback inicial si la imatge no carrega */}
                    <div className="relative w-12 h-12 flex-shrink-0">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${colors.bg} ${colors.text}`}>
                            {player.nombre?.charAt(0)}
                        </div>
                        {player.foto && (
                            <img
                                src={player.foto}
                                alt={player.nombre}
                                className="w-12 h-12 rounded-full object-cover absolute inset-0"
                                onError={e => { e.target.style.display = 'none' }}
                            />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-white truncate">{player.nombre}</div>
                        <div className="flex items-center gap-1 text-gray-400 text-xs truncate">
                            {player.escudo_equip && (
                                <img src={player.escudo_equip} alt=""
                                     className="w-4 h-4 object-contain flex-shrink-0"
                                     onError={e => { e.target.style.display = 'none' }} />
                            )}
                            {player.equipo_real}
                        </div>
                    </div>
                </div>

                {/* Preu i punts */}
                <div className="flex items-center justify-between mb-2">
                    <div className="text-center">
                        <div className="text-green-400 font-bold text-sm">{formatPreu(player.precio)}</div>
                        <div className="text-gray-600 text-[9px] uppercase">Preu</div>
                    </div>
                    <div className="w-px h-6 bg-gray-700" />
                    <div className="text-center">
                        <div className="text-yellow-400 font-bold text-sm">{player.punts_totals || 0}</div>
                        <div className="text-gray-600 text-[9px] uppercase">Punts</div>
                    </div>
                    <div className="w-px h-6 bg-gray-700" />
                    <div className="text-center">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                            {player.posicion?.slice(0, 3).toUpperCase()}
                        </span>
                    </div>
                </div>

                {/* Darreres 5 jornades */}
                {jornadesJugador.length > 0 && (
                    <div className="border-t border-gray-700/50 pt-2">
                        <div className="text-gray-600 text-[8px] uppercase tracking-wider mb-1">Darreres jornades</div>
                        <div className="flex gap-1">
                            {jornadesJugador.map(({ jornada, punts: p }) => (
                                <div key={jornada} className="flex-1 text-center bg-gray-900/60 rounded py-0.5">
                                    <div className={`text-[11px] font-bold leading-tight ${
                                        p >= 8  ? 'text-green-400' :
                                        p >= 4  ? 'text-yellow-400' :
                                        p > 0   ? 'text-gray-300' :
                                        p < 0   ? 'text-red-400' : 'text-gray-600'
                                    }`}>{p}</div>
                                    <div className="text-gray-700 text-[7px]">J{jornada}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Estat */}
                {meu && <div className="mt-2 text-[10px] font-bold text-green-400">✓ El teu</div>}
                {agafat && !meu && <div className="mt-2 text-[10px] text-gray-400 truncate">👤 {owner}</div>}
                {limitPosicio && !agafat && !meu && (
                    <div className="mt-2 text-[10px] text-orange-400">🚫 Màx. {maxPos} {player.posicion}s ({comptPos}/{maxPos})</div>
                )}
                {limitEquip && !agafat && !limitPosicio && (
                    <div className="mt-2 text-[10px] text-orange-400">🚫 Límit {comptEquip}/{maxEquip} de l&apos;equip</div>
                )}
                {!agafat && !limitEquip && !limitPosicio && esMeuTorn && comptEquip > 0 && (
                    <div className="mt-2 text-[10px] text-gray-500">{comptEquip}/{maxEquip} d&apos;aquest equip</div>
                )}
                {pot && jugadorPreSel?.id !== player.id && (
                    <div className="absolute inset-0 rounded-xl ring-2 ring-green-500/0 hover:ring-green-500/50 transition pointer-events-none" />
                )}
            </button>
        )
    }

    // ── Loading ──────────────────────────────────────────────────────
    if (loading) return (
        <>
            <Navbar />
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Carregant...</div>
        </>
    )

    // ── Render ───────────────────────────────────────────────────────
    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
                <div className="max-w-7xl mx-auto">

                    {/* Capçalera */}
                    <div className="flex justify-between items-center mb-5">
                        <div>
                            <h1 className="text-2xl font-bold text-green-400">⚽ Sala de Draft</h1>
                            <p className="text-gray-400 text-sm">
                                {participants.find(p => p.id === user?.id)?.nom || user?.email}
                                {' · '}{meusPicks.length} jugadors triats
                            </p>
                        </div>
                    </div>

                    {/* ── Banner estat (pendent o torn actual) ── */}
                    {draft?.estat === 'pendent' ? (
                        <div className="bg-gray-900 border border-yellow-700/50 rounded-xl p-3 mb-5 text-center">
                            <p className="text-yellow-400 font-semibold text-sm">⏳ El draft encara no ha començat — pots explorar els jugadors disponibles</p>
                        </div>
                    ) : draft?.estat === 'actiu' ? (
                        <div className={`rounded-xl p-3 mb-5 text-center border ${
                            esMeuTorn ? 'bg-green-900/50 border-green-500 animate-pulse' : 'bg-gray-900 border-gray-700'
                        }`}>
                            <p className="text-xs text-gray-400 mb-0.5">Torn {draft.torn_actual + 1}</p>
                            {esMeuTorn ? (
                                <p className="text-green-300 font-bold text-lg">🎯 És el teu torn! Cerca i tria un jugador</p>
                            ) : (
                                <p className="text-white font-semibold">
                                    ⏳ Esperant que <span className="text-yellow-400">{nomActual}</span> triï...
                                </p>
                            )}
                        </div>
                    ) : null}

                    {/* ── Layout principal: jugadors + panell ordre ── */}
                    {(draft?.estat === 'pendent' || draft?.estat === 'actiu') && (
                        <div className="flex gap-5 items-start flex-col xl:flex-row">

                                {/* ── ESQUERRA: Jugadors ── */}
                                <div className="flex-1 min-w-0">

                                {/* Filtres de vista de jugadors */}
                                <div className="grid grid-cols-3 gap-2 mb-3 w-full">
                                     <button
                                         onClick={() => setVistaJugadors('tots')}
                                         className={`w-full px-3 py-2 rounded-lg text-xs font-bold transition border ${vistaJugadors === 'tots' ? 'bg-green-500 border-green-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                         ⚽ Tots ({jugadorsFiltrats.length})
                                     </button>
                                      <button
                                          onClick={() => setVistaJugadors('disponibles')}
                                         className={`w-full px-3 py-2 rounded-lg text-xs font-bold transition border ${vistaJugadors === 'disponibles' ? 'bg-green-500 border-green-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                         🟢 Disponibles ({jugadorsDisponibles.length})
                                      </button>
                                      <button
                                          onClick={() => setVistaJugadors('seleccionats')}
                                         className={`w-full px-3 py-2 rounded-lg text-xs font-bold transition border ${vistaJugadors === 'seleccionats' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                         👥 Seleccionats ({picks.length})
                                      </button>
                                  </div>

                                    {/* ── Comptador posicions del meu equip ── */}
                                {meusPicks.length > 0 && (
                                    <div className="flex gap-2 mb-3">
                                        {posicions.map(pos => {
                                            const actual  = meusDePos(pos)
                                            const max     = LIMIT_POSICIO[pos]
                                            const ple     = actual >= max
                                            const colors  = POS_COLORS[pos]
                                            return (
                                                <div key={pos} className={`flex-1 text-center rounded-lg py-1.5 border transition ${
                                                    ple ? 'bg-red-900/40 border-red-600' : actual > 0 ? `border-gray-600 bg-gray-800` : 'border-gray-700 bg-gray-900'
                                                }`}>
                                                    <div className={`text-sm font-bold ${ple ? 'text-red-400' : actual > 0 ? 'text-white' : 'text-gray-600'}`}>
                                                        {actual}<span className="text-gray-600 text-xs">/{max}</span>
                                                    </div>
                                                    <div className={`text-[9px] font-semibold ${colors.bg.replace('bg-','text-').replace('-500','-400').replace('-400','-400')}`}>
                                                        {pos.slice(0,3).toUpperCase()}
                                                    </div>
                                                    {ple && <div className="text-[8px] text-red-500 leading-tight">MÀXIM</div>}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {vistaJugadors !== 'seleccionats' && (
                                    <>
                                {/* Barra cerca + filtres + ordenació */}
                                    <div className="flex flex-col gap-2 mb-4">
                                        <input
                                            type="text"
                                            placeholder="🔍 Cercar jugador o equip..."
                                            value={cerca}
                                            onChange={e => setCerca(e.target.value)}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
                                        />
                                        <div className="flex gap-2 flex-wrap">
                                            {/* Filtre posició */}
                                            <div className="flex gap-1">
                                                {['Tots', ...posicions].map(pos => (
                                                    <button key={pos} onClick={() => setPosicioFiltro(pos)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition
                                                                ${posicioFiltro === pos
                                                                    ? 'bg-green-500 text-white'
                                                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                                        {pos === 'Tots' ? 'Tots' : pos.slice(0, 3).toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Ordenació */}
                                            <div className="flex gap-1 ml-auto">
                                                <span className="text-gray-600 text-xs self-center mr-1">Ordenar:</span>
                                                {[
                                                    { id: 'posicio', label: 'Posició' },
                                                    { id: 'preu',    label: '💰 Preu' },
                                                    { id: 'punts',   label: '📊 Punts' },
                                                ].map(o => (
                                                    <button key={o.id} onClick={() => setOrdenar(o.id)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition
                                                                ${ordenar === o.id
                                                                    ? 'bg-blue-600 text-white'
                                                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                                        {o.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                                                {meusPicks.length}/{maxJugadorsDraft} teus
                                            </span>
                                        </div>
                                     </div>

                                    {/* Llista de jugadors */}
                                    {jugadorsVista.length === 0 ? (
                                        <p className="text-gray-500 text-center py-10">Sense resultats per &ldquo;{cerca}&rdquo;</p>
                                    ) : ordenar !== 'posicio' ? (
                                        /* Vista plana ordenada per preu o punts */
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                            {jugadorsVista.map(player => {
                                                const agafat     = picks.includes(player.id)
                                                const meu        = meusPicks.includes(player.id)
                                                const owner      = agafat ? propietari(player.id) : null
                                                const comptEquip = meusDeEquipReal(player.equipo_real)
                                                const limitEquip = !meu && comptEquip >= maxEquip
                                                const limitPosicio = !meu && meusDePos(player.posicion) >= (LIMIT_POSICIO[player.posicion] ?? 99)
                                                const pot        = esMeuTorn && !agafat && !limitEquip && !limitPosicio
                                                const colors     = POS_COLORS[player.posicion]
                                                return renderCard(player, { agafat, meu, owner, comptEquip, limitEquip, limitPosicio, pot, colors })
                                            })}
                                        </div>
                                    ) : (
                                        /* Vista agrupada per posició */
                                        <div className="space-y-6">
                                            {(posicioFiltro === 'Tots' ? posicions : [posicioFiltro]).map(pos => {
                                                const del = jugadorsVista.filter(p => p.posicion === pos)
                                                if (!del.length) return null
                                                const colors = POS_COLORS[pos]
                                                const comptActualPos = meusDePos(pos)
                                                const maxPosActual   = LIMIT_POSICIO[pos] ?? 99
                                                const posPlena       = comptActualPos >= maxPosActual
                                                return (
                                                    <div key={pos}>
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                                                                {pos.toUpperCase()}
                                                            </span>
                                                            <span className="text-gray-500 text-xs">{del.length} {vistaJugadors === 'disponibles' ? 'disponibles' : 'jugadors'}</span>
                                                            {/* Estat límit posició */}
                                                            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${posPlena ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-500'}`}>
                                                                {posPlena ? '🚫 LÍMIT POSICIÓ' : ' '}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                                            {del.map(player => {
                                                                const agafat     = picks.includes(player.id)
                                                                const meu        = meusPicks.includes(player.id)
                                                                const owner      = agafat ? propietari(player.id) : null
                                                                const comptEquip = meusDeEquipReal(player.equipo_real)
                                                                const limitEquip  = !meu && comptEquip >= maxEquip
                                                                const limitPosicio = !meu && comptActualPos >= maxPosActual
                                                                const pot        = esMeuTorn && !agafat && !limitEquip && !limitPosicio
                                                                return renderCard(player, { agafat, meu, owner, comptEquip, limitEquip, limitPosicio, pot, colors })
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                    </>
                                )}

                                {vistaJugadors === 'seleccionats' && (
                                    <div className="space-y-4">
                                        {seleccionsPerUsuari.length === 0 ? (
                                            <p className="text-gray-500 text-center py-10">Encara no hi ha jugadors seleccionats.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {seleccionsPerUsuari.map(({ userId, nom, jugadors, totalSegons }) => (
                                                    <div key={userId} className="bg-gray-900 border border-gray-700 rounded-xl p-3">
                                                        <div className="flex items-center justify-between mb-1.5 gap-2">
                                                             <p className="text-white font-semibold text-sm truncate">{nom}</p>
                                                            <span className="text-[10px] text-gray-500 whitespace-nowrap">{jugadors.length} picks</span>
                                                         </div>
                                                        <div className="text-[10px] text-cyan-300 mb-2 font-semibold">⏱️ Temps total: {formatDuracio(totalSegons)}</div>
                                                         <div className="space-y-1">
                                                            {jugadors.map(j => {
                                                                const colors = POS_COLORS[j.posicion]
                                                                return (
                                                                    <div key={j.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-2 py-1.5">
                                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                                                            {j.posicion?.slice(0, 3).toUpperCase()}
                                                                        </span>
                                                                        <span className="text-white text-xs truncate flex-1">{j.nombre}</span>
                                                                    </div>
                                                                )
                                                            })}
                                                         </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                </div>

                                {/* ── DRETA: Ordre del draft ── */}
                                <div className="w-full xl:w-64 flex-shrink-0">
                                    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden sticky top-4">
                                        <div className="px-4 py-3 border-b border-gray-700">
                                            <p className="text-white font-semibold text-sm">Ordre del draft</p>
                                            <p className="text-gray-500 text-xs mt-0.5">
                                                {picks.length} picks realitzats · {ordre.length} participants
                                            </p>
                                            {draft?.estat === 'actiu' && (
                                                <p className={`text-xs mt-1 font-semibold ${colorTemps}`}>
                                                    ⏱️ Torn actual: {formatTemps(segonsTurn)}
                                                </p>
                                            )}
                                        </div>
                                        <div className="overflow-y-auto max-h-[600px]">
                                            {generarTorns().map(({ t, uid, nom, esCurrent, esPassat, esMeu }) => (
                                                <div key={t}
                                                     className={`flex items-center gap-2 px-3 py-2 border-b border-gray-800 transition
                                                         ${esCurrent
                                                             ? 'bg-green-900/40 border-l-2 border-l-green-500'
                                                             : esPassat
                                                                 ? 'opacity-40'
                                                                 : ''
                                                         }`}>
                                                    <span className={`text-xs w-7 text-center font-mono flex-shrink-0
                                                        ${esCurrent ? 'text-green-400 font-bold' : 'text-gray-600'}`}>
                                                        {t + 1}
                                                    </span>
                                                    <span className={`text-xs flex-1 truncate font-medium
                                                        ${esCurrent ? 'text-green-300' : esMeu ? 'text-yellow-300' : 'text-gray-300'}`}>
                                                        {nom}
                                                        {esMeu && !esCurrent && <span className="text-gray-600 text-[10px] ml-1">(tu)</span>}
                                                    </span>
                                                    {esCurrent && <span className="text-green-400 text-xs">←</span>}
                                                    {esPassat && (
                                                        <span className="text-gray-600 text-[10px]">
                                                            {picksDetall.find(pk => {
                                                                const r = Math.floor(t / n)
                                                                const ord = r % 2 === 0 ? ordre : [...ordre].reverse()
                                                                return ord[t % n] === pk.user_id
                                                            })
                                                                ? players.find(pl => {
                                                                    const r = Math.floor(t / n)
                                                                    const ord = r % 2 === 0 ? ordre : [...ordre].reverse()
                                                                    const uid2 = ord[t % n]
                                                                    return picksDetall.find(pk => pk.user_id === uid2 && pl.id === pk.player_id)
                                                                })?.nombre?.split(' ').pop() || '✓'
                                                                : ''
                                                            }
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            </div>
                    )}

                </div>
            </main>

            {/* ── Barra de confirmació (sticky baix) ── */}
            {jugadorPreSel && esMeuTorn && (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-950/95 border-t border-green-600 backdrop-blur-sm p-4">
                    <div className="max-w-2xl mx-auto flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold truncate">{jugadorPreSel.nombre}</p>
                            <p className="text-gray-400 text-xs">{jugadorPreSel.equipo_real} · {jugadorPreSel.posicion}</p>
                        </div>
                        <button onClick={() => setJugadorPreSel(null)}
                                className="text-gray-400 hover:text-white text-sm px-3 py-2 transition">
                            Cancel·lar
                        </button>
                        <button
                            onClick={() => setJugadorPreSel(prev => ({ ...prev, confirmPopup: true }))}
                            className="bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-2.5 rounded-xl transition text-sm">
                            ✓ Confirma selecció draft
                        </button>
                    </div>
                </div>
            )}

            {/* ── Modal de confirmació ── */}
            {jugadorPreSel?.confirmPopup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <div className="text-center mb-5">
                            <div className="text-4xl mb-3">⚽</div>
                            <h3 className="text-white font-bold text-lg mb-1">Confirmar selecció</h3>
                            <p className="text-gray-400 text-sm">
                                Segur que vols confirmar a{' '}
                                <span className="text-white font-semibold">{jugadorPreSel.nombre}</span>?
                            </p>
                            <p className="text-gray-500 text-xs mt-1">{jugadorPreSel.equipo_real} · {jugadorPreSel.posicion}</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setJugadorPreSel(prev => ({ ...prev, confirmPopup: false }))}
                                disabled={confirmant}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-medium transition disabled:opacity-50">
                                Cancel·lar
                            </button>
                            <button
                                onClick={() => pickPlayer(jugadorPreSel.id)}
                                disabled={confirmant}
                                className="flex-1 bg-green-500 hover:bg-green-400 text-white py-2.5 rounded-xl font-bold transition disabled:opacity-50">
                                {confirmant ? 'Confirmant...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}