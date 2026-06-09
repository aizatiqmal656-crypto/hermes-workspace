# Cost Limits & Budget Rules

These rules prevent runaway API spend. The HermesTikTok pipeline uses paid APIs and must be cost-conscious. All Claude Code actions that involve API calls must respect these limits.

## Per-Run Limits

| Service | Max Units | Max Cost (RM) | Rule |
|---------|-----------|---------------|------|
| fal.ai Flux (images) | 6 images | RM 0.09 | Never exceed 6 images per pipeline run |
| fal.ai Kling (videos) | 6 videos | RM 3.90 | Never exceed 6 videos per pipeline run |
| ElevenLabs (voice) | 1 audio | RM 0.05 | Never generate more than 1 voiceover per run |
| Claude Haiku (storyboard) | 1 call | RM 0.10 | 1 storyboard generation per run |
| **Total per run** | | **RM 4.14** | Hard limit — do not exceed |

**Code enforcement:**
```typescript
// Hard limit: only generate 6 scenes max
const MAX_SCENES = 6
const scenesToGenerate = storyboard.slice(0, MAX_SCENES)
```

## Retry Limits

**Never auto-retry any API call more than 2 times.** After 2 automatic retries, stop and show a manual Retry button to the user.

```typescript
// Retry counter pattern:
let retryCount = 0
const MAX_RETRIES = 2

while (retryCount <= MAX_RETRIES) {
  try {
    await apiCall()
    break  // success — exit loop
  } catch (err) {
    retryCount++
    if (retryCount > MAX_RETRIES) {
      setError('Gagal selepas 2 cubaan — klik Retry untuk cuba manual')
      return
    }
    await sleep(1000 * retryCount)  // backoff: 1s, 2s
  }
}
```

**Why:** Each retry attempt costs money. Kling videos especially — a failed job that retried twice auto = RM1.30 wasted on failed calls.

## Monthly Budget Warning

When the pipeline completes, log the estimated cost and warn if projected monthly spend exceeds RM 200:

```typescript
// After pipeline completes:
const runCost = 4.11  // RM per run
const runsPerMonth = 30  // estimate
const monthlyProjection = runCost * runsPerMonth

console.log(`[Cost] Pipeline run cost: RM${runCost.toFixed(2)}`)
console.log(`[Cost] Monthly projection (${runsPerMonth} runs): RM${monthlyProjection.toFixed(2)}`)

if (monthlyProjection > 200) {
  console.warn(`[Cost] ⚠️ Projected monthly spend RM${monthlyProjection.toFixed(2)} exceeds RM200 budget`)
  // Optionally show a toast notification
}
```

## ElevenLabs Free Tier Management

ElevenLabs free tier allows 10,000 characters/month.

**Character counting before each voice generation:**
```typescript
const voiceText = storyboard.map(s => s.voiceover_text).join(' ')
const charCount = voiceText.length

console.log(`[ElevenLabs] Text length: ${charCount} chars`)

if (charCount > 2500) {
  console.warn('[ElevenLabs] Text exceeds 2500 chars — truncating to avoid API rejection')
  // Truncate at word boundary
}

// Monthly tracking (rough estimate):
const usedThisMonth = parseInt(localStorage.getItem('el_chars_this_month') ?? '0')
const newTotal = usedThisMonth + charCount
localStorage.setItem('el_chars_this_month', String(newTotal))

if (newTotal > 9000) {
  console.warn(`[ElevenLabs] ⚠️ Approaching 10k free tier limit: ${newTotal}/10000 chars used this month`)
}
```

## No Background Auto-Generation

Never trigger API calls automatically without user action. All generation must be initiated by an explicit button click.

**Never do:**
```typescript
// Bad: auto-trigger on state change
useEffect(() => {
  if (storyboard && !sceneImages.some(s => s.url)) {
    generateAllSceneImages()  // Auto-generating without user consent = unexpected costs
  }
}, [storyboard])
```

**Always require explicit button click** to start each stage:
- "Generate All Images" button
- "Generate All Videos" button
- "Merge All Clips" button
- "Generate BM Voiceover" button
- "Merge Audio + Video" button

## Cost Logging Format

Use this format in all console.log cost entries for easy grep/filtering:

```
[Cost] {service} {action}: RM{amount} | Total today: RM{total}
```

Examples:
```
[Cost] fal.ai Flux Dev image 1/6: RM0.014
[Cost] fal.ai Flux Dev image 2/6: RM0.014
[Cost] fal.ai Kling video 1/6: RM0.65 | ETA: 3min
[Cost] ElevenLabs BM voice (487 chars): RM0.005
[Cost] Pipeline total: RM4.11
```

## Budget Reset

Monthly cost tracking resets on the 1st of each month. Use localStorage for lightweight tracking:

```typescript
const resetKey = new Date().toISOString().slice(0, 7)  // "2026-06"
if (localStorage.getItem('cost_month') !== resetKey) {
  localStorage.setItem('cost_month', resetKey)
  localStorage.setItem('el_chars_this_month', '0')
  localStorage.setItem('total_runs_this_month', '0')
}
```
