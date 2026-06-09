# /project:run-pipeline

Run the full TikTok content pipeline end-to-end for a given product, validating every stage.

## Usage

```
/project:run-pipeline [product_name]
```

Example: `/project:run-pipeline "LED Face Mask"`

## Steps

### 1. Validate Environment Variables

Check all required API keys are present in `.env`:

```bash
# Check .env for required keys
VITE_FAL_API_KEY          # fal.ai — images + videos
VITE_ELEVENLABS_API_KEY   # ElevenLabs — voiceover
ANTHROPIC_API_KEY         # Claude — storyboard generation
HERMES_API_URL            # Hermes gateway URL
HERMES_API_TOKEN          # Hermes auth token
```

If any key is missing, output which key is absent and stop. Do not proceed with incomplete config.

### 2. Open and Inspect Key File

Open `src/screens/tiktok/tiktok-screen.tsx` and verify:
- `DEMO_STORYBOARD` is defined with 6 scenes
- `generateStoryboard()` calls `/api/generate-storyboard`
- `generateAllSceneImages()` uses `fal-ai/flux/dev`
- `generateAllSceneVideos()` uses `fal-ai/kling-video/v1.6/pro/image-to-video`
- `generateVoice()` calls ElevenLabs with `VITE_ELEVENLABS_API_KEY`
- `mergeAllClips()` uses ffmpeg.wasm concat demuxer
- `mergeFinalVideo()` merges voice + merged clips

### 3. Verify API Endpoints

Check `src/routes/api/generate-storyboard.ts`:
- POST handler exists
- Uses `ANTHROPIC_API_KEY` (server-side, not VITE_)
- Returns `{ scenes: Scene[] }` with 6 scenes
- Has error fallback and JSON parse safety

Check `src/routes/api/conductor-spawn.ts`:
- POST and GET handlers exist
- Handles both Conductor API and native swarm fallback

### 4. Run Pipeline with Test Product

Navigate to `http://localhost:3000/tiktok` and run through the full pipeline:

1. Click **▶ Run Daily Pipeline** — verify all 5 agents animate and complete
2. Confirm `product` state populates with product data
3. Confirm `script` state populates with hook/body/CTA
4. Click **🎞️ Generate Storyboard →** — verify 6 scenes appear
5. Click **🎨 Generate All Images** — verify all 6 images generate (check fal.ai console for errors)
6. Click **🎬 Generate All Videos** — monitor per-scene progress (allow 3–4 min)
7. Click **⚡ Merge All Clips** — verify ffmpeg.wasm loads and concat succeeds
8. Click **🎙️ Generate BM Voiceover** — verify ElevenLabs returns audio
9. Click **⚡ Merge Audio + Video** — verify final MP4 is produced
10. Verify **Download Final MP4** button works

### 5. Check Progress Tracker

Verify all 7 steps in the progress tracker turn green:
`Script ✓ → Storyboard ✓ → Images (6/6) ✓ → Videos (6/6) ✓ → Merge ✓ → Voice ✓ → Done ✓`

### 6. Report

Output a summary:
- Which steps passed
- Any API errors encountered
- Estimated total cost for this run (see CLAUDE.md cost reference)
- Any suggestions for improvement
