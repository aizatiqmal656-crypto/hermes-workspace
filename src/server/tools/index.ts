/**
 * HermesTikTok tool registry — Phase R4.
 *
 * Maps tool names to executable functions and the agent that owns them.
 * conductor-spawn imports `executeTool` to resolve + run a requested tool (with
 * timing + cost logging) and `getToolsForAgent` to surface an agent's tools in
 * its system prompt.
 */

import { searchTrendingProducts } from './web-search'
import { generateSceneImage } from './fal-flux'
import { generateSceneVideo } from './fal-kling'
import { generateBMVoiceover } from './elevenlabs-voice'
import { mergeVideoClips } from './ffmpeg-merge'
import {
  generateWeeklyReport,
  identifyWinningPatterns,
  readPipelinePerformance,
  writeWinningPatterns,
} from './analytics'
import { checkKKMCompliance } from './compliance-check'

// Re-export every tool function for direct use / testing.
export { searchTrendingProducts } from './web-search'
export { generateSceneImage } from './fal-flux'
export { generateSceneVideo } from './fal-kling'
export { generateBMVoiceover } from './elevenlabs-voice'
export { mergeVideoClips } from './ffmpeg-merge'
export { generateWeeklyReport, identifyWinningPatterns, readPipelinePerformance, writeWinningPatterns } from './analytics'
export { checkKKMCompliance } from './compliance-check'

export type ToolArgs = Record<string, unknown>

export type ToolDefinition = {
  name: string
  agent: string
  description: string
  /** Static cost estimate (RM); a tool result may override with its own costRm. */
  costRm: number
  run: (args: ToolArgs) => Promise<unknown> | unknown
}

export type ToolExecutionResult = {
  ok: boolean
  tool: string
  ms: number
  costRm: number
  result?: unknown
  error?: string
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function strArray(value: unknown): Array<string> {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** The registry — keyed by tool name. */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  web_search: {
    name: 'web_search',
    agent: 'trend-hunter',
    description: 'searchTrendingProducts(category, market="Malaysia") → top 5 trending affiliate products (name, price_rm, trend_score, viral_reason in BM).',
    costRm: 0.1,
    run: (args) => searchTrendingProducts(str(args.category, 'health & beauty'), str(args.market, 'Malaysia')),
  },
  fal_flux: {
    name: 'fal_flux',
    agent: 'image-generator',
    description: 'generateSceneImage(prompt, sceneNumber) → fal.ai Flux portrait image URL for one scene.',
    costRm: 0.014,
    run: (args) => generateSceneImage(str(args.prompt), num(args.sceneNumber, 1)),
  },
  fal_kling: {
    name: 'fal_kling',
    agent: 'video-generator',
    description: 'generateSceneVideo(imageUrl, motionPrompt, sceneNumber) → fal.ai Kling 5s 9:16 video URL for one scene.',
    costRm: 0.65,
    run: (args) => generateSceneVideo(str(args.imageUrl), str(args.motionPrompt), num(args.sceneNumber, 1)),
  },
  elevenlabs: {
    name: 'elevenlabs',
    agent: 'video-generator',
    description: 'generateBMVoiceover(script) → Bahasa Malaysia voiceover (base64 audio) using the Adam voice; falls back to script text if quota is exhausted.',
    costRm: 0.05,
    run: (args) => generateBMVoiceover(str(args.script)),
  },
  ffmpeg_merge: {
    name: 'ffmpeg_merge',
    agent: 'video-generator',
    description: 'mergeVideoClips(videoUrls[], audioUrl) → merges the 6 clips in sequence and muxes the voiceover into a final MP4 path.',
    costRm: 0,
    run: (args) => mergeVideoClips(strArray(args.videoUrls), str(args.audioUrl)),
  },
  analytics: {
    name: 'analytics',
    agent: 'analytics-agent',
    description: 'analytics(op) where op ∈ {read, patterns, report}: read pipeline_runs, identify+save winning patterns, or generate a weekly report.',
    costRm: 0,
    run: (args) => {
      const op = str(args.op, 'read')
      if (op === 'patterns') {
        const patterns = identifyWinningPatterns()
        writeWinningPatterns(patterns)
        return patterns
      }
      if (op === 'report') return generateWeeklyReport(num(args.periodDays, 7))
      return readPipelinePerformance()
    },
  },
  compliance_check: {
    name: 'compliance_check',
    agent: 'compliance-agent',
    description: 'checkKKMCompliance(script, productName) → APPROVED or REJECTED with reason + fix against KKM Malaysia + TikTok guidelines.',
    costRm: 0,
    run: (args) => checkKKMCompliance(str(args.script), str(args.productName, 'product')),
  },
}

/** Tools available to a given agent (for prompt injection). */
export function getToolsForAgent(agentId: string): Array<{ name: string; description: string }> {
  return Object.values(TOOL_REGISTRY)
    .filter((t) => t.agent === agentId)
    .map((t) => ({ name: t.name, description: t.description }))
}

/** Resolve and execute a tool by name, logging execution time + cost. */
export async function executeTool(toolName: string, args: ToolArgs = {}): Promise<ToolExecutionResult> {
  const def = TOOL_REGISTRY[toolName]
  if (!def) {
    console.warn(`[tool] unknown tool requested: ${toolName}`)
    return { ok: false, tool: toolName, ms: 0, costRm: 0, error: `unknown tool: ${toolName}` }
  }
  const t0 = Date.now()
  try {
    const result = await def.run(args)
    const ms = Date.now() - t0
    const resultCost = result && typeof result === 'object' && 'costRm' in result ? num((result as { costRm?: unknown }).costRm) : null
    const costRm = resultCost ?? def.costRm
    console.log(`[tool] ${toolName} (${def.agent}) executed in ${ms}ms · cost RM${costRm.toFixed(3)}`)
    return { ok: true, tool: toolName, ms, costRm, result }
  } catch (err) {
    const ms = Date.now() - t0
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[tool] ${toolName} failed in ${ms}ms: ${error}`)
    return { ok: false, tool: toolName, ms, costRm: 0, error }
  }
}
