/**
 * fal.ai Kling video tool (VideoGeneratorAgent) — Phase R4.
 *
 * generateSceneVideo(imageUrl, motionPrompt, sceneNumber) submits to the Kling
 * v1.6 Pro image-to-video queue, polls until complete (max 5 minutes), retries
 * submission up to 2 times, and writes the result to the videos/ namespace.
 */

import { writeTikTokMemory } from '../swarm-memory'

export type KlingVideoResult = {
  ok: boolean
  sceneNumber: number
  url?: string
  costRm: number
  attempts: number
  error?: string
}

const MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'
const QUEUE_BASE = `https://queue.fal.run/${MODEL}`
const COST_PER_VIDEO_RM = 0.65
const MAX_RETRIES = 2
const POLL_INTERVAL_MS = 5000
const MAX_POLLS = 60 // 60 × 5s = 5 minutes

function getFalKey(): string | undefined {
  return process.env.VITE_FAL_API_KEY ?? process.env.FAL_API_KEY
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Submit one job and poll to completion. Returns the video URL or throws. */
async function runKlingJob(falKey: string, imageUrl: string, motionPrompt: string): Promise<string> {
  const submitRes = await fetch(QUEUE_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${falKey}` },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt: motionPrompt,
      duration: '5', // string — Kling rejects number
      aspect_ratio: '9:16',
    }),
  })
  if (!submitRes.ok) {
    const err = (await submitRes.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(typeof err.detail === 'string' ? err.detail : `Kling submit HTTP ${submitRes.status}`)
  }
  const { request_id: requestId } = (await submitRes.json()) as { request_id?: string }
  if (!requestId) throw new Error('Kling submit returned no request_id')

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS)
    const statusRes = await fetch(`${QUEUE_BASE}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${falKey}` },
    })
    const { status } = (await statusRes.json().catch(() => ({}))) as { status?: string }
    if (status === 'COMPLETED') {
      const resultRes = await fetch(`${QUEUE_BASE}/requests/${requestId}`, {
        headers: { Authorization: `Key ${falKey}` },
      })
      if (!resultRes.ok) throw new Error(`Kling result HTTP ${resultRes.status}`)
      const result = (await resultRes.json()) as { video?: { url: string } }
      const url = result.video?.url
      if (!url) throw new Error('Kling result had no video URL')
      return url
    }
    if (status === 'FAILED') throw new Error('Kling generation failed on server')
  }
  throw new Error('Kling timed out after 5 minutes')
}

export async function generateSceneVideo(
  imageUrl: string,
  motionPrompt: string,
  sceneNumber: number,
): Promise<KlingVideoResult> {
  const falKey = getFalKey()
  if (!falKey) {
    console.warn('[tool:fal_kling] VITE_FAL_API_KEY missing — cannot generate video')
    return { ok: false, sceneNumber, costRm: 0, attempts: 0, error: 'VITE_FAL_API_KEY not configured' }
  }
  if (!imageUrl) {
    return { ok: false, sceneNumber, costRm: 0, attempts: 0, error: 'imageUrl required' }
  }

  let lastError = 'unknown error'
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1))
    try {
      const t0 = Date.now()
      const url = await runKlingJob(falKey, imageUrl, motionPrompt)
      console.log(`[tool:fal_kling] scene ${sceneNumber} ready in ${Math.round((Date.now() - t0) / 1000)}s (attempt ${attempt + 1})`)
      writeTikTokMemory('video-generator', 'videos', `scene-${sceneNumber}`, {
        sceneNumber,
        url,
        motionPrompt: motionPrompt.slice(0, 200),
        costRm: COST_PER_VIDEO_RM,
      })
      return { ok: true, sceneNumber, url, costRm: COST_PER_VIDEO_RM, attempts: attempt + 1 }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.warn(`[tool:fal_kling] scene ${sceneNumber} attempt ${attempt + 1} failed: ${lastError}`)
    }
  }

  console.error(`[tool:fal_kling] scene ${sceneNumber} failed after retries: ${lastError}`)
  return { ok: false, sceneNumber, costRm: 0, attempts: MAX_RETRIES + 1, error: lastError }
}
