/**
 * ElevenLabs voice tool (VideoGeneratorAgent) — Phase R4.
 *
 * generateBMVoiceover(script) generates a Bahasa Malaysia voiceover with the
 * Adam voice + eleven_multilingual_v2. It checks remaining character quota
 * first and falls back to returning the script text (with a warning) when the
 * quota is exhausted or no key is configured. Audio is returned base64-encoded.
 */

import { appendTikTokMemoryEvent } from '../swarm-memory'

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam
const MODEL_ID = 'eleven_multilingual_v2'
const MAX_CHARS = 2500
const COST_RM = 0.05

export type VoiceResult = {
  ok: boolean
  source: 'elevenlabs' | 'fallback'
  audioBase64?: string
  mimeType?: string
  chars: number
  costRm: number
  scriptText?: string
  warning?: string
  error?: string
}

function getElevenKey(): string | undefined {
  return process.env.VITE_ELEVENLABS_API_KEY
}

/** Returns remaining characters on the subscription, or null if unknown. */
async function remainingQuota(key: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': key },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { character_count?: number; character_limit?: number }
    if (typeof data.character_count === 'number' && typeof data.character_limit === 'number') {
      return Math.max(0, data.character_limit - data.character_count)
    }
    return null
  } catch {
    return null
  }
}

export async function generateBMVoiceover(script: string): Promise<VoiceResult> {
  const text = script.trim()
  const chars = text.length
  const key = getElevenKey()

  if (!key) {
    console.warn('[tool:elevenlabs] VITE_ELEVENLABS_API_KEY missing — returning script text only')
    return {
      ok: false,
      source: 'fallback',
      chars,
      costRm: 0,
      scriptText: text,
      warning: 'ElevenLabs key not configured — record manually from the script text.',
    }
  }

  const truncated = chars > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text

  // Quota check before spending.
  const remaining = await remainingQuota(key)
  if (remaining !== null && remaining < truncated.length) {
    console.warn(`[tool:elevenlabs] quota low (${remaining} left, need ${truncated.length}) — fallback to text`)
    appendTikTokMemoryEvent('video-generator', 'videos', { type: 'voiceover-skipped', reason: 'quota', remaining })
    return {
      ok: false,
      source: 'fallback',
      chars,
      costRm: 0,
      scriptText: text,
      warning: `ElevenLabs quota exhausted (${remaining} chars left) — using script text only.`,
    }
  }

  try {
    const t0 = Date.now()
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: truncated,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(errText.slice(0, 160) || `ElevenLabs HTTP ${res.status}`)
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    console.log(`[tool:elevenlabs] voiceover ${truncated.length} chars in ${Date.now() - t0}ms`)
    appendTikTokMemoryEvent('video-generator', 'videos', { type: 'voiceover', chars: truncated.length, costRm: COST_RM })
    return {
      ok: true,
      source: 'elevenlabs',
      audioBase64: bytes.toString('base64'),
      mimeType: 'audio/mpeg',
      chars: truncated.length,
      costRm: COST_RM,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[tool:elevenlabs] generation failed:', error)
    return { ok: false, source: 'fallback', chars, costRm: 0, scriptText: text, error }
  }
}
