import { createClient } from '@supabase/supabase-js'

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

export async function POST() {
    const { data: teamRows, error: errTeams } = await supabaseAdmin.from('teams').select('id')
    if (errTeams) return Response.json({ error: errTeams.message }, { status: 400 })

    const { error: errPicks } = await supabaseAdmin.from('draft_picks').delete().neq('id', 0)
    if (errPicks) return Response.json({ error: errPicks.message }, { status: 400 })

    const resetPayload = {
        estat: 'pendent',
        torn_actual: 0,
        ordre_participants: [],
        torn_iniciat_at: null,
        pausat_at: null,
        temps_pausat_acumulat: 0,
    }

    const runDraftReset = async (payload) => {
        return await supabaseAdmin
            .from('drafts')
            .update(payload)
            .neq('id', 0)
    }

    let { error: errDraft } = await runDraftReset(resetPayload)
    if (errDraft && hasPauseColumnsSchemaError(errDraft)) {
        const fallback = await runDraftReset(withoutPauseFields(resetPayload))
        errDraft = fallback.error
    }
    if (errDraft) return Response.json({ error: errDraft.message }, { status: 400 })

    const results = await Promise.all((teamRows || []).map(team =>
        supabaseAdmin
            .from('teams')
            .update({ alineacio: {}, suplents: [] })
            .eq('id', team.id)
    ))

    const teamError = results.find(r => r.error)?.error
    if (teamError) return Response.json({ error: teamError.message }, { status: 400 })

    return Response.json({ ok: true, teamsReset: teamRows?.length || 0 })
}
