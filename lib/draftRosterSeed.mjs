const RAW_ASSIGNMENTS = String.raw`
Ramón: Lamine Yamal
Pol: Mbappe
Joan F.: Raphinha
Langer: Jude
Tolo: Vini
Carles: Pedri
Martí: Gordon
Tomás: Diomande
Guille: Fermín
Fernando: Baena
Bernie: Aubameyang
Cuart: Oyarzabal
Cuart: Pepe
Bernat: Mikautadze
Fernando: Budimir
Guille: Julian Alvarez
Tomás: Cucurella
Martí: Adeyemi
Carles: Olmo
Tolo: Kang In
Langer: Cubarsi
Joan F.: Antony
Pol: Sancet
Ramón: Abde
Ramón: Moleiro
Pol: Nico Williams
Joan F.: Joan García
Langer: Rodri
Tolo: Valverde
Carles: Yeremay
Marti: Arda Guler
Tomás: Lookman
Guille: Bernardo Silva
Fernando: Barrios
Bernat: Edu Expósito
Cuart: Álvaro García
Cuart: Iñigo Vicente
Bernat: De Frutos
Fernando: Roberto Fernández
Guille: Gueye
Tomás: Enes Ünal
Martí: Berenger
Carles: Marcos Llorente
Tolo: Canales
Langer: Eric García
Joan F.: Pubill
Pol: Gio Simeone
Ramón: Isco
Ramón: Romero
Pol: Javier Hernández
Joan F: Kubo
Langer: Fornals
Tolo: Borja Iglesias
Carles: Huijsen
Martí: Tenaglia
Tomás: Riquelme
Guille: Grimaldo
Fernando: Carlos Soler
Bernat: Catena
Cuart: Cucho
Cuart: Larrubia
Bernat: Miguel Sierra
Fernando: Hancko
Guille: Cancelo
Tomás: Guridi
Marti: Oskarsson
Carles: Germán Valera
Tolo: Lejeune
Langer: Ayoze
Joan F: Ángel Pérez
Pol: Jon Martin
Ramón: Cuti Romero
Ramón: Javi Guerra
Pol: Ratiu
Joan F.: Calatrava
Langer: Sorloth
Tolo: Laporte
Carles: Satriano
Martí: Xavi Espart
Tomás: Dumfries
Guille: Guedes
Fernando: Zabiri
Bernat: Camello
Cuart: Courtois
Cuart: Fran Garcia
Bernat: Jorge Salinas
Fernando: Miguel Román
Guille: Gerard Moreno
Tomás: Gonzalo Villar
Martí: Terrats
Carles: Oblak
Tolo: Boyé
Langer: Soria
Joan F.: Amatucci
Pol: Buchanan
Ramón: Toni Martínez
Ramón: Kike Salas
Pol: Bartra
Joan F.: Chupe
Langer: Natan
Tolo: Zaid Romero
Carles: Ure
Marti: Sivera
Tomás: Sergio Herrera
Guille: Unai Simon
Fernando: Renato Veiga
Bernat: Luismi Cruz
Cuart: Mario Soriano
Cuart: Dela
Bernat: Konaté
Fernando: Remiro
Guille: Juan Iglesias
Tomás: Zubeldia
Martí: Blanco
Carles: Comesaña
Tolo: Isi Palazon
Langer: Barrenetxea
Joan F.: Sergio Gómez
Pol: Leo Román
Ramón: Ryan
Ramón: Guido
Pol: Iván Romero
Joan F.: Gerenabarrera
Langer: Sucic
Tolo: Radu
Carles: Yuri
Martí: Arguibide
Tomás: Marcos Alonso
Guille: Galarreta
Fernando: Sangare
Bernat: Herrero
Cuart: Mojica
Cuart: Ejuke
Bernat: Gerard Martin
Fernando: Casadó
Guille: Hjulmand
Tomás: Olasagasti
Martí: Brugue
Carles: Kochorashvili
Tolo: Foyth
Langer: Iñaki Williams
Joan F.: Agoume
Pol: Aimar Oroz
Ramón: Febas
Ramón: Giménez
Pol: Bretones
Joan F.: Pablo Garcia
Langer: Cabrera
Tolo: Bardelli
Carles: Hector Fort
Martí: Robert Navarro
Tomás: Ferran Jutglà
Guille: Nsongo
Fernando: Espí
Bernat: Iker Muñoz
Cuart: Dolan
Cuart: Aramburu
Bernat: Guruzeta
Fernando: Mandi
Guille: Yoel Lago
Tomás: Rubén Garcia
Martí: Quagliatta
Carles: Rudiger
Tolo: Mangala
Langer: Diego Llorente
Joan F.: Arnau
Pol: Luis Rioja
Ramón: Bernal
Ramón: Fer Niño
Pol: Freeman
Joan F.: Mouriño
Langer: Letacek
Tolo: Dmitrovic
Carles: Parrott
Marti: Tete Morente
Tomás: Aitor Fdez
Guille: Pablo Ramon
Fernando: Marrero
Bernat: Tchouameni
Cuart: Lunin
`.trim()

const OWNER_ALIASES = {
  'ramon': 'Ramón',
  'pol': 'Pol',
  'joan f': 'Joan F.',
  'joan f.': 'Joan F.',
  'langer': 'Langer',
  'tolo': 'Tolo',
  'carles': 'Carles',
  'marti': 'Martí',
  'tomas': 'Tomás',
  'guille': 'Guille',
  'fernando': 'Fernando',
  'bernie': 'Bernie',
  'cuart': 'Cuart',
  'bernat': 'Bernat',
}

export function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(value = '') {
  return normalizeText(value).replace(/\s+/g, '-')
}

export function normalizeOwnerName(value = '') {
  const normalized = normalizeText(value)
  return OWNER_ALIASES[normalized] || value.trim().replace(/\s+/g, ' ')
}

export const draftRosterAssignments = RAW_ASSIGNMENTS
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const index = line.indexOf(':')
    if (index < 0) {
      return null
    }
    const owner = normalizeOwnerName(line.slice(0, index).trim())
    const player = line.slice(index + 1).trim()
    if (!owner || !player) {
      return null
    }
    return { owner, player }
  })
  .filter(Boolean)

export const draftRosterOwners = [...new Set(draftRosterAssignments.map((item) => item.owner))]

export function buildDefaultCredentials(owner, index = 0) {
  const base = slugify(owner) || `participant-${index + 1}`
  const suffix = index > 0 ? `-${index + 1}` : ''
  return {
    email: `${base}${suffix}@fantasyandratx.example`,
    password: `Fantasy-${base.replace(/-/g, '')}-2026!`,
  }
}

function buildPlayerAliases(player) {
  const aliases = new Set()
  const normalized = normalizeText(player?.nombre)
  if (!normalized) return aliases

  aliases.add(normalized)
  const parts = normalized.split(' ').filter(Boolean)
  if (parts.length >= 1) {
    aliases.add(parts[0])
    aliases.add(parts[parts.length - 1])
  }
  if (parts.length >= 2) {
    aliases.add(parts.slice(0, 2).join(' '))
    aliases.add(parts.slice(-2).join(' '))
  }
  if (parts.length >= 3) {
    aliases.add(parts.slice(-3).join(' '))
  }

  return aliases
}

export function buildPlayerAliasMap(players = []) {
  const aliasMap = new Map()

  for (const player of players || []) {
    for (const alias of buildPlayerAliases(player)) {
      const list = aliasMap.get(alias) || []
      list.push(player)
      aliasMap.set(alias, list)
    }
  }

  return aliasMap
}

function scorePlayerCandidate(player, normalizedLabel, labelTokens) {
  const normalizedPlayer = normalizeText(player?.nombre)
  if (!normalizedPlayer) return -1
  if (normalizedPlayer === normalizedLabel) return 1000

  const playerTokens = normalizedPlayer.split(' ').filter(Boolean)
  const labelTokenSet = new Set(labelTokens)
  const shared = playerTokens.filter((token) => labelTokenSet.has(token)).length
  const includes = normalizedPlayer.includes(normalizedLabel) || normalizedLabel.includes(normalizedPlayer)
  const exactLast = labelTokens[labelTokens.length - 1] && playerTokens[playerTokens.length - 1] === labelTokens[labelTokens.length - 1]
  const exactFirst = labelTokens[0] && playerTokens[0] === labelTokens[0]
  const shortNickname = normalizedLabel.length <= 5 && normalizedPlayer.includes(normalizedLabel)

  return (shared * 20) + (includes ? 10 : 0) + (exactLast ? 8 : 0) + (exactFirst ? 4 : 0) + (shortNickname ? 6 : 0)
}

export function findBestPlayer(players = [], label = '', aliasMap = new Map(), excludedIds = new Set()) {
  const normalizedLabel = normalizeText(label)
  if (!normalizedLabel) return null

  const directMatches = (aliasMap.get(normalizedLabel) || []).filter((player) => !excludedIds.has(player?.id))
  if (directMatches.length === 1) return directMatches[0]
  if (directMatches.length > 1) {
    const exact = directMatches.find((player) => normalizeText(player?.nombre) === normalizedLabel)
    if (exact) return exact
  }

  const labelTokens = normalizedLabel.split(' ').filter(Boolean)
  let best = null
  let bestScore = -1
  let tied = false

  for (const player of players || []) {
    if (!player?.id || excludedIds.has(player.id)) continue
    const score = scorePlayerCandidate(player, normalizedLabel, labelTokens)
    if (score > bestScore) {
      best = player
      bestScore = score
      tied = false
    } else if (score === bestScore && score > 0) {
      tied = true
    }
  }

  if (!best || bestScore < 4 || tied) return null
  return best
}

export function groupAssignmentsByOwner(assignments = draftRosterAssignments) {
  const counts = new Map()
  for (const item of assignments || []) {
    counts.set(item.owner, (counts.get(item.owner) || 0) + 1)
  }
  return counts
}

export function buildDraftImportReport() {
  return {
    totalAssignments: draftRosterAssignments.length,
    owners: draftRosterOwners,
    countsByOwner: Object.fromEntries(groupAssignmentsByOwner()),
  }
}

export async function applyDraftRoster(supabaseAdmin, { dryRun = false } = {}) {
  if (!supabaseAdmin) {
    throw new Error('Falta el client de Supabase amb privilegis d\'administració')
  }

  const [{ data: players, error: playersError }, { data: profiles, error: profilesError }, { data: draft, error: draftError }] = await Promise.all([
    supabaseAdmin.from('players').select('id, nombre, posicion, equipo_real'),
    supabaseAdmin.from('profiles').select('id, nom, email'),
    supabaseAdmin.from('drafts').select('*').order('id', { ascending: true }).limit(1).maybeSingle(),
  ])

  if (playersError) throw new Error(playersError.message)
  if (profilesError) throw new Error(profilesError.message)
  if (draftError) throw new Error(draftError.message)

  const profilesByName = new Map()
  const profilesByEmail = new Map()
  for (const profile of profiles || []) {
    const nameKey = normalizeText(profile?.nom)
    const emailKey = normalizeText(String(profile?.email || '').split('@')[0])
    if (nameKey && !profilesByName.has(nameKey)) profilesByName.set(nameKey, profile)
    if (emailKey && !profilesByEmail.has(emailKey)) profilesByEmail.set(emailKey, profile)
  }

  const authByEmail = new Map()
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const authUser of data?.users || []) {
      const emailKey = normalizeText(authUser?.email)
      if (emailKey && !authByEmail.has(emailKey)) authByEmail.set(emailKey, authUser)
    }
  } catch {
    // Si la llista d'usuaris no està disponible, seguim amb els perfils existents.
  }

  const resolvedUsers = new Map()
  const createdUsers = []
  const reusedUsers = []
  const participantIds = []

  for (const owner of draftRosterOwners) {
    const ownerKey = normalizeText(owner)
    const generated = buildDefaultCredentials(owner, participantIds.length)
    const existingProfile = profilesByName.get(ownerKey) || profilesByEmail.get(normalizeText(generated.email.split('@')[0]))
    const existingEmail = String(existingProfile?.email || generated.email)
    const existingAuth = authByEmail.get(normalizeText(existingEmail))

    if (existingProfile?.id) {
      resolvedUsers.set(owner, {
        id: existingProfile.id,
        email: existingProfile.email || existingEmail,
        nom: existingProfile.nom || owner,
        created: false,
      })
      reusedUsers.push({ owner, userId: existingProfile.id, email: existingProfile.email || existingEmail })
      participantIds.push(existingProfile.id)
      continue
    }

    if (!dryRun) {
      let userId = existingAuth?.id || null

      if (!userId) {
        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: generated.email,
          password: generated.password,
          email_confirm: true,
          user_metadata: { full_name: owner },
        })
        if (createError) {
          throw new Error(`No s\'ha pogut crear l\'usuari ${owner}: ${createError.message}`)
        }
        userId = created?.user?.id || null
      }

      if (!userId) {
        throw new Error(`No s\'ha pogut determinar l\'id per a ${owner}`)
      }

      const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
        { id: userId, email: generated.email, nom: owner },
        { onConflict: 'id' }
      )
      if (profileError) {
        throw new Error(`No s\'ha pogut crear el perfil de ${owner}: ${profileError.message}`)
      }

      resolvedUsers.set(owner, { id: userId, email: generated.email, nom: owner, created: true })
      createdUsers.push({ owner, userId, email: generated.email, password: generated.password })
      participantIds.push(userId)
    } else {
      const tempId = `dry-run:${ownerKey || participantIds.length + 1}`
      resolvedUsers.set(owner, { id: tempId, email: generated.email, nom: owner, created: true })
      createdUsers.push({ owner, userId: tempId, email: generated.email, password: generated.password })
      participantIds.push(tempId)
    }
  }

  const aliasMap = buildPlayerAliasMap(players || [])
  const usedPlayerIds = new Set()
  const resolvedPicks = []
  const unresolved = []

  for (const [turn, assignment] of draftRosterAssignments.entries()) {
    const player = findBestPlayer(players || [], assignment.player, aliasMap, usedPlayerIds)
    const user = resolvedUsers.get(assignment.owner)
    if (!player || !user) {
      unresolved.push({ turn, owner: assignment.owner, player: assignment.player })
      continue
    }

    usedPlayerIds.add(player.id)
    resolvedPicks.push({
      player_id: player.id,
      user_id: user.id,
      torn: turn,
      temps_seleccio: 0,
    })
  }

  const countsByOwner = groupAssignmentsByOwner()
  const maxJugadors = Math.max(...Object.values(Object.fromEntries(countsByOwner)), 0)

  const draftPayload = {
    estat: 'finalitzat',
    torn_actual: resolvedPicks.length,
    ordre_participants: participantIds,
    max_jugadors: Number.isFinite(maxJugadors) && maxJugadors > 0 ? maxJugadors : draft?.max_jugadors || 15,
    max_jugadors_equip: draft?.max_jugadors_equip || 4,
    torn_iniciat_at: null,
    pausat_at: null,
    temps_pausat_acumulat: 0,
  }

  const cleanupParticipantIds = participantIds.filter(Boolean)

  if (unresolved.length > 0) {
    return {
      ok: false,
      dryRun,
      summary: buildDraftImportReport(),
      createdUsers,
      reusedUsers,
      unresolved,
      resolvedPicks,
      draftPayload,
      cleanupParticipantIds,
      message: `Hi ha ${unresolved.length} jugadors sense resoldre. Revisa els àlies abans d\'aplicar el seed.`,
    }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      summary: buildDraftImportReport(),
      createdUsers,
      reusedUsers,
      unresolved,
      resolvedPicks,
      draftPayload,
      cleanupParticipantIds,
      message: 'Dry-run completat sense escriure dades.',
    }
  }

  const cleanupTables = async (table, column = 'user_id') => {
    if (!cleanupParticipantIds.length) return
    const { error } = await supabaseAdmin.from(table).delete().in(column, cleanupParticipantIds)
    if (error && !/schema cache|does not exist|could not find the table/i.test(String(error.message || ''))) {
      throw new Error(`Error netejant ${table}: ${error.message}`)
    }
  }

  await cleanupTables('draft_picks', 'user_id')
  await cleanupTables('teams', 'user_id')
  await cleanupTables('gameweek_lineups', 'user_id')
  await cleanupTables('canvi_bomba', 'user_id')

  const { error: deletePicksError } = await supabaseAdmin.from('draft_picks').delete().neq('id', 0)
  if (deletePicksError) throw new Error(`Error esborrant picks: ${deletePicksError.message}`)

  if (resolvedPicks.length > 0) {
    const chunkSize = 100
    for (let i = 0; i < resolvedPicks.length; i += chunkSize) {
      const chunk = resolvedPicks.slice(i, i + chunkSize)
      const { error: insertError } = await supabaseAdmin.from('draft_picks').insert(chunk)
      if (insertError) throw new Error(`Error inserint picks: ${insertError.message}`)
    }
  }

  const draftRowPayload = draft?.id
    ? draftPayload
    : {
        ...draftPayload,
        estat: 'finalitzat',
        torn_actual: resolvedPicks.length,
      }

  let draftResult
  if (draft?.id) {
    const { data, error } = await supabaseAdmin.from('drafts').update(draftRowPayload).eq('id', draft.id).select('*').single()
    if (error) throw new Error(`Error actualitzant draft: ${error.message}`)
    draftResult = data
  } else {
    const { data, error } = await supabaseAdmin.from('drafts').insert(draftRowPayload).select('*').single()
    if (error) throw new Error(`Error creant draft: ${error.message}`)
    draftResult = data
  }

  return {
    ok: true,
    dryRun: false,
    summary: buildDraftImportReport(),
    createdUsers,
    reusedUsers,
    unresolved,
    resolvedPicks,
    draft: draftResult,
    draftPayload,
    cleanupParticipantIds,
    insertedPicks: resolvedPicks.length,
    message: `Draft importat: ${resolvedPicks.length} picks i ${createdUsers.length} usuaris creats.`,
  }
}



