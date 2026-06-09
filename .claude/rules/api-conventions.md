# API Conventions

Rules for how to call each external API in the HermesTikTok pipeline. Follow these conventions exactly — they encode lessons from past debugging and cost incidents.

## fal.ai — Image Generation (Flux Dev)

**Model:** `fal-ai/flux/dev`
**Endpoint:** `https://fal.run/fal-ai/flux/dev` (synchronous)
**Auth:** `Authorization: Key ${VITE_FAL_API_KEY}`

**Required error fallback:** Every fal.ai call must catch errors and update per-scene error state, not throw globally.

```typescript
// Correct fal.ai image call pattern:
const res = await fetch('https://fal.run/fal-ai/flux/dev', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Key ${falKey}`,
  },
  body: JSON.stringify({
    prompt: scene.image_prompt,
    image_size: 'portrait_4_3',    // 768×1024 — vertical portrait for TikTok
    num_inference_steps: 28,       // Default for flux/dev — do not reduce below 20
    num_images: 1,
    enable_safety_checker: true,   // Always enabled — TikTok compliance
  }),
})

// Always check non-200 before parsing:
if (!res.ok) {
  const err = await res.json().catch(() => ({})) as Record<string, unknown>
  throw new Error(
    typeof err.detail === 'string' ? err.detail :
    typeof err.error === 'string' ? err.error :
    `fal.ai HTTP ${res.status}`
  )
}

const data = await res.json() as { images?: Array<{ url: string }> }
const url = data.images?.[0]?.url
if (!url) throw new Error('fal.ai returned no image URL')
```

**Do NOT use `fal.subscribe()` from the fal SDK** — we use raw fetch to keep the bundle lean and avoid the SDK dependency. The direct HTTP API gives identical results with full control over error handling.

**Image size options for TikTok:**
- `portrait_4_3` → 768×1024 (3:4, recommended — matches TikTok feed crop area)
- `portrait_16_9` → 576×1024 (9:16, true TikTok ratio but narrower)

## fal.ai — Video Generation (Kling Pro)

**Model:** `fal-ai/kling-video/v1.6/pro/image-to-video`
**Submit endpoint:** `https://queue.fal.run/{MODEL}` (async queue)
**Status endpoint:** `https://queue.fal.run/{MODEL}/requests/{id}/status`
**Result endpoint:** `https://queue.fal.run/{MODEL}/requests/{id}`

**Required pattern — always use queue, not direct:**
Kling video generation takes 2–4 minutes. Always use the queue API with polling, never assume synchronous response.

```typescript
const MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'
const QUEUE_BASE = `https://queue.fal.run/${MODEL}`

// 1. Submit to queue
const submitRes = await fetch(QUEUE_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Key ${falKey}` },
  body: JSON.stringify({
    image_url: imageUrl,           // Must be publicly accessible URL
    prompt: scene.action,          // Scene action description
    duration: '5',                 // '5' or '10' — always string, not number
    aspect_ratio: '9:16',          // TikTok vertical
  }),
})
const { request_id: requestId } = await submitRes.json() as { request_id: string }

// 2. Poll every 5 seconds, max 120 polls (10 minutes)
for (let i = 0; i < 120; i++) {
  await new Promise(r => setTimeout(r, 5000))
  const { status } = await fetch(`${QUEUE_BASE}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${falKey}` },
  }).then(r => r.json()) as { status: string }

  if (status === 'COMPLETED') {
    const result = await fetch(`${QUEUE_BASE}/requests/${requestId}`, {
      headers: { Authorization: `Key ${falKey}` },
    }).then(r => r.json()) as { video?: { url: string } }
    return result.video?.url
  }
  if (status === 'FAILED') throw new Error('Kling generation failed')
}
throw new Error('Timed out after 10 minutes')
```

**Duration must be a string:** `'5'` not `5`. Kling API rejects number types for duration.

## ElevenLabs — Text to Speech

**Model:** `eleven_multilingual_v2` (for BM) — or `eleven_turbo_v2_5` (faster, still multilingual)
**Voice ID:** `pNInz6obpgDQGcFmaJgB` (Adam — deep male voice, works well for BM)
**Endpoint:** `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
**Output format:** `audio/mpeg` (MP3)

```typescript
const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB`,
  {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsKey,   // NOT 'Authorization: Bearer'
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: combinedBmScript,
      model_id: 'eleven_turbo_v2_5',   // Multilingual model for BM
      voice_settings: {
        stability: 0.5,                // 0.5 = balanced stability
        similarity_boost: 0.75,        // 0.75 = high similarity to voice
        style: 0.3,                    // Slight expressiveness for BM energy
        use_speaker_boost: true,
      },
    }),
  }
)

// Response is raw audio bytes, not JSON:
const audioBytes = new Uint8Array(await res.arrayBuffer())
```

**Character limits:**
- Free tier: 10,000 chars/month
- Starter ($5/mo): 30,000 chars/month
- Count: `text.length` before sending — warn if > 2,000 chars per voiceover

**Max text length per request:** 2,500 characters (ElevenLabs limit). If the combined voiceover script exceeds this, truncate from the end with an ellipsis or split into multiple requests.

## OpenRouter — LLM Calls

**Default model:** `anthropic/claude-haiku-4-5` (fast, cheap, good for structured output)
**Endpoint:** `https://openrouter.ai/api/v1/chat/completions`
**Auth:** `Authorization: Bearer ${OPENROUTER_API_KEY}`

```typescript
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://aizatiqmal656-crypto.github.io/hermes-workspace/',
    'X-Title': 'HermesTikTok Pipeline',
  },
  body: JSON.stringify({
    model: 'anthropic/claude-haiku-4-5',
    max_tokens: 1000,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  }),
})
```

**OpenRouter vs Direct Anthropic:**
- Use `ANTHROPIC_API_KEY` + direct API for `generate-storyboard.ts` (already implemented)
- Use `OPENROUTER_API_KEY` for any new agent tasks or experimental prompts
- Never use OpenRouter key on the browser side (no `VITE_OPENROUTER_API_KEY`)

## General API Rules

1. **Always check API key exists before calling.** Return early with a user-facing error if missing.

```typescript
const falKey = import.meta.env.VITE_FAL_API_KEY as string | undefined
if (!falKey) {
  updateSceneImage(idx, { error: 'VITE_FAL_API_KEY not configured — check .env' })
  return
}
```

2. **Log API response time for cost monitoring.** Use `console.log` with timing:

```typescript
const t0 = performance.now()
// ... API call ...
console.log(`[API] fal.ai Flux Dev completed in ${Math.round(performance.now() - t0)}ms`)
```

3. **Never retry automatically more than twice.** After 2 failures, show error to user with a manual Retry button. Automatic retries can multiply costs rapidly.

4. **All API keys in `.env`, never hardcoded.** Even test/dev keys must use environment variables.
