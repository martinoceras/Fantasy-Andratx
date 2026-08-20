'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const ADMIN_USER    = 'admin'
const ADMIN_PASS    = 'fantasy-andratx'

export default function Admin() {
    // ── Autenticació admin local ─────────────────────────────────────
    const [pinUser, setPinUser]       = useState('')
    const [pinPass, setPinPass]       = useState('')
    const [pinError, setPinError]     = useState('')
    const [adminOk, setAdminOk] = useState(() => {
        if (typeof window === 'undefined') return false
        return sessionStorage.getItem('admin_auth') === 'ok'
    })
    const [participants, setParticipants] = useState([])
    const [draft, setDraft] = useState(null)
    const [ordre, setOrdre] = useState([])
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [missatge, setMissatge] = useState('')
    const [seccio, setSeccio] = useState('draft')
    const [maxJugadors, setMaxJugadors] = useState(15)
    const [maxJugadorsEquip, setMaxJugadorsEquip] = useState(4)

    // Nou usuari
    const [nouNom, setNouNom] = useState('')
    const [nouEmail, setNouEmail] = useState('')
    const [nouPassword, setNouPassword] = useState('')
    const [creanUser, setCreanUser] = useState(false)
    const [editantUsuariId, setEditantUsuariId] = useState(null)
    const [usuariEditant, setUsuariEditant] = useState(null)
    const [nomEditat, setNomEditat] = useState('')
    const [desantEdicioUsuari, setDesantEdicioUsuari] = useState(false)

    // Reset contrasenya
    const [usuariResetant, setUsuariResetant] = useState(null)
    const [novaContrasenya, setNovaContrasenya] = useState('')
    const [resetantContrasenya, setResetantContrasenya] = useState(false)
    const [missatgeReset, setMissatgeReset] = useState('')

    // Secció punts — TOTS els hooks han d'estar aquí dalt
    const [jornadaPunts, setJornadaPunts] = useState(1)
    const [players, setPlayers] = useState([])
    const [puntsMapa, setPuntsMapa] = useState({})
    const [desantPunts, setDesantPunts] = useState(false)
    const [importantFutmondo, setImportantFutmondo] = useState(false)
    const [missatgePunts, setMissatgePunts] = useState('')

    // Secció sync jugadors
    const [sincronitzant, setSincronitzant] = useState(false)
    const [missatgeSync, setMissatgeSync] = useState('')
    const [resumCanvisSync, setResumCanvisSync] = useState(null)

    // Secció canvis
    const [iniciantCanvis, setIniciantCanvis] = useState(false)
    const [missatgeCanvis, setMissatgeCanvis] = useState('')
    const [iniciantCanvisNadal, setIniciantCanvisNadal] = useState(false)
    const [missatgeCanvisNadal, setMissatgeCanvisNadal] = useState('')

    // Secció classificació arxivada
    const [classificacionsArxivades, setClassificacionsArxivades] = useState([])
    const [nomVolta, setNomVolta]             = useState('1a Volta')
    const [jornadaFinalVolta, setJornadaFinalVolta] = useState(19)
    const [guardantClass, setGuardantClass]   = useState(false)
    const [reiniciantPunts, setReiniciantPunts] = useState(false)
    const [missatgeClass, setMissatgeClass]   = useState('')
    const [resetantDraft, setResetantDraft]   = useState(false)
    const [acabantDraftAleatori, setAcabantDraftAleatori] = useState(false)
    const [pausantDraft, setPausantDraft]     = useState(false)
    const [reactivantDraft, setReactivantDraft] = useState(false)
    const [desantConfiguracioDraft, setDesantConfiguracioDraft] = useState(false)
    const [iniciantDraftAdmin, setIniciantDraftAdmin] = useState(false)

    // Gestió picks draft (desfer / canviar jugador)
    const [picksDraft, setPicksDraft]           = useState([])
    const [missatgeDraft, setMissatgeDraft]     = useState('')
    const [editantPick, setEditantPick]         = useState(null)   // pick obert al modal
    const [filtreCanvi, setFiltreCanvi]         = useState('')
    const [allPlayers, setAllPlayers]           = useState([])

    const router = useRouter()

    function comprovarPin() {
        if (pinUser === ADMIN_USER && pinPass === ADMIN_PASS) {
            sessionStorage.setItem('admin_auth', 'ok')
            setAdminOk(true)
            setPinError('')
        } else {
            setPinError('Usuari o contrasenya incorrectes')
        }
    }

    function aplicarDraftLocal(draftData) {
        setDraft(draftData || null)
        setOrdre(Array.isArray(draftData?.ordre_participants) ? draftData.ordre_participants : [])
        setMaxJugadors(Number(draftData?.max_jugadors) || 15)
        setMaxJugadorsEquip(Number(draftData?.max_jugadors_equip) || 4)
    }

    function mostrarMissatge(text, ms = 3000) {
        setMissatge(text)
        setTimeout(() => setMissatge(''), ms)
    }

    const fetchTot = useCallback(async () => {
        // Llegir usuaris via API amb service key (evita bloqueig RLS al client)
        const resUsers = await fetch('/api/admin/get-users')
        const usersPayload = await resUsers.json()
        const users = resUsers.ok ? usersPayload?.users : []

        const resDraft = await fetch('/api/admin/draft-config', { cache: 'no-store' })
        const draftPayload = await resDraft.json().catch(() => ({}))
        const draftData = resDraft.ok ? draftPayload?.draft : null
        const { data: playersData } = await supabase.from('players').select('id, nombre, posicion').order('posicion').order('nombre')
        const { data: classData } = await supabase.from('classificacio_arxivada').select('*').order('created_at', { ascending: false })
        setParticipants(users || [])
        aplicarDraftLocal(draftData)
        setPlayers(playersData || [])
        setAllPlayers(playersData || [])
        setClassificacionsArxivades(classData || [])
        await carregarPicksDraft()
        setLoading(false)
    }, [])

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUser(data.user)
            void fetchTot()
        })
    }, [fetchTot])

    async function actualitzarDraftAdmin(action, missatgeExit, loadingSetter, includeConfig = true) {
        loadingSetter?.(true)
        try {
            const body = { action }
            if (includeConfig) {
                body.ordre = ordre
                body.maxJugadors = maxJugadors
                body.maxJugadorsEquip = maxJugadorsEquip
            }

            const res = await fetch('/api/admin/draft-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => ({}))

            if (!res.ok || data.error) {
                mostrarMissatge('❌ Error: ' + (data.error || 'No s\'ha pogut actualitzar el draft'), 5000)
                return { ok: false, data: null }
            }

            aplicarDraftLocal(data?.draft)
            if (missatgeExit) mostrarMissatge(missatgeExit)
            return { ok: true, data }
        } catch (error) {
            mostrarMissatge('❌ Error: ' + error.message, 5000)
            return { ok: false, data: null }
        } finally {
            loadingSetter?.(false)
        }
    }

    async function calcularClassificacioActual(perfils) {
        const { data: allPunts } = await supabase.from('player_punts').select('player_id, punts')
        const { data: teams }    = await supabase.from('teams').select('user_id, alineacio')
        const puntsMapa = {}
        allPunts?.forEach(p => { puntsMapa[p.player_id] = (puntsMapa[p.player_id] || 0) + Number(p.punts) })
        return (perfils || []).map(perf => {
            const team = teams?.find(t => t.user_id === perf.id)
            const alineacio = team?.alineacio || {}
            const total = Object.values(alineacio).reduce((sum, pid) => sum + (puntsMapa[pid] || 0), 0)
            return { user_id: perf.id, nom: perf.nom || perf.email, punts: total }
        }).sort((a, b) => b.punts - a.punts).map((u, i) => ({ ...u, posicio: i + 1 }))
    }

    async function guardarClassificacioIReinicisar() {
        if (!confirm(`Segur que vols guardar la classificació de "${nomVolta}" i REINICIAR tots els punts a 0? Aquesta acció no es pot desfer.`)) return
        setGuardantClass(true)
        setMissatgeClass('')
        try {
            // 1. Calcular classificació actual
            const { data: perfils } = await supabase.from('profiles').select('id, nom, email')
            const classActual = await calcularClassificacioActual(perfils)

            // 2. Guardar a classificacio_arxivada
            const { error: errGuardar } = await supabase.from('classificacio_arxivada').insert({
                nom: nomVolta,
                jornada_final: jornadaFinalVolta,
                classificacio: classActual,
            })
            if (errGuardar) {
                setMissatgeClass('❌ Error: ' + errGuardar.message)
                setGuardantClass(false)
                setTimeout(() => setMissatgeClass(''), 6000)
                return
            }

            // 3. Reiniciar tots els punts (eliminar tots els player_punts)
            const { error: errDelete } = await supabase.from('player_punts').delete().neq('id', 0)
            if (errDelete) {
                setMissatgeClass('❌ Error: ' + errDelete.message)
                setGuardantClass(false)
                setTimeout(() => setMissatgeClass(''), 6000)
                return
            }

            setMissatgeClass(`✅ Classificació "${nomVolta}" guardada i punts reiniciats a 0!`)
            await fetchTot()
        } catch (e) {
            setMissatgeClass('❌ Error: ' + e.message)
        }
        setGuardantClass(false)
        setTimeout(() => setMissatgeClass(''), 6000)
    }

    async function nomesReiniciarPunts() {
        if (!confirm('Segur que vols reiniciar TOTS els punts a 0 sense guardar la classificació?')) return
        setReiniciantPunts(true)
        const { error } = await supabase.from('player_punts').delete().neq('id', 0)
        if (error) setMissatgeClass('❌ Error: ' + error.message)
        else setMissatgeClass('✅ Punts reiniciats a 0!')
        setReiniciantPunts(false)
        setTimeout(() => setMissatgeClass(''), 4000)
    }

    async function eliminarClassificacioArxivada(id, nom) {
        if (!confirm(`Eliminar la classificació "${nom}"?`)) return
        await supabase.from('classificacio_arxivada').delete().eq('id', id)
        await fetchTot()
    }

    async function carregarPicksDraft() {
        const { data } = await supabase
            .from('draft_picks')
            .select('id, player_id, user_id, torn, temps_seleccio')
            .order('torn', { ascending: true })
        setPicksDraft(data || [])
    }

    function formatSegons(segonsTotals) {
        const segons = Math.max(0, Number(segonsTotals) || 0)
        const h = Math.floor(segons / 3600)
        const m = Math.floor((segons % 3600) / 60)
        const s = segons % 60
        if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
        return `${m}m ${String(s).padStart(2, '0')}s`
    }

    function colorTempsMinuts(mins) {
        if (mins > 60) return 'text-red-400'
        if (mins >= 21) return 'text-yellow-400'
        return 'text-green-400'
    }

    async function desferPick(pick) {
        if (!confirm('Segur que vols desfer aquesta elecció? El torn tornarà a aquest punt.')) return
        await supabase.from('draft_picks').delete().eq('id', pick.id)
        await supabase.from('drafts').update({
            estat: 'actiu',
            torn_actual: pick.torn,
            torn_iniciat_at: new Date().toISOString(),
            pausat_at: null,
            temps_pausat_acumulat: 0,
        }).eq('id', draft.id)
        setMissatgeDraft('✓ Elecció desfeta. Torn reiniciat.')
        await carregarPicksDraft()
        await fetchTot()
        setTimeout(() => setMissatgeDraft(''), 4000)
    }

    async function confirmarCanviJugador(pickId, newPlayerId) {
        await supabase.from('draft_picks').update({ player_id: newPlayerId }).eq('id', pickId)
        setMissatgeDraft('✓ Jugador canviat correctament.')
        setEditantPick(null)
        setFiltreCanvi('')
        await carregarPicksDraft()
        setTimeout(() => setMissatgeDraft(''), 4000)
    }

    function moureAmunt(index) {
        if (index === 0) return
        const nou = [...ordre]
        ;[nou[index - 1], nou[index]] = [nou[index], nou[index - 1]]
        setOrdre(nou)
    }

    function moureavall(index) {
        if (index === ordre.length - 1) return
        const nou = [...ordre]
        ;[nou[index + 1], nou[index]] = [nou[index], nou[index + 1]]
        setOrdre(nou)
    }

    function afegirParticipant(userId) {
        if (ordre.includes(userId)) return
        setOrdre([...ordre, userId])
    }

    function treureParticipant(userId) {
        setOrdre(ordre.filter(id => id !== userId))
    }

    async function guardarOpcions() {
        await actualitzarDraftAdmin('save-config', 'El draft s\'ha guardat correctament.', setDesantConfiguracioDraft)
    }

    async function iniciarDraft() {
        if (ordre.length < 2) return alert('Necessites almenys 2 participants!')
        const result = await actualitzarDraftAdmin('start-draft', 'El draft s\'ha iniciat correctament.', setIniciantDraftAdmin)
        if (!result.ok) return

        const primer = participants.find(p => p.id === ordre[0])
        if (primer?.email) {
            await fetch('/api/notify-torn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: primer.email, nom: primer.nom || primer.email, torn: 1, jugadorsTriats: 0 })
            })
        }
        void fetchTot()
    }

    async function pausarDraft() {
        await actualitzarDraftAdmin('pause-draft', 'El draft s\'ha pausat correctament.', setPausantDraft, false)
    }

    async function reactivarDraft() {
        await actualitzarDraftAdmin('resume-draft', 'El draft s\'ha reactivat correctament.', setReactivantDraft, false)
    }

    async function resetDraft() {
        if (!confirm('Segur que vols fer un reset del draft?\n\nAixò eliminarà tots els jugadors assignats a cada usuari i es tornarà a començar l\'elecció de jugadors des de zero.')) return
        setResetantDraft(true)
        try {
            const res = await fetch('/api/admin/reset-draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            const data = await res.json()
            if (!res.ok || data.error) {
                setMissatge('❌ Error: ' + (data.error || 'No s’ha pogut reiniciar el draft'))
                setResetantDraft(false)
                setTimeout(() => setMissatge(''), 5000)
                return
            }

            setOrdre([])
            setMissatge('🔄 Draft reiniciat: s’han esborrat tots els picks i s’han buidat els equips.')
            await fetchTot()
        } catch (e) {
            setMissatge('❌ Error: ' + e.message)
        }
        setResetantDraft(false)
        setTimeout(() => setMissatge(''), 5000)
    }

    async function acabarDraftAleatori() {
        if (!confirm('Vols acabar el draft de forma aleatoria?\n\nS\'ompliran tots els picks restants respectant limits de posicio i equip real. Aquesta accio no es pot desfer facilment.')) return
        setAcabantDraftAleatori(true)
        try {
            const res = await fetch('/api/admin/finish-random-draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || data.error || !data.ok) {
                setMissatge(`❌ Error: ${data.error || 'No s\'ha pogut acabar el draft aleatori'}`)
                setTimeout(() => setMissatge(''), 5000)
                return
            }

            const cleaned = Number(data.cleanedPicks || 0)
            const suffix = cleaned > 0 ? ` (neteja: ${cleaned} picks inconsistents).` : '.'
            setMissatge(`🎲 Draft completat aleatoriament (${data.inserted || 0} picks nous)${suffix}`)
            await fetchTot()
            await carregarPicksDraft()
            setTimeout(() => setMissatge(''), 5000)
        } catch (e) {
            setMissatge('❌ Error: ' + e.message)
            setTimeout(() => setMissatge(''), 5000)
        } finally {
            setAcabantDraftAleatori(false)
        }
    }

    async function crearUsuari() {
        if (!nouNom || !nouEmail || !nouPassword) return alert('Omple tots els camps!')
        setCreanUser(true)
        const res = await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom: nouNom, email: nouEmail, password: nouPassword })
        })
        const data = await res.json()
        if (data.error) setMissatge('❌ Error: ' + data.error)
        else { setMissatge('✓ Usuari creat: ' + nouEmail); setNouNom(''); setNouEmail(''); setNouPassword(''); fetchTot() }
        setCreanUser(false)
        setTimeout(() => setMissatge(''), 4000)
    }

    async function eliminarUsuari(userId, email) {
        if (!confirm(`Eliminar usuari ${email}?`)) return
        try {
            const res = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            })
            const data = await res.json()
            if (!res.ok || data.error) {
                setMissatge('❌ Error: ' + (data.error || 'No s\'ha pogut eliminar l\'usuari'))
                return
            }

            setMissatge('✅ Usuari eliminat.')
            await fetchTot()
        } catch (e) {
            setMissatge('❌ Error: ' + e.message)
        }
        setTimeout(() => setMissatge(''), 3000)
    }

    function obrirModalEdicioUsuari(userObj) {
        setUsuariEditant(userObj)
        setNomEditat(userObj?.nom || '')
    }

    function tancarModalEdicioUsuari() {
        if (desantEdicioUsuari) return
        setUsuariEditant(null)
        setNomEditat('')
    }

    function obrirModalResetContrasenya(userObj) {
        setUsuariResetant(userObj)
        setNovaContrasenya('')
        setMissatgeReset('')
    }

    function tancarModalResetContrasenya() {
        if (resetantContrasenya) return
        setUsuariResetant(null)
        setNovaContrasenya('')
        setMissatgeReset('')
    }

    async function guardarNovaContrasenya() {
        if (!usuariResetant?.id) return
        if (novaContrasenya.length < 6) {
            setMissatgeReset('❌ La contrasenya ha de tenir almenys 6 caràcters')
            return
        }
        setResetantContrasenya(true)
        setMissatgeReset('')
        try {
            const res = await fetch('/api/admin/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: usuariResetant.id, novaContrasenya }),
            })
            const data = await res.json()
            if (!res.ok || data.error) {
                setMissatgeReset('❌ Error: ' + (data.error || 'No s\'ha pogut canviar la contrasenya'))
            } else {
                setMissatgeReset('✅ Contrasenya canviada correctament!')
                setTimeout(() => tancarModalResetContrasenya(), 2000)
            }
        } catch (e) {
            setMissatgeReset('❌ Error: ' + e.message)
        }
        setResetantContrasenya(false)
    }

    async function guardarEdicioUsuari() {
        if (!usuariEditant?.id) return
        const nom = nomEditat.trim()
        if (!nom) return alert('El nom no pot estar buit')

        const userId = usuariEditant.id
        setDesantEdicioUsuari(true)
        setEditantUsuariId(userId)
        try {
            const res = await fetch('/api/admin/update-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: usuariEditant.id, nom }),
            })
            const data = await res.json()
            if (!res.ok || data.error) {
                setMissatge('❌ Error: ' + (data.error || 'No s\'ha pogut editar l\'usuari'))
                return
            }

            setMissatge('✏️ Nom d\'usuari actualitzat.')
            await fetchTot()
            setUsuariEditant(null)
            setNomEditat('')
        } catch (e) {
            setMissatge('❌ Error: ' + e.message)
        }
        setEditantUsuariId(null)
        setDesantEdicioUsuari(false)
        setTimeout(() => setMissatge(''), 3000)
    }

    async function carregarPuntsJornada(jornada) {
        const { data } = await supabase.from('player_punts').select('player_id, punts').eq('jornada', jornada)
        const mapa = {}
        data?.forEach(p => { mapa[p.player_id] = p.punts })
        setPuntsMapa(mapa)
    }

    function generarOrdreSerpentina(baseOrdre, rondesTotals = 1) {
        return Array.from({ length: rondesTotals }).flatMap((_, rondaIndex) => (
            rondaIndex % 2 === 0 ? baseOrdre : [...baseOrdre].reverse()
        ))
    }

    function isMissingCanvisPicksError(error) {
        const msg = (error?.message || '').toLowerCase()
        return msg.includes('canvis_picks') && (
            msg.includes('could not find the table') ||
            msg.includes('does not exist') ||
            msg.includes('schema cache')
        )
    }

    async function netejarCanvisPicksSiExisteix() {
        const { error } = await supabase.from('canvis_picks').delete().neq('id', 0)
        if (error && !isMissingCanvisPicksError(error)) {
            throw new Error(error.message)
        }
    }

    async function sincronitzarJugadors() {
        setSincronitzant(true)
        setMissatgeSync('')
        try {
            const res = await fetch('/api/sync-players', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: process.env.NEXT_PUBLIC_SYNC_SECRET || '' })
            })
            const data = await res.json()
            if (!res.ok || data.error) {
                setMissatgeSync('❌ Error: ' + (data.error || 'No s\'ha pogut sincronitzar'))
            } else {
                setMissatgeSync(`✓ ${data.message}`)
                setResumCanvisSync({
                    altes: Array.isArray(data.altes) ? data.altes : [],
                    baixes: Array.isArray(data.baixes) ? data.baixes : [],
                })
            }
            // Recarreguem la llista de players
            const { data: playersData } = await supabase.from('players').select('id, nombre, posicion').order('posicion').order('nombre')
            setPlayers(playersData || [])
        } catch (e) {
            setMissatgeSync('❌ Error de connexió: ' + e.message)
        }
        setSincronitzant(false)
        setTimeout(() => setMissatgeSync(''), 6000)
    }

    async function desarPuntsJornada(mapaOverride, jornadaOverride) {
        setDesantPunts(true)
        setMissatgePunts('')
        const mapaFinal = mapaOverride ?? puntsMapa
        const jornadaFinal = jornadaOverride ?? jornadaPunts
        try {
            const res = await fetch('/api/admin/save-player-points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jornada: jornadaFinal, puntsMapa: mapaFinal }),
            })
            const data = await res.json().catch(() => ({}))
            setMissatgePunts(
                !res.ok || !data?.ok
                    ? `❌ Error desant punts: ${data?.error || 'Error desconegut'}`
                    : `✓ ${data.saved} punts jornada ${jornadaFinal} desats a la BD!`
            )
        } catch (e) {
            setMissatgePunts(`❌ Error de connexió: ${e.message}`)
        }
        setDesantPunts(false)
        setTimeout(() => setMissatgePunts(''), 5000)
    }

    async function importarPuntsFutmondo() {
        setImportantFutmondo(true)
        setMissatgePunts('')
        try {
            const res = await fetch('/api/admin/import-futmondo-points', { cache: 'no-store' })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data?.ok) {
                setMissatgePunts(`❌ Error important punts Futmondo: ${data?.error || 'Resposta invàlida'}`)
                return
            }

            const mapa = data.puntsMapa || {}
            const jornadaImportada = Number(data.jornada) || jornadaPunts
            setPuntsMapa(mapa)
            if (jornadaImportada !== jornadaPunts) setJornadaPunts(jornadaImportada)

            // Recarrega des de BD per mostrar l'estat real persistit després de l'upsert.
            await carregarPuntsJornada(jornadaImportada)

            const unmatched = Number(data.unmatched || 0)
            const zeros = Number(data.defaultedToZero || 0)
            setMissatgePunts(
                `✅ Futmondo (Jornada ${data.jornada || jornadaPunts}): ${data.matched || 0} jugadors desats a la BD${data.importedAt ? ` · última importació ${new Intl.DateTimeFormat('ca-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(data.importedAt))}` : ''}${zeros ? ` · ${zeros} amb 0 pts` : ''}${unmatched ? ` · ${unmatched} sense encaix` : ''}`
            )
        } catch (error) {
            setMissatgePunts(`❌ Error important punts Futmondo: ${error.message}`)
        } finally {
            setImportantFutmondo(false)
            setTimeout(() => setMissatgePunts(''), 8000)
        }
    }

    async function iniciarRondaCanvis() {
        setIniciantCanvis(true)
        setMissatgeCanvis('')
        try {
            // 1. Calcular classificació general (suma punts per usuari)
            const { data: allPunts } = await supabase.from('player_punts').select('player_id, punts')
            const { data: teams }    = await supabase.from('teams').select('user_id, alineacio')
            const { data: perfils }  = await supabase.from('profiles').select('id')

            const puntsMapa = {}
            allPunts?.forEach(p => { puntsMapa[p.player_id] = (puntsMapa[p.player_id] || 0) + Number(p.punts) })

            const userPunts = (teams || []).map(team => {
                const alineacio = team.alineacio || {}
                const total = Object.values(alineacio).reduce((sum, pid) => sum + (puntsMapa[pid] || 0), 0)
                return { userId: team.user_id, total }
            })

            // Afegir usuaris sense equip (0 punts)
            const teamIds = new Set(teams?.map(t => t.user_id) || [])
            perfils?.forEach(p => { if (!teamIds.has(p.id)) userPunts.push({ userId: p.id, total: 0 }) })

            // Ordre ascendent (pitjor primer = invers de classificació)
            userPunts.sort((a, b) => a.total - b.total)
            const ordreBase = userPunts.map(u => u.userId)
            const ordre = generarOrdreSerpentina(ordreBase, 1)

            // 2. Reiniciar picks i crear o actualitzar registre de canvis
            await netejarCanvisPicksSiExisteix()
            const { data: existing } = await supabase.from('canvis').select('id')
                .order('created_at', { ascending: false }).limit(1).single()

            if (existing) {
                await supabase.from('canvis').update({
                    estat: 'actiu', torn_actual: 0, ordre_participants: ordre
                }).eq('id', existing.id)
            } else {
                await supabase.from('canvis').insert({
                    estat: 'actiu', torn_actual: 0, ordre_participants: ordre
                })
            }

            setMissatgeCanvis(`✓ Ronda de canvis iniciada! Ordre: ${ordre.length} participants`)
        } catch (e) {
            setMissatgeCanvis('❌ Error: ' + e.message)
        }
        setIniciantCanvis(false)
        setTimeout(() => setMissatgeCanvis(''), 5000)
    }

    async function iniciarRondaCanvisNadal() {
        setIniciantCanvisNadal(true)
        setMissatgeCanvisNadal('')
        try {
            const { data: allPunts } = await supabase.from('player_punts').select('player_id, punts')
            const { data: teams }    = await supabase.from('teams').select('user_id, alineacio')
            const { data: perfils }  = await supabase.from('profiles').select('id')

            const puntsMapa = {}
            allPunts?.forEach(p => { puntsMapa[p.player_id] = (puntsMapa[p.player_id] || 0) + Number(p.punts) })

            const userPunts = (teams || []).map(team => {
                const alineacio = team.alineacio || {}
                const total = Object.values(alineacio).reduce((sum, pid) => sum + (puntsMapa[pid] || 0), 0)
                return { userId: team.user_id, total }
            })

            const teamIds = new Set(teams?.map(t => t.user_id) || [])
            perfils?.forEach(p => { if (!teamIds.has(p.id)) userPunts.push({ userId: p.id, total: 0 }) })

            userPunts.sort((a, b) => a.total - b.total)
            const ordreBase = userPunts.map(u => u.userId)
            const ordre = generarOrdreSerpentina(ordreBase, 3)

            await netejarCanvisPicksSiExisteix()
            const { data: existing } = await supabase.from('canvis').select('id')
                .order('created_at', { ascending: false }).limit(1).single()

            if (existing) {
                await supabase.from('canvis').update({
                    estat: 'actiu', torn_actual: 0, ordre_participants: ordre
                }).eq('id', existing.id)
            } else {
                await supabase.from('canvis').insert({
                    estat: 'actiu', torn_actual: 0, ordre_participants: ordre
                })
            }

            setMissatgeCanvisNadal(`🎄 Ronda de canvis Nadal iniciada! ${ordreBase.length} participants · 3 rondes serpentina`)
        } catch (e) {
            setMissatgeCanvisNadal('❌ Error: ' + e.message)
        }
        setIniciantCanvisNadal(false)
        setTimeout(() => setMissatgeCanvisNadal(''), 7000)
    }

    if (loading) return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Carregant...</div>
    )

    // ── Pantalla de PIN admin ────────────────────────────────────────
    if (!adminOk) return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm">
                <div className="text-center mb-6">
                    <div className="text-4xl mb-3">🔐</div>
                    <h1 className="text-2xl font-bold text-green-400">Panell d&apos;Admin</h1>
                    <p className="text-gray-500 text-sm mt-1">Accés restringit</p>
                </div>
                <input
                    type="text"
                    placeholder="Usuari"
                    value={pinUser}
                    onChange={e => setPinUser(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                    autoComplete="off"
                />
                <input
                    type="password"
                    placeholder="Contrasenya"
                    value={pinPass}
                    onChange={e => setPinPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && comprovarPin()}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                />
                {pinError && <p className="text-red-400 text-sm text-center mb-3">{pinError}</p>}
                <button
                    onClick={comprovarPin}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition">
                    Entrar
                </button>
            </div>
        </div>
    )

    const noAfegits = participants.filter(p => !ordre.includes(p.id))
    const resumTempsDraft = participants
        .map((p) => {
            const picksUsuari = picksDraft.filter(pk => pk.user_id === p.id)
            const totalSegons = picksUsuari.reduce((sum, pk) => sum + (Number(pk.temps_seleccio) || 0), 0)
            const mitjanaSegons = picksUsuari.length ? Math.round(totalSegons / picksUsuari.length) : 0
            return {
                userId: p.id,
                nom: p.nom || p.email || p.id,
                picks: picksUsuari.length,
                totalSegons,
                mitjanaSegons,
            }
        })
        .filter(x => x.picks > 0)
        .sort((a, b) => b.totalSegons - a.totalSegons)

    return (
        <main className="min-h-screen bg-gray-950 text-white p-8">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-3xl font-bold text-green-400">⚙️ Panell d&apos;Admin</h1>
                    <button
                        onClick={() => {
                            sessionStorage.removeItem('admin_auth')
                            router.push('/login')
                        }}
                        className="text-gray-500 hover:text-white text-sm border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition">
                        🚪 Tancar sessió
                    </button>
                </div>
                <p className="text-gray-400 mb-6">Benvingut, {user?.email || 'Admin'}</p>

                {missatge && (
                    <div className={`border px-4 py-3 rounded-lg mb-6 ${missatge.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                        {missatge}
                    </div>
                )}

                {/* Navegació seccions */}
                <div className="flex gap-2 mb-8 flex-wrap">
                    {['draft', 'opcions', 'usuaris', 'punts', 'sync', 'canvis', 'classificacio'].map(s => (
                        <button key={s} onClick={() => { setSeccio(s); if (s === 'punts') carregarPuntsJornada(jornadaPunts) }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${seccio === s ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                            {s === 'draft' ? '⚽ Draft' : s === 'opcions' ? '⚙️ Opcions' : s === 'usuaris' ? '👥 Usuaris' : s === 'punts' ? '📊 Punts' : s === 'sync' ? '🔄 Jugadors' : s === 'canvis' ? '↔️ Canvis' : '🏆 Classificació'}
                        </button>
                    ))}
                </div>

                {/* SECCIÓ DRAFT */}
                {seccio === 'draft' && (
                    <div>
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
                            <p className="text-gray-400 text-sm">Estat:
                                <span className={`ml-2 font-semibold ${draft?.estat === 'actiu' ? 'text-green-400' : draft?.estat === 'pausat' ? 'text-orange-400' : draft?.estat === 'finalitzat' ? 'text-yellow-400' : 'text-yellow-600'}`}>
                                    {draft?.estat === 'actiu'
                                        ? '🟢 Actiu · Torn ' + (draft.torn_actual + 1)
                                        : draft?.estat === 'pausat'
                                            ? '⏸️ Pausat · Torn ' + ((draft?.torn_actual || 0) + 1)
                                            : draft?.estat === 'finalitzat'
                                                ? '🏆 Finalitzat'
                                                : '🟡 Pendent'}
                                </span>
                            </p>
                            <p className="text-gray-400 text-sm mt-1">Màxim jugadors per equip: <span className="text-white font-semibold">{maxJugadors}</span></p>
                        </div>

                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-white font-semibold">⏱️ Temps de selecció per usuari</p>
                                <p className="text-gray-500 text-xs">Basat en `draft_picks.temps_seleccio`</p>
                            </div>

                            {resumTempsDraft.length === 0 ? (
                                <p className="text-gray-600 text-sm">Encara no hi ha picks amb temps registrat.</p>
                            ) : (
                                <div className="space-y-2">
                                    {resumTempsDraft.map((r, idx) => {
                                        const minsMitjana = Math.floor(r.mitjanaSegons / 60)
                                        return (
                                            <div key={r.userId} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                                                <span className="text-gray-500 text-xs w-5">#{idx + 1}</span>
                                                <span className="text-white text-sm font-medium flex-1 truncate">{r.nom}</span>
                                                <span className="text-gray-500 text-xs">{r.picks} picks</span>
                                                <span className="text-cyan-300 text-xs font-semibold">Total: {formatSegons(r.totalSegons)}</span>
                                                <span className={`text-xs font-semibold ${colorTempsMinuts(minsMitjana)}`}>
                                                    Mitjana: {formatSegons(r.mitjanaSegons)}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {noAfegits.length > 0 && (
                            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
                                <p className="text-gray-400 text-sm mb-3">Participants disponibles:</p>
                                <div className="flex flex-wrap gap-2">
                                    {noAfegits.map(p => (
                                        <button key={p.id} onClick={() => afegirParticipant(p.id)}
                                                className="bg-gray-700 hover:bg-green-700 text-white text-sm px-3 py-1 rounded-full transition">
                                            + {p.nom || p.email}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
                            <p className="text-white font-semibold mb-4">Ordre del draft</p>
                            {ordre.length === 0 ? (
                                <p className="text-gray-600 text-sm">Afegeix participants des de dalt</p>
                            ) : (
                                <div className="space-y-2">
                                    {ordre.map((uid, index) => {
                                        const p = participants.find(x => x.id === uid)
                                        return (
                                            <div key={uid} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                                                <span className="text-gray-500 text-sm w-6">{index + 1}</span>
                                                <span className="flex-1 font-medium">{p?.nom || p?.email || uid.slice(0, 8)}</span>
                                                <span className="text-gray-500 text-xs hidden md:block">{p?.email}</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => moureAmunt(index)} className="text-gray-400 hover:text-white px-2 py-1 rounded">↑</button>
                                                    <button onClick={() => moureavall(index)} className="text-gray-400 hover:text-white px-2 py-1 rounded">↓</button>
                                                    <button onClick={() => treureParticipant(uid)} className="text-red-400 hover:text-red-300 px-2 py-1 rounded">✕</button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {ordre.length > 0 && (
                            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
                                <p className="text-white font-semibold mb-3">Preview serpentina ({maxJugadors} rondes)</p>
                                <div className="space-y-1 max-h-64 overflow-y-auto">
                                    {Array.from({ length: maxJugadors }).flatMap((_, rondaIndex) => {
                                        const esParell = rondaIndex % 2 === 0
                                        const ordenatRonda = esParell ? ordre : [...ordre].reverse()
                                        return ordenatRonda.map((uid, posIndex) => {
                                            const p = participants.find(x => x.id === uid)
                                            const tornGlobal = rondaIndex * ordre.length + posIndex + 1
                                            return (
                                                <div key={`${rondaIndex}-${posIndex}`} className="flex gap-3 text-sm">
                                                    <span className="text-gray-600 w-8">#{tornGlobal}</span>
                                                    <span className={`w-16 text-xs px-2 py-0.5 rounded text-center ${rondaIndex % 2 === 0 ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}`}>
                                                        Ronda {rondaIndex + 1}
                                                    </span>
                                                    <span className="text-gray-300">{p?.nom || p?.email}</span>
                                                </div>
                                            )
                                        })
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <button
                                onClick={guardarOpcions}
                                disabled={desantConfiguracioDraft || iniciantDraftAdmin || pausantDraft || reactivantDraft || resetantDraft || acabantDraftAleatori}
                                className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                            >
                                {desantConfiguracioDraft ? 'Desant ordre...' : 'Guardar ordre'}
                            </button>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button
                                    onClick={iniciarDraft}
                                    disabled={draft?.estat === 'actiu' || draft?.estat === 'pausat' || draft?.estat === 'finalitzat' || ordre.length < 2 || desantConfiguracioDraft || iniciantDraftAdmin || pausantDraft || reactivantDraft || resetantDraft || acabantDraftAleatori}
                                    className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                                >
                                    {iniciantDraftAdmin
                                        ? 'Iniciant draft...'
                                        : draft?.estat === 'finalitzat'
                                            ? '🏆 Draft finalitzat'
                                            : draft?.estat === 'actiu'
                                            ? '✅ Draft ja iniciat'
                                            : draft?.estat === 'pausat'
                                                ? 'Draft pausat'
                                                : ordre.length < 2
                                                    ? 'Calen almenys 2 participants'
                                                    : '🚀 Inici draft'}
                                </button>
                                <button
                                    onClick={pausarDraft}
                                    disabled={draft?.estat !== 'actiu' || pausantDraft || reactivantDraft || resetantDraft || acabantDraftAleatori}
                                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                                >
                                    {pausantDraft ? 'Pausant...' : '⏸️ Pausar draft'}
                                </button>
                                <button
                                    onClick={reactivarDraft}
                                    disabled={draft?.estat !== 'pausat' || pausantDraft || reactivantDraft || resetantDraft || acabantDraftAleatori}
                                    className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                                >
                                    {reactivantDraft ? 'Reactivant...' : '▶️ Reactivar draft'}
                                </button>
                            </div>
                            {missatge && (
                                <div className={`border px-4 py-3 rounded-lg text-sm ${missatge.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                    {missatge}
                                </div>
                            )}
                            <button onClick={resetDraft} disabled={resetantDraft || acabantDraftAleatori} className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 px-4 py-3 rounded-lg transition">
                                {resetantDraft ? 'Reiniciant...' : '🔄 Reset Draft'}
                            </button>
                            <button
                                onClick={acabarDraftAleatori}
                                disabled={acabantDraftAleatori || resetantDraft || draft?.estat === 'finalitzat' || draft?.estat === 'pendent'}
                                className="w-full bg-purple-800 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg transition"
                            >
                                {acabantDraftAleatori ? 'Omplint picks aleatoris...' : '🎲 Acaba draft aleatori'}
                            </button>
                        </div>

                        {/* ── Gestió picks: desfer / canviar jugador ── */}
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-white font-semibold">🗂️ Picks realitzats ({picksDraft.length})</p>
                                <button onClick={carregarPicksDraft} className="text-gray-400 hover:text-white text-xs border border-gray-700 rounded px-2 py-1">↻ Actualitzar</button>
                            </div>

                            {missatgeDraft && (
                                <div className={`border px-3 py-2 rounded-lg mb-3 text-sm ${missatgeDraft.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                    {missatgeDraft}
                                </div>
                            )}

                            {picksDraft.length === 0 ? (
                                <p className="text-gray-600 text-sm">Encara no hi ha picks.</p>
                            ) : (
                                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                                    {[...picksDraft].reverse().map((pick, idx) => {
                                        const esDarrerPick = idx === 0
                                        const propietari = participants.find(p => p.id === pick.user_id)
                                        const jugador    = allPlayers.find(p => p.id === pick.player_id)
                                        return (
                                            <div key={pick.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                                                <span className="text-gray-500 text-xs w-6">#{(pick.torn ?? 0) + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm truncate">{jugador?.nombre || `ID:${pick.player_id}`}</p>
                                                    <p className="text-gray-400 text-xs">{propietari?.nom || propietari?.email || pick.user_id?.slice(0,8)}</p>
                                                </div>
                                                <span className="text-gray-500 text-xs hidden md:block">{jugador?.posicion}</span>
                                                <button
                                                    onClick={() => { setEditantPick(pick); setFiltreCanvi('') }}
                                                    className="text-blue-400 hover:text-blue-300 text-xs border border-blue-800 hover:border-blue-600 rounded px-2 py-1 transition">
                                                    ✏️ Canviar
                                                </button>
                                                <button
                                                    onClick={() => desferPick(pick)}
                                                    disabled={!esDarrerPick}
                                                    title={esDarrerPick ? 'Desfer darrer pick' : 'Nomes es pot desfer el darrer pick'}
                                                    className={`text-xs border rounded px-2 py-1 transition ${esDarrerPick
                                                        ? 'text-red-400 hover:text-red-300 border-red-800 hover:border-red-600'
                                                        : 'text-gray-600 border-gray-700 cursor-not-allowed'
                                                    }`}>
                                                    ✕ Desfer
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ── Modal canvi de jugador ── */}
                        {editantPick && (() => {
                            const pickedIds = new Set(picksDraft.filter(p => p.id !== editantPick.id).map(p => p.player_id))
                            const filtre = filtreCanvi.toLowerCase()
                            const disponibles = allPlayers.filter(p =>
                                !pickedIds.has(p.id) &&
                                (p.nombre.toLowerCase().includes(filtre) || p.posicion?.toLowerCase().includes(filtre))
                            )
                            const jugadorActual = allPlayers.find(p => p.id === editantPick.player_id)
                            const propietari    = participants.find(p => p.id === editantPick.user_id)
                            return (
                                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
                                        <h3 className="text-white font-bold text-lg mb-1">✏️ Canviar jugador del pick</h3>
                                        <p className="text-gray-400 text-sm mb-1">
                                            Propietari: <span className="text-white">{propietari?.nom || propietari?.email}</span>
                                        </p>
                                        <p className="text-gray-400 text-sm mb-4">
                                            Jugador actual: <span className="text-yellow-400 font-semibold">{jugadorActual?.nombre || `ID:${editantPick.player_id}`}</span>
                                        </p>
                                        <input
                                            type="text"
                                            placeholder="Cerca jugador disponible..."
                                            value={filtreCanvi}
                                            onChange={e => setFiltreCanvi(e.target.value)}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3 text-sm"
                                            autoFocus
                                        />
                                        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                            {disponibles.length === 0 ? (
                                                <p className="text-gray-500 text-sm text-center py-4">No hi ha jugadors disponibles.</p>
                                            ) : (
                                                disponibles.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => confirmarCanviJugador(editantPick.id, p.id)}
                                                        className="w-full flex items-center gap-3 bg-gray-800 hover:bg-blue-900 border border-transparent hover:border-blue-600 rounded-lg px-3 py-2 transition text-left">
                                                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                                                            p.posicion === 'Porter'      ? 'bg-yellow-500 text-yellow-900' :
                                                            p.posicion === 'Defensa'     ? 'bg-blue-500 text-blue-900' :
                                                            p.posicion === 'Migcampista' ? 'bg-green-500 text-green-900' :
                                                            'bg-red-500 text-red-900'
                                                        }`}>{p.posicion?.slice(0,3)}</span>
                                                        <span className="text-white text-sm flex-1">{p.nombre}</span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                        <button
                                            onClick={() => { setEditantPick(null); setFiltreCanvi('') }}
                                            className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition">
                                            Cancel·lar
                                        </button>
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                )}

                {/* SECCIÓ OPCIONS */}
                {seccio === 'opcions' && (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                        <h2 className="text-white font-semibold text-lg mb-6">⚙️ Opcions de la lliga</h2>

                        {/* Màxim jugadors per equip fantasy */}
                        <div className="mb-6">
                            <label className="text-gray-400 text-sm block mb-1">Màxim de jugadors per equip fantasy</label>
                            <p className="text-gray-600 text-xs mb-2">El draft s&apos;aturarà quan tots els equips tinguin {maxJugadors} jugadors</p>
                            <div className="flex items-center gap-4">
                                <button onClick={() => setMaxJugadors(Math.max(1, maxJugadors - 1))}
                                        className="bg-gray-700 hover:bg-gray-600 text-white w-10 h-10 rounded-lg text-xl font-bold transition">−</button>
                                <span className="text-white text-2xl font-bold w-12 text-center">{maxJugadors}</span>
                                <button onClick={() => setMaxJugadors(maxJugadors + 1)}
                                        className="bg-gray-700 hover:bg-gray-600 text-white w-10 h-10 rounded-lg text-xl font-bold transition">+</button>
                            </div>
                        </div>

                        {/* Màxim jugadors d'un mateix equip real */}
                        <div className="mb-6 pt-5 border-t border-gray-800">
                            <label className="text-gray-400 text-sm block mb-1">Nombre màxim de jugadors d&apos;un mateix equip real</label>
                            <p className="text-gray-600 text-xs mb-2">
                                No es podran triar més de {maxJugadorsEquip} jugadors d&apos;un mateix equip (ex: màx. {maxJugadorsEquip} del Madrid)
                            </p>
                            <div className="flex items-center gap-4">
                                <button onClick={() => setMaxJugadorsEquip(Math.max(1, maxJugadorsEquip - 1))}
                                        className="bg-gray-700 hover:bg-gray-600 text-white w-10 h-10 rounded-lg text-xl font-bold transition">−</button>
                                <span className="text-white text-2xl font-bold w-12 text-center">{maxJugadorsEquip}</span>
                                <button onClick={() => setMaxJugadorsEquip(maxJugadorsEquip + 1)}
                                        className="bg-gray-700 hover:bg-gray-600 text-white w-10 h-10 rounded-lg text-xl font-bold transition">+</button>
                            </div>
                        </div>

                        <button onClick={guardarOpcions} className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg font-semibold transition">
                            Guardar opcions
                        </button>
                    </div>
                )}

                {/* SECCIÓ USUARIS */}
                {seccio === 'usuaris' && (
                    <div>
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-5">
                            <h2 className="text-white font-semibold text-lg mb-4">➕ Crear usuari</h2>
                            <input type="text" placeholder="Nom complet" value={nouNom} onChange={e => setNouNom(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500" />
                            <input type="email" placeholder="Email" value={nouEmail} onChange={e => setNouEmail(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500" />
                            <input type="text" placeholder="Contrasenya temporal" value={nouPassword} onChange={e => setNouPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white placeholder-gray-500 focus:outline-none focus:border-green-500" />
                            <button onClick={crearUsuari} disabled={creanUser} className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50">
                                {creanUser ? 'Creant...' : 'Crear usuari'}
                            </button>
                        </div>

                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-white font-semibold text-lg mb-4">👥 Usuaris registrats ({participants.length})</h2>
                            <div className="space-y-2">
                                {participants.map(p => (
                                    <div key={p.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                                        <div className="flex-1">
                                            <p className="font-medium text-white">{p.nom}</p>
                                            <p className="text-gray-400 text-xs">{p.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                             <button
                                                 onClick={() => obrirModalEdicioUsuari(p)}
                                                 disabled={editantUsuariId === p.id}
                                                 className="text-blue-400 hover:text-blue-300 text-sm px-3 py-1 rounded border border-blue-800 hover:border-blue-600 transition disabled:opacity-50">
                                                 {editantUsuariId === p.id ? 'Editant...' : 'Editar'}
                                             </button>
                                             <button
                                                 onClick={() => obrirModalResetContrasenya(p)}
                                                 className="text-yellow-400 hover:text-yellow-300 text-sm px-3 py-1 rounded border border-yellow-800 hover:border-yellow-600 transition">
                                                 🔑 Contrasenya
                                             </button>
                                             <button onClick={() => eliminarUsuari(p.id, p.email)} className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-800 hover:border-red-600 transition">
                                                 Eliminar
                                             </button>
                                         </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {usuariEditant && (
                            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
                                    <h3 className="text-white font-bold text-lg mb-1">✏️ Editar nom d&apos;usuari</h3>
                                    <p className="text-gray-400 text-sm mb-4">{usuariEditant.email}</p>

                                    <label className="text-gray-400 text-sm block mb-1">Nom que es mostrarà a la classificació</label>
                                    <input
                                        type="text"
                                        value={nomEditat}
                                        onChange={e => setNomEditat(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !desantEdicioUsuari && guardarEdicioUsuari()}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
                                        autoFocus
                                    />

                                    <div className="flex gap-2">
                                        <button
                                            onClick={tancarModalEdicioUsuari}
                                            disabled={desantEdicioUsuari}
                                            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 rounded-lg transition">
                                            Cancel·lar
                                        </button>
                                        <button
                                            onClick={guardarEdicioUsuari}
                                            disabled={desantEdicioUsuari}
                                            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition">
                                            {desantEdicioUsuari ? 'Desant...' : 'Desar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Modal reset contrasenya */}
                        {usuariResetant && (
                            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                                <div className="bg-gray-900 border border-yellow-700/50 rounded-2xl p-6 w-full max-w-md">
                                    <h3 className="text-white font-bold text-lg mb-1">🔑 Nova contrasenya</h3>
                                    <p className="text-gray-400 text-sm mb-1">{usuariResetant.nom || usuariResetant.email}</p>
                                    <p className="text-gray-500 text-xs mb-4">{usuariResetant.email}</p>

                                    <label className="text-gray-400 text-sm block mb-1">Nova contrasenya (mínim 6 caràcters)</label>
                                    <input
                                        type="text"
                                        value={novaContrasenya}
                                        onChange={e => setNovaContrasenya(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !resetantContrasenya && guardarNovaContrasenya()}
                                        placeholder="Escriu la nova contrasenya..."
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 mb-4 font-mono"
                                        autoFocus
                                    />

                                    {missatgeReset && (
                                        <div className={`border px-3 py-2 rounded-lg mb-4 text-sm ${missatgeReset.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                            {missatgeReset}
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={tancarModalResetContrasenya}
                                            disabled={resetantContrasenya}
                                            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 rounded-lg transition">
                                            Cancel·lar
                                        </button>
                                        <button
                                            onClick={guardarNovaContrasenya}
                                            disabled={resetantContrasenya || novaContrasenya.length < 6}
                                            className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition">
                                            {resetantContrasenya ? 'Canviant...' : '🔑 Canviar contrasenya'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* SECCIÓ PUNTS PER JORNADA */}
                {seccio === 'punts' && (
                    <div>
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-5">
                            <p className="text-white font-semibold mb-3">Selecciona la jornada:</p>
                            <div className="grid grid-cols-7 md:grid-cols-10 gap-1.5">
                                {Array.from({ length: 38 }, (_, i) => i + 1).map(j => (
                                    <button key={j} onClick={() => { setJornadaPunts(j); carregarPuntsJornada(j) }} className={`text-xs rounded-lg py-1.5 border transition font-mono ${jornadaPunts === j ? 'bg-green-500 border-green-400 text-white font-bold' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                        {j}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {missatgePunts && (
                            <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${missatgePunts.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                {missatgePunts}
                            </div>
                        )}

                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-4">
                            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                                <div>
                                    <p className="text-white font-semibold">Punts Jornada {jornadaPunts}</p>
                                    <p className="text-gray-500 text-xs mt-1">Pots omplir manualment o carregar els valors de Futmondo (Prensa) al panell.</p>
                                </div>
                                <button
                                    onClick={importarPuntsFutmondo}
                                    disabled={importantFutmondo || desantPunts}
                                    className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                                >
                                    {importantFutmondo ? 'Important Futmondo...' : '📥 Importar Futmondo (Prensa)'}
                                </button>
                            </div>
                            {players.length === 0 ? (
                                <p className="text-gray-500 text-sm">No hi ha jugadors carregats.</p>
                            ) : (
                                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                                    {['Porter', 'Defensa', 'Migcampista', 'Davanter'].map(pos => {
                                        const delPos = players.filter(p => p.posicion === pos)
                                        if (!delPos.length) return null
                                        return (
                                            <div key={pos}>
                                                <p className="text-gray-500 text-xs uppercase tracking-wider mt-3 mb-2">{pos}s</p>
                                                {delPos.map(player => (
                                                    <div key={player.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2 mb-1">
                                                        <span className="text-white text-sm flex-1 truncate">{player.nombre}</span>
                                                        <input
                                                            type="number"
                                                            min="-20"
                                                            max="30"
                                                            step="0.5"
                                                            placeholder="0"
                                                            value={puntsMapa[player.id] ?? ''}
                                                            onChange={e => setPuntsMapa(prev => ({ ...prev, [player.id]: e.target.value }))}
                                                            className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm text-center focus:outline-none focus:border-green-500"
                                                        />
                                                        <span className="text-gray-500 text-xs w-6">pts</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <button onClick={desarPuntsJornada} disabled={desantPunts} className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition">
                            {desantPunts ? 'Desant...' : `💾 Desar punts jornada ${jornadaPunts}`}
                        </button>
                    </div>
                )}

                {/* SECCIÓ SYNC JUGADORS */}
                {seccio === 'sync' && (
                    <div>
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-4">
                            <h2 className="text-white font-semibold text-lg mb-2">🔄 Sincronitzar jugadors de LaLiga</h2>
                            <p className="text-gray-400 text-sm mb-1">Importa tots els jugadors de Primera Divisió des de <span className="text-green-400 font-mono">Biwenger</span> amb els seus preus, posicions i punts actuals.</p>
                            <p className="text-gray-500 text-xs mb-5">S&apos;actualitza automàticament cada nit a les 4:00 AM. Pots forçar la sincronització ara prement el botó.</p>

                            {missatgeSync && (
                                <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${missatgeSync.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                    {missatgeSync}
                                </div>
                            )}

                            <button onClick={sincronitzarJugadors} disabled={sincronitzant} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2">
                                {sincronitzant ? (<><span className="animate-spin">⟳</span> Sincronitzant jugadors...</>) : ('🔄 Sincronitzar ara')}
                            </button>

                            <div className="mt-4 bg-gray-950 border border-gray-800 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-white font-semibold text-sm">Altes i baixes de la darrera sincronització</p>
                                    <span className="text-xs text-gray-500">Altes: {resumCanvisSync?.altes?.length || 0} · Baixes: {resumCanvisSync?.baixes?.length || 0}</span>
                                </div>

                                {!resumCanvisSync ? (
                                    <p className="text-gray-500 text-sm">Prem &quot;Sincronitzar ara&quot; per veure altes i baixes.</p>
                                ) : resumCanvisSync.altes.length === 0 && resumCanvisSync.baixes.length === 0 ? (
                                    <p className="text-gray-400 text-sm">Mateixos jugadors que la darrera sincronització.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="bg-gray-900 border border-green-900 rounded-lg p-3">
                                            <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-2">Altes</p>
                                            {resumCanvisSync.altes.length === 0 ? (
                                                <p className="text-gray-500 text-sm">Mateixos jugadors que la darrera sincronització.</p>
                                            ) : (
                                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                    {resumCanvisSync.altes.map((p) => (
                                                        <div key={`alta-${p.id}`} className="text-sm bg-gray-800 rounded px-2 py-1">
                                                            <span className="text-white font-medium">{p.nombre}</span>
                                                            <span className="text-gray-500 text-xs"> · {p.posicion} · {p.equipo_real}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-gray-900 border border-red-900 rounded-lg p-3">
                                            <p className="text-red-400 text-xs font-bold uppercase tracking-wider mb-2">Baixes</p>
                                            {resumCanvisSync.baixes.length === 0 ? (
                                                <p className="text-gray-500 text-sm">Sense baixes en aquesta sincronització.</p>
                                            ) : (
                                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                    {resumCanvisSync.baixes.map((p) => (
                                                        <div key={`baixa-${p.id}`} className="text-sm bg-gray-800 rounded px-2 py-1">
                                                            <span className="text-white font-medium">{p.nombre}</span>
                                                            <span className="text-gray-500 text-xs"> · {p.posicion} · {p.equipo_real}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-4">
                            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Com funciona la sincronització</p>
                            <ul className="text-gray-400 text-sm space-y-1.5">
                                <li>📥 Descarrega tots els jugadors de LaLiga des de Biwenger API</li>
                                <li>🗂️ Mapeja posicions, preus de mercat i punts acumulats</li>
                                <li>💾 Fa un upsert a Supabase (actualitza si ja existeix, crea si no)</li>
                                <li>⏰ El cron de Vercel ho executa automàticament cada nit a les 4:00 AM</li>
                                <li>✅ Fitxatges i canvis de preu es reflecteixen l&apos;endemà automàticament</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* SECCIÓ CANVIS */}
                {seccio === 'canvis' && (
                    <div className="space-y-5">
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                            <h2 className="text-white font-semibold text-lg mb-2">↔️ Ronda de Canvis</h2>
                            <p className="text-gray-400 text-sm mb-1">Inicia una ronda on cada participant pot canviar un jugador del seu equip per un de disponible.</p>
                            <p className="text-gray-500 text-xs mb-5">L&apos;ordre serà l&apos;invers de la classificació general (el darrer de la classificació tria primer). Si ja hi ha una ronda activa, es reiniciarà.</p>

                            {missatgeCanvis && (
                                <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${missatgeCanvis.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                    {missatgeCanvis}
                                </div>
                            )}

                            <button onClick={iniciarRondaCanvis} disabled={iniciantCanvis} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition">
                                {iniciantCanvis ? '⏳ Calculant ordre...' : '🔄 Iniciar ronda de canvis'}
                            </button>
                        </div>

                        <div className="bg-gray-900 border border-emerald-700/60 rounded-xl p-6">
                            <h2 className="text-white font-semibold text-lg mb-2">🎄 Ronda de Canvis Nadal</h2>
                            <p className="text-gray-400 text-sm mb-1">Ideal per a les proves de Nadal: crea una ronda especial de 3 voltes amb sistema serpentina.</p>
                            <p className="text-gray-500 text-xs mb-5">L&apos;ordre comença invertit segons la classificació del dia d&apos;inici i després alterna en serpentina.</p>

                            {missatgeCanvisNadal && (
                                <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${missatgeCanvisNadal.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                    {missatgeCanvisNadal}
                                </div>
                            )}

                            <button onClick={iniciarRondaCanvisNadal} disabled={iniciantCanvisNadal} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition">
                                {iniciantCanvisNadal ? '⏳ Iniciant Nadal...' : '🎄 Iniciar ronda de canvis Nadal (3 rondes)'}
                            </button>
                        </div>
                    </div>
                )}

                {/* SECCIÓ CLASSIFICACIÓ ARXIVADA */}
                {seccio === 'classificacio' && (
                    <div className="space-y-5">

                        {missatgeClass && (
                            <div className={`border px-4 py-3 rounded-xl text-sm font-medium ${missatgeClass.includes('❌') ? 'bg-red-900 border-red-500 text-red-300' : 'bg-green-900 border-green-500 text-green-300'}`}>
                                {missatgeClass}
                            </div>
                        )}

                        {/* Guardar i reiniciar */}
                        <div className="bg-gray-900 border border-orange-700/50 rounded-xl p-6">
                            <h2 className="text-white font-bold text-lg mb-1">💾 Guardar classificació i reiniciar punts</h2>
                            <p className="text-gray-400 text-sm mb-4">
                                Guarda una instantània de la classificació actual i reinicia tots els punts a 0 per a la nova volta.
                            </p>
                            <div className="flex gap-3 mb-3 flex-wrap">
                                <div className="flex-1 min-w-40">
                                    <label className="text-gray-500 text-xs block mb-1">Nom de la volta</label>
                                    <input
                                        type="text"
                                        value={nomVolta}
                                        onChange={e => setNomVolta(e.target.value)}
                                        placeholder="Ex: 1a Volta 2025-26"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-gray-500 text-xs block mb-1">Jornada final</label>
                                    <input
                                        type="number"
                                        value={jornadaFinalVolta}
                                        onChange={e => setJornadaFinalVolta(Number(e.target.value))}
                                        min="1" max="38"
                                        className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={guardarClassificacioIReinicisar}
                                disabled={guardantClass || !nomVolta}
                                className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition mb-2">
                                {guardantClass ? '⏳ Guardant i reiniciant...' : '💾 Guardar classificació i reiniciar punts a 0'}
                            </button>
                            <button
                                onClick={nomesReiniciarPunts}
                                disabled={reiniciantPunts}
                                className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 py-2 rounded-xl text-sm transition border border-red-700">
                                {reiniciantPunts ? '⏳ Reiniciant...' : '🗑️ Reiniciar punts sense guardar classificació'}
                            </button>
                        </div>

                        {/* Historial de classificacions arxivades */}
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                            <h2 className="text-white font-bold text-lg mb-4">📋 Classificacions arxivades ({classificacionsArxivades.length})</h2>
                            {classificacionsArxivades.length === 0 ? (
                                <p className="text-gray-600 text-sm text-center py-4">Encara no hi ha classificacions guardades.</p>
                            ) : (
                                <div className="space-y-4">
                                    {classificacionsArxivades.map(c => (
                                        <div key={c.id} className="bg-gray-800 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <p className="text-white font-bold">{c.nom}</p>
                                                    <p className="text-gray-500 text-xs">
                                                        Fins a jornada {c.jornada_final} · {new Date(c.created_at).toLocaleDateString('ca-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => eliminarClassificacioArxivada(c.id, c.nom)}
                                                    className="text-red-500 hover:text-red-400 text-xs border border-red-800 hover:border-red-600 px-2 py-1 rounded transition">
                                                    Eliminar
                                                </button>
                                            </div>
                                            <div className="space-y-1">
                                                {(c.classificacio || []).map(u => (
                                                    <div key={u.user_id} className="flex items-center gap-3 px-2 py-1 rounded-lg bg-gray-900/50">
                                                        <span className={`text-xs font-bold w-6 text-center flex-shrink-0 ${
                                                            u.posicio === 1 ? 'text-yellow-400' :
                                                            u.posicio === 2 ? 'text-gray-300' :
                                                            u.posicio === 3 ? 'text-orange-400' : 'text-gray-600'
                                                        }`}>
                                                            {u.posicio === 1 ? '🥇' : u.posicio === 2 ? '🥈' : u.posicio === 3 ? '🥉' : `#${u.posicio}`}
                                                        </span>
                                                        <span className="text-white text-sm flex-1">{u.nom}</span>
                                                        <span className="text-yellow-400 font-bold text-sm">{u.punts} pts</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </main>
    )
}
