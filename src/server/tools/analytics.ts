/**
 * Analytics tool (AnalyticsAgent) — Phase R4.
 *
 * Reads pipeline_runs/ memory, mines winning patterns, persists them to
 * winning_patterns/, and produces a weekly performance report. This is the
 * feedback loop that makes every future run smarter.
 */

import { readAllNamespaceMemory, writeTikTokMemory } from '../swarm-memory'
import type { TikTokMemoryEntry } from '../swarm-memory'

export type PipelineRunData = {
  product?: string
  category?: string
  hook_style?: string
  costRm?: number
  success?: boolean
  imagesReady?: number
  videosReady?: number
  [key: string]: unknown
}

export type WinningPatterns = {
  bestCategories: Array<{ category: string; runs: number }>
  bestProducts: Array<{ product: string; runs: number }>
  totalRuns: number
  successRuns: number
  avgCostRm: number
  updated: string
}

export type WeeklyReport = {
  periodDays: number
  totalRuns: number
  successRuns: number
  totalSpendRm: number
  topProduct: string | null
  topCategory: string | null
  recommendation: string
  generatedAt: string
}

/** Read all pipeline runs (newest first). */
export function readPipelinePerformance(): Array<TikTokMemoryEntry> {
  const runs = readAllNamespaceMemory('pipeline_runs')
  console.log(`[tool:analytics] readPipelinePerformance → ${runs.length} runs`)
  return runs
}

function tally(values: Array<string>): Array<{ key: string; count: number }> {
  const map = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

/** Analyse runs and compute winning patterns. */
export function identifyWinningPatterns(): WinningPatterns {
  const runs = readPipelinePerformance()
  const data = runs.map((r) => (r.data ?? {}) as PipelineRunData)
  const categories = tally(data.map((d) => String(d.category ?? '')).filter(Boolean))
  const products = tally(data.map((d) => String(d.product ?? '')).filter(Boolean))
  const costs = data.map((d) => Number(d.costRm ?? 0)).filter((n) => n > 0)
  const successRuns = data.filter((d) => d.success === true).length
  const avgCostRm = costs.length > 0 ? Number((costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(2)) : 0

  const patterns: WinningPatterns = {
    bestCategories: categories.slice(0, 5).map((c) => ({ category: c.key, runs: c.count })),
    bestProducts: products.slice(0, 5).map((p) => ({ product: p.key, runs: p.count })),
    totalRuns: runs.length,
    successRuns,
    avgCostRm,
    updated: new Date().toISOString(),
  }
  console.log(`[tool:analytics] identifyWinningPatterns → ${patterns.totalRuns} runs, top category ${patterns.bestCategories[0]?.category ?? 'n/a'}`)
  return patterns
}

/** Persist winning patterns (updated in place under the 'latest' key). */
export function writeWinningPatterns(patterns: WinningPatterns): TikTokMemoryEntry | null {
  const entry = writeTikTokMemory('analytics-agent', 'winning_patterns', 'latest', patterns)
  console.log('[tool:analytics] writeWinningPatterns saved')
  return entry
}

/** Build a weekly performance summary from the last N days of runs. */
export function generateWeeklyReport(periodDays = 7): WeeklyReport {
  const runs = readPipelinePerformance()
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000
  const recent = runs.filter((r) => {
    const t = Date.parse(r.timestamp || '')
    return Number.isFinite(t) ? t >= cutoff : true
  })
  const data = recent.map((r) => (r.data ?? {}) as PipelineRunData)
  const totalSpendRm = Number(data.reduce((sum, d) => sum + (Number(d.costRm) || 0), 0).toFixed(2))
  const successRuns = data.filter((d) => d.success === true).length
  const topProduct = tally(data.map((d) => String(d.product ?? '')).filter(Boolean))[0]?.key ?? null
  const topCategory = tally(data.map((d) => String(d.category ?? '')).filter(Boolean))[0]?.key ?? null

  const recommendation =
    recent.length === 0
      ? 'No runs yet this period — run the pipeline to start building performance data.'
      : `Double down on ${topCategory ?? 'your best category'}; ${topProduct ?? 'your top product'} performed best. Keep per-run cost near RM${(totalSpendRm / Math.max(1, recent.length)).toFixed(2)}.`

  const report: WeeklyReport = {
    periodDays,
    totalRuns: recent.length,
    successRuns,
    totalSpendRm,
    topProduct,
    topCategory,
    recommendation,
    generatedAt: new Date().toISOString(),
  }
  console.log(`[tool:analytics] generateWeeklyReport → ${report.totalRuns} runs, RM${report.totalSpendRm}`)
  return report
}
