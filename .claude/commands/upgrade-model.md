# /project:upgrade-model

Swap the image or video generation model to a newer fal.ai model.

## Usage

```
/project:upgrade-model [image|video] [model_id]
```

Examples:
- `/project:upgrade-model image fal-ai/flux-pro/v1.1`
- `/project:upgrade-model video fal-ai/kling-video/v2/pro/image-to-video`
- `/project:upgrade-model image` (interactive — shows available models)

## Steps

### 1. Show Current Models

Open `src/screens/tiktok/tiktok-screen.tsx` and find the current model references:

**Current image model:**
```typescript
// Search for: fal.run/fal-ai/
// Line: const res = await fetch('https://fal.run/fal-ai/flux/dev', {
```

**Current video model:**
```typescript
// Search for: MODEL = 'fal-ai/kling
// Line: const MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'
```

Display the current model IDs clearly before making any changes.

### 2. Show Available fal.ai Models

**Image generation models (ranked by quality/cost):**

| Model ID | Quality | Speed | Cost | Notes |
|----------|---------|-------|------|-------|
| `fal-ai/flux/schnell` | Good | Fast (~3s) | Cheapest | Best for prototyping |
| `fal-ai/flux/dev` | High | Medium (~20s) | Low | **Current default** |
| `fal-ai/flux-pro/v1.1` | Very High | Slow (~30s) | Medium | Best quality |
| `fal-ai/flux-pro/v1.1-ultra` | Ultra | Slow (~45s) | High | Max quality, 2048px |
| `fal-ai/stable-diffusion-3-5-large` | High | Medium | Medium | Good for products |
| `fal-ai/recraft-v3` | High | Medium | Medium | Good for graphics |

**Video generation models (ranked by quality/cost):**

| Model ID | Quality | Duration | Cost | Notes |
|----------|---------|----------|------|-------|
| `fal-ai/kling-video/v1.6/pro/image-to-video` | High | 5–10s | ~RM0.65 | **Current default** |
| `fal-ai/kling-video/v2/pro/image-to-video` | Very High | 5–10s | ~RM0.80 | Newer, smoother |
| `fal-ai/hailuo-video/i2v` | High | 6s | ~RM0.50 | Fast queue |
| `fal-ai/wan/v2.1/pro/image-to-video` | High | 5s | ~RM0.60 | Good motion |
| `fal-ai/mochi-v1` | Good | 5s | ~RM0.30 | Budget option |
| `fal-ai/seedance-2-0-lite-image-to-video` | Medium | 5s | ~RM0.20 | Ultra-budget |

### 3. Confirm Model Selection

If the user didn't specify a model, display the table above and ask which model to use.

Display the cost impact:
```
Current: fal-ai/flux/dev (~RM0.01/image × 6 = RM0.06 per run)
New:     fal-ai/flux-pro/v1.1 (~RM0.05/image × 6 = RM0.30 per run)
Cost increase: RM0.24 per pipeline run (+400%)
```

Ask for confirmation before making the change.

### 4. Apply the Change in tiktok-screen.tsx

**For image model change**, update the fetch URL in `generateSingleSceneImage()`:

```typescript
// Before:
const res = await fetch('https://fal.run/fal-ai/flux/dev', {

// After (example: flux-pro):
const res = await fetch('https://fal.run/fal-ai/flux-pro/v1.1', {
```

Also update `num_inference_steps` if needed (flux-pro uses different defaults):
- `flux/dev`: 28 steps
- `flux-pro/v1.1`: no manual steps (model handles it)
- `flux/schnell`: 4 steps

**For video model change**, update the `MODEL` constant in `generateSingleSceneVideo()`:

```typescript
// Before:
const MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'

// After (example: kling v2):
const MODEL = 'fal-ai/kling-video/v2/pro/image-to-video'
```

Check if the new model has the same input/output schema. Kling v1.x and v2.x use identical API shapes. Other models (Wan, Hailuo) may have different field names.

### 5. Update CLAUDE.md Cost Reference

After changing the model, update the cost reference table in `CLAUDE.md`:

```markdown
| fal.ai | 6× images | ~RM0.XX | [new model name] |
| fal.ai | 6× videos | ~RM0.XX | [new model name] |
```

### 6. Test the Change

Run a quick test with just 1 scene to verify the new model works before committing:
1. Generate storyboard
2. Generate only Scene 1 image (click individual Redo)
3. Generate only Scene 1 video (click individual Redo)
4. Confirm output quality is acceptable

### 7. Commit the Change

```bash
git add src/screens/tiktok/tiktok-screen.tsx CLAUDE.md
git commit -m "feat: upgrade [image/video] model to [new-model-id]"
```
