# /project:fix-bug

Auto-diagnose and fix common TikTok pipeline errors.

## Usage

```
/project:fix-bug [optional: describe the error]
```

Example: `/project:fix-bug "ffmpeg merge fails with SharedArrayBuffer error"`

## Diagnostic Steps

### 1. Check Browser Console Errors

Ask the user to open DevTools (F12) → Console and report any red errors. Common errors and fixes:

| Error | Cause | Fix |
|-------|-------|-----|
| `SharedArrayBuffer is not defined` | COOP/COEP headers missing for ffmpeg.wasm | Add headers in `vite.config.ts`: `'Cross-Origin-Opener-Policy': 'same-origin'` and `'Cross-Origin-Embedder-Policy': 'require-corp'` |
| `Failed to fetch` on fal.ai | VITE_FAL_API_KEY missing or invalid | Check `.env`, restart `pnpm dev` |
| `401 Unauthorized` on ElevenLabs | VITE_ELEVENLABS_API_KEY missing or expired | Check `.env`, verify key at elevenlabs.io |
| `Cannot read properties of null` | State race condition | Check if `generateStoryboard` is called before `script` is set |
| `ffmpeg is not loaded` | ffmpegRef.current is null when merge called | Ensure `ff.load()` completes before `ff.exec()` |
| `Module not found: @ffmpeg/ffmpeg` | Package not installed | Run `pnpm install` |

### 2. Check API Responses

For each failing API, check the network tab in DevTools:

**fal.ai Image (Flux Dev):**
```
POST https://fal.run/fal-ai/flux/dev
Expected: 200 with { images: [{ url: "..." }] }
Common 4xx: 401 (bad key), 422 (bad prompt), 429 (rate limit)
```

**fal.ai Video (Kling):**
```
POST https://queue.fal.run/fal-ai/kling-video/v1.6/pro/image-to-video
Expected: 200 with { request_id: "..." }
Then GET .../requests/{id}/status until COMPLETED
Common issues: request_id missing, status stuck at IN_QUEUE for >10min
```

**ElevenLabs:**
```
POST https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB
Expected: 200 with audio/mpeg binary
Common 4xx: 401 (bad key), 422 (text too long — max 2500 chars free tier)
```

**Storyboard API:**
```
POST /api/generate-storyboard
Expected: 200 with { scenes: [...] }
Common issues: ANTHROPIC_API_KEY not set server-side, Claude returns non-JSON
```

### 3. Check Environment Variables

```bash
# In project root, check .env exists and has required keys
cat .env | grep -E "VITE_FAL_API_KEY|VITE_ELEVENLABS_API_KEY|ANTHROPIC_API_KEY"
```

If running in dev, restart `pnpm dev` after any `.env` change — Vite does not hot-reload env changes.

If `VITE_*` variables show as `undefined` in browser, confirm:
1. Variable name starts with `VITE_`
2. `pnpm dev` was restarted after adding to `.env`
3. No typos in variable name

### 4. Check ffmpeg.wasm Load Status

In `tiktok-screen.tsx`, `ffmpegRef` is a singleton. If `ffmpegRef.current` is not null but merge still fails, the WASM may be in a bad state. Fix:

```typescript
// Force reload ffmpeg
ffmpegRef.current = null
// Then retry merge — it will re-initialise
```

The WASM core is loaded from `https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm`. If unpkg.com is slow, the load step may time out. Check network tab for failed fetch to unpkg.com.

### 5. Check fal.ai Credit Balance

Log in to fal.ai dashboard at `https://fal.ai` → Billing. If credits are exhausted:
- Flux Dev requests will return `402 Payment Required`
- Kling requests will fail at queue submission

**Fix:** Top up fal.ai credits. Minimum RM5 recommended for testing a full pipeline run.

### 6. Check TypeScript/Build Errors

```bash
npx tsc --noEmit 2>&1 | grep "src/screens/tiktok\|src/routes/api/generate-storyboard"
```

Only check for errors in TikTok pipeline files. Pre-existing errors in other files (e2e tests, playground, etc.) can be ignored.

### 7. Common Fixes Applied

After diagnosis, apply the appropriate fix:

**Fix A: Missing env var**
```bash
echo "VITE_FAL_API_KEY=your_key_here" >> .env
# Then restart dev server
```

**Fix B: ffmpeg COOP headers (for SharedArrayBuffer)**
Open `vite.config.ts` and add to the server plugins config:
```typescript
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  }
}
```

**Fix C: Scene video stuck in queue**
Use per-scene Retry button in the Videos grid. The old request ID is saved in `sceneVideos[idx].requestId`.

**Fix D: Storyboard returns non-JSON**
In `generate-storyboard.ts`, the JSON stripping regex handles markdown code blocks. If Claude returns extra text, increase `max_tokens` or tighten the system prompt to say "Return ONLY a JSON array, nothing else."

### 8. Report Fix

Output:
- Error identified: [description]
- Root cause: [explanation]
- Fix applied: [what was changed]
- How to prevent: [recommendation]
