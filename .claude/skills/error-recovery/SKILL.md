# Skill: Error Recovery

## Trigger Conditions

This skill activates when:
- Any API call in the pipeline fails (HTTP 4xx/5xx)
- ffmpeg.wasm throws an error during merge
- A network timeout occurs during generation
- An unexpected JavaScript error occurs in `tiktok-screen.tsx`
- The user clicks a "Retry" button after a failure
- A generation produces no output (empty URL, null response)

## What This Skill Does

Provides a 3-stage error recovery flow:
1. **Log:** Record the error with full context
2. **Inform:** Show user-friendly message (in Malaysian-friendly English or BM)
3. **Recover:** Attempt auto-recovery or offer manual retry + fallback content

This skill ensures no error ever leaves the user in a broken, non-recoverable state.

## Stage 1: Error Logging

Every error must be logged with enough context to diagnose it later:

```typescript
// Standard error logging format:
console.error('[ErrorRecovery]', {
  service: 'fal.ai-kling',      // Which service failed
  sceneIdx: 2,                   // Which scene (if applicable)
  errorMessage: err.message,     // Human-readable error
  httpStatus: 422,               // HTTP status if available
  requestUrl: QUEUE_BASE,        // Which endpoint was called
  inputSize: imageUrl?.length,   // Input data size
  elapsedMs: performance.now() - startTime,
  timestamp: new Date().toISOString(),
  retryAttempt: retryCount,      // Which retry attempt this is
})
```

**Log format for cost tracking:**
```typescript
// Log API charges even for failed calls (some services charge for failed attempts):
console.warn('[Cost] Kling job failed after submission — RM0.65 may have been charged')
```

## Stage 2: User Notification

### Error Message Guidelines

Error messages must be:
1. **Specific** — tell the user exactly what failed, not just "something went wrong"
2. **Actionable** — tell them what to do next
3. **Not alarming** — use calm language, not panic-inducing

**Error message templates by scenario:**

```typescript
const ERROR_MESSAGES = {
  // fal.ai errors
  'fal-image-401': 'VITE_FAL_API_KEY tidak sah — semak .env dan restart pnpm dev',
  'fal-image-402': 'Kredit fal.ai habis — tambah kredit di fal.ai/billing',
  'fal-image-429': 'Terlalu banyak permintaan — tunggu 30 saat dan cuba lagi',
  'fal-image-timeout': 'fal.ai mengambil masa terlalu lama — cuba lagi',
  'fal-image-no-url': 'fal.ai tidak pulangkan URL imej — cuba lagi',
  
  'fal-video-401': 'VITE_FAL_API_KEY tidak sah untuk video generation',
  'fal-video-failed': 'Kling video gagal di server — klik Retry untuk hantar semula',
  'fal-video-timeout': 'Video mengambil masa >10 minit — klik Retry atau muat turun imej sahaja',
  
  // ElevenLabs errors
  'elevenlabs-401': 'VITE_ELEVENLABS_API_KEY tidak sah atau tamat tempoh',
  'elevenlabs-422': 'Skrip terlalu panjang untuk ElevenLabs — memotong teks',
  'elevenlabs-quota': 'Had percuma ElevenLabs sudah habis bulan ini — naik taraf atau tunggu',
  
  // ffmpeg errors
  'ffmpeg-sharedarraybuffer': 'Perlukan header COOP/COEP untuk ffmpeg — semak vite.config.ts',
  'ffmpeg-wasm-load': 'Gagal muatkan ffmpeg.wasm — semak sambungan internet',
  'ffmpeg-merge-empty': 'Fail video tidak sah atau pautan tamat tempoh — jana semula video',
  
  // Storyboard errors
  'storyboard-api-fail': 'Storyboard API gagal — menggunakan storyboard demo',
  'storyboard-parse-fail': 'Respons AI tidak dapat dibaca — menggunakan demo',
  
  // Generic
  'network-offline': 'Tiada sambungan internet — semak WiFi/data dan cuba lagi',
  'unknown': 'Ralat tidak dijangka — sila cuba lagi',
}
```

### Retry Button Display

Every error state must show a retry button:

```tsx
<div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
  style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}>
  <span>{friendlyErrorMessage}</span>
  <button onClick={retryAction}
    className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110"
    style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}>
    Retry
  </button>
</div>
```

## Stage 3: Recovery Actions

### fal.ai Image Failure → Auto-Retry Once

```typescript
// Auto-retry image generation once before showing error:
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const url = await callFluxAPI(prompt)
    return url  // success
  } catch (err) {
    if (attempt === 0) {
      console.warn(`[ErrorRecovery] Scene ${idx} image failed, retrying once...`)
      await sleep(2000)
      continue
    }
    // Second failure — show error to user
    updateSceneImage(idx, { error: getFriendlyMessage(err) })
    return
  }
}
```

### fal.ai Video Failure → Keep Other Scenes

If scene video fails, do not block other scenes. Each scene generates independently:

```typescript
// Each scene video has independent state
// A failure on scene 3 does not affect scenes 1, 2, 4, 5, 6
// User can retry individual scenes with per-scene Retry button
```

### ElevenLabs Failure → Text Fallback

If voice generation fails, the voiceover script text is still displayed in the UI so the user has the content even without audio:

```typescript
// Voiceover section shows script text regardless of audio generation success
// User can manually record the voiceover or use another TTS tool
const fallbackMessage = 'Suara tidak dapat dijana — teks skrip tersedia di atas untuk rakaman manual'
setVoiceError(fallbackMessage)
// voiceover text still visible in the Voiceover section card
```

### ffmpeg Failure → Individual Downloads

If merge fails, offer individual video downloads as an alternative:

```typescript
// When merge fails, show download buttons for each individual scene video
// User can manually combine using a video editor
{mergeClipsError && sceneVideos.some(v => v.url) && (
  <div>
    <p>Muat turun klip secara berasingan dan gabungkan menggunakan CapCut atau Video Editor:</p>
    {sceneVideos.filter(v => v.url).map((v, idx) => (
      <a key={idx} href={v.url!} download={`scene-${idx+1}.mp4`}>
        Muat Turun Adegan {idx + 1}
      </a>
    ))}
  </div>
)}
```

### Storyboard API Failure → Demo Fallback

Storyboard failure auto-loads `DEMO_STORYBOARD` — the pipeline never truly stops for this error. This is already implemented in `generateStoryboard()`.

## Recovery Status Tracking

Track recovery attempts to avoid infinite retry loops:

```typescript
const MAX_AUTO_RETRIES = 2

// In state:
const [retryCount, setRetryCount] = useState<Record<string, number>>({})

// Before retrying:
const currentCount = retryCount[`scene-${idx}-image`] ?? 0
if (currentCount >= MAX_AUTO_RETRIES) {
  // Stop auto-retrying, show manual retry button only
  updateSceneImage(idx, { error: 'Gagal selepas 2 cubaan auto — klik Retry untuk cuba manual' })
  return
}
setRetryCount(prev => ({ ...prev, [`scene-${idx}-image`]: currentCount + 1 }))
```

## Post-Recovery Logging

After successful recovery from an error, log the recovery:

```typescript
console.log('[ErrorRecovery] Recovered', {
  service: 'fal.ai-flux',
  sceneIdx: idx,
  attemptNumber: retryCount + 1,
  recoveryMethod: 'auto-retry',
  successAfterMs: performance.now() - startTime,
})
```
