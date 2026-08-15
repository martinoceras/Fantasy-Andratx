import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const TARGET_POSICIO = {
  Porter: 2,
  Defensa: 4,
  Migcampista: 5,
  Davanter: 4,
}

const MAX_POSICIO = { ...TARGET_POSICIO }

function hasPauseColumnsSchemaError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('schema cache') && (msg.includes('pausat_at') || msg.includes('temps_pausat_acumulat'))
}

function withoutPauseFields(payload) {
  const cleaned = { ...payload }
  delete cleaned.pausat_at
  delete cleaned.temps_pausat_acumulat
  return cleaned
}

function getTurnUserId(ordre, turnIndex) {
  const n = ordre.length
  if (!n) return null

  const ronda = Math.floor(turnIndex / n)
  const ordenat = ronda % 2 === 0 ? ordre : [...ordre].reverse()
  return ordenat[turnIndex % n] || null
}

function randomItem(list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return list[Math.floor(Math.random() * list.length)]
}

function getMissingTargets(posMap) {
  const missing = {}
  for (const [pos, target] of Object.entries(TARGET_POSICIO)) {
    missing[pos] = Math.max(0, target - (posMap?.[pos] || 0))
  }
  const missingTotal = Object.values(missing).reduce((acc, n) => acc + n, 0)
  return { missing, missingTotal }
}

export async function POST() {
  try {
    const { data: draft, error: draftError } = await supabaseAdmin
      .from('drafts')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (draftError || !draft) {
      return Response.json({ ok: false, error: draftError?.message || 'No hi ha draft configurat' }, { status: 400 })
    }

    if (draft.estat !== 'actiu' && draft.estat !== 'pausat') {
      return Response.json({ ok: false, error: 'El draft ha d\'estar iniciat (actiu o pausat)' }, { status: 400 })
    }

    const ordre = Array.isArray(draft.ordre_participants) ? draft.ordre_participants.filter(Boolean) : []
    if (ordre.length < 2) {
      return Response.json({ ok: false, error: 'No hi ha participants suficients' }, { status: 400 })
    }

    const maxJugadors = Math.max(1, Number(draft.max_jugadors) || 15)
    const maxEquip = Math.max(1, Number(draft.max_jugadors_equip) || 4)
    const totalTorns = maxJugadors * ordre.length
    const currentTurn = Math.max(0, Number(draft.torn_actual) || 0)

    if (currentTurn >= totalTorns || draft.estat === 'finalitzat') {
      return Response.json({ ok: false, error: 'El draft ja esta finalitzat' }, { status: 400 })
    }

    const { data: players, error: playersError } = await supabaseAdmin
      .from('players')
      .select('id, posicion, equipo_real')

    if (playersError) {
      return Response.json({ ok: false, error: playersError.message }, { status: 500 })
    }

    const { data: picks, error: picksError } = await supabaseAdmin
      .from('draft_picks')
      .select('id, player_id, user_id, torn')
      .order('torn', { ascending: true })
      .order('id', { ascending: true })

    if (picksError) {
      return Response.json({ ok: false, error: picksError.message }, { status: 500 })
    }

    const playersById = new Map((players || []).map((p) => [p.id, p]))

    // Keep only one committed pick per completed turn and drop impossible/future duplicates.
    const seenTurns = new Set()
    const effectivePicks = []
    const invalidPickIds = []

    for (const pick of picks || []) {
      const turn = Number(pick?.torn)
      if (!Number.isFinite(turn) || turn < 0 || turn >= totalTorns || turn >= currentTurn) {
        if (pick?.id) invalidPickIds.push(pick.id)
        continue
      }
      if (seenTurns.has(turn)) {
        if (pick?.id) invalidPickIds.push(pick.id)
        continue
      }
      seenTurns.add(turn)
      effectivePicks.push(pick)
    }

    if (invalidPickIds.length > 0) {
      const { error: cleanupError } = await supabaseAdmin
        .from('draft_picks')
        .delete()
        .in('id', invalidPickIds)

      if (cleanupError) {
        return Response.json({ ok: false, error: cleanupError.message }, { status: 500 })
      }
    }

    const usedPlayerIds = new Set(effectivePicks.map((p) => p.player_id))

    const userTotals = new Map()
    const userPosCounts = new Map()
    const userTeamCounts = new Map()

    const ensureUserState = (uid) => {
      if (!userTotals.has(uid)) userTotals.set(uid, 0)
      if (!userPosCounts.has(uid)) userPosCounts.set(uid, {})
      if (!userTeamCounts.has(uid)) userTeamCounts.set(uid, {})
    }

    ordre.forEach(ensureUserState)

    for (const pick of effectivePicks) {
      const uid = pick.user_id
      const pl = playersById.get(pick.player_id)
      if (!uid || !pl) continue

      ensureUserState(uid)
      userTotals.set(uid, (userTotals.get(uid) || 0) + 1)

      const posMap = userPosCounts.get(uid)
      const pos = pl.posicion || 'Altres'
      posMap[pos] = (posMap[pos] || 0) + 1

      const teamMap = userTeamCounts.get(uid)
      const team = pl.equipo_real || 'Sense equip'
      teamMap[team] = (teamMap[team] || 0) + 1
    }

    const baseAvailablePlayers = (players || []).filter((p) => !usedPlayerIds.has(p.id))

    const cloneCountsMap = (map) => {
      const cloned = new Map()
      for (const [uid, values] of map.entries()) {
        cloned.set(uid, { ...values })
      }
      return cloned
    }

    const simulatePlan = () => {
      const availablePlayers = [...baseAvailablePlayers]
      const simTotals = new Map(userTotals)
      const simPosCounts = cloneCountsMap(userPosCounts)
      const simTeamCounts = cloneCountsMap(userTeamCounts)
      const simCanPick = (uid, player) => {
        const total = simTotals.get(uid) || 0
        if (total >= maxJugadors) return false

        const posMap = simPosCounts.get(uid) || {}
        const pos = player.posicion || 'Altres'
        const maxPos = MAX_POSICIO[pos] ?? 99
        if ((posMap[pos] || 0) >= maxPos) return false

        const teamMap = simTeamCounts.get(uid) || {}
        const team = player.equipo_real || 'Sense equip'
        return (teamMap[team] || 0) < maxEquip
      }

      const pending = []
      let failTurn = null

      for (let turn = currentTurn; turn < totalTorns; turn += 1) {
        const uid = getTurnUserId(ordre, turn)
        if (!uid) {
          failTurn = turn
          break
        }

        const userTotal = simTotals.get(uid) || 0
        const remainingForUser = Math.max(0, maxJugadors - userTotal)
        const posMap = simPosCounts.get(uid) || {}
        const { missing, missingTotal } = getMissingTargets(posMap)

        if (missingTotal > remainingForUser) {
          failTurn = turn
          break
        }

        const candidates = availablePlayers.filter((p) => simCanPick(uid, p))
        const neededPositions = Object.entries(missing)
          .filter(([, amount]) => amount > 0)
          .map(([pos]) => pos)

        const mustFillNeededNow = missingTotal === remainingForUser
        const neededCandidates = candidates.filter((p) => neededPositions.includes(p.posicion || 'Altres'))
        const selected = randomItem(
          mustFillNeededNow
            ? neededCandidates
            : (neededCandidates.length > 0 ? neededCandidates : candidates)
        )

        if (!selected) {
          failTurn = turn
          break
        }

        pending.push({
          player_id: selected.id,
          user_id: uid,
          torn: turn,
          temps_seleccio: 0,
        })

        const idx = availablePlayers.findIndex((p) => p.id === selected.id)
        if (idx >= 0) availablePlayers.splice(idx, 1)

        simTotals.set(uid, (simTotals.get(uid) || 0) + 1)

        const pos = selected.posicion || 'Altres'
        const posMapAfterPick = simPosCounts.get(uid) || {}
        posMapAfterPick[pos] = (posMapAfterPick[pos] || 0) + 1
        simPosCounts.set(uid, posMapAfterPick)

        const team = selected.equipo_real || 'Sense equip'
        const teamMap = simTeamCounts.get(uid) || {}
        teamMap[team] = (teamMap[team] || 0) + 1
        simTeamCounts.set(uid, teamMap)
      }

      return {
        ok: failTurn === null,
        pending,
        failTurn,
      }
    }

    // Validate existing picks don't already break the target composition.
    for (const uid of ordre) {
      const total = userTotals.get(uid) || 0
      if (total > maxJugadors) {
        return Response.json({ ok: false, error: 'Hi ha un usuari amb mes jugadors dels permesos.' }, { status: 409 })
      }

      const posMap = userPosCounts.get(uid) || {}
      for (const [pos, maxPos] of Object.entries(MAX_POSICIO)) {
        if ((posMap[pos] || 0) > maxPos) {
          return Response.json({ ok: false, error: `Composicio invalida: un usuari ja supera el maxim de ${pos}.` }, { status: 409 })
        }
      }

      const remainingForUser = Math.max(0, maxJugadors - total)
      const { missingTotal } = getMissingTargets(posMap)
      if (missingTotal > remainingForUser) {
        return Response.json({ ok: false, error: 'Composicio invalida: no es pot arribar al minim per posicio amb els picks restants.' }, { status: 409 })
      }
    }

    const MAX_ATTEMPTS = 500
    let pendingInserts = null
    let failTurn = null

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const simulated = simulatePlan()
      if (simulated.ok) {
        pendingInserts = simulated.pending
        break
      }
      failTurn = simulated.failTurn
    }

    if (!pendingInserts) {
      return Response.json({
        ok: false,
        error: `No s'ha trobat cap combinacio valida despres de ${MAX_ATTEMPTS} intents. Bloqueig aproximat al torn ${(failTurn ?? currentTurn) + 1}.`,
      }, { status: 409 })
    }

    if (pendingInserts.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('draft_picks')
        .insert(pendingInserts)

      if (insertError) {
        return Response.json({ ok: false, error: insertError.message }, { status: 500 })
      }
    }

    const updatePayload = {
      estat: 'finalitzat',
      torn_actual: totalTorns,
      torn_iniciat_at: null,
      pausat_at: null,
      temps_pausat_acumulat: 0,
    }

    const runUpdateDraft = async (payload) => {
      return await supabaseAdmin
        .from('drafts')
        .update(payload)
        .eq('id', draft.id)
        .select('*')
        .maybeSingle()
    }

    let { data: updatedDraft, error: updateError } = await runUpdateDraft(updatePayload)
    if (updateError && hasPauseColumnsSchemaError(updateError)) {
      const fallback = await runUpdateDraft(withoutPauseFields(updatePayload))
      updatedDraft = fallback.data
      updateError = fallback.error
    }

    if (updateError) {
      return Response.json({ ok: false, error: updateError.message }, { status: 500 })
    }

    return Response.json({
      ok: true,
      inserted: pendingInserts.length,
      tornsRestants: totalTorns - currentTurn,
      cleanedPicks: invalidPickIds.length,
      draft: updatedDraft,
    })
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'Error acabant draft aleatori' }, { status: 500 })
  }
}






