import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import YAML from 'yaml'
import { SWARM_CANONICAL_REPO, SWARM_MEMORY_HANDOFFS } from './swarm-environment'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

export type SwarmMemoryKind = 'profile' | 'mission' | 'episodic' | 'handoff' | 'shared'

export type SwarmMemoryEventType =
  | 'mission-start'
  | 'dispatch'
  | 'checkpoint'
  | 'handoff-requested'
  | 'handoff-written'
  | 'resume'
  | 'blocked'
  | 'complete'
  | 'note'

export type SwarmMemoryEvent = {
  at: string
  type: SwarmMemoryEventType
  workerId?: string
  missionId?: string | null
  assignmentId?: string | null
  summary: string
  event?: Record<string, unknown>
}

export type SwarmMemoryFile = {
  name: string
  path: string
  content: string
}

export type SwarmMemoryReadResult = {
  ok: boolean
  workerId?: string | null
  kind: SwarmMemoryKind
  root: string
  path: string
  files: Array<SwarmMemoryFile>
  error?: string
}

export type SwarmMemorySearchResult = {
  path: string
  line: number
  score: number
  snippet: string
}

export const SWARM_SHARED_MEMORY_ROOT = join(SWARM_MEMORY_HANDOFFS, 'swarm')
export const SWARM_SHARED_HANDOFF_ROOT = join(SWARM_MEMORY_HANDOFFS, 'handoffs', 'swarm')
export const SWARM_RUNTIME_ROOT = join(SWARM_CANONICAL_REPO, '.runtime')
export const SWARM_PROJECT_CONTEXT_PATH = join(SWARM_SHARED_MEMORY_ROOT, 'PROJECT.md')

// ---------------------------------------------------------------------------
// HermesTikTok memory namespaces (Phase R2)
//
// The 8 HermesTikTok conductor agents each read/write a shared memory
// namespace. These live under a dedicated tiktok/ root so the pipeline's
// product/script/compliance/etc. state is isolated from generic swarm memory
// but still uses the same atomic-write + scaffold discipline.
// ---------------------------------------------------------------------------

export const TIKTOK_MEMORY_ROOT = join(SWARM_SHARED_MEMORY_ROOT, 'tiktok')

/** The 8 namespaces, in pipeline order, each owned by one agent. */
export const TIKTOK_MEMORY_NAMESPACES = [
  'products',         // TrendHunter findings
  'scripts',          // CopywriterAgent outputs
  'compliance',       // ComplianceAgent history
  'prompts',          // PromptEngineerAgent outputs
  'images',           // ImageGeneratorAgent URLs
  'videos',           // VideoGeneratorAgent URLs
  'pipeline_runs',    // ContentBoss mission logs
  'winning_patterns', // AnalyticsAgent insights
] as const

export type TikTokMemoryNamespace = (typeof TIKTOK_MEMORY_NAMESPACES)[number]

/** Normalise a namespace value ("products/" or "products") to a bare dir name. */
function normalizeTikTokNamespace(namespace: string): string {
  const trimmed = namespace.trim().replace(/\/+$/, '')
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(trimmed)) {
    throw new Error(`Invalid TikTok memory namespace: ${namespace}`)
  }
  return trimmed
}

/** Absolute path to a single TikTok memory namespace directory. */
export function tiktokMemoryNamespaceRoot(namespace: string): string {
  return join(TIKTOK_MEMORY_ROOT, normalizeTikTokNamespace(namespace))
}

/**
 * Ensure a single TikTok memory namespace exists with a README scaffold.
 * Idempotent — safe to call on every spawn. Returns the namespace dir path.
 */
export function ensureTikTokMemoryNamespace(namespace: string): string {
  const dir = tiktokMemoryNamespaceRoot(namespace)
  ensureDir(dir)
  const readme = join(dir, 'README.md')
  if (!existsSync(readme)) {
    atomicWrite(readme, [
      markdownHeader(`HermesTikTok memory — ${normalizeTikTokNamespace(namespace)}/`),
      'Shared memory namespace for the HermesTikTok pipeline.\n\n',
      'Agents write structured entries here (one file or JSONL per run).\n',
      `Created: ${new Date().toISOString()}\n`,
    ].join(''))
  }
  return dir
}

/**
 * Initialise all 8 HermesTikTok memory namespaces. Called by conductor-spawn
 * before dispatching an agent so every namespace exists up front.
 */
export function ensureTikTokMemoryNamespaces(): Array<string> {
  ensureDir(TIKTOK_MEMORY_ROOT)
  return TIKTOK_MEMORY_NAMESPACES.map((ns) => ensureTikTokMemoryNamespace(ns))
}

// ---------------------------------------------------------------------------
// HermesTikTok persistent memory read/write (Phase R3)
//
// Real read/write helpers so the 8 agents (and the pipeline UI) can persist
// structured state between runs. Each entry is a JSON envelope with a timestamp;
// every operation is best-effort (never throws to the caller) and logged.
// ---------------------------------------------------------------------------

export type TikTokMemoryEntry = {
  key: string
  agentId: string
  namespace: string
  timestamp: string
  data: unknown
}

export type TikTokMemoryEvent = {
  timestamp: string
  agentId: string
  event: unknown
}

export type TikTokNamespaceStatus = {
  namespace: string
  path: string
  exists: boolean
  entryCount: number
}

function safeMemoryKey(key: string): string {
  const cleaned = key.trim().replace(/[^a-z0-9._-]/gi, '_').slice(0, 120)
  return cleaned || `entry-${Date.now()}`
}

function readJsonEntry(path: string): TikTokMemoryEntry | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as TikTokMemoryEntry
  } catch {
    return null
  }
}

/** List all JSON entries in a namespace, newest first (by ISO timestamp). */
function listTikTokEntries(namespace: string): Array<TikTokMemoryEntry> {
  try {
    const dir = ensureTikTokMemoryNamespace(namespace)
    const ns = normalizeTikTokNamespace(namespace)
    const entries: Array<TikTokMemoryEntry> = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      const parsed = readJsonEntry(join(dir, name))
      if (parsed && typeof parsed === 'object') {
        entries.push({
          key: parsed.key ?? name.replace(/\.json$/, ''),
          agentId: parsed.agentId ?? 'unknown',
          namespace: ns,
          timestamp: parsed.timestamp ?? '',
          data: parsed.data ?? parsed,
        })
      }
    }
    return entries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0))
  } catch (err) {
    console.error('[tiktok-memory] list failed:', err instanceof Error ? err.message : String(err))
    return []
  }
}

/** Write a structured JSON entry to a TikTok memory namespace. */
export function writeTikTokMemory(
  agentId: string,
  namespace: string,
  key: string,
  data: unknown,
): TikTokMemoryEntry | null {
  try {
    const dir = ensureTikTokMemoryNamespace(namespace)
    const entry: TikTokMemoryEntry = {
      key: safeMemoryKey(key),
      agentId: agentId || 'unknown',
      namespace: normalizeTikTokNamespace(namespace),
      timestamp: new Date().toISOString(),
      data,
    }
    atomicWrite(join(dir, `${entry.key}.json`), `${JSON.stringify(entry, null, 2)}\n`)
    console.log(`[tiktok-memory] write ${entry.namespace}/${entry.key}.json by ${entry.agentId}`)
    return entry
  } catch (err) {
    console.error('[tiktok-memory] write failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Read from a TikTok memory namespace.
 * - With `key`: returns the single entry (or null if missing).
 * - Without `key`: returns all entries in the namespace, newest first.
 */
export function readTikTokMemory(
  agentId: string,
  namespace: string,
  key?: string,
): TikTokMemoryEntry | Array<TikTokMemoryEntry> | null {
  try {
    const dir = ensureTikTokMemoryNamespace(namespace)
    if (key) {
      const file = join(dir, `${safeMemoryKey(key)}.json`)
      if (!existsSync(file)) {
        console.log(`[tiktok-memory] read miss ${normalizeTikTokNamespace(namespace)}/${key} by ${agentId || 'unknown'}`)
        return null
      }
      console.log(`[tiktok-memory] read ${normalizeTikTokNamespace(namespace)}/${key} by ${agentId || 'unknown'}`)
      return readJsonEntry(file)
    }
    const entries = listTikTokEntries(namespace)
    console.log(`[tiktok-memory] read ${entries.length} from ${normalizeTikTokNamespace(namespace)} by ${agentId || 'unknown'}`)
    return entries
  } catch (err) {
    console.error('[tiktok-memory] read failed:', err instanceof Error ? err.message : String(err))
    return key ? null : []
  }
}

/** Append a timestamped event to a namespace events log (events.jsonl). */
export function appendTikTokMemoryEvent(
  agentId: string,
  namespace: string,
  event: unknown,
): TikTokMemoryEvent | null {
  try {
    const dir = ensureTikTokMemoryNamespace(namespace)
    const record: TikTokMemoryEvent = {
      timestamp: new Date().toISOString(),
      agentId: agentId || 'unknown',
      event,
    }
    appendLine(join(dir, 'events.jsonl'), JSON.stringify(record))
    console.log(`[tiktok-memory] event ${normalizeTikTokNamespace(namespace)} by ${record.agentId}`)
    return record
  } catch (err) {
    console.error('[tiktok-memory] event failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/** Read ALL agents' entries for a namespace (newest first). Used by ContentBoss/Analytics. */
export function readAllNamespaceMemory(namespace: string): Array<TikTokMemoryEntry> {
  const entries = listTikTokEntries(namespace)
  console.log(`[tiktok-memory] readAll ${normalizeTikTokNamespace(namespace)} → ${entries.length} entries`)
  return entries
}

/** Read winning_patterns/ and return the latest insights plus full history (newest first). */
export function getWinningPatterns(): { latest: unknown; history: Array<TikTokMemoryEntry> } {
  const history = listTikTokEntries('winning_patterns')
  const latest = history.length > 0 ? history[0].data : null
  console.log(`[tiktok-memory] getWinningPatterns → ${history.length} entries, latest=${latest ? 'present' : 'none'}`)
  return { latest, history }
}

/** Log a complete pipeline run to pipeline_runs/ (also records an event). */
export function logPipelineRun(runData: Record<string, unknown>): TikTokMemoryEntry | null {
  const key = `run-${Date.now()}`
  const entry = writeTikTokMemory('content-boss', 'pipeline_runs', key, {
    ...runData,
    loggedAt: new Date().toISOString(),
  })
  appendTikTokMemoryEvent('content-boss', 'pipeline_runs', {
    type: 'pipeline-run',
    key,
    product: runData.product ?? null,
    success: runData.success ?? null,
  })
  console.log(`[tiktok-memory] logPipelineRun ${key} success=${String(runData.success ?? 'n/a')}`)
  return entry
}

/** Clear all entries (and events) in a namespace, preserving the README scaffold. */
export function clearTikTokNamespace(namespace: string): number {
  try {
    const dir = ensureTikTokMemoryNamespace(namespace)
    let removed = 0
    for (const name of readdirSync(dir)) {
      if (name === 'README.md') continue
      if (name.endsWith('.json') || name === 'events.jsonl') {
        unlinkSync(join(dir, name))
        removed++
      }
    }
    console.log(`[tiktok-memory] cleared ${removed} entries from ${normalizeTikTokNamespace(namespace)}`)
    return removed
  } catch (err) {
    console.error('[tiktok-memory] clear failed:', err instanceof Error ? err.message : String(err))
    return 0
  }
}

/** Verify all 8 namespaces exist (create if missing) and log a status report. */
export function verifyTikTokMemoryNamespaces(): Array<TikTokNamespaceStatus> {
  ensureDir(TIKTOK_MEMORY_ROOT)
  const status = TIKTOK_MEMORY_NAMESPACES.map((ns) => {
    const path = ensureTikTokMemoryNamespace(ns)
    return { namespace: ns, path, exists: existsSync(path), entryCount: listTikTokEntries(ns).length }
  })
  console.log(`[tiktok-memory] startup namespace check (root: ${TIKTOK_MEMORY_ROOT}):`)
  for (const s of status) {
    console.log(`  - ${s.namespace.padEnd(16)} ${s.exists ? 'OK' : 'MISSING'} (${s.entryCount} entries)`)
  }
  return status
}

function profileRoot(workerId: string): string {
  return join(homedir(), '.hermes', 'profiles', workerId)
}

function profileFile(workerId: string, name: string): string {
  return join(profileRoot(workerId), name)
}

export function swarmWorkerMemoryRoot(workerId: string): string {
  return join(profileRoot(workerId), 'memory')
}

export function swarmWorkerMissionMemoryRoot(workerId: string, missionId: string): string {
  return join(swarmWorkerMemoryRoot(workerId), 'missions', missionId)
}

export function swarmWorkerEpisodesRoot(workerId: string): string {
  return join(swarmWorkerMemoryRoot(workerId), 'episodes')
}

export function swarmWorkerHandoffsRoot(workerId: string): string {
  return join(swarmWorkerMemoryRoot(workerId), 'handoffs')
}

export function validateSwarmId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

export function validateMissionId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_.:-]{0,127}$/i.test(value)
}

function assertInside(root: string, target: string): string {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const rel = relative(resolvedRoot, resolvedTarget)
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw new Error(`Path escapes memory root: ${target}`)
  }
  return resolvedTarget
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

function atomicWrite(path: string, content: string): void {
  ensureDir(dirname(path))
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

function appendLine(path: string, content: string): void {
  ensureDir(dirname(path))
  appendFileSync(path, content.endsWith('\n') ? content : `${content}\n`)
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function timeUtc(): string {
  return new Date().toISOString().slice(11, 16)
}

function readTextIfExists(path: string): string {
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8')
}

function markdownHeader(title: string): string {
  return `# ${title}\n\n`
}

export function ensureWorkerMemoryScaffold(input: {
  workerId: string
  name?: string | null
  role?: string | null
  specialty?: string | null
  model?: string | null
}): void {
  const { workerId } = input
  if (!validateSwarmId(workerId)) throw new Error(`Invalid workerId: ${workerId}`)
  const root = swarmWorkerMemoryRoot(workerId)
  ensureDir(root)
  ensureDir(join(root, 'missions'))
  ensureDir(join(root, 'episodes'))
  ensureDir(join(root, 'handoffs'))

  // The PROFILE-ROOT MEMORY.md / SOUL.md / USER.md are cloned from the main
  // user profile and contain durable project + persona + user context. We do
  // NOT replicate them here. Instead, this swarm `memory/` subdirectory holds
  // *swarm-specific* layered memory: per-worker IDENTITY.md, plus mission /
  // episodic / handoff files. We add tiny pointer files so that any worker
  // exploring `memory/` learns where the real durable memory lives.

  const memoryPath = join(root, 'MEMORY.md')
  if (!existsSync(memoryPath)) {
    atomicWrite(memoryPath, [
      markdownHeader(`Memory pointer — ${workerId}`),
      'This file is a pointer, not a memory store.\n\n',
      `Durable long-term memory for ${workerId} lives at:\n`,
      `~/.\u0068\u0065\u0072\u006d\u0065\u0073/profiles/${workerId}/MEMORY.md\n\n`,
      'Swarm-specific memory under this directory:\n',
      '- IDENTITY.md — worker role/specialty\n',
      '- missions/<missionId>/SUMMARY.md + events.jsonl — per-mission memory\n',
      '- episodes/YYYY-MM-DD.md — daily episodic log\n',
      '- handoffs/<missionId>.md or latest.md — compaction/restart handoffs\n',
    ].join(''))
  }

  const identityPath = join(root, 'IDENTITY.md')
  if (!existsSync(identityPath)) {
    atomicWrite(identityPath, [
      markdownHeader(`IDENTITY.md — ${workerId}`),
      `- Name: ${input.name ?? workerId}\n`,
      `- Worker ID: ${workerId}\n`,
      `- Role: ${input.role ?? 'Unassigned'}\n`,
      `- Specialty: ${input.specialty ?? 'Unassigned'}\n`,
      `- Model: ${input.model ?? 'Unspecified'}\n`,
    ].join(''))
  }

  const soulPath = join(root, 'SOUL.md')
  if (!existsSync(soulPath)) {
    atomicWrite(soulPath, [
      markdownHeader(`SOUL pointer — ${workerId}`),
      'This file is a pointer, not a persona store.\n\n',
      `Persona/SOUL for ${workerId} lives at:\n`,
      `~/.\u0068\u0065\u0072\u006d\u0065\u0073/profiles/${workerId}/SOUL.md\n`,
    ].join(''))
  }
}

function missionSummaryPath(workerId: string, missionId: string): string {
  return join(swarmWorkerMissionMemoryRoot(workerId, missionId), 'SUMMARY.md')
}

function missionEventsPath(workerId: string, missionId: string): string {
  return join(swarmWorkerMissionMemoryRoot(workerId, missionId), 'events.jsonl')
}

function updateMissionSummary(input: {
  workerId: string
  missionId: string
  title?: string | null
  summary: string
  status?: string | null
  assignmentId?: string | null
  checkpoint?: ParsedSwarmCheckpoint | null
}): void {
  const path = missionSummaryPath(input.workerId, input.missionId)
  const current = readTextIfExists(path)
  if (!current) {
    atomicWrite(path, [
      markdownHeader(`Mission ${input.missionId} — ${input.title ?? 'Untitled mission'}`),
      '## Current state\n\n',
      `- Status: ${input.status ?? 'executing'}\n`,
      `- Current assignment: ${input.assignmentId ?? 'none'}\n`,
      `- Last updated: ${new Date().toISOString()}\n\n`,
      '## Objective\n\n',
      `${input.title ?? input.summary}\n\n`,
      '## Decisions\n\n- None recorded yet.\n\n',
      '## Files touched\n\n- None recorded yet.\n\n',
      '## Checkpoints\n\n',
      `- ${new Date().toISOString()}: ${input.summary}\n\n`,
      '## Blockers\n\n- None recorded yet.\n\n',
      '## Next action\n\n',
      `${input.checkpoint?.nextAction ?? 'Continue assigned work.'}\n`,
    ].join(''))
    return
  }

  const checkpointLines = input.checkpoint
    ? [
        `\n## Checkpoint — ${new Date().toISOString()}\n\n`,
        `- State: ${input.checkpoint.stateLabel}\n`,
        `- Result: ${input.checkpoint.result ?? input.summary}\n`,
        `- Files changed: ${input.checkpoint.filesChanged ?? 'none'}\n`,
        `- Commands run: ${input.checkpoint.commandsRun ?? 'none'}\n`,
        `- Blocker: ${input.checkpoint.blocker ?? 'none'}\n`,
        `- Next action: ${input.checkpoint.nextAction ?? 'none'}\n`,
      ].join('')
    : `\n## Update — ${new Date().toISOString()}\n\n- ${input.summary}\n`
  atomicWrite(path, `${current.trimEnd()}\n${checkpointLines}`)
}

function appendEpisode(input: SwarmMemoryEvent): void {
  if (!input.workerId || !validateSwarmId(input.workerId)) return
  const path = join(swarmWorkerEpisodesRoot(input.workerId), `${todayUtc()}.md`)
  if (!existsSync(path)) {
    atomicWrite(path, markdownHeader(`Episodes — ${input.workerId} — ${todayUtc()}`))
  }
  const lines = [
    `\n## ${timeUtc()} UTC — ${input.type}\n`,
    input.missionId ? `- Mission: ${input.missionId}\n` : '',
    input.assignmentId ? `- Assignment: ${input.assignmentId}\n` : '',
    `- Summary: ${input.summary}\n`,
  ].filter(Boolean).join('')
  appendLine(path, lines)
}

export function appendSwarmMemoryEvent(input: {
  workerId: string
  missionId?: string | null
  assignmentId?: string | null
  type: SwarmMemoryEventType
  summary: string
  event?: Record<string, unknown>
  title?: string | null
  checkpoint?: ParsedSwarmCheckpoint | null
}): void {
  const { workerId, missionId } = input
  if (!validateSwarmId(workerId)) throw new Error(`Invalid workerId: ${workerId}`)
  ensureWorkerMemoryScaffold({ workerId })
  const event: SwarmMemoryEvent = {
    at: new Date().toISOString(),
    type: input.type,
    workerId,
    missionId: missionId ?? null,
    assignmentId: input.assignmentId ?? null,
    summary: input.summary,
    event: input.event,
  }

  appendEpisode(event)

  if (missionId) {
    if (!validateMissionId(missionId)) throw new Error(`Invalid missionId: ${missionId}`)
    ensureDir(swarmWorkerMissionMemoryRoot(workerId, missionId))
    appendLine(missionEventsPath(workerId, missionId), JSON.stringify(event))
    updateMissionSummary({
      workerId,
      missionId,
      title: input.title,
      summary: input.summary,
      status: input.type === 'checkpoint' ? input.checkpoint?.runtimeState : 'executing',
      assignmentId: input.assignmentId,
      checkpoint: input.checkpoint,
    })
  }
}

export function writeSwarmHandoff(input: {
  workerId: string
  missionId: string
  content: string
  mirrorShared?: boolean
}): { localPath: string; sharedPath?: string } {
  if (!validateSwarmId(input.workerId)) throw new Error(`Invalid workerId: ${input.workerId}`)
  if (!validateMissionId(input.missionId)) throw new Error(`Invalid missionId: ${input.missionId}`)
  const localPath = join(swarmWorkerHandoffsRoot(input.workerId), `${input.missionId}.md`)
  atomicWrite(localPath, input.content.endsWith('\n') ? input.content : `${input.content}\n`)
  let sharedPath: string | undefined
  if (input.mirrorShared ?? true) {
    sharedPath = join(SWARM_SHARED_HANDOFF_ROOT, `${input.workerId}-latest.md`)
    atomicWrite(sharedPath, input.content.endsWith('\n') ? input.content : `${input.content}\n`)
  }
  return { localPath, sharedPath }
}

function memoryRootFor(input: { workerId?: string | null; kind: SwarmMemoryKind; missionId?: string | null; date?: string | null }): string {
  if (input.kind === 'shared') return SWARM_SHARED_MEMORY_ROOT
  const workerId = input.workerId?.trim()
  if (!workerId || !validateSwarmId(workerId)) throw new Error('Valid workerId required')
  if (input.kind === 'profile') return swarmWorkerMemoryRoot(workerId)
  if (input.kind === 'mission') {
    const missionId = input.missionId?.trim()
    if (!missionId || !validateMissionId(missionId)) throw new Error('Valid missionId required')
    return swarmWorkerMissionMemoryRoot(workerId, missionId)
  }
  if (input.kind === 'episodic') return swarmWorkerEpisodesRoot(workerId)
  return swarmWorkerHandoffsRoot(workerId)
}

function listFiles(root: string, maxDepth = 2): Array<string> {
  if (!existsSync(root)) return []
  const out: Array<string> = []
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const st = statSync(path)
      if (st.isDirectory()) {
        walk(path, depth + 1)
      } else if (/\.(md|jsonl|json)$/i.test(name)) {
        out.push(path)
      }
    }
  }
  walk(root, 0)
  return out
}

export function readSwarmMemory(input: { workerId?: string | null; kind: SwarmMemoryKind; missionId?: string | null; date?: string | null }): SwarmMemoryReadResult {
  const root = memoryRootFor(input)
  ensureDir(root)
  const files = listFiles(root, input.kind === 'profile' ? 1 : 2)
    .filter((path) => !input.date || basename(path).startsWith(input.date))
    .slice(0, 50)
    .map((path) => ({ name: basename(path), path, content: readFileSync(assertInside(root, path), 'utf8') }))
  return {
    ok: true,
    workerId: input.workerId ?? null,
    kind: input.kind,
    root,
    path: root,
    files,
  }
}

function tokenScore(line: string, query: string): number {
  const lower = line.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  if (lower.includes(q)) return 100 + q.length
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.reduce((score, token) => score + (lower.includes(token) ? 10 : 0), 0)
}

export function searchSwarmMemory(input: { workerId?: string | null; query: string; scope?: 'worker' | 'shared' | 'all'; limit?: number }): Array<SwarmMemorySearchResult> {
  const query = input.query.trim()
  if (!query) return []
  const roots: Array<string> = []
  const scope = input.scope ?? 'worker'
  if ((scope === 'worker' || scope === 'all') && input.workerId) {
    if (!validateSwarmId(input.workerId)) throw new Error(`Invalid workerId: ${input.workerId}`)
    roots.push(swarmWorkerMemoryRoot(input.workerId))
  }
  if (scope === 'shared' || scope === 'all') {
    roots.push(SWARM_SHARED_MEMORY_ROOT, SWARM_SHARED_HANDOFF_ROOT)
  }

  const results: Array<SwarmMemorySearchResult> = []
  for (const root of roots) {
    for (const file of listFiles(root, 4)) {
      const content = readFileSync(assertInside(root, file), 'utf8')
      const lines = content.split('\n')
      lines.forEach((line, index) => {
        const score = tokenScore(line, query)
        if (score > 0) {
          results.push({ path: file, line: index + 1, score, snippet: line.trim().slice(0, 240) })
        }
      })
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(50, input.limit ?? 10)))
}

// ---------------------------------------------------------------------------
// Startup snapshot helpers
// ---------------------------------------------------------------------------

function tail(content: string, max: number): string {
  if (!content) return ''
  if (content.length <= max) return content.trim()
  return `… ${content.slice(content.length - max).trim()}`
}

function readShared(file: string): string {
  return readTextIfExists(file)
}

function readActiveMissionId(workerId: string): string | null {
  const runtimePath = profileFile(workerId, 'runtime.json')
  if (!existsSync(runtimePath)) return null
  try {
    const json = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
    const id = json.currentMissionId
    return typeof id === 'string' && validateMissionId(id) ? id : null
  } catch {
    return null
  }
}

function readEnabledToolsets(workerId: string): Array<string> {
  const configPath = profileFile(workerId, 'config.yaml')
  if (!existsSync(configPath)) return []
  try {
    const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const toolsets = parsed.toolsets
    if (!Array.isArray(toolsets)) return []
    return toolsets.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  } catch {
    return []
  }
}

function newestEpisodeContent(workerId: string): { date: string; content: string } | null {
  const root = swarmWorkerEpisodesRoot(workerId)
  if (!existsSync(root)) return null
  const entries = readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
  if (!entries.length) return null
  const latest = entries[entries.length - 1]
  return { date: latest.replace(/\.md$/, ''), content: readTextIfExists(join(root, latest)) }
}

function newestMissionEvents(workerId: string, missionId: string, n = 4): Array<string> {
  const path = join(swarmWorkerMissionMemoryRoot(workerId, missionId), 'events.jsonl')
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  return lines.slice(-n)
}

export type SwarmStartupSnapshotInput = {
  workerId: string
  role?: string | null
  specialty?: string | null
  rosterMission?: string | null
  taskTitle?: string | null
  missionId?: string | null
  // Soft caps so the inline snapshot does not blow up dispatch envelopes.
  maxIdentityChars?: number
  maxMemoryChars?: number
  maxMissionChars?: number
  maxEpisodeChars?: number
  maxProjectChars?: number
}

export type SwarmStartupSnapshot = {
  workerId: string
  identity: string
  durableMemory: string
  persona: string
  user: string
  project: string
  enabledToolsets: Array<string>
  activeMission: { missionId: string; summary: string; recentEvents: Array<string> } | null
  latestHandoff: { path: string; content: string } | null
  latestEpisode: { date: string; content: string } | null
  rendered: string
}

export function buildSwarmStartupSnapshot(input: SwarmStartupSnapshotInput): SwarmStartupSnapshot {
  const { workerId } = input
  if (!validateSwarmId(workerId)) throw new Error(`Invalid workerId: ${workerId}`)
  const identity = readTextIfExists(join(swarmWorkerMemoryRoot(workerId), 'IDENTITY.md'))
  const durableMemory = readTextIfExists(profileFile(workerId, 'MEMORY.md'))
  const persona = readTextIfExists(profileFile(workerId, 'SOUL.md'))
  const user = readTextIfExists(profileFile(workerId, 'USER.md'))
  const project = readShared(SWARM_PROJECT_CONTEXT_PATH)
  const enabledToolsets = readEnabledToolsets(workerId)

  const activeMissionId = input.missionId ?? readActiveMissionId(workerId)
  let activeMission: SwarmStartupSnapshot['activeMission'] = null
  if (activeMissionId) {
    const summaryPath = join(swarmWorkerMissionMemoryRoot(workerId, activeMissionId), 'SUMMARY.md')
    if (existsSync(summaryPath)) {
      activeMission = {
        missionId: activeMissionId,
        summary: readTextIfExists(summaryPath),
        recentEvents: newestMissionEvents(workerId, activeMissionId, 5),
      }
    }
  }

  const sharedHandoffPath = join(SWARM_SHARED_HANDOFF_ROOT, `${workerId}-latest.md`)
  let latestHandoff: SwarmStartupSnapshot['latestHandoff'] = null
  if (existsSync(sharedHandoffPath)) {
    latestHandoff = { path: sharedHandoffPath, content: readTextIfExists(sharedHandoffPath) }
  } else if (activeMissionId) {
    const localHandoff = join(swarmWorkerHandoffsRoot(workerId), `${activeMissionId}.md`)
    if (existsSync(localHandoff)) {
      latestHandoff = { path: localHandoff, content: readTextIfExists(localHandoff) }
    }
  }

  const latestEpisode = newestEpisodeContent(workerId)

  const maxIdentity = input.maxIdentityChars ?? 600
  const maxMemory = input.maxMemoryChars ?? 1600
  const maxMission = input.maxMissionChars ?? 1600
  const maxEpisode = input.maxEpisodeChars ?? 600
  const maxProject = input.maxProjectChars ?? 1200

  const renderedSections: Array<string> = []
  renderedSections.push('## Worker Startup Memory Snapshot')
  renderedSections.push(`Worker: ${workerId}${input.role ? ` — ${input.role}` : ''}${input.specialty ? ` (${input.specialty})` : ''}`)
  if (input.rosterMission) renderedSections.push(`Mission focus: ${input.rosterMission}`)
  if (enabledToolsets.length) {
    renderedSections.push('### Enabled tools')
    renderedSections.push(enabledToolsets.join(', '))
  }
  if (project) {
    renderedSections.push('### Project context')
    renderedSections.push(tail(project, maxProject))
  }
  if (durableMemory) {
    renderedSections.push('### Durable memory (profile MEMORY.md tail)')
    renderedSections.push(tail(durableMemory, maxMemory))
  }
  if (identity) {
    renderedSections.push('### Worker identity')
    renderedSections.push(tail(identity, maxIdentity))
  }
  if (latestHandoff) {
    renderedSections.push(`### Latest handoff (${latestHandoff.path})`)
    renderedSections.push(tail(latestHandoff.content, maxMission))
  }
  if (activeMission) {
    renderedSections.push(`### Active mission ${activeMission.missionId}`)
    renderedSections.push(tail(activeMission.summary, maxMission))
    if (activeMission.recentEvents.length) {
      renderedSections.push('Recent events:')
      renderedSections.push(activeMission.recentEvents.map((line) => `- ${line}`).join('\n'))
    }
  }
  if (latestEpisode) {
    renderedSections.push(`### Latest episode (${latestEpisode.date})`)
    renderedSections.push(tail(latestEpisode.content, maxEpisode))
  }
  renderedSections.push('### Memory locations')
  renderedSections.push(
    [
      `Profile root: ~/.hermes/profiles/${workerId}/  (SOUL.md plus optional MEMORY.md / USER.md when cloned from main)`,
      `Swarm memory: ~/.hermes/profiles/${workerId}/memory/  (IDENTITY.md, missions/, episodes/, handoffs/)`,
      `Shared handoff: ${sharedHandoffPath}`,
      `Shared swarm memory: ${SWARM_SHARED_MEMORY_ROOT}`,
      `Project context: ${SWARM_PROJECT_CONTEXT_PATH}`,
    ].join('\n'),
  )

  return {
    workerId,
    identity,
    durableMemory,
    persona,
    user,
    project,
    enabledToolsets,
    activeMission,
    latestHandoff,
    latestEpisode,
    rendered: renderedSections.join('\n\n'),
  }
}

export function readSwarmProjectContext(): string {
  return readTextIfExists(SWARM_PROJECT_CONTEXT_PATH)
}
