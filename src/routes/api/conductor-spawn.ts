import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { dashboardFetch, ensureGatewayProbed } from '../../server/gateway-capabilities'
import { sanitizeConductorMissionGoal } from '../../server/conductor-mission-sanitize'
import { getSwarmMission, recordMissionCheckpoint  } from '../../server/swarm-missions'
import { getSwarmProfilePath } from '../../server/swarm-foundation'
import { readWorkerMessages } from '../../server/swarm-chat-reader'
import { newestCheckpointFromMessages } from '../../server/swarm-checkpoints'
import { checkpointFromRuntimeSnapshot, dispatchSwarmAssignments, readRuntimeCheckpointSnapshot, runtimeCheckpointSignature } from './swarm-dispatch'
import { appendTikTokMemoryEvent, ensureTikTokMemoryNamespace, ensureTikTokMemoryNamespaces, getWinningPatterns, readAllNamespaceMemory, tiktokMemoryNamespaceRoot, writeTikTokMemory } from '../../server/swarm-memory'
import type { TikTokMemoryEntry } from '../../server/swarm-memory'
import { getHermesTikTokAgent } from '../../screens/agents/agent-presets'
import type { HermesTikTokAgentPreset } from '../../screens/agents/agent-presets'
import { executeTool, getToolsForAgent } from '../../server/tools'
import { getPipelineMission, startFullPipeline } from '../../server/tiktok-pipeline'
import type { PipelineMission } from '../../server/tiktok-pipeline'
import type { SwarmMission } from '../../server/swarm-missions'

let cachedSkill: string | null = null
const cachedAgentSkills = new Map<string, string>()

export const NATIVE_CONDUCTOR_MODE_NOTE = 'Native-swarm is the official Workspace-native Swarm fallback when the dashboard Conductor API is unavailable.'

type ConductorSpawnBody = {
  goal?: unknown
  orchestratorModel?: unknown
  workerModel?: unknown
  projectsDir?: unknown
  maxParallel?: unknown
  supervised?: unknown
  // Phase R2 — spawn a specific HermesTikTok agent by id.
  agentId?: unknown
  product?: unknown
  category?: unknown
  script?: unknown
  // Phase R4 — execute a registered tool directly.
  toolCall?: unknown
}

function repoRoot(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    return resolve(here, '..', '..', '..')
  } catch {
    return process.cwd()
  }
}

function loadDispatchSkill(): string {
  if (cachedSkill !== null) return cachedSkill
  const home = process.env.HOME ?? ''
  const candidates = [
    resolve(repoRoot(), 'skills/workspace-dispatch/SKILL.md'),
    resolve(process.cwd(), 'skills/workspace-dispatch/SKILL.md'),
    ...(home ? [resolve(home, '.hermes/skills/workspace-dispatch/SKILL.md')] : []),
    ...(home ? [resolve(home, '.openclaw/workspace/skills/workspace-dispatch/SKILL.md')] : []),
  ]
  for (const p of candidates) {
    try {
      cachedSkill = readFileSync(p, 'utf-8')
      return cachedSkill
    } catch {}
  }
  cachedSkill = ''
  return cachedSkill
}

/**
 * Load a HermesTikTok skill body (SKILL.md) by skill name from the tiktok/
 * category. Mirrors loadDispatchSkill's fallback-chain pattern. Cached per skill.
 */
function loadTikTokSkill(skill: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(skill)) return ''
  const cached = cachedAgentSkills.get(skill)
  if (cached !== undefined) return cached
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  const rel = `tiktok/${skill}/SKILL.md`
  const candidates = [
    resolve(repoRoot(), '.claude/skills', rel),
    resolve(process.cwd(), '.claude/skills', rel),
    ...(home ? [resolve(home, 'AppData/Local/hermes/skills', rel)] : []),
    ...(home ? [resolve(home, '.hermes/skills', rel)] : []),
  ]
  for (const p of candidates) {
    try {
      const body = readFileSync(p, 'utf-8')
      cachedAgentSkills.set(skill, body)
      return body
    } catch {}
  }
  cachedAgentSkills.set(skill, '')
  return ''
}

/**
 * Build the goal for an agent spawn. If an explicit goal is supplied it wins;
 * otherwise the preset's goalTemplate is filled with the provided
 * product/category/script context (with sensible fallbacks).
 */
function buildAgentGoal(
  agent: HermesTikTokAgentPreset,
  explicitGoal: string,
  context: { product: string; category: string; script: string },
): string {
  if (explicitGoal) return explicitGoal
  return agent.goalTemplate
    .replace(/\{product\}/g, context.product || 'the selected product')
    .replace(/\{category\}/g, context.category || 'health & beauty')
    .replace(/\{script\}/g, context.script || 'the current script')
}

/**
 * Per-agent memory read plan (Phase R3). `limit: 0` means "all entries".
 * Each entry maps an agent id to the namespaces it should be primed with.
 */
const AGENT_MEMORY_READS: Record<string, Array<{ namespace: string; limit: number }>> = {
  'content-boss': [{ namespace: 'pipeline_runs', limit: 5 }],
  'trend-hunter': [{ namespace: 'products', limit: 10 }],
  'copywriter-agent': [{ namespace: 'scripts', limit: 5 }],
  'compliance-agent': [{ namespace: 'compliance', limit: 10 }],
  'prompt-engineer': [{ namespace: 'prompts', limit: 5 }],
  'image-generator': [{ namespace: 'images', limit: 3 }],
  'video-generator': [{ namespace: 'videos', limit: 3 }],
  'analytics-agent': [{ namespace: 'pipeline_runs', limit: 0 }],
}

/** Agents that should also receive AnalyticsAgent's winning_patterns/ insights. */
const AGENT_WANTS_WINNING_PATTERNS = new Set([
  'content-boss',
  'trend-hunter',
  'copywriter-agent',
  'analytics-agent',
])

function clipJson(value: unknown, max = 600): string {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`
}

function formatMemoryEntries(entries: Array<TikTokMemoryEntry>, limit: number): string {
  const slice = limit > 0 ? entries.slice(0, limit) : entries
  if (slice.length === 0) return '_(none yet — this is a fresh start for this namespace)_'
  return slice
    .map((entry, i) => `${i + 1}. [${entry.timestamp || '?'}] ${entry.agentId}: ${clipJson(entry.data)}`)
    .join('\n')
}

/**
 * Build the injected memory context block for an agent (Phase R3). Reads the
 * agent's relevant namespaces (and winning_patterns/ when applicable) so the
 * worker is primed with prior runs before it acts. Best-effort — returns '' on
 * any failure so memory never blocks a spawn.
 */
function buildAgentMemoryContext(agent: HermesTikTokAgentPreset): string {
  try {
    const sections: Array<string> = []
    for (const read of AGENT_MEMORY_READS[agent.id] ?? []) {
      const entries = readAllNamespaceMemory(read.namespace)
      const label = read.limit > 0 ? `last ${read.limit}` : 'all'
      sections.push(`### ${read.namespace}/ (${label})`, formatMemoryEntries(entries, read.limit), '')
    }
    if (AGENT_WANTS_WINNING_PATTERNS.has(agent.id)) {
      const { latest, history } = getWinningPatterns()
      sections.push(
        '### winning_patterns/ (AnalyticsAgent insights)',
        latest ? clipJson(latest, 1000) : '_(no winning patterns recorded yet)_',
        history.length > 1 ? `(+${history.length - 1} earlier pattern snapshots)` : '',
        '',
      )
    }
    if (sections.length === 0) return ''
    return [
      '## Memory Context (read this before acting)',
      '',
      'Prior pipeline memory for your namespace(s). Use it to avoid repeating',
      'past mistakes and to build on what worked. Do NOT duplicate existing entries.',
      '',
      ...sections,
    ].join('\n')
  } catch (error) {
    console.warn('[conductor] memory context build failed:', error instanceof Error ? error.message : String(error))
    return ''
  }
}

/**
 * Build the orchestrator prompt for a single named HermesTikTok agent, injecting
 * its skill instructions and memory-namespace context before the goal.
 */
function buildAgentSpawnPrompt(input: {
  agent: HermesTikTokAgentPreset
  goal: string
  skillBody: string
  memoryNamespacePath: string
  memoryContext: string
  toolDescriptions: Array<{ name: string; description: string }>
}): string {
  const { agent, goal, skillBody, memoryNamespacePath, memoryContext, toolDescriptions } = input
  const toolLines =
    toolDescriptions.length > 0
      ? [
          '## Available Tools',
          '',
          'You can request these real tools. To call one, emit a line:',
          'TOOL_CALL: <tool_name> {"arg": "value"}',
          'The runtime executes it via POST /api/conductor-spawn { toolCall: { tool, args } } and returns the result.',
          '',
          ...toolDescriptions.map((t) => `- **${t.name}** — ${t.description}`),
          '',
        ]
      : []
  return [
    `You are ${agent.name}, the ${agent.role} in the HermesTikTok pipeline.`,
    '',
    '## Skill Instructions',
    '',
    skillBody || `(tiktok/${agent.skill} skill not found locally; proceed from your role description.)`,
    '',
    '## Memory Namespace',
    '',
    `Read and write your durable state under: ${memoryNamespacePath}`,
    `Namespace: ${agent.memoryNamespace}`,
    'Read upstream namespaces before acting; write your outputs before reporting.',
    ...(memoryContext ? ['', memoryContext] : []),
    '',
    ...toolLines,
    '## Granted Toolsets',
    '',
    agent.toolsets.join(', ') || 'none',
    '',
    '## Goal',
    '',
    goal,
    '',
    '## Rules',
    `- Use model ${agent.workerModel} for this work.`,
    '- Do NOT ask for confirmation — start immediately.',
    '- Write your outputs to the memory namespace above before reporting.',
    '- Report a concise summary when done.',
  ].join('\n')
}

// Guard so each agent completion is persisted to memory only once across polls.
const persistedAgentCompletions = new Set<string>()

/**
 * Persist a HermesTikTok agent's output to its memory namespace when it
 * completes (Phase R3). Idempotent per mission+assignment via the guard set.
 */
function persistTikTokAgentCompletion(input: {
  missionId: string
  assignmentId: string
  workerId: string
  task: string
  checkpoint: { stateLabel?: string; result?: string | null; nextAction?: string | null; filesChanged?: string | null }
}): void {
  const agent = getHermesTikTokAgent(input.workerId)
  if (!agent) return
  const dedupeKey = `${input.missionId}:${input.assignmentId}`
  if (persistedAgentCompletions.has(dedupeKey)) return
  persistedAgentCompletions.add(dedupeKey)
  try {
    const key = `output-${Date.now()}`
    writeTikTokMemory(agent.id, agent.memoryNamespace, key, {
      missionId: input.missionId,
      task: input.task.slice(0, 500),
      state: input.checkpoint.stateLabel ?? 'DONE',
      result: input.checkpoint.result ?? null,
      nextAction: input.checkpoint.nextAction ?? null,
      filesChanged: input.checkpoint.filesChanged ?? null,
    })
    appendTikTokMemoryEvent(agent.id, agent.memoryNamespace, {
      type: 'agent-completion',
      missionId: input.missionId,
      state: input.checkpoint.stateLabel ?? 'DONE',
    })
  } catch (error) {
    console.warn('[conductor] persist agent completion failed:', error instanceof Error ? error.message : String(error))
  }
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readMaxParallel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(5, Math.max(1, Math.round(value)))
}

function buildOrchestratorPrompt(
  goal: string,
  skill: string,
  options: {
    orchestratorModel: string
    workerModel: string
    projectsDir: string
    maxParallel: number
    supervised: boolean
  },
): string {
  const outputBase = options.projectsDir || '/tmp'
  const outputPrefix = outputBase === '/tmp' ? '/tmp/dispatch-<slug>' : `${outputBase}/dispatch-<slug>`
  return [
    'You are a mission orchestrator. Execute this mission autonomously.',
    '',
    '## Dispatch Skill Instructions',
    '',
    skill || '(workspace-dispatch skill not found locally; proceed using create_task to spawn workers)',
    '',
    '## Mission',
    '',
    `Goal: ${goal}`,
    ...(options.orchestratorModel ? ['', `Use model: ${options.orchestratorModel} for the orchestrator`] : []),
    ...(options.workerModel ? ['', `Use model: ${options.workerModel} for all workers`] : []),
    ...(options.maxParallel > 1
      ? ['', `Run up to ${options.maxParallel} workers in parallel when tasks are independent`]
      : ['', 'Spawn workers one at a time. Do NOT wait for workers to finish — the UI handles tracking.']),
    ...(options.supervised ? ['', 'Supervised mode is enabled. Require approval before each task.'] : []),
    '',
    '## Critical Rules',
    '- Use create_task / delegate_task to create worker agents for each task',
    '- Do NOT do the work yourself — spawn workers',
    '- For simple tasks (single file, quick mockup), use ONLY 1 task with 1 worker — do not over-decompose',
    '- Do NOT ask for confirmation — start immediately',
    '- Label workers as "worker-<task-slug>" so the UI can track them',
    '- Each worker gets a self-contained prompt with the task + exit criteria',
    `- Workers should write output to ${outputPrefix} directories`,
    '- After spawning all workers, report your plan summary and finish. The UI tracks worker completion automatically.',
    '- Report a summary when all tasks are done',
  ].join('\n')
}

async function createDashboardConductorMission(payload: { name: string; prompt: string }): Promise<{
  id?: string
  name?: string
  sessionKey?: string
  error?: string
}> {
  const res = await dashboardFetch('/api/conductor/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: payload.name, prompt: payload.prompt }),
  })
  const text = await res.text()
  let data: { id?: string; name?: string; session_id?: string; error?: string; detail?: string } = {}
  try {
    data = JSON.parse(text)
  } catch {
    return { error: text || `HTTP ${res.status}` }
  }
  if (!res.ok || data.error || data.detail) {
    return { error: data.error || data.detail || `HTTP ${res.status}` }
  }
  return { id: data.id, name: data.name, sessionKey: data.session_id }
}

type NativeConductorAssignment = {
  workerId: string
  task: string
  rationale: string
  reviewRequired?: boolean
  direct?: boolean
  raw?: boolean
}

function clipText(value: string, max = 8000): string {
  return value.length <= max ? value : `${value.slice(0, max - 20)}\n...[truncated]`
}

export function buildNativeConductorAssignments(goal: string, options: { maxParallel: number; supervised: boolean }): Array<NativeConductorAssignment> {
  const maxParallel = Math.min(5, Math.max(1, options.maxParallel || 1))
  const normalizedGoal = goal.toLowerCase()
  const wantsOps = /production|ready|harden|audit|clean|fix|bug|test|build|release|deploy|operational|runtime|gateway|tmux|service|health/.test(normalizedGoal)
  const wantsDocs = /doc|handoff|readme|spec|plan|summary|knowledge|note/.test(normalizedGoal)
  const assignments: Array<NativeConductorAssignment> = []

  const pushUnique = (assignment: NativeConductorAssignment) => {
    if (!assignments.some((existing) => existing.workerId === assignment.workerId)) assignments.push(assignment)
  }

  pushUnique({
    workerId: wantsOps ? 'ops-watch' : 'builder',
    rationale: wantsOps ? 'Ops Watch owns runtime health, service quality, and production blockers.' : 'Builder owns scoped implementation and concrete progress.',
    reviewRequired: false,
    direct: true,
    task: [
      `Conductor mission: ${goal}`,
      '',
      wantsOps ? 'Lane: Ops Watch / runtime quality.' : 'Lane: Builder / primary implementation.',
      wantsOps
        ? 'Diagnose the runtime path, make the smallest safe operational improvement, and return proof. Avoid destructive changes unless explicitly approved.'
        : 'Find the smallest safe execution plan, make concrete progress, and produce a checkpoint. If code changes are required, keep them scoped and testable.',
      options.supervised ? 'Supervised mode: stop before destructive writes or commits and report the exact approval needed.' : 'Do not ask for confirmation unless blocked; start immediately.',
    ].join('\n'),
  })

  if (maxParallel >= 2) {
    pushUnique({
      workerId: wantsOps ? 'builder' : 'reviewer',
      rationale: wantsOps
        ? 'Builder executes implementation or patch work in parallel with runtime analysis.'
        : 'Reviewer provides the second-lane quality gate for implementation work.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        wantsOps ? 'Lane: Builder.' : 'Lane: Reviewer / quality gate.',
        wantsOps
          ? 'Implement or prototype the concrete fix/feature path. Avoid broad refactors. Report files changed, tests run, and remaining risks.'
          : 'Review the execution path and any changes. Look for regressions, missing tests, unsafe assumptions, and production-readiness gaps.',
        options.supervised ? 'Supervised mode: prepare patches but stop before destructive writes or commits if approval is needed.' : 'Proceed without asking unless blocked.',
      ].join('\n'),
    })
  }

  if (maxParallel >= 3) {
    pushUnique({
      workerId: wantsOps ? 'reviewer' : 'qa',
      rationale: wantsOps
        ? 'Reviewer independently checks correctness, regressions, and merge risk.'
        : 'QA validates user-visible behavior with focused smoke checks.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        wantsOps ? 'Lane: Reviewer / quality gate.' : 'Lane: QA.',
        wantsOps
          ? 'Review the implementation plan and any changes from Ops/Builder. Look for regressions, missing tests, unsafe assumptions, and production-readiness gaps. Do not make broad edits unless needed to unblock correctness.'
          : 'Run or design focused verification. Prefer targeted tests/build/smoke checks. Report exact commands and results. If tests are missing, identify the minimal regression coverage needed.',
      ].join('\n'),
    })
  }

  if (maxParallel >= 4) {
    pushUnique({
      workerId: wantsOps ? 'qa' : 'ops-watch',
      rationale: wantsOps
        ? 'QA validates behavior with targeted tests and smoke checks.'
        : 'Ops Watch checks runtime/service risks for implementation missions.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        wantsOps ? 'Lane: QA.' : 'Lane: Ops Watch / runtime quality.',
        wantsOps
          ? 'Run or design focused verification. Prefer targeted tests/build/smoke checks. Report exact commands and results. If tests are missing, identify the minimal regression coverage needed.'
          : 'Check runtime, service, deployment, and operational risk. Report only concrete blockers, verification gaps, and safe next actions.',
      ].join('\n'),
    })
  }

  if (maxParallel >= 5 || wantsDocs) {
    pushUnique({
      workerId: 'km-agent',
      rationale: 'KM Agent captures handoff, docs, and durable knowledge notes without leaking secrets.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        'Lane: KM Agent / handoff and knowledge hygiene.',
        'Create a concise handoff/status note: what changed, how to operate it, verification, caveats, and next actions. Do not expose secrets.',
        options.supervised ? 'Supervised mode: stop before destructive writes or commits and report the exact approval needed.' : 'Proceed without asking unless blocked.',
      ].join('\n'),
    })
  }

  const selected = assignments.slice(0, maxParallel)
  if (wantsDocs && !selected.some((assignment) => assignment.workerId === 'km-agent')) {
    selected[selected.length - 1] = {
      workerId: 'km-agent',
      rationale: 'KM Agent captures handoff, docs, and durable knowledge notes without leaking secrets.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        'Lane: KM Agent / handoff and knowledge hygiene.',
        'Create a concise handoff/status note: what changed, how to operate it, verification, caveats, and next actions. Do not expose secrets.',
        options.supervised ? 'Supervised mode: stop before destructive writes or commits and report the exact approval needed.' : 'Proceed without asking unless blocked.',
      ].join('\n'),
    }
  }

  return selected
}

function swarmMissionStatus(mission: SwarmMission): string {
  if (mission.state === 'cancelled') return 'cancelled'
  if (mission.state === 'complete') return 'completed'
  if (mission.state === 'blocked') return 'failed'
  return 'running'
}

function nativeMissionLines(mission: SwarmMission, maxLines: number): Array<string> {
  const lines = [
    `Native Workspace Swarm mission: ${mission.title}`,
    `mission_id: ${mission.id}`,
    `state: ${mission.state}`,
    ...mission.assignments.map((assignment) => {
      const result = assignment.checkpoint?.result ? ` — ${assignment.checkpoint.result}` : ''
      const blocker = assignment.checkpoint?.blocker ? ` — blocker: ${assignment.checkpoint.blocker}` : ''
      return `${assignment.workerId} ${assignment.state}: ${assignment.task.slice(0, 160)}${result}${blocker}`
    }),
    ...mission.events.slice(-20).map((event) => `${new Date(event.at).toISOString()} ${event.type}: ${event.message}`),
  ]
  return lines.slice(-maxLines)
}

export function toNativeConductorMissionRecord(mission: SwarmMission, maxLines = 400) {
  return {
    id: mission.id,
    name: mission.title,
    status: swarmMissionStatus(mission),
    error: mission.state === 'blocked' ? 'Native Workspace Swarm mission blocked' : null,
    session_id: null,
    lines: nativeMissionLines(mission, maxLines),
    exit_code: mission.state === 'blocked' || mission.state === 'cancelled' ? 1 : mission.state === 'complete' ? 0 : null,
    nativeSwarm: true,
    modeOfficialOotb: true,
    modeNote: NATIVE_CONDUCTOR_MODE_NOTE,
    assignments: mission.assignments,
    updatedAt: mission.updatedAt,
  }
}

function createNativeConductorMission(input: {
  goal: string
  missionName: string
  maxParallel: number
  supervised: boolean
}) {
  const assignments = buildNativeConductorAssignments(input.goal, {
    maxParallel: input.maxParallel,
    supervised: input.supervised,
  })
  const missionTitle = `Conductor: ${clipText(input.goal, 120)}`
  void dispatchSwarmAssignments({
    assignments,
    missionId: input.missionName,
    missionTitle,
    allowAsync: true,
    waitForCheckpoint: false,
    timeoutSeconds: 600,
    checkpointPollSeconds: 10,
    notifySessionKey: 'main',
  }).catch((error) => {
    console.error('[conductor] native swarm dispatch failed:', error instanceof Error ? error.message : String(error))
  })
  return { missionId: input.missionName, missionTitle, assignments }
}

/**
 * Native-swarm dispatch for a single named HermesTikTok agent. Unlike the
 * generic conductor fallback, this dispatches exactly one worker (the agent)
 * carrying the agent's pre-built prompt (skill + memory context + goal).
 */
function createNativeAgentMission(input: {
  agent: HermesTikTokAgentPreset
  prompt: string
  goal: string
  missionName: string
}) {
  const assignments: Array<NativeConductorAssignment> = [
    {
      workerId: input.agent.id,
      task: input.prompt,
      rationale: `${input.agent.name} — ${input.agent.role}`,
      reviewRequired: false,
      direct: true,
    },
  ]
  const missionTitle = `Agent: ${input.agent.name} — ${clipText(input.goal, 100)}`
  void dispatchSwarmAssignments({
    assignments,
    missionId: input.missionName,
    missionTitle,
    allowAsync: true,
    waitForCheckpoint: false,
    timeoutSeconds: 600,
    checkpointPollSeconds: 10,
    notifySessionKey: 'main',
  }).catch((error) => {
    console.error('[conductor] native agent dispatch failed:', error instanceof Error ? error.message : String(error))
  })
  return { missionId: input.missionName, missionTitle, assignments }
}

/** Shape a pipeline mission into the status contract the TikTok UI polls (Task 4). */
function toPipelineStatus(m: PipelineMission) {
  return {
    id: m.id,
    status: m.status,
    product: m.product,
    activeAgent: m.activeAgent,
    activeAgentName: m.activeAgent ? m.agents[m.activeAgent]?.name ?? m.activeAgent : null,
    completedAgents: m.completedAgents,
    agents: Object.values(m.agents).map((a) => ({ id: a.id, name: a.name, status: a.status, error: a.error, costRm: a.costRm, output: a.output })),
    outputs: m.outputs,
    costRm: Number(m.costRm.toFixed(2)),
    progressPct: m.progressPct,
    finalVideoUrl: m.finalVideoUrl,
    error: m.error,
    log: m.log.slice(-30),
  }
}

export const Route = createFileRoute('/api/conductor-spawn')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const missionId = url.searchParams.get('missionId')?.trim()
        const requestedLines = Number(url.searchParams.get('lines') || '200')
        const lines = Number.isFinite(requestedLines) ? Math.min(2000, Math.max(1, requestedLines)) : 200
        if (!missionId) return json({ ok: false, error: 'missionId required' }, { status: 400 })

        // ── Phase R5: ContentBoss autonomous pipeline status ─────────────
        const pipeline = getPipelineMission(missionId)
        if (pipeline) {
          return json({ ok: true, mode: 'pipeline', mission: toPipelineStatus(pipeline) })
        }

        const nativeMission = getSwarmMission(missionId)
        if (nativeMission) {
          // For active native missions, check worker runtime.json for fresh
          // checkpoints that haven't been written back to the mission store yet.
          // This bridges the gap between fire-and-forget dispatch (waitForCheckpoint=false)
          // and the conductor UI polling for live status.
          if (nativeMission.state === 'executing') {
            for (const assignment of nativeMission.assignments) {
              if (assignment.state === 'dispatched' && assignment.workerId) {
                try {
                  const profilePath = getSwarmProfilePath(assignment.workerId)
                  // Check runtime.json first
                  const snapshot = readRuntimeCheckpointSnapshot(profilePath)
                  let checkpoint = checkpointFromRuntimeSnapshot(snapshot)

                  // Also check the worker's chat SQLite DB for checkpoint messages
                  // (tmux workers write checkpoints there)
                  if (!checkpoint || checkpoint.stateLabel === 'IN_PROGRESS') {
                    const chat = readWorkerMessages(profilePath, 50)
                    if (chat.ok) {
                      const msgCheckpoint = newestCheckpointFromMessages(chat.messages)
                      if (msgCheckpoint && msgCheckpoint.raw !== snapshot.checkpointRaw) {
                        checkpoint = msgCheckpoint
                      }
                    }
                  }

                  if (checkpoint && (checkpoint.stateLabel === 'DONE' || checkpoint.stateLabel === 'BLOCKED' || checkpoint.stateLabel === 'HANDOFF' || checkpoint.stateLabel === 'NEEDS_INPUT')) {
                    recordMissionCheckpoint({
                      missionId: nativeMission.id,
                      assignmentId: assignment.id,
                      workerId: assignment.workerId,
                      checkpoint,
                      source: 'conductor-poll',
                    })
                    // Phase R3: when a HermesTikTok agent finishes, persist its
                    // output to its memory namespace (once per assignment).
                    if (checkpoint.stateLabel === 'DONE') {
                      persistTikTokAgentCompletion({
                        missionId: nativeMission.id,
                        assignmentId: assignment.id,
                        workerId: assignment.workerId,
                        task: assignment.task,
                        checkpoint,
                      })
                    }
                  }
                } catch {
                  // runtime.json might not exist yet or be temporarily unreadable
                }
              }
            }
          }
          // Re-read the mission from the store so the response reflects any
          // checkpoints just synced via recordMissionCheckpoint above.
          const updatedNative = getSwarmMission(missionId) ?? nativeMission
          return json({ ok: true, mode: 'native-swarm', mission: toNativeConductorMissionRecord(updatedNative, lines) })
        }

        const capabilities = await ensureGatewayProbed()
        if (!capabilities.dashboard.available || !capabilities.conductor) {
          return json({ ok: false, error: 'Conductor mission not found in native swarm store and dashboard Conductor API is unavailable' }, { status: 404 })
        }

        const res = await dashboardFetch(`/api/conductor/missions/${encodeURIComponent(missionId)}?lines=${lines}`)
        const text = await res.text()
        let mission: Record<string, unknown> = {}
        try {
          mission = JSON.parse(text) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: text || `HTTP ${res.status}` }, { status: res.ok ? 502 : res.status })
        }
        if (!res.ok) {
          const error = typeof mission.detail === 'string' ? mission.detail : typeof mission.error === 'string' ? mission.error : `HTTP ${res.status}`
          return json({ ok: false, error }, { status: res.status })
        }
        return json({ ok: true, mission })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as ConductorSpawnBody

          // ── Phase R4: direct tool execution via the tool registry ────────
          if (body.toolCall && typeof body.toolCall === 'object') {
            const call = body.toolCall as { tool?: unknown; args?: unknown }
            const toolName = readOptionalString(call.tool)
            if (!toolName) return json({ ok: false, error: 'toolCall.tool required' }, { status: 400 })
            const args = call.args && typeof call.args === 'object' ? (call.args as Record<string, unknown>) : {}
            const execution = await executeTool(toolName, args)
            return json({ mode: 'tool', ...execution }, { status: execution.ok ? 200 : 400 })
          }

          const orchestratorModel = readOptionalString(body.orchestratorModel)
          const projectsDir = readOptionalString(body.projectsDir)
          const maxParallel = readMaxParallel(body.maxParallel)
          const supervised = body.supervised === true

          // ── Phase R2: optional single HermesTikTok agent spawn ───────────
          const agentId = readOptionalString(body.agentId)
          const agent = agentId ? getHermesTikTokAgent(agentId) : undefined
          if (agentId && !agent) {
            return json({ ok: false, error: `Unknown agentId: ${agentId}` }, { status: 400 })
          }

          const explicitGoal = readOptionalString(body.goal)
          const rawGoal = agent
            ? buildAgentGoal(agent, explicitGoal, {
                product: readOptionalString(body.product),
                category: readOptionalString(body.category),
                script: readOptionalString(body.script),
              })
            : explicitGoal
          const goalSanitization = sanitizeConductorMissionGoal(rawGoal)
          const goal = goalSanitization.goal
          // Agent presets carry their own worker model; an explicit body value wins.
          const workerModel = readOptionalString(body.workerModel) || (agent?.workerModel ?? '')
          if (!goal) {
            return json(
              {
                ok: false,
                error: goalSanitization.removedCloudflareErrorPage
                  ? 'mission goal only contained a Cloudflare 5xx HTML error page; enter the original mission goal and retry'
                  : 'goal required',
                warnings: goalSanitization.warnings,
              },
              { status: 400 },
            )
          }

          // ── Phase R5: ContentBoss runs the full autonomous pipeline ──────
          // Spawning content-boss kicks off the end-to-end orchestration
          // (TrendHunter → … → AnalyticsAgent) in the background; the UI polls
          // GET ?missionId=<id> for live status.
          if (agent && agent.id === 'content-boss') {
            const productRaw = readOptionalString(body.product)
            const product = productRaw || undefined
            const autonomous = !product
            const pipelineMissionId = `pipeline-${Date.now()}`
            startFullPipeline(pipelineMissionId, product)
            return json({
              ok: true,
              mode: 'pipeline',
              missionId: pipelineMissionId,
              product: product ?? 'autonomous',
              autonomous,
              agent: { id: agent.id, name: agent.name },
            })
          }

          // For agent spawns, initialise all 8 namespaces and resolve this
          // agent's namespace path so it can be injected into the prompt.
          let agentMeta: Record<string, unknown> | null = null
          let memoryNamespacePath = ''
          if (agent) {
            try {
              ensureTikTokMemoryNamespaces()
              memoryNamespacePath = ensureTikTokMemoryNamespace(agent.memoryNamespace)
            } catch (memErr) {
              memoryNamespacePath = tiktokMemoryNamespaceRoot(agent.memoryNamespace)
              console.warn('[conductor] tiktok memory init failed:', memErr instanceof Error ? memErr.message : String(memErr))
            }
            agentMeta = {
              id: agent.id,
              name: agent.name,
              role: agent.role,
              skill: agent.skill,
              workerModel: agent.workerModel,
              memoryNamespace: agent.memoryNamespace,
              memoryPath: memoryNamespacePath,
              toolsets: agent.toolsets,
            }
          }

          const prompt = agent
            ? buildAgentSpawnPrompt({
                agent,
                goal,
                skillBody: loadTikTokSkill(agent.skill),
                memoryNamespacePath,
                memoryContext: buildAgentMemoryContext(agent),
                toolDescriptions: getToolsForAgent(agent.id),
              })
            : buildOrchestratorPrompt(goal, loadDispatchSkill(), {
                orchestratorModel,
                workerModel,
                projectsDir,
                maxParallel,
                supervised,
              })
          const missionName = `conductor-${Date.now()}`
          const capabilities = await ensureGatewayProbed()

          if (!capabilities.dashboard.available || !capabilities.conductor) {
            const native = agent
              ? createNativeAgentMission({ agent, prompt, goal, missionName })
              : createNativeConductorMission({
                  goal,
                  missionName,
                  maxParallel,
                  supervised,
                })
            return json({
              ok: true,
              mode: 'native-swarm',
              modeOfficialOotb: true,
              modeNote: NATIVE_CONDUCTOR_MODE_NOTE,
              prompt: null,
              agent: agentMeta,
              missionId: native.missionId,
              sessionKey: null,
              sessionKeyPrefix: null,
              jobId: native.missionId,
              jobName: native.missionTitle,
              runId: null,
              warnings: goalSanitization.warnings,
              assignments: native.assignments,
              results: null,
            })
          }

          const result = await createDashboardConductorMission({ name: missionName, prompt })
          if (result.error) return json({ ok: false, error: result.error }, { status: 502 })
          const missionId = result.id ?? missionName
          return json({
            ok: true,
            mode: 'dashboard',
            prompt: null,
            agent: agentMeta,
            missionId,
            sessionKey: result.sessionKey ?? null,
            sessionKeyPrefix: (result as Record<string, unknown>).sessionKeyPrefix ?? null,
            jobId: missionId,
            jobName: result.name ?? missionName,
            runId: null,
            warnings: goalSanitization.warnings,
          })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
        }
      },
    },
  },
})
