import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function getOrCreateDraft() {
  const { data: existing, error: getError } = await supabaseAdmin
    .from('drafts')
    .select('*')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (getError) throw new Error(getError.message)
  if (existing) return existing

  const { data: created, error: createError } = await supabaseAdmin
    .from('drafts')
    .insert({
      estat: 'pendent',
      torn_actual: 0,
      ordre_participants: [],
      max_jugadors: 15,
      max_jugadors_equip: 4,
    })
    .select('*')
    .single()

  if (createError) throw new Error(createError.message)
  return created
}

function sanitizeOrdre(value) {
  if (!Array.isArray(value)) return []
  return value.filter((id) => typeof id === 'string' && id.trim() !== '')
}

function toTs(value) {
  if (!value) return null
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? null : ts
}

function getElapsedTurnSeconds(draft, nowTs = Date.now()) {
  const acumulat = Math.max(0, Number(draft?.temps_pausat_acumulat) || 0)
  if (draft?.estat === 'pausat') return acumulat

  const iniciTs = toTs(draft?.torn_iniciat_at)
  if (!iniciTs) return acumulat

  return acumulat + Math.max(0, Math.floor((nowTs - iniciTs) / 1000))
}

export async function GET() {
  try {
    const draft = await getOrCreateDraft()
    return Response.json({ ok: true, draft })
  } catch (error) {
    return Response.json({ ok: false, error: error.message || 'Error obtenint draft' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body?.action

    if (!action) {
      return Response.json({ ok: false, error: 'Falta accio' }, { status: 400 })
    }

    const draft = await getOrCreateDraft()
    const ordre = body?.ordre === undefined ? draft.ordre_participants || [] : sanitizeOrdre(body?.ordre)
    const maxJugadors = Number(body?.maxJugadors)
    const maxJugadorsEquip = Number(body?.maxJugadorsEquip)
    const nowIso = new Date().toISOString()
    const nowTs = Date.now()

    const updatePayload = {
      ordre_participants: ordre,
      max_jugadors: Number.isFinite(maxJugadors) && maxJugadors > 0 ? maxJugadors : draft.max_jugadors,
      max_jugadors_equip: Number.isFinite(maxJugadorsEquip) && maxJugadorsEquip > 0 ? maxJugadorsEquip : draft.max_jugadors_equip,
    }

    if (action === 'start-draft') {
      if (ordre.length < 2) {
        return Response.json({ ok: false, error: 'Necessites almenys 2 participants' }, { status: 400 })
      }

      updatePayload.estat = 'actiu'
      updatePayload.torn_actual = 0
      updatePayload.torn_iniciat_at = nowIso
      updatePayload.pausat_at = null
      updatePayload.temps_pausat_acumulat = 0
    } else if (action === 'pause-draft') {
      if (draft.estat !== 'actiu') {
        return Response.json({ ok: false, error: 'Només pots pausar un draft actiu' }, { status: 400 })
      }

      updatePayload.estat = 'pausat'
      updatePayload.pausat_at = nowIso
      updatePayload.torn_iniciat_at = null
      updatePayload.temps_pausat_acumulat = getElapsedTurnSeconds(draft, nowTs)
    } else if (action === 'resume-draft') {
      if (draft.estat !== 'pausat') {
        return Response.json({ ok: false, error: 'Només pots reactivar un draft pausat' }, { status: 400 })
      }

      updatePayload.estat = 'actiu'
      updatePayload.pausat_at = null
      updatePayload.torn_iniciat_at = nowIso
      updatePayload.temps_pausat_acumulat = Math.max(0, Number(draft?.temps_pausat_acumulat) || 0)
    } else if (action === 'save-config') {
      // No extra validation required here.
    } else {
      return Response.json({ ok: false, error: 'Accio no suportada' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('drafts')
      .update(updatePayload)
      .eq('id', draft.id)
      .select('*')
      .single()

    if (updateError) {
      return Response.json({ ok: false, error: updateError.message }, { status: 500 })
    }

    return Response.json({ ok: true, draft: updated })
  } catch (error) {
    return Response.json({ ok: false, error: error.message || 'Error desant draft' }, { status: 500 })
  }
}



