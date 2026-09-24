import { createClient } from '@supabase/supabase-js'
import { applyDraftRoster } from '../../../../lib/draftRosterSeed.mjs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const dryRun = Boolean(body?.dryRun)
    const result = await applyDraftRoster(supabaseAdmin, { dryRun })
    return Response.json(result, { status: result.ok ? 200 : 409 })
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'Error aplicant el seed del draft' }, { status: 500 })
  }
}


