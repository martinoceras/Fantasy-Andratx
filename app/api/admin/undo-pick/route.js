import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

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

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const pickId = Number(body?.pickId)
    const draftId = Number(body?.draftId)

    if (!Number.isFinite(pickId) || !Number.isFinite(draftId)) {
      return Response.json({ ok: false, error: 'Dades invalides' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabaseAdmin
      .from('drafts')
      .select('id, torn_actual')
      .eq('id', draftId)
      .limit(1)
      .maybeSingle()

    if (draftError || !draft) {
      return Response.json({ ok: false, error: draftError?.message || 'No s\'ha trobat el draft' }, { status: 404 })
    }

    const { data: pick, error: pickError } = await supabaseAdmin
      .from('draft_picks')
      .select('id, torn')
      .eq('id', pickId)
      .limit(1)
      .maybeSingle()

    if (pickError || !pick) {
      return Response.json({ ok: false, error: pickError?.message || 'Pick no trobat' }, { status: 404 })
    }

    const { data: lastPick, error: lastPickError } = await supabaseAdmin
      .from('draft_picks')
      .select('id, torn')
      .order('torn', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastPickError) {
      return Response.json({ ok: false, error: lastPickError.message }, { status: 500 })
    }

    if (!lastPick || lastPick.id !== pick.id) {
      return Response.json({ ok: false, error: 'Nomes es pot desfer el darrer pick realitzat.' }, { status: 409 })
    }

    const expectedTurn = Number(pick.torn) + 1
    if (Number(draft.torn_actual) !== expectedTurn) {
      return Response.json({ ok: false, error: 'El torn ja ha canviat. Refresca i torna-ho a provar.' }, { status: 409 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('draft_picks')
      .delete()
      .eq('id', pick.id)

    if (deleteError) {
      return Response.json({ ok: false, error: deleteError.message }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const updatePayload = {
      estat: 'actiu',
      torn_actual: pick.torn,
      torn_iniciat_at: nowIso,
      pausat_at: null,
      temps_pausat_acumulat: 0,
    }

    const runUpdateDraft = async (payload) => {
      return await supabaseAdmin
        .from('drafts')
        .update(payload)
        .eq('id', draft.id)
        .eq('torn_actual', expectedTurn)
        .select('id, estat, torn_actual, torn_iniciat_at')
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

    if (!updatedDraft) {
      return Response.json({ ok: false, error: 'No s\'ha pogut restablir el torn. Refresca i revisa estat draft.' }, { status: 409 })
    }

    return Response.json({ ok: true, draft: updatedDraft })
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'Error desfent pick' }, { status: 500 })
  }
}


