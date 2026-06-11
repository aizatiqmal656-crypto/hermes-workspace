/**
 * HermesTikTok autonomous pipeline engine — Phase R5.
 *
 * Two pieces:
 *  1. runAgentWithTools() — the autonomous tool loop. An agent (Claude Haiku)
 *     can emit `TOOL_CALL: <name> {json}`; the runtime parses it, executes the
 *     tool via the registry, feeds back `TOOL_RESULT:` and loops (max 5 rounds)
 *     until the agent answers without a tool call.
 *  2. runFullPipeline() — ContentBoss orchestration that drives all 7 specialist
 *     stages in sequence, with compliance retry and per-stage retry-once-then-
 *     skip error recovery, writing every output to memory and tracking live
 *     status in an in-memory mission store the UI polls.
 */

import { executeTool, getToolsForAgent } from './tools'
import type { ToolExecutionResult } from './tools'
import { getHermesTikTokAgent } from '../screens/agents/agent-presets'
import {
  logPipelineRun,
  readAllNamespaceMemory,
  writeTikTokMemory,
} from './swarm-memory'

// ---------------------------------------------------------------------------
// Mission store (Task 4) — what the UI polls
// ---------------------------------------------------------------------------

export type StageState = 'idle' | 'running' | 'done' | 'error' | 'skipped'

export type PipelineAgentState = {
  id: string
  name: string
  status: StageState
  output: string
  error: string | null
  costRm: number
}

export type PipelineOutputs = {
  product: { name: string; price?: string; trendScore?: number; viralReason?: string } | null
  script: { hook: string; body: string; cta: string } | null
  compliance: { decision: string; reason: string } | null
  prompts: Array<{ sceneNumber: number; angle?: string; image_prompt: string; motion_prompt: string; voiceover_text: string }>
  images: Array<string>
  videos: Array<string>
  voiceWarning: string | null
  finalVideo: string | null
}

export type PipelineMission = {
  id: string
  product: string
  status: 'running' | 'completed' | 'failed'
  activeAgent: string | null
  completedAgents: Array<string>
  agents: Record<string, PipelineAgentState>
  outputs: PipelineOutputs
  costRm: number
  progressPct: number
  finalVideoUrl: string | null
  error: string | null
  startedAt: number
  updatedAt: number
  log: Array<string>
}

// Pipeline agent order (the 7 specialists ContentBoss orchestrates).
const STAGE_ORDER: Array<{ id: string; name: string }> = [
  { id: 'trend-hunter', name: 'TrendHunter' },
  { id: 'copywriter-agent', name: 'CopywriterAgent' },
  { id: 'compliance-agent', name: 'ComplianceAgent' },
  { id: 'prompt-engineer', name: 'PromptEngineerAgent' },
  { id: 'image-generator', name: 'ImageGeneratorAgent' },
  { id: 'video-generator', name: 'VideoGeneratorAgent' },
  { id: 'analytics-agent', name: 'AnalyticsAgent' },
]

const pipelineMissions = new Map<string, PipelineMission>()

export function isPipelineMission(id: string): boolean {
  return pipelineMissions.has(id)
}

export function getPipelineMission(id: string): PipelineMission | undefined {
  return pipelineMissions.get(id)
}

function newMission(id: string, product: string): PipelineMission {
  const agents: Record<string, PipelineAgentState> = {}
  for (const s of STAGE_ORDER) {
    agents[s.id] = { id: s.id, name: s.name, status: 'idle', output: '', error: null, costRm: 0 }
  }
  const mission: PipelineMission = {
    id,
    product,
    status: 'running',
    activeAgent: null,
    completedAgents: [],
    agents,
    outputs: { product: null, script: null, compliance: null, prompts: [], images: [], videos: [], voiceWarning: null, finalVideo: null },
    costRm: 0,
    progressPct: 0,
    finalVideoUrl: null,
    error: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    log: [],
  }
  pipelineMissions.set(id, mission)
  return mission
}

function touch(m: PipelineMission): void {
  m.updatedAt = Date.now()
  m.progressPct = Math.round((m.completedAgents.length / STAGE_ORDER.length) * 100)
}

function logLine(m: PipelineMission, line: string): void {
  m.log.push(`[${new Date().toISOString()}] ${line}`)
  if (m.log.length > 200) m.log = m.log.slice(-200)
  console.log(`[pipeline ${m.id}] ${line}`)
}

// ---------------------------------------------------------------------------
// Autonomous tool loop (Task 1)
// ---------------------------------------------------------------------------

const MAX_TOOL_ROUNDS = 5

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type AgentRunResult = {
  finalText: string
  rounds: number
  toolResults: Array<ToolExecutionResult>
  costRm: number
}

function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY
}

async function callHaiku(system: string, messages: Array<ChatMessage>, maxTokens = 1500): Promise<string | null> {
  const key = getAnthropicKey()
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { content?: Array<{ type: string; text: string }> }
    return (data.content?.[0]?.text ?? '').trim()
  } catch {
    return null
  }
}

/** Parse the first `TOOL_CALL: <name> {json}` line in the text, if any. */
export function parseToolCall(text: string): { tool: string; args: Record<string, unknown> } | null {
  const match = text.match(/TOOL_CALL:\s*([a-z0-9_]+)\s*(\{[\s\S]*?\})?/i)
  if (!match) return null
  const tool = match[1]
  let args: Record<string, unknown> = {}
  if (match[2]) {
    try {
      const parsed = JSON.parse(match[2])
      if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
    } catch {
      // malformed JSON — run with empty args
    }
  }
  return { tool, args }
}

/**
 * Run an agent autonomously with tool access. The agent may call tools via
 * `TOOL_CALL:`; results are fed back until it answers without one (max 5 rounds).
 * Each tool call logs agent, tool, time, and cost.
 */
export async function runAgentWithTools(
  agentId: string,
  goal: string,
  context = '',
  onLog?: (line: string) => void,
): Promise<AgentRunResult> {
  const agent = getHermesTikTokAgent(agentId)
  const tools = getToolsForAgent(agentId)
  const toolResults: Array<ToolExecutionResult> = []
  let costRm = 0

  const system = [
    `You are ${agent?.name ?? agentId}, ${agent?.role ?? 'a HermesTikTok agent'}.`,
    tools.length > 0
      ? `You can call tools by emitting a line exactly: TOOL_CALL: <tool_name> {"arg":"value"}\nAvailable tools:\n${tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}\nAfter a tool runs you receive TOOL_RESULT and continue. When finished, answer WITHOUT any TOOL_CALL line.`
      : 'Answer directly and concisely.',
  ].join('\n\n')

  const messages: Array<ChatMessage> = [{ role: 'user', content: context ? `${goal}\n\n${context}` : goal }]
  let finalText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await callHaiku(system, messages)
    if (reply === null) {
      // No LLM available — bail out of the loop (callers have deterministic fallbacks).
      finalText = ''
      break
    }
    finalText = reply
    const call = parseToolCall(reply)
    if (!call) break

    const exec = await executeTool(call.tool, call.args)
    toolResults.push(exec)
    costRm += exec.costRm
    const line = `${agentId} → tool ${call.tool} (${exec.ms}ms, RM${exec.costRm.toFixed(3)}) ${exec.ok ? 'ok' : 'FAIL'}`
    onLog?.(line)
    console.log(`[pipeline-tool] ${line}`)

    messages.push({ role: 'assistant', content: reply })
    messages.push({
      role: 'user',
      content: `TOOL_RESULT: ${call.tool}\n${JSON.stringify(exec.result ?? { error: exec.error }).slice(0, 4000)}\nContinue your task using the above tool result.`,
    })
  }

  return { finalText, rounds: messages.filter((m) => m.role === 'assistant').length, toolResults, costRm }
}

// ---------------------------------------------------------------------------
// ContentBoss orchestration (Task 2 + error recovery Task 5)
// ---------------------------------------------------------------------------

function firstJson<T>(text: string): T | null {
  if (!text) return null
  const fence = text.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/, '')
  for (const candidate of [fence, text]) {
    const start = candidate.search(/[[{]/)
    if (start < 0) continue
    try {
      return JSON.parse(candidate.slice(start)) as T
    } catch {
      // try next
    }
  }
  return null
}

/**
 * Run a single stage with retry-once-then-skip recovery (Task 5). Never throws —
 * a failed stage is marked 'error'/'skipped' and the pipeline continues.
 */
async function runStage(
  m: PipelineMission,
  agentId: string,
  fn: () => Promise<{ ok: boolean; output: string; costRm?: number }>,
): Promise<boolean> {
  const a = m.agents[agentId]
  m.activeAgent = agentId
  a.status = 'running'
  a.error = null
  touch(m)
  logLine(m, `${a.name} running`)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await fn()
      a.costRm += result.costRm ?? 0
      m.costRm += result.costRm ?? 0
      if (result.ok) {
        a.status = 'done'
        a.output = result.output
        if (!m.completedAgents.includes(agentId)) m.completedAgents.push(agentId)
        touch(m)
        logLine(m, `${a.name} done${result.costRm ? ` (RM${(result.costRm).toFixed(2)})` : ''}`)
        return true
      }
      a.error = result.output
      logLine(m, `${a.name} attempt ${attempt + 1} failed: ${result.output}`)
    } catch (err) {
      a.error = err instanceof Error ? err.message : String(err)
      logLine(m, `${a.name} attempt ${attempt + 1} threw: ${a.error}`)
    }
  }

  // Both attempts failed → skip and continue (never crash the pipeline).
  a.status = 'skipped'
  if (!m.completedAgents.includes(agentId)) m.completedAgents.push(agentId)
  touch(m)
  logLine(m, `${a.name} skipped after retry`)
  return false
}

/** The full autonomous pipeline. Runs in the background; updates the mission. */
export function startFullPipeline(missionId: string, product: string): PipelineMission {
  const m = newMission(missionId, product)
  void runFullPipeline(m).catch((err) => {
    m.status = 'failed'
    m.error = err instanceof Error ? err.message : String(err)
    m.activeAgent = null
    touch(m)
    logLine(m, `pipeline crashed: ${m.error}`)
  })
  return m
}

async function runFullPipeline(m: PipelineMission): Promise<void> {
  const product = m.product

  // ── Stage 1: TrendHunter — web_search ──────────────────────────────────
  await runStage(m, 'trend-hunter', async () => {
    const exec = await executeTool('web_search', { category: product, market: 'Malaysia' })
    const products = (exec.result as { products?: Array<{ name: string; price_rm?: string; trend_score?: number; viral_reason?: string }> } | undefined)?.products ?? []
    const pick = products.find((p) => p.name.toLowerCase().includes(product.toLowerCase().split(' ')[0] ?? '')) ?? products[0]
    const chosen = pick ?? { name: product, price_rm: undefined, trend_score: undefined, viral_reason: undefined }
    m.outputs.product = { name: chosen.name, price: chosen.price_rm, trendScore: chosen.trend_score, viralReason: chosen.viral_reason }
    writeTikTokMemory('trend-hunter', 'products', `pick-${Date.now()}`, m.outputs.product)
    return { ok: exec.ok, output: `Picked ${chosen.name} (score ${chosen.trend_score ?? '?'})`, costRm: exec.costRm }
  })

  const productName = m.outputs.product?.name ?? product

  // ── Stage 2: CopywriterAgent — Haiku writes BM script ──────────────────
  const writeScript = async (extra = ''): Promise<{ ok: boolean; output: string; costRm?: number }> => {
    const run = await runAgentWithTools(
      'copywriter-agent',
      `Write a viral Bahasa Malaysia TikTok script for "${productName}". Return ONLY JSON: {"hook": "...", "body": "...", "cta": "..."} — pure BM with Malaysian slang, RM prices.${extra ? `\n${extra}` : ''}`,
      '',
      (l) => logLine(m, l),
    )
    const parsed = firstJson<{ hook?: string; body?: string; cta?: string }>(run.finalText)
    if (parsed?.hook && parsed.body && parsed.cta) {
      m.outputs.script = { hook: parsed.hook, body: parsed.body, cta: parsed.cta }
      writeTikTokMemory('copywriter-agent', 'scripts', `script-${Date.now()}`, m.outputs.script)
      return { ok: true, output: 'Script written', costRm: run.costRm }
    }
    return { ok: false, output: 'copywriter did not return valid script JSON', costRm: run.costRm }
  }
  await runStage(m, 'copywriter-agent', () => writeScript())

  // ── Stage 3: ComplianceAgent — compliance_check (with copywriter retry) ─
  await runStage(m, 'compliance-agent', async () => {
    const scriptText = m.outputs.script ? `${m.outputs.script.hook} ${m.outputs.script.body} ${m.outputs.script.cta}` : ''
    let exec = await executeTool('compliance_check', { script: scriptText, productName })
    let decision = exec.result as { decision?: string; reason?: string; fix?: string } | undefined
    let cost = exec.costRm

    // REJECTED → send back to CopywriterAgent once to fix, then re-check.
    if (decision?.decision === 'REJECTED' && m.outputs.script) {
      logLine(m, `compliance REJECTED (${decision.reason}) — sending back to CopywriterAgent`)
      const fixed = await writeScript(`The previous script was REJECTED: ${decision.reason}. Fix: ${decision.fix ?? 'remove the flagged claim'}. Rewrite compliantly.`)
      cost += fixed.costRm ?? 0
      const newText = m.outputs.script ? `${m.outputs.script.hook} ${m.outputs.script.body} ${m.outputs.script.cta}` : scriptText
      exec = await executeTool('compliance_check', { script: newText, productName })
      decision = exec.result as { decision?: string; reason?: string } | undefined
      cost += exec.costRm
    }

    m.outputs.compliance = { decision: decision?.decision ?? 'UNKNOWN', reason: decision?.reason ?? '' }
    return { ok: exec.ok, output: `${m.outputs.compliance.decision}`, costRm: cost }
  })

  // ── Stage 4: PromptEngineerAgent — Haiku generates 6 scenes ────────────
  await runStage(m, 'prompt-engineer', async () => {
    const s = m.outputs.script
    const run = await runAgentWithTools(
      'prompt-engineer',
      `For product "${productName}", generate EXACTLY 6 TikTok scenes. Return ONLY a JSON array of 6 objects: {"sceneNumber":1-6,"angle":"...","image_prompt":"detailed English Flux prompt","motion_prompt":"short Kling motion","voiceover_text":"1-2 sentences Bahasa Malaysia"}.${s ? `\nScript hook: ${s.hook}\nBody: ${s.body}\nCTA: ${s.cta}` : ''}`,
      '',
      (l) => logLine(m, l),
    )
    const arr = firstJson<Array<Record<string, unknown>>>(run.finalText)
    if (Array.isArray(arr) && arr.length > 0) {
      m.outputs.prompts = arr.slice(0, 6).map((row, i) => ({
        sceneNumber: Number(row.sceneNumber ?? i + 1) || i + 1,
        angle: typeof row.angle === 'string' ? row.angle : undefined,
        image_prompt: String(row.image_prompt ?? ''),
        motion_prompt: String(row.motion_prompt ?? 'slow zoom'),
        voiceover_text: String(row.voiceover_text ?? ''),
      }))
      writeTikTokMemory('prompt-engineer', 'prompts', `prompts-${Date.now()}`, m.outputs.prompts)
      return { ok: m.outputs.prompts.length === 6, output: `${m.outputs.prompts.length} scene prompts`, costRm: run.costRm }
    }
    return { ok: false, output: 'prompt-engineer did not return 6 scenes', costRm: run.costRm }
  })

  // ── Stage 5: ImageGeneratorAgent — fal_flux × 6 ────────────────────────
  await runStage(m, 'image-generator', async () => {
    const prompts = m.outputs.prompts
    if (prompts.length === 0) return { ok: false, output: 'no prompts to render' }
    let cost = 0
    const urls: Array<string> = []
    for (const scene of prompts) {
      const exec = await executeTool('fal_flux', { prompt: scene.image_prompt, sceneNumber: scene.sceneNumber })
      cost += exec.costRm
      const url = (exec.result as { url?: string } | undefined)?.url
      if (url) urls.push(url)
      m.outputs.images = [...urls]
      touch(m)
    }
    return { ok: urls.length > 0, output: `${urls.length}/${prompts.length} images`, costRm: cost }
  })

  // ── Stage 6: VideoGeneratorAgent — fal_kling × 6 + elevenlabs + merge ──
  await runStage(m, 'video-generator', async () => {
    const prompts = m.outputs.prompts
    const images = m.outputs.images
    if (images.length === 0) return { ok: false, output: 'no images to animate' }
    let cost = 0
    const videoUrls: Array<string> = []
    for (let i = 0; i < images.length; i++) {
      const motion = prompts[i]?.motion_prompt ?? 'slow zoom'
      const exec = await executeTool('fal_kling', { imageUrl: images[i], motionPrompt: motion, sceneNumber: i + 1 })
      cost += exec.costRm
      const url = (exec.result as { url?: string } | undefined)?.url
      if (url) videoUrls.push(url)
      m.outputs.videos = [...videoUrls]
      touch(m)
    }

    // Voiceover
    const voiceText = prompts.map((p) => p.voiceover_text).filter(Boolean).join(' ')
    const voice = await executeTool('elevenlabs', { script: voiceText })
    cost += voice.costRm
    const voiceResult = voice.result as { ok?: boolean; warning?: string; audioBase64?: string } | undefined
    if (voiceResult?.warning) m.outputs.voiceWarning = voiceResult.warning

    // Merge (server-side ffmpeg; falls back gracefully if not installed)
    if (videoUrls.length > 0) {
      const merge = await executeTool('ffmpeg_merge', { videoUrls, audioUrl: '' })
      const mergePath = (merge.result as { outputPath?: string } | undefined)?.outputPath
      if (mergePath) {
        m.outputs.finalVideo = mergePath
        m.finalVideoUrl = mergePath
      }
    }
    return { ok: videoUrls.length > 0, output: `${videoUrls.length} clips${m.outputs.finalVideo ? ' + merged' : ''}`, costRm: cost }
  })

  // ── Stage 7: AnalyticsAgent — patterns + logPipelineRun ────────────────
  await runStage(m, 'analytics-agent', async () => {
    const patterns = await executeTool('analytics', { op: 'patterns' })
    logPipelineRun({
      product: productName,
      category: m.outputs.product?.viralReason ? 'beauty' : 'general',
      script: m.outputs.script,
      compliance: m.outputs.compliance?.decision,
      imagesReady: m.outputs.images.length,
      videosReady: m.outputs.videos.length,
      costRm: Number(m.costRm.toFixed(2)),
      success: m.outputs.videos.length > 0,
      finalVideo: m.outputs.finalVideo,
      missionId: m.id,
    })
    return { ok: patterns.ok, output: 'patterns updated + run logged', costRm: patterns.costRm }
  })

  // ── Finalise ───────────────────────────────────────────────────────────
  m.activeAgent = null
  m.status = m.outputs.videos.length > 0 || m.outputs.script ? 'completed' : 'failed'
  m.progressPct = 100
  touch(m)
  logLine(m, `pipeline ${m.status} · RM${m.costRm.toFixed(2)} · ${m.outputs.images.length} imgs · ${m.outputs.videos.length} vids`)
}
