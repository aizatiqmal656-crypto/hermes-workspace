/**
 * fal.ai Flux image tool (ImageGeneratorAgent) — Phase R4.
 *
 * generateSceneImage(prompt, sceneNumber) calls fal-ai/flux/dev, with
 * exponential backoff on rate limits, max 2 retries, and writes the result to
 * the images/ memory namespace. Never throws — returns a structured result.
 */

import { writeTikTokMemory } from '../swarm-memory'

export type FluxImageResult = {
  ok: boolean
  sceneNumber: number
  url?: string
  costRm: number
  attempts: number
  error?: string
}

const FLUX_ENDPOINT = 'https://fal.run/fal-ai/flux/dev'
const COST_PER_IMAGE_RM = 0.014
const MAX_RETRIES = 2

function getFalKey(): string | undefined {
  return process.env.VITE_FAL_API_KEY ?? process.env.FAL_API_KEY
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function generateSceneImage(
  prompt: string,
  sceneNumber: number,
): Promise<FluxImageResult> {
  const falKey = getFalKey()
  if (!falKey) {
    console.warn('[tool:fal_flux] VITE_FAL_API_KEY missing — cannot generate image')
    return { ok: false, sceneNumber, costRm: 0, attempts: 0, error: 'VITE_FAL_API_KEY not configured' }
  }

  let lastError = 'unknown error'
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)) // backoff 1s, 2s
    try {
      const t0 = Date.now()
      const res = await fetch(FLUX_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${falKey}` },
        body: JSON.stringify({
          prompt,
          image_size: 'portrait_4_3',
          num_inference_steps: 28,
          num_images: 1,
          enable_safety_checker: true,
        }),
      })

      // Retry on rate limit / server errors.
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`
        continue
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
        lastError = typeof err.detail === 'string' ? err.detail : `fal.ai HTTP ${res.status}`
        break // non-retryable (bad prompt, auth, payment)
      }

      const data = (await res.json()) as { images?: Array<{ url: string }> }
      const url = data.images?.[0]?.url
      if (!url) {
        lastError = 'fal.ai returned no image URL'
        continue
      }

      console.log(`[tool:fal_flux] scene ${sceneNumber} ready in ${Date.now() - t0}ms (attempt ${attempt + 1})`)
      writeTikTokMemory('image-generator', 'images', `scene-${sceneNumber}`, {
        sceneNumber,
        url,
        prompt: prompt.slice(0, 200),
        costRm: COST_PER_IMAGE_RM,
      })
      return { ok: true, sceneNumber, url, costRm: COST_PER_IMAGE_RM, attempts: attempt + 1 }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  console.error(`[tool:fal_flux] scene ${sceneNumber} failed: ${lastError}`)
  return { ok: false, sceneNumber, costRm: 0, attempts: MAX_RETRIES + 1, error: lastError }
}
