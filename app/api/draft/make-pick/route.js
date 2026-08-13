import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabaseAdmin = createClient(supabaseUrl, serviceKey)
const supabaseAuth = createClient(supabaseUrl, anonKey)

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

function getTurnUserId(ordre, turnIndex) {
  const n = ordre.length
  if (!n) return null

  const ronda = Math.floor(turnIndex / n)
  const ordenat = ronda % 2 === 0 ? ordre : [...ordre].reverse()
  const pos = turnIndex % n
  return ordenat[pos] || null
}

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

async function sendTurnNotification({ email, nom, torn, jugadorsTriats }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !email) return { sent: false, skipped: true }

  const resend = new Resend(apiKey)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  await resend.emails.send({
    from: 'Fantasy Andratx <onboarding@resend.dev>',
    to: email,
    subject: '⚽ Et toca triar al draft!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #111827; color: white; padding: 32px; border-radius: 12px;">
        <h1 style="color: #4ade80; font-size: 24px;">⚽ Fantasy Andratx</h1>
        <h2 style="color: white;">És el teu torn, ${nom || email}!</h2>
        <p style="color: #9ca3af;">Torn número <strong style="color: white;">${torn}</strong></p>
        <p style="color: #9ca3af;">Jugadors triats fins ara: <strong style="color: white;">${jugadorsTriats}</strong></p>
        <a href="${appUrl}/draft"
           style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Triar jugador ara →
        </a>
      </div>
    `,
  })

  return { sent: true }
}

export async function POST(request) {
  try {
    const auth = request.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) {
      return Response.json({ ok: false, error: 'No autoritzat' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !authData?.user) {
      return Response.json({ ok: false, error: 'Sessio invalida' }, { status: 401 })
    }
    const user = authData.user

    const body = await request.json().catch(() => ({}))
    const playerId = Number(body?.playerId)
    if (!Number.isFinite(playerId)) {
      return Response.json({ ok: false, error: 'Jugador invalid' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabaseAdmin
      .from('drafts')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (draftError || !draft) {
      return Response.json({ ok: false, error: draftError?.message || 'No hi ha draft actiu' }, { status: 400 })
    }
    if (draft.estat !== 'actiu') {
      return Response.json({ ok: false, error: 'El draft no esta actiu' }, { status: 400 })
    }

    const ordre = Array.isArray(draft.ordre_participants) ? draft.ordre_participants.filter(Boolean) : []
    if (ordre.length < 2) {
      return Response.json({ ok: false, error: 'Configuracio de participants invalida' }, { status: 400 })
    }

    const totalTorns = Number(draft.max_jugadors || 0) * ordre.length
    const currentTurn = Number(draft.torn_actual || 0)
    if (currentTurn >= totalTorns) {
      return Response.json({ ok: false, error: 'El draft ja ha finalitzat' }, { status: 400 })
    }

    const expectedUserId = getTurnUserId(ordre, currentTurn)
    if (expectedUserId !== user.id) {
      return Response.json({ ok: false, error: 'No es el teu torn' }, { status: 403 })
    }

    const { data: existingPlayerPick } = await supabaseAdmin
      .from('draft_picks')
      .select('id')
      .eq('player_id', playerId)
      .limit(1)
      .maybeSingle()

    if (existingPlayerPick) {
      return Response.json({ ok: false, error: 'Aquest jugador ja ha estat seleccionat' }, { status: 409 })
    }

    const nowIso = new Date().toISOString()
    const elapsedSeconds = getElapsedTurnSeconds(draft)
    const nextTurn = currentTurn + 1
    const esDraftFinalitzat = nextTurn >= totalTorns

    const claimPayload = {
      torn_actual: nextTurn,
      torn_iniciat_at: esDraftFinalitzat ? null : nowIso,
      pausat_at: null,
      temps_pausat_acumulat: 0,
      ...(esDraftFinalitzat ? { estat: 'finalitzat' } : {}),
    }

    const runClaim = async (payload) => {
      return await supabaseAdmin
        .from('drafts')
        .update(payload)
        .eq('id', draft.id)
        .eq('estat', 'actiu')
        .eq('torn_actual', currentTurn)
        .select('*')
        .maybeSingle()
    }

    let { data: claimedDraft, error: claimError } = await runClaim(claimPayload)
    if (claimError && hasPauseColumnsSchemaError(claimError)) {
      const fallback = await runClaim(withoutPauseFields(claimPayload))
      claimedDraft = fallback.data
      claimError = fallback.error
    }

    if (claimError) {
      return Response.json({ ok: false, error: claimError.message }, { status: 500 })
    }
    if (!claimedDraft) {
      return Response.json({ ok: false, error: 'Aquest torn ja ha estat processat. Refresca la pagina.' }, { status: 409 })
    }

    const { error: pickInsertError } = await supabaseAdmin
      .from('draft_picks')
      .insert({
        player_id: playerId,
        user_id: user.id,
        torn: currentTurn,
        temps_seleccio: elapsedSeconds,
      })

    if (pickInsertError) {
      // Best-effort rollback to keep the turn pointer consistent if insert fails.
      await supabaseAdmin
        .from('drafts')
        .update({
          torn_actual: currentTurn,
          torn_iniciat_at: draft.torn_iniciat_at,
          pausat_at: draft.pausat_at || null,
          temps_pausat_acumulat: Math.max(0, Number(draft?.temps_pausat_acumulat) || 0),
          estat: draft.estat,
        })
        .eq('id', draft.id)

      return Response.json({ ok: false, error: pickInsertError.message }, { status: 500 })
    }

    let emailStatus = { sent: false, skipped: true }
    if (!esDraftFinalitzat) {
      const nextUserId = getTurnUserId(ordre, nextTurn)
      if (nextUserId) {
        const { data: nextProfile } = await supabaseAdmin
          .from('profiles')
          .select('email, nom')
          .eq('id', nextUserId)
          .limit(1)
          .maybeSingle()

        if (nextProfile?.email) {
          try {
            emailStatus = await sendTurnNotification({
              email: nextProfile.email,
              nom: nextProfile.nom || nextProfile.email,
              torn: nextTurn + 1,
              jugadorsTriats: nextTurn,
            })
          } catch (emailError) {
            emailStatus = { sent: false, skipped: false, error: String(emailError?.message || emailError) }
            console.error('Error enviant email de torn:', emailStatus.error)
          }
        }
      }
    }

    return Response.json({ ok: true, draft: claimedDraft, email: emailStatus })
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'Error processant pick' }, { status: 500 })
  }
}

