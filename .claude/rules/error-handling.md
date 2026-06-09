# Error Handling Rules

Every error in the HermesTikTok pipeline must be handled gracefully. Users should never see raw error objects, JavaScript stack traces, or confusing technical messages. Errors must be informative, actionable, and where possible shown in BM.

## Core Principle

**Every API call must have try/catch.** No exceptions. A single unhandled error should never crash the entire pipeline.

## Error Boundaries by Service

### fal.ai Image Generation

**On failure:** Show per-scene error message with Retry button. Do not block other scenes from generating.

```typescript
// Correct: per-scene error, pipeline continues
updateSceneImage(idx, {
  generating: false,
  error: err instanceof Error ? err.message : 'Gagal hasilkan imej — cuba lagi',
})
// Scene idx shows error, other scenes continue normally
```

**Do NOT:**
```typescript
// Wrong: global error that blocks entire pipeline
setGlobalError(err.message)  // Never block all 6 scenes for one failure
throw err                    // Never re-throw from scene generators
```

**User-facing error messages (BM-friendly):**

| Technical Error | User Message |
|----------------|-------------|
| `HTTP 401` | "API key tidak sah — semak VITE_FAL_API_KEY dalam .env" |
| `HTTP 402` | "Kredit fal.ai tidak mencukupi — tambah kredit di fal.ai/billing" |
| `HTTP 429` | "Terlalu banyak permintaan — cuba lagi dalam beberapa saat" |
| `HTTP 422` | "Prompt imej tidak sah — cuba ubah arahan" |
| `No image URL in response` | "fal.ai tidak pulangkan imej — cuba lagi" |
| Network error | "Tiada sambungan internet atau fal.ai tidak dapat dihubungi" |

### ElevenLabs Voice Generation

**On failure:** Fall back to displaying the combined voiceover script text so the user can still read/use it, even without audio.

```typescript
// Correct fallback behavior:
try {
  // ElevenLabs call
} catch (err) {
  setVoiceError(err instanceof Error ? err.message : 'Gagal hasilkan suara')
  // The voiceover TEXT is still visible in the UI
  // User can manually record or try again later
}
```

**User-facing error messages:**

| Technical Error | User Message |
|----------------|-------------|
| `HTTP 401` | "ElevenLabs API key tidak sah — semak VITE_ELEVENLABS_API_KEY" |
| `HTTP 422` | "Skrip terlalu panjang — ElevenLabs had 2,500 aksara" |
| `quota_exceeded` | "Kuota percuma ElevenLabs sudah habis — naik taraf atau tunggu bulan depan" |

### ffmpeg.wasm Failures

**On failure:** Do not show a crash screen. Offer individual video downloads as an alternative.

```typescript
try {
  // ffmpeg merge operation
} catch (err) {
  setMergeClipsError(
    err instanceof Error
      ? `Gabungan video gagal: ${err.message}`
      : 'Gagal gabungkan klip — muat turun secara berasingan di bawah'
  )
  // Individual video download buttons remain accessible in the Videos grid
}
```

**Common ffmpeg errors and fixes:**

| Error | Cause | Fix |
|-------|-------|-----|
| `SharedArrayBuffer is not defined` | Missing COOP/COEP headers | Add headers to vite.config.ts |
| `ffmpeg-core.wasm failed to load` | CDN unreachable or slow connection | Retry — unpkg.com may be temporarily slow |
| `Invalid data found when processing input` | Corrupted video URL or expired fal.ai CDN link | Re-generate the affected scene video |
| `Output file is empty` | Concat demuxer couldn't read a clip | Check all clip URLs are still accessible |

### Storyboard API Failure (`/api/generate-storyboard`)

**On failure:** Load `DEMO_STORYBOARD` from `tiktok-screen.tsx` as a fallback. The pipeline must continue.

```typescript
try {
  const res = await fetch('/api/generate-storyboard', { ... })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
  setStoryboard(data.scenes)
} catch (err) {
  // FALLBACK: use demo storyboard
  setStoryboard(DEMO_STORYBOARD)
  setStoryboardError(
    `${err instanceof Error ? err.message : 'Storyboard gagal dijanakan'} — menggunakan storyboard demo`
  )
}
```

This ensures the user always has 6 scenes to work with, even if Claude API is down.

### Conductor / Hermes Agent Failure

The conductor mission spawn is best-effort. If it fails, the pipeline still runs the visual animation and sets demo data.

```typescript
try {
  await fetch('/api/conductor-spawn', { ... })
} catch (err) {
  // Silent fallback — visual pipeline still runs
  console.warn('[TikTok Pipeline] conductor-spawn failed:', err)
  // Do NOT set any error state visible to user
}
```

## Error Display Components

All error states must include:
1. Clear error message (not a raw JavaScript error)
2. A **Retry** button that re-attempts the exact failed operation
3. Visible but not alarming styling (red-tinted background, not a modal)

```tsx
// Standard error display pattern:
{error && (
  <div
    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
    style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}
  >
    <span>{error}</span>
    <button
      onClick={retry}
      className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110"
      style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
    >
      Retry
    </button>
  </div>
)}
```

## What to Never Show Users

- ❌ Raw JavaScript error objects (`Error: ...` stack traces)
- ❌ Full API response bodies with error details
- ❌ HTTP status codes on their own (e.g., just "404")
- ❌ Internal variable names or state names
- ❌ fal.ai request IDs in error messages (save for console logs only)
- ❌ Crashing the entire component on any single error

## Logging Convention

Always log errors to console with context, even when showing user-friendly messages:

```typescript
// Always log the full error for debugging:
console.error('[Pipeline] Scene video failed', {
  sceneIdx: idx,
  error: err instanceof Error ? err.message : err,
  imageUrl: imageUrl?.slice(0, 60),
  timestamp: new Date().toISOString(),
})

// Then show friendly message to user:
updateSceneVideo(idx, { error: 'Video gagal — klik Retry untuk cuba lagi' })
```
