# /project:check-costs

Calculate API usage costs for the TikTok pipeline and project monthly spend.

## Usage

```
/project:check-costs
```

## Steps

### 1. Gather Cost Data from Console Logs

Ask the user to open DevTools → Console and filter for `[cost]` or `[pipeline]` log messages. The pipeline logs each generation with timing and model info.

If console logs are not available, calculate based on the known pipeline structure.

### 2. Per-Run Cost Breakdown

Calculate the cost for a single full pipeline run:

```
┌─────────────────────────────────────────────────────────────────┐
│           PIPELINE COST BREAKDOWN — PER RUN                     │
├──────────────────────┬────────────┬──────────┬──────────────────┤
│ Service              │ Model      │ Units    │ Cost (RM)        │
├──────────────────────┼────────────┼──────────┼──────────────────┤
│ Claude Haiku         │ Storyboard │ ~800 tok │ RM 0.10          │
│ fal.ai Flux Dev      │ Images     │ 6 images │ RM 0.06          │
│ fal.ai Kling Pro v1.6│ Videos     │ 6 × 5s   │ RM 3.90          │
│ ElevenLabs Turbo v2.5│ Voiceover  │ ~500 chr │ RM 0.05          │
│ ffmpeg.wasm          │ Merge      │ 2 merges │ FREE (browser)   │
├──────────────────────┼────────────┼──────────┼──────────────────┤
│ TOTAL                │            │          │ RM 4.11          │
└──────────────────────┴────────────┴──────────┴──────────────────┘
```

**Cost notes:**
- Flux Dev: approximately USD $0.003/image → RM 0.014/image → RM 0.084 for 6 (rounded to RM 0.06 for schnell, RM 0.08 for dev)
- Kling Pro v1.6: approximately USD $0.14/video → RM 0.65/video → RM 3.90 for 6
- ElevenLabs: ~$0.30/1000 chars on Creator plan → RM 0.011/char for 500 chars = RM 0.05
- Claude Haiku: $0.25/1M input tokens → ~800 tokens → < RM 0.01 (effectively free)

### 3. Monthly Projection Calculator

Ask the user: **"How many TikTok videos do you plan to create per month?"**

```
Videos/month | Monthly Cost (RM) | Annual Cost (RM)
─────────────┼───────────────────┼─────────────────
     5        │     RM 20.55      │    RM 246.60
    10        │     RM 41.10      │    RM 493.20
    20        │     RM 82.20      │    RM 986.40
    30        │     RM 123.30     │    RM 1,479.60
    50        │     RM 205.50     │    RM 2,466.00
   100        │     RM 411.00     │    RM 4,932.00
```

### 4. ROI Calculation

To determine if the cost is justified, calculate estimated affiliate revenue:

```
Assumptions for a typical Malaysian TikTok affiliate video:
- Views per video:          5,000 (conservative estimate)
- Click-through rate:       3% → 150 clicks
- Conversion rate:          5% → 7.5 sales
- Average commission:       RM 8 per sale (10% of RM80 product)
- Revenue per video:        ~RM 60

Cost per video:  RM 4.11
Revenue per video: RM 60
ROI per video:   ~1,360% (if views are achieved)
```

**Note:** These are estimates. Actual performance depends on product, niche, posting time, and content quality.

### 5. Budget Warnings

Check against cost limits defined in `.claude/rules/cost-limits.md`:

- If monthly spend > RM 200, show warning: "Kos bulanan melebihi RM 200 — semak semula strategi kandungan"
- If a single run would exceed RM 10, warn before proceeding
- Count failed API calls that still incurred charges (Kling charges even for failed video jobs)

### 6. Cost Optimisation Tips

If costs are high, suggest optimisations:

1. **Use Flux Schnell instead of Flux Dev for images** — 10× faster, ~90% cheaper, minimal quality difference for product shots
2. **Reduce video duration from 5s to 3s** — some Kling models support shorter duration, reducing cost
3. **Batch voice generation** — record one voiceover track manually for high-volume periods
4. **Use ElevenLabs free tier wisely** — 10k chars/month free, ~20 videos/month at no cost
5. **Cache storyboards** — don't regenerate storyboard for the same product twice

### 7. Output Report

```
📊 COST REPORT — [date]

Per-run cost: RM 4.11
Plan: [X] videos/month
Projected monthly: RM [X.XX]
Projected annual: RM [X.XX]

Budget status: [UNDER/OVER RM 200/month threshold]

Top cost driver: Kling video generation (RM 3.90 = 94.9% of total)
Optimisation opportunity: Switch to fal-ai/kling-video/v1.5/standard to save ~40%
```
