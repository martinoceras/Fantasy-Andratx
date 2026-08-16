import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}))
        const jornada = Number(body?.jornada)
        const puntsMapa = body?.puntsMapa

        if (!Number.isInteger(jornada) || jornada <= 0 || jornada > 38) {
            return Response.json({ ok: false, error: 'Jornada invàlida' }, { status: 400 })
        }

        if (!puntsMapa || typeof puntsMapa !== 'object') {
            return Response.json({ ok: false, error: 'puntsMapa invàlid' }, { status: 400 })
        }

        const files = Object.entries(puntsMapa)
            .filter(([, v]) => v !== '' && v !== undefined && v !== null)
            .map(([player_id, punts]) => ({
                player_id: Number(player_id),
                jornada,
                punts: Number(punts),
            }))
            .filter((row) => Number.isInteger(row.player_id) && row.player_id > 0 && Number.isFinite(row.punts))

        if (files.length === 0) {
            return Response.json({ ok: true, saved: 0, message: 'Cap punt a desar' })
        }

        const { error } = await supabaseAdmin
            .from('player_punts')
            .upsert(files, { onConflict: 'player_id,jornada' })

        if (error) {
            return Response.json({ ok: false, error: error.message }, { status: 500 })
        }

        return Response.json({ ok: true, saved: files.length, jornada })
    } catch (error) {
        return Response.json({ ok: false, error: error?.message || 'Error desant punts' }, { status: 500 })
    }
}

