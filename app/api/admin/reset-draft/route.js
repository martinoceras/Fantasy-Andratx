import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST() {
    const { data: teamRows, error: errTeams } = await supabaseAdmin.from('teams').select('id')
    if (errTeams) return Response.json({ error: errTeams.message }, { status: 400 })

    const { error: errPicks } = await supabaseAdmin.from('draft_picks').delete().neq('id', 0)
    if (errPicks) return Response.json({ error: errPicks.message }, { status: 400 })

    const { error: errDraft } = await supabaseAdmin
        .from('drafts')
        .update({ estat: 'pendent', torn_actual: 0, ordre_participants: [] })
        .neq('id', 0)
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
