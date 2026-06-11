/**
 * Provision the 8 HermesTikTok agents as native Hermes worker profiles.
 *
 * These agents are registered in `swarm.yaml` (the roster) exactly like the
 * native `builder` / `reviewer` / `orchestrator` workers. This script creates
 * their on-disk profile under ~/.hermes/profiles/<id> the same way Hermes does
 * for any roster worker — using the existing exported helpers, not a custom
 * provisioning path:
 *
 *   - ensureWorkerMemoryScaffold     → ~/.hermes/profiles/<id>/memory/ (+ pointers)
 *   - syncSwarmProfileIdentity       → memory/IDENTITY.md from the roster entry
 *   - ensureTikTokMemoryNamespaces   → shared tiktok/ memory namespaces
 *   - ensureTikTokMemoryNamespace    → this agent's own namespace
 *
 * Idempotent: safe to re-run. After running, the 8 agents appear in the
 * Agents/Conductor roster view next to builder, each with its tiktok/ skill as
 * its system prompt (via the roster `skills:` list) and its memory initialised.
 *
 * Run:  npx tsx scripts/provision-tiktok-agents.ts
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getSwarmProfilePath } from '../src/server/swarm-foundation'
import { rosterByWorkerId } from '../src/server/swarm-roster'
import { syncSwarmProfileIdentity } from '../src/server/swarm-profile-config'
import {
  ensureTikTokMemoryNamespace,
  ensureTikTokMemoryNamespaces,
  ensureWorkerMemoryScaffold,
} from '../src/server/swarm-memory'
import { HERMES_TIKTOK_AGENTS } from '../src/screens/agents/agent-presets'

function main(): void {
  const ids = HERMES_TIKTOK_AGENTS.map((agent) => agent.id)
  const roster = rosterByWorkerId(ids)

  // Initialise all 8 shared pipeline memory namespaces up front.
  const namespaces = ensureTikTokMemoryNamespaces()
  console.log(`[provision] initialised ${namespaces.length} shared tiktok memory namespaces`)

  for (const preset of HERMES_TIKTOK_AGENTS) {
    const worker = roster.get(preset.id)
    if (!worker) {
      console.warn(`[provision] ${preset.id}: NOT in swarm.yaml roster — skipping`)
      continue
    }

    // 1. Per-worker profile memory scaffold (same as every native worker).
    ensureWorkerMemoryScaffold({
      workerId: worker.id,
      name: worker.name,
      role: worker.role,
      specialty: worker.specialty,
      model: worker.model,
    })

    // 2. Ensure the profile dir exists at the authoritative profiles root
    //    (getProfilesDir — what listSwarmWorkerIds + dispatch read), then
    //    write a rich IDENTITY.md rendered from the roster entry.
    const profilePath = getSwarmProfilePath(worker.id)
    mkdirSync(join(profilePath, 'memory'), { recursive: true })
    const identity = syncSwarmProfileIdentity(profilePath, {
      id: worker.id,
      name: worker.name,
      role: worker.role,
      specialty: worker.specialty,
      model: worker.model,
      mission: worker.mission,
      skills: worker.skills,
      capabilities: worker.capabilities,
    })

    // 3. This agent's own pipeline memory namespace.
    const nsPath = ensureTikTokMemoryNamespace(preset.memoryNamespace)

    const identityNote = identity.ok ? (identity.changed ? 'identity written' : 'identity current') : `identity error: ${identity.error}`
    console.log(`[provision] ${worker.id.padEnd(18)} profile=${profilePath} | ${identityNote} | ns=${preset.memoryNamespace} (${nsPath})`)
  }

  console.log('[provision] done — 8 HermesTikTok agents provisioned')
}

main()
