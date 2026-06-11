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

const BANQUETA_SLOTS = {
    Davanter: 3,
    Migcampista: 3,
    Defensa: 3,
    Porter: 1,
}

const ORDRE_POSICIONS = ['Porter', 'Defensa', 'Migcampista', 'Davanter']
function normalitzarSuplents(suplentsRaw) {
    if (!suplentsRaw) return {}
    if (!Array.isArray(suplentsRaw)) return suplentsRaw

    const slots = {}
    let indexArray = 0
    Object.entries(BANQUETA_SLOTS).forEach(([posicio, total]) => {
        for (let i = 0; i < total; i++) {
            const id = suplentsRaw[indexArray]
            if (id) slots[`${posicio}_${i}`] = id
            indexArray += 1
        }
    })
    return slots
}

export default function Equip() {
    const [user, setUser]               = useState(null)
    const [jugadors, setJugadors]       = useState([])
    const [perfil, setPerfil]           = useState(null)
    const [team, setTeam]               = useState(null)
    const [formacio, setFormacio]       = useState('4-4-2')
    const [titulars, setTitulars]       = useState({})
    const [suplents, setSuplents]       = useState({})
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
            const { data: teamData } = await supabase.from('teams').select('*').eq('user_id', userId).single()
            const formacioActual = teamData?.formacio || '4-4-2'
            const titularsActuals = teamData?.alineacio || {}
            const suplentsActuals = normalitzarSuplents(teamData?.suplents)
            const { nousTitulars, nousSuplents } = autoOmplirPlantilla(players || [], formacioActual, titularsActuals, suplentsActuals)

            setTeam(teamData || null)
            setFormacio(formacioActual)
            setTitulars(nousTitulars)
            setSuplents(nousSuplents)

            if (!teamData || JSON.stringify(nousTitulars) !== JSON.stringify(titularsActuals) || JSON.stringify(nousSuplents) !== JSON.stringify(suplentsActuals)) {
                const payload = {
                    user_id: userId,
                    temporada: TEMPORADA,
                    formacio: formacioActual,
                    alineacio: nousTitulars,
                    suplents: nousSuplents,
                }
                if (teamData) {
                    await supabase.from('teams').update(payload).eq('user_id', userId)
                } else {
                    const { data: nouTeam } = await supabase.from('teams').insert(payload).select().single()
                    if (nouTeam) setTeam(nouTeam)
                }
            }

            setLoading(false)
            return
        }
        setJugadors([])
        setTitulars({})
        setSuplents({})
        const { data: teamData } = await supabase.from('teams').select('*').eq('user_id', userId).single()
        if (teamData) {
            setTeam(teamData)
            setFormacio(teamData.formacio || '4-4-2')
        }
        setLoading(false)
    }

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) router.push('/login')
            else { setUser(data.user); fetchTot(data.user.id) }
        })
    }, [])

    async function desarAuto(nousTitulars, novaFormacio, nousSuplents) {
        if (!user) return
        setDesant(true)
        const payload = {
            user_id: user.id,
            temporada: TEMPORADA,
            formacio: novaFormacio ?? formacio,
            alineacio: nousTitulars ?? titulars,
            suplents: nousSuplents ?? suplents,
        }
        if (team) {
            await supabase.from('teams').update(payload).eq('user_id', user.id)
        } else {
            const { data: nouTeam } = await supabase.from('teams').insert(payload).select().single()
            if (nouTeam) setTeam(nouTeam)
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

        const { nousSuplents } = autoOmplirPlantilla(jugadors, novaFormacio, nousTitulars, suplents)
        setFormacio(novaFormacio)
        setTitulars(nousTitulars)
        setSuplents(nousSuplents)
        setSeleccionat(null)
        desarAuto(nousTitulars, novaFormacio, nousSuplents)
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
        const jugadorActual = jugadors.find(j => j.id === jugadorActualId)

        if (!seleccionat) {
            if (jugadorActualId) setSeleccionat({ tipus: 'titular', key, posicio, id: jugadorActualId })
            else setSeleccionat({ tipus: 'slot-buit', key, posicio, id: null })
            return
        }

        // Deseleccionar si cliquem el mateix
        if (seleccionat.key === key) { setSeleccionat(null); return }

        const jugadorMovent = jugadors.find(j => j.id === seleccionat.id)

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
        const nousSuplents = { ...suplents }

        if (seleccionat.tipus === 'titular') {
            // Intercanvi entre dos slots
            nousTitulars[key] = seleccionat.id
            if (jugadorActualId) nousTitulars[seleccionat.key] = jugadorActualId
            else delete nousTitulars[seleccionat.key]

        } else if (seleccionat.tipus === 'banqueta') {
            // De banqueta a titular - el titular anterior ocupa el mateix slot de banqueta
            if (jugadorActual && jugadorActual.posicion !== seleccionat.posicio) {
                alert(`${jugadorActual.nombre} és ${jugadorActual.posicion} i no pot anar al slot de ${seleccionat.posicio}`)
                setSeleccionat(null)
                return
            }

            if (jugadorActualId) nousSuplents[seleccionat.key] = jugadorActualId
            else delete nousSuplents[seleccionat.key]
            nousTitulars[key] = seleccionat.id
        }

        setTitulars(nousTitulars)
        setSuplents(nousSuplents)
        setSeleccionat(null)
        desarAuto(nousTitulars, undefined, nousSuplents)
    }

    function handleClickBanqueta(posicio, index) {
        const key = `${posicio}_${index}`
        const jugadorId = suplents[key]
        const jugador = jugadors.find(j => j.id === jugadorId)

        if (!seleccionat) {
            if (jugador) setSeleccionat({ tipus: 'banqueta', key, posicio, id: jugador.id })
            return
        }

        // Deseleccionar si cliquem el mateix
        if (seleccionat.key === key) { setSeleccionat(null); return }

        if (seleccionat.tipus === 'titular') {
            const jugadorTitular = jugadors.find(j => j.id === seleccionat.id)
            if (!jugadorTitular || jugadorTitular.posicion !== posicio) {
                alert('Aquest slot de banqueta nomes accepta jugadors de la mateixa posicio')
                setSeleccionat(null)
                return
            }

            const nousTitulars = { ...titulars }
            const nousSuplents = { ...suplents }

            if (jugadorId && !potJugarDe(jugador, seleccionat.posicio)) {
                alert(`${jugador.nombre} no pot ocupar aquest slot titular`)
                setSeleccionat(null)
                return
            }

            delete nousTitulars[seleccionat.key]
            nousSuplents[key] = seleccionat.id
            if (jugadorId && potJugarDe(jugador, seleccionat.posicio)) {
                nousTitulars[seleccionat.key] = jugadorId
            }
            setTitulars(nousTitulars)
            setSuplents(nousSuplents)
            setSeleccionat(null)
            desarAuto(nousTitulars, undefined, nousSuplents)
            return
        }

        if (seleccionat.tipus === 'banqueta') {
            // Canvi de seleccio dins banqueta
            setSeleccionat(jugador ? { tipus: 'banqueta', key, posicio, id: jugador.id } : null)
            return
        }

        setSeleccionat(null)
    }

    const formacioActual = FORMACIONS[formacio]

    function getBanquetaJugador(posicio, index) {
        const id = suplents[`${posicio}_${index}`]
        return jugadors.find(j => j.id === id) || null
    }

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
                             width: 380,
                             height: 560,
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

                        <div className="absolute inset-0 flex flex-col justify-between" style={{ padding: '24px 18px' }}>
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

                        {/* Banqueta per posicions i prioritat */}
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 overflow-y-auto" style={{ maxHeight: 420 }}>
                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                                Banqueta ({Object.values(suplents).filter(Boolean).length})
                            </p>

                            {Object.entries(BANQUETA_SLOTS).map(([posicio, totalSlots]) => {
                                const colors = POS_COLORS[posicio]

                                return (
                                    <div key={posicio} className="mb-3 last:mb-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold">{posicio}</p>
                                        </div>

                                        <div className="flex gap-2 flex-wrap">
                                            {Array.from({ length: totalSlots }).map((_, index) => {
                                                const jugador = getBanquetaJugador(posicio, index)
                                                const esSelec = jugador && seleccionat?.id === jugador.id
                                                return (
                                                    <div key={`${posicio}_${index}`} className="flex flex-col items-center" style={{ width: 62 }}>
                                                        <div
                                                            onClick={() => handleClickBanqueta(posicio, index)}
                                                            className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${jugador ? 'cursor-pointer' : 'cursor-default'} ${jugador ? `${colors.bg} ${colors.border}` : 'bg-black/20 border-dashed border-white/20'} ${esSelec ? 'ring-2 ring-white scale-105' : jugador ? 'hover:scale-105' : ''}`}
                                                        >
                                                            {jugador
                                                                ? <span className={`text-[9px] font-bold ${colors.text} text-center px-1`}>{nomCurt(jugador.nombre)}</span>
                                                                : <span className="text-white/25 text-sm">{index + 1}</span>
                                                            }
                                                        </div>
                                                        <span className="text-[10px] text-gray-500 mt-1">#{index + 1}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
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

function autoOmplirPlantilla(players, formacioActiva, titularsActuals = {}, suplentsActuals = {}) {
    const jugadorsPerId = new Map((players || []).map(p => [p.id, p]))
    const idsUtilitzats = new Set()
    const nousTitulars = {}
    const nousSuplents = {}

    ORDRE_POSICIONS.forEach(posicio => {
        const total = FORMACIONS[formacioActiva]?.[posicio] || 0
        for (let i = 0; i < total; i++) {
            const key = `${posicio}_${i}`
            const idActual = titularsActuals[key]
            const jugadorActual = jugadorsPerId.get(idActual)
            if (jugadorActual && jugadorActual.posicion === posicio && !idsUtilitzats.has(idActual)) {
                nousTitulars[key] = idActual
                idsUtilitzats.add(idActual)
            }
        }
    })

    ORDRE_POSICIONS.forEach(posicio => {
        const total = FORMACIONS[formacioActiva]?.[posicio] || 0
        for (let i = 0; i < total; i++) {
            const key = `${posicio}_${i}`
            if (nousTitulars[key]) continue
            const candidat = players.find(p => p.posicion === posicio && !idsUtilitzats.has(p.id))
            if (candidat) {
                nousTitulars[key] = candidat.id
                idsUtilitzats.add(candidat.id)
            }
        }
    })

    Object.entries(BANQUETA_SLOTS).forEach(([posicio, total]) => {
        for (let i = 0; i < total; i++) {
            const key = `${posicio}_${i}`
            const idActual = suplentsActuals[key]
            const jugadorActual = jugadorsPerId.get(idActual)
            if (jugadorActual && jugadorActual.posicion === posicio && !idsUtilitzats.has(idActual)) {
                nousSuplents[key] = idActual
                idsUtilitzats.add(idActual)
            }
        }
    })

    Object.entries(BANQUETA_SLOTS).forEach(([posicio, total]) => {
        for (let i = 0; i < total; i++) {
            const key = `${posicio}_${i}`
            if (nousSuplents[key]) continue
            const candidat = players.find(p => p.posicion === posicio && !idsUtilitzats.has(p.id))
            if (candidat) {
                nousSuplents[key] = candidat.id
                idsUtilitzats.add(candidat.id)
            }
        }
    })

    return { nousTitulars, nousSuplents }
}

