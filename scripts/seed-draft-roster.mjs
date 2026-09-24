import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { applyDraftRoster } from '../lib/draftRosterSeed.mjs'

function loadEnv(filePath = '.env.local') {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')

if (!supabaseUrl || !serviceKey) {
  console.error('Falten NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_KEY a .env.local')
  process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey)

;(async () => {
  const result = await applyDraftRoster(supabaseAdmin, { dryRun })

  console.log(JSON.stringify({
    ok: result.ok,
    dryRun: result.dryRun,
    message: result.message,
    summary: result.summary,
    unresolved: result.unresolved,
    createdUsers: result.createdUsers,
    reusedUsers: result.reusedUsers,
    insertedPicks: result.insertedPicks || 0,
  }, null, 2))

  if (result.createdUsers?.length > 0) {
    console.log('\nCredencials creades:')
    for (const user of result.createdUsers) {
      console.log(`- ${user.owner}: ${user.email} / ${user.password}`)
    }
  }

  process.exit(result.ok ? 0 : 2)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})

