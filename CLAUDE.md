# HermesTikTok — Multi-Agent TikTok Affiliate Automation System

## Project Overview

HermesTikTok is a fully automated, AI-powered TikTok affiliate content pipeline for the Malaysian market. It uses a multi-agent architecture to discover trending products, write Bahasa Malaysia scripts, generate storyboards, produce 6 cinematic scenes, and export a complete TikTok-ready MP4 video — all from a single click.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TanStack Start (SSR) + TypeScript |
| Styling | TailwindCSS 4 + Framer Motion |
| Build | Vite + Node.js |
| LLM | Claude Haiku (`claude-haiku-4-5-20251001`) via Anthropic API (server-side) |
| Image Gen | fal.ai — `fal-ai/flux/dev` (Flux Dev) |
| Video Gen | fal.ai — `fal-ai/kling-video/v1.6/pro/image-to-video` (Kling v1.6 Pro) |
| Voice Gen | ElevenLabs TTS — Adam voice, BM scripts |
| Video Merge | ffmpeg.wasm (browser-side, zero upload) |
| Agent Runtime | Hermes Workspace — multi-agent conductor system |
| Deployment | VPS via pm2 + nginx |

## Full Pipeline Flow

```
Product Input
    │
    ▼
TrendHunter Agent ──────► Trend score, viral reason, target demographic
    │
    ▼
CopywriterAgent ─────────► BM Hook (5s) + Body (15s) + CTA (5s)
    │
    ▼
ComplianceAgent ─────────► TikTok guideline check + fix suggestions
    │
    ▼
AnalyticsAgent ──────────► Trend score 0–100, virality prediction
    │
    ▼
Storyboard Generation ───► 6 scenes: angle, action, image_prompt, voiceover_text (BM)
    │
    ▼
6× Flux Dev Images ──────► Parallel generation, 3:4 portrait, scene-optimised prompts
    │
    ▼
6× Kling Pro Videos ─────► Parallel queue submission, 9:16, 5s per clip
    │
    ▼
ffmpeg.wasm Concat ──────► All 6 clips merged in sequence → merged_clips.mp4
    │
    ▼
ElevenLabs BM Voice ─────► All 6 voiceover_texts → single BM audio track (MP3)
    │
    ▼
ffmpeg.wasm Final Merge ─► merged_clips.mp4 + voice.mp3 → tiktok-final.mp4
    │
    ▼
Download / Upload ───────► User downloads final MP4, ready to post to TikTok
```

## Key Files

| File | Purpose |
|------|---------|
| `src/screens/tiktok/tiktok-screen.tsx` | Main pipeline UI — all state, generation logic, progress tracker |
| `src/routes/api/generate-storyboard.ts` | Server endpoint — calls Claude Haiku to generate 6-scene storyboard JSON |
| `src/routes/api/conductor-spawn.ts` | Multi-agent conductor — spawns Hermes agent missions |
| `vite.config.ts` | Vite config — auto-starts Hermes Agent, env setup |
| `.env` | API keys — see Environment Variables section |

## Environment Variables

```bash
# fal.ai — Image and video generation (browser-exposed via VITE_ prefix)
VITE_FAL_API_KEY=your_fal_api_key_here

# ElevenLabs — BM voiceover generation (browser-exposed)
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key_here

# OpenRouter — LLM calls via OpenRouter (server-side only)
OPENROUTER_API_KEY=your_openrouter_key_here

# Anthropic — Direct Claude API (server-side only, used by generate-storyboard)
ANTHROPIC_API_KEY=your_anthropic_key_here

# Hermes Agent — Local agent runtime
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_TOKEN=your_hermes_token_here
HERMES_AGENT_PATH=C:/Users/Admin/AppData/Local/hermes/hermes-agent
HERMES_CLI_BIN=C:/Users/Admin/AppData/Local/hermes/hermes-agent/venv/Scripts/hermes.exe
```

## All Agents Location

All Hermes agent skill definitions are stored at:
```
C:\Users\Admin\AppData\Local\hermes\skills\
```

Agent configs in this repo are at `.claude/agents/` for documentation and Claude Code context.

## API Cost Reference (Per Pipeline Run)

| Service | Model | Cost (RM) | Notes |
|---------|-------|-----------|-------|
| Claude Haiku | Storyboard gen | ~RM0.10 | 6 scenes, ~800 tokens |
| Flux Dev | 6× images | ~RM0.06 | ~RM0.01 per image |
| Kling Pro v1.6 | 6× videos (5s each) | ~RM3.90 | ~RM0.65 per video |
| ElevenLabs | 1× BM voiceover | ~RM0.05 | ~500 chars |
| **Total** | **Per video** | **~RM4.11** | Full pipeline |

**Monthly projection:** 30 videos/month ≈ RM123/month in API costs.

## Target Market

- **Platform:** TikTok Malaysia
- **Content type:** Affiliate product reviews + demonstrations
- **Language:** Bahasa Malaysia (conversational, pasar malam tone)
- **Demographics:** Malaysian TikTok users 18–35
- **Products:** Health, beauty, home gadgets trending on Shopee/Lazada Malaysia

## Known Issues & Workarounds

1. **ffmpeg.wasm must be loaded before merge** — The WASM binary (~30 MB) is loaded on first merge only. On slow connections, show a loading indicator. The `ffmpegRef` singleton reuses the loaded instance across merges.

2. **ElevenLabs free tier limit** — Free tier allows 10,000 characters/month. At ~500 chars per voiceover, that's ~20 free videos/month. Upgrade to Starter ($5/mo) for 30k chars.

3. **fal.ai Kling queue times** — Kling Pro can take 2–4 minutes per video. All 6 are submitted simultaneously and polled independently. Total wait time = slowest single video ≈ 3–4 minutes.

4. **Storyboard fallback** — If Claude API fails, `generate-storyboard.ts` returns 500, and `tiktok-screen.tsx` falls back to `DEMO_STORYBOARD` (hardcoded for AeroGlow LED Face Mask). User still sees full UI.

5. **CORS on fal.ai** — fal.ai allows direct browser requests with API key. This is intentional for their SDK pattern. `VITE_FAL_API_KEY` is browser-exposed by design.

## Development Notes

- API routes use TanStack Start pattern: `export const Route = createFileRoute('/api/...')({ server: { handlers: { POST: async ({ request }) => {} } } })`
- All monetary amounts in UI should display in RM (Malaysian Ringgit)
- Default video aspect ratio: 9:16 (TikTok vertical)
- Default image size for Flux: `portrait_4_3` (768×1024)
