# Skill: Cost Calculator

## Trigger Conditions

This skill activates when:
- A pipeline run completes (all 6 videos generated)
- The user runs `/project:check-costs`
- The user asks about API costs or monthly spend
- Monthly API spend approaches RM200 budget limit
- A generation fails and may have incurred partial charges

## What This Skill Does

Calculates the real-time API cost of each pipeline run, tracks cumulative monthly spend, compares against the RM200 monthly budget, and surfaces warnings when approaching limits. All costs are displayed in Malaysian Ringgit (RM).

## Cost Rates (Current)

All rates are approximate and based on pay-as-you-go pricing converted to RM at USD 1 = RM 4.7:

```typescript
const COST_RATES_RM = {
  // fal.ai
  fluxSchnellPerImage: 0.007,       // ~USD 0.0015 per image
  fluxDevPerImage: 0.014,           // ~USD 0.003 per image
  fluxProPerImage: 0.047,           // ~USD 0.010 per image
  
  klingV16ProPer5sVideo: 0.650,     // ~USD 0.138 per 5s video
  klingV16StandardPer5sVideo: 0.330, // ~USD 0.070 per 5s video
  klingV2ProPer5sVideo: 0.800,      // ~USD 0.170 per 5s video
  
  // ElevenLabs
  elevenLabsPerChar_FreeTier: 0.000,           // 10k chars/month free
  elevenLabsPerChar_StarterPlan: 0.000350,     // RM0.00035 per char
  elevenLabsPerChar_CreatorPlan: 0.000117,     // RM0.000117 per char (better rate)
  
  // Anthropic
  claudeHaikuPerInputToken: 0.000001175,       // $0.25/1M input tokens
  claudeHaikuPerOutputToken: 0.000005875,      // $1.25/1M output tokens
  
  // ffmpeg.wasm
  ffmpegWasm: 0.000,                // Browser-based, FREE
}
```

## Calculation Functions

### Per-Run Cost Calculator

```typescript
interface PipelineRunCost {
  storyboardGeneration: number    // Claude Haiku call
  imageGeneration: number         // 6× Flux images
  videoGeneration: number         // 6× Kling videos
  voiceGeneration: number         // ElevenLabs TTS
  mergeOperation: number          // ffmpeg.wasm (always 0)
  total: number
  breakdown: Record<string, number>
}

function calculateRunCost(
  imageModel: 'flux-schnell' | 'flux-dev' | 'flux-pro' = 'flux-dev',
  videoModel: 'kling-v1.6-pro' | 'kling-v1.6-standard' | 'kling-v2-pro' = 'kling-v1.6-pro',
  numImages: number = 6,
  numVideos: number = 6,
  voiceChars: number = 500,
  elevenLabsPlan: 'free' | 'starter' | 'creator' = 'free'
): PipelineRunCost {
  
  const storyboard = (800 * 0.000001175) + (200 * 0.000005875)  // ~800 input, ~200 output tokens
  
  const imageRate = {
    'flux-schnell': 0.007,
    'flux-dev': 0.014,
    'flux-pro': 0.047,
  }[imageModel]
  
  const videoRate = {
    'kling-v1.6-pro': 0.650,
    'kling-v1.6-standard': 0.330,
    'kling-v2-pro': 0.800,
  }[videoModel]
  
  const voiceRate = {
    'free': 0,
    'starter': 0.000350,
    'creator': 0.000117,
  }[elevenLabsPlan]
  
  const images = numImages * imageRate
  const videos = numVideos * videoRate
  const voice = voiceChars * voiceRate
  
  return {
    storyboardGeneration: storyboard,
    imageGeneration: images,
    videoGeneration: videos,
    voiceGeneration: voice,
    mergeOperation: 0,
    total: storyboard + images + videos + voice,
    breakdown: {
      'Claude Haiku (storyboard)': storyboard,
      `fal.ai ${imageModel} × ${numImages}`: images,
      `fal.ai Kling ${videoModel} × ${numVideos}`: videos,
      `ElevenLabs ${elevenLabsPlan} (${voiceChars} chars)`: voice,
      'ffmpeg.wasm (merge)': 0,
    }
  }
}
```

## Monthly Tracking (localStorage)

```typescript
const STORAGE_KEYS = {
  monthKey: 'hermes_cost_month',           // "2026-06" format
  totalRunsRM: 'hermes_total_cost_rm',     // Running total in RM
  runsCount: 'hermes_runs_count',          // Number of pipeline runs
  elCharsUsed: 'hermes_el_chars_used',     // ElevenLabs char count
  lastRunCost: 'hermes_last_run_cost_rm',  // Most recent run cost
}

function trackRunCost(cost: PipelineRunCost): void {
  const currentMonth = new Date().toISOString().slice(0, 7)  // "2026-06"
  
  // Reset if new month
  if (localStorage.getItem(STORAGE_KEYS.monthKey) !== currentMonth) {
    localStorage.setItem(STORAGE_KEYS.monthKey, currentMonth)
    localStorage.setItem(STORAGE_KEYS.totalRunsRM, '0')
    localStorage.setItem(STORAGE_KEYS.runsCount, '0')
    localStorage.setItem(STORAGE_KEYS.elCharsUsed, '0')
  }
  
  // Accumulate
  const prev = parseFloat(localStorage.getItem(STORAGE_KEYS.totalRunsRM) ?? '0')
  const newTotal = prev + cost.total
  localStorage.setItem(STORAGE_KEYS.totalRunsRM, newTotal.toFixed(4))
  
  const prevRuns = parseInt(localStorage.getItem(STORAGE_KEYS.runsCount) ?? '0')
  localStorage.setItem(STORAGE_KEYS.runsCount, String(prevRuns + 1))
  localStorage.setItem(STORAGE_KEYS.lastRunCost, cost.total.toFixed(4))
}
```

## Budget Warning Thresholds

```
RM 0–100:  ✅ Under budget — safe to continue
RM 100–160: ⚠️ Moderate spend — monitor closely
RM 160–190: 🔶 Approaching limit — reduce run frequency
RM 190–200: 🔴 Near limit — only critical runs
RM 200+:   🚨 Over budget — STOP and review
```

When approaching RM200, show a warning in the UI:
```tsx
{monthlySpend > 160 && (
  <div className="rounded-lg px-3 py-2 text-xs"
    style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
    ⚠️ Perbelanjaan API bulan ini: RM{monthlySpend.toFixed(2)} / RM200 had
  </div>
)}
```

## Post-Pipeline Cost Output (Console)

After every completed pipeline run:

```
╔══════════════════════════════════════════════════╗
║           PIPELINE COST BREAKDOWN                ║
╠══════════════════════════════════════════════════╣
║ Claude Haiku (storyboard)    RM 0.010            ║
║ fal.ai Flux Dev × 6 images   RM 0.084            ║
║ fal.ai Kling Pro × 6 videos  RM 3.900            ║
║ ElevenLabs Free (487 chars)  RM 0.000            ║
║ ffmpeg.wasm (merge)          RM 0.000            ║
╠══════════════════════════════════════════════════╣
║ THIS RUN TOTAL               RM 3.994            ║
║ MONTH TO DATE (4 runs)       RM 15.96 / RM 200   ║
╚══════════════════════════════════════════════════╝
```

## Cost Optimisation Suggestions

Automatically suggest when applicable:

1. **If using flux/dev:** "Tukar ke flux/schnell untuk jimat ~50% kos imej (RM0.08 → RM0.04)"
2. **If using kling-v1.6-pro with 6 videos:** "Pertimbangkan kling-v1.6-standard untuk jimat ~50% (RM3.90 → RM1.98)"
3. **If ElevenLabs approaching 10k:** "Hampir mencapai had percuma — pertimbangkan naik taraf ke Starter ($5/mo) untuk 30k aksara"
4. **If running >20 pipelines/month:** "Anggaran kos bulanan melebihi RM80 — pastikan ROI affiliate melebihi kos penjanaan"
