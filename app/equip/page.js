'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import Link from 'next/link'
import Navbar from '../components/Navbar'

const TEMPORADA = '2026-27'

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
    Porter:      { bg: 'bg-yellow-400', text: 'text-yellow-900', border: 'border-yellow-300', light: 'bg-yellow-900/40' },
    Defensa:     { bg: 'bg-blue-500',   text: 'text-blue-900',   border: 'border-blue-400',   light: 'bg-blue-900/40' },
    Migcampista: { bg: 'bg-green-400',  text: 'text-green-900',  border: 'border-green-400',  light: 'bg-green-900/40' },
    Davanter:    { bg: 'bg-red-500',    text: 'text-red-900',    border: 'border-red-400',    light: 'bg-red-900/40' },
}

export default function Equip() {
    const [user, setUser]               = useState(null)
    const [jugadors, setJugadors]       = useState([])
    const [perfil, setPerfil]           = useState(null)
    const [team, setTeam]               = useState(null)
    const [formacio, setFormacio]       = useState('4-4-2')
    const [titulars, setTitulars]       = useState({})
    const [seleccionat, setSeleccionat] = useState(null)
    const [loading, setLoading]         = useState(true)
    const [desant, setDesant]           = useState(false)
    const [maxJugadors, setMaxJugadors] = useState(15)
    const router = useRouter()

    async function fetchTot(userId) {
        const { data: perfilData } = await supabase.from('profiles').select('*').eq('id', userId).single()
        setPerfil(perfilData)
        const { data: draftData } = await supabase.from('drafts').select('max_jugadors').single()
        if (draftData) setMaxJugadors(draftData.max_jugadors || 15)
        const { data: picks } = await supabase.from('draft_picks').select('player_id').eq('user_id', userId)
        if (picks?.length) {
            const { data: players } = await supabase.from('players').select('*').in('id', picks.map(p => p.player_id))
            setJugadors(players || [])
        }
        const { data: teamData } = await supabase.from('teams').select('*').eq('user_id', userId).single()
        if (teamData) {
            setTeam(teamData)
            setFormacio(teamData.formacio || '4-4-2')
            setTitulars(teamData.alineacio || {})
        }
        setLoading(false)
    }

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) router.push('/login')
            else { setUser(data.user); fetchTot(data.user.id) }
        })
    }, [])

    async function desarAuto(nousTitulars, novaFormacio) {
        if (!user) return
        setDesant(true)
        const payload = {
            user_id: user.id,
            temporada: TEMPORADA,
            formacio: novaFormacio ?? formacio,
            alineacio: nousTitulars ?? titulars,
            suplents: []
        }
        if (team) {
            await supabase.from('teams').update(payload).eq('user_id', user.id)
        } else {
            const { data } = await supabase.from('teams').insert(payload).select().single()
            setTeam(data)
        }
        setTimeout(() => setDesant(false), 800)
    }

    function canviarFormacio(novaFormacio) {
        const nova = FORMACIONS[novaFormacio]
        const actual = FORMACIONS[formacio]

        // Mantenim titulars que segueixen tenint slot a la nova formació
        const nousTitulars = {}
        const posicions = ['Porter', 'Defensa', 'Migcampista', 'Davanter']

        posicions.forEach(pos => {
            const slotsNous = nova[pos] || 0
            const slotsActuals = actual[pos] || 0
            // Mantenim fins al mínim de slots entre les dues formacions
            const slotsAMantenir = Math.min(slotsNous, slotsActuals)
            for (let i = 0; i < slotsAMantenir; i++) {
                const key = `${pos}_${i}`
                if (titulars[key]) nousTitulars[key] = titulars[key]
            }
        })

        setFormacio(novaFormacio)
        setTitulars(nousTitulars)
        setSeleccionat(null)
        desarAuto(nousTitulars, novaFormacio)
    }

    function potJugarDe(jugador, posicio) {
        if (!jugador) return false
        if (jugador.posicion === 'Porter') return posicio === 'Porter'
        if (posicio === 'Porter') return jugador.posicion === 'Porter'
        return jugador.posicion === posicio
    }

    function nomCurt(nom) {
        if (!nom) return ''
        const parts = nom.trim().split(' ')
        const cognom = parts[parts.length - 1]
        return cognom.length > 10 ? cognom.slice(0, 10) : cognom
    }

    function handleClickSlot(posicio, index) {
        const key = `${posicio}_${index}`
        const jugadorActualId = titulars[key]

        if (!seleccionat) {
            if (jugadorActualId) setSeleccionat({ tipus: 'titular', key, posicio, id: jugadorActualId })
            else setSeleccionat({ tipus: 'slot-buit', key, posicio, id: null })
            return
        }

        // Deseleccionar si cliquem el mateix
        if (seleccionat.key === key) { setSeleccionat(null); return }

        const jugadorMovent = jugadors.find(j => j.id === seleccionat.id)
        const jugadorActual = jugadors.find(j => j.id === jugadorActualId)

        // Validacio: el jugador que movem pot anar a aquesta posicio?
        if (jugadorMovent && !potJugarDe(jugadorMovent, posicio)) {
            alert(`${jugadorMovent.nombre} és ${jugadorMovent.posicion} i no pot jugar de ${posicio}`)
            setSeleccionat(null)
            return
        }

        // Si hi ha un jugador al desti, validar que pot anar a l'origen
        if (jugadorActual && seleccionat.tipus === 'titular') {
            if (!potJugarDe(jugadorActual, seleccionat.posicio)) {
                alert(`${jugadorActual.nombre} és ${jugadorActual.posicion} i no pot jugar de ${seleccionat.posicio}`)
                setSeleccionat(null)
                return
            }
        }

        const nousTitulars = { ...titulars }

        if (seleccionat.tipus === 'titular') {
            // Intercanvi entre dos slots
            nousTitulars[key] = seleccionat.id
            if (jugadorActualId) nousTitulars[seleccionat.key] = jugadorActualId
            else delete nousTitulars[seleccionat.key]

        } else if (seleccionat.tipus === 'banqueta') {
            // De banqueta a titular - el titular anterior torna a banqueta automaticament
            nousTitulars[key] = seleccionat.id
            if (!jugadorActualId) {
                // slot buit, simplement posem
            }
            // Si hi havia titular, ja no es a titulars -> va a banqueta automaticament
            if (jugadorActualId) delete nousTitulars[key]
            nousTitulars[key] = seleccionat.id
        }

        setTitulars(nousTitulars)
        setSeleccionat(null)
        desarAuto(nousTitulars)
    }

    function handleClickBanqueta(jugador) {
        if (!seleccionat) {
            setSeleccionat({ tipus: 'banqueta', id: jugador.id })
            return
        }

        // Deseleccionar si cliquem el mateix
        if (seleccionat.id === jugador.id) { setSeleccionat(null); return }

        if (seleccionat.tipus === 'titular') {
            // Titular -> banqueta: simplement treiem el titular del camp
            const nousTitulars = { ...titulars }
            delete nousTitulars[seleccionat.key]
            setTitulars(nousTitulars)
            setSeleccionat(null)
            desarAuto(nousTitulars)
            return
        }

        if (seleccionat.tipus === 'banqueta') {
            // Canvi de seleccio dins banqueta
            setSeleccionat({ tipus: 'banqueta', id: jugador.id })
            return
        }

        setSeleccionat(null)
    }

    const formacioActual = FORMACIONS[formacio]
    const titularsIds = Object.values(titulars).filter(Boolean)
    const jugadorsLliures = jugadors.filter(j => !titularsIds.includes(j.id))

    function renderSlot(posicio, index) {
        const key = `${posicio}_${index}`
        const jugadorId = titulars[key]
        const jugador = jugadors.find(j => j.id === jugadorId)
        const colors = POS_COLORS[posicio]
        const esSeleccionat = seleccionat?.key === key || (jugadorId && seleccionat?.id === jugadorId)
        const jugadorMovent = seleccionat ? jugadors.find(j => j.id === seleccionat?.id) : null
        const esCompatible = jugadorMovent ? potJugarDe(jugadorMovent, posicio) : false
        const mostraDestinacio = seleccionat && !esSeleccionat && esCompatible && !jugadorId

        return (
            <div key={key} className="flex flex-col items-center" style={{ width: 64 }}>
                <div
                    onClick={() => handleClickSlot(posicio, index)}
                    className={`
            w-14 h-14 rounded-full border-2 flex items-center justify-center cursor-pointer
            transition-all duration-150 select-none
            ${jugador
                        ? `${colors.bg} ${colors.border}`
                        : mostraDestinacio
                            ? 'border-dashed border-white bg-white/15 animate-pulse'
                            : 'border-dashed border-white/20 bg-black/20'
                    }
            ${esSeleccionat ? 'ring-4 ring-white scale-110 shadow-lg' : 'hover:scale-105'}
          `}
                >
                    {jugador ? (
                        jugador.foto
                            ? <img src={jugador.foto} alt={jugador.nombre}
                                   className="w-full h-full rounded-full object-cover"
                                   onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                            : <span className={`text-[10px] font-bold ${colors.text} text-center leading-tight px-0.5`}>{nomCurt(jugador.nombre)}</span>
                    ) : (
                        <span className="text-white/20 text-xl">+</span>
                    )}
                </div>
                <span className="text-white/70 text-[10px] mt-1 text-center w-16 truncate font-medium">
          {jugador ? nomCurt(jugador.nombre) : <span className="text-white/20 text-[9px]">{posicio.slice(0,3)}</span>}
        </span>
            </div>
        )
    }

    if (loading) return (
        <>
            <Navbar />
            <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Carregant...</div>
        </>
    )

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-gray-950 text-white p-3 md:p-6">
            <div className="max-w-5xl mx-auto">

                {/* Capçalera */}
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-green-400">🏟️ {perfil?.nom || user?.email}</h1>
                        <p className="text-gray-500 text-xs">
                            {TEMPORADA} · {jugadors.length}/{maxJugadors} jugadors
                            {desant && <span className="ml-2 text-green-400 animate-pulse">· Desant...</span>}
                        </p>
                    </div>
                    <Link href="/classificacio" className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition">
                        Classificació
                    </Link>
                </div>

                {/* Selector formació */}
                <div className="flex gap-1.5 flex-wrap mb-4">
                    {Object.keys(FORMACIONS).map(f => (
                        <button key={f} onClick={() => canviarFormacio(f)}
                                className={`px-3 py-1 rounded-lg text-sm font-mono font-bold transition ${formacio === f ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                            {f}
                        </button>
                    ))}
                </div>

                {/* Layout horitzontal */}
                <div className="flex gap-4 items-start">

                    {/* Camp de futbol */}
                    <div className="relative rounded-xl overflow-hidden flex-shrink-0"
                         style={{
                             width: 320,
                             height: 480,
                             backgroundImage: `
                repeating-linear-gradient(180deg,
                  rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px,
                  transparent 40px, transparent 80px
                ),
                linear-gradient(180deg,
                  #1e5c1e 0%, #246b24 14%, #1e5c1e 28%,
                  #246b24 42%, #1e5c1e 56%,
                  #246b24 70%, #1e5c1e 84%, #246b24 100%
                )
              `,
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

                        <div className="absolute inset-0 flex flex-col justify-between" style={{ padding: '20px 10px' }}>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioActual.Davanter }).map((_, i) => renderSlot('Davanter', i))}
                            </div>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioActual.Migcampista }).map((_, i) => renderSlot('Migcampista', i))}
                            </div>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioActual.Defensa }).map((_, i) => renderSlot('Defensa', i))}
                            </div>
                            <div className="flex justify-around items-center">
                                {Array.from({ length: formacioActual.Porter }).map((_, i) => renderSlot('Porter', i))}
                            </div>
                        </div>
                    </div>

                    {/* Panell lateral */}
                    <div className="flex-1 flex flex-col gap-3 min-w-0">

                        {/* Info seleccionat */}
                        {seleccionat && (
                            <div className="bg-green-900/50 border border-green-600 rounded-xl p-3">
                                <p className="text-green-300 text-sm font-semibold">
                                    {seleccionat.id
                                        ? `✓ ${jugadors.find(j => j.id === seleccionat.id)?.nombre} seleccionat`
                                        : 'Slot buit — clica un jugador'}
                                </p>
                                <p className="text-green-500 text-xs mt-0.5">
                                    Clica on el vols posar · slots compatibles parpadegen
                                </p>
                                <button onClick={() => setSeleccionat(null)} className="text-green-600 text-xs mt-1 hover:text-green-400">
                                    Cancel·lar ✕
                                </button>
                            </div>
                        )}

                        {/* Banqueta */}
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 overflow-y-auto" style={{ maxHeight: 420 }}>
                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                                Banqueta ({jugadorsLliures.length})
                            </p>
                            {jugadorsLliures.length === 0 ? (
                                <p className="text-gray-600 text-xs text-center py-6">Tots els jugadors col·locats! 🎉</p>
                            ) : (
                                <div className="space-y-1">
                                    {['Porter', 'Defensa', 'Migcampista', 'Davanter'].map(pos => {
                                        const delPos = jugadorsLliures.filter(j => j.posicion === pos)
                                        if (!delPos.length) return null
                                        return (
                                            <div key={pos}>
                                                <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-2 mb-1">{pos}s</p>
                                                {delPos.map(j => {
                                                    const colors = POS_COLORS[j.posicion]
                                                    const esSelec = seleccionat?.id === j.id
                                                    return (
                                                        <div key={j.id} onClick={() => handleClickBanqueta(j)}
                                                             className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all mb-1
                                ${esSelec ? `${colors.light} border ${colors.border}` : 'hover:bg-gray-800'}`}>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>
                                {pos.slice(0, 3).toUpperCase()}
                              </span>
                                                            {j.foto
                                                                ? <img src={j.foto} alt={j.nombre}
                                                                       className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-gray-700"
                                                                       onError={e => { e.target.style.display='none' }} />
                                                                : null
                                                            }
                                                            <span className="text-white text-xs font-medium flex-1 truncate">{j.nombre}</span>
                                                            <div className="flex items-center gap-1 hidden md:flex">
                                                                {j.escudo_equip && (
                                                                    <img src={j.escudo_equip} alt="" className="w-4 h-4 object-contain"
                                                                         onError={e => { e.target.style.display='none' }} />
                                                                )}
                                                                <span className="text-gray-500 text-[10px] truncate">{j.equipo_real}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <p className="text-gray-700 text-xs text-center mt-3">
                    Clica un jugador → clica on el vols posar · Els canvis es desen automàticament
                </p>
            </div>
            </main>
        </>
    )
}