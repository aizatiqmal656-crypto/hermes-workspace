# Local Developer Config — Aizat

> This file is gitignored. Do not commit. Contains machine-specific and personal preferences.

## Developer Profile

**Name:** Aizat
**Background:** Pharmacist + Branch Manager — hybrid clinical-technical background. Understands both healthcare compliance and business operations. Building AI tools to automate content creation for Malaysian affiliate marketing.
**GitHub:** github.com/aizatiqmal656-crypto/hermes-workspace
**GitHub Pages:** https://aizatiqmal656-crypto.github.io/hermes-workspace/

## Machine Setup

- **OS:** Windows 11
- **Editor:** VS Code
- **Node.js:** v24
- **Package manager:** pnpm
- **Shell:** PowerShell (primary) + Git Bash available
- **Terminal:** Windows Terminal

## Run Commands

```bash
# Start dev server (localhost:3000)
pnpm dev

# Start Hermes gateway (run in separate terminal)
hermes gateway run

# Full local setup (both terminals needed)
# Terminal 1:
pnpm dev
# Terminal 2:
hermes gateway run

# Build for production
pnpm build

# Preview production build
pnpm preview

# Type check
npx tsc --noEmit
```

## Local API Keys Location

All API keys are in `.env` at project root. Never commit this file.

Key variables needed for full pipeline:
- `VITE_FAL_API_KEY` — fal.ai (images + videos)
- `VITE_ELEVENLABS_API_KEY` — voice generation
- `ANTHROPIC_API_KEY` — Claude (storyboard generation, server-side)
- `OPENROUTER_API_KEY` — OpenRouter LLM fallback
- `HERMES_API_TOKEN` — local Hermes agent

## Coding Preferences

**Always use TypeScript** — no plain JS files in `src/`

**Always handle API errors with fallback** — every API call must have a fallback state (demo data, retry button, or friendly error message in BM)

**Keep responses concise** — when Claude Code explains changes, bullet points preferred over long paragraphs

**Minimal comments in code** — self-documenting variable names preferred; only comment non-obvious logic

**Preferred patterns:**
```typescript
// Good: async/await with try/catch
const result = await apiCall().catch(err => { setError(err.message); return null })

// Good: explicit error state + retry UI
{error && <ErrorBanner message={error} onRetry={retry} />}

// Good: TypeScript interfaces for all API responses
interface FalImageResponse { images: Array<{ url: string }> }
```

## Deployment

**Target:** VPS (Ubuntu, pm2 + nginx)

```bash
# Deploy steps
pnpm build
git add -A && git commit -m "feat: ..."
git push origin main

# On VPS (SSH):
cd /var/www/hermes-workspace
git pull origin main
pnpm install
pnpm build
pm2 restart hermes-workspace
```

## VS Code Extensions Used

- ESLint
- Prettier
- TypeScript + JavaScript Language Features
- Tailwind CSS IntelliSense
- GitHub Copilot (secondary, Claude Code is primary)

## Personal Notes

- Focus products on health + beauty — aligns with pharmacist background and credibility
- Malaysian audience responds well to conversational BM, not formal language
- Best posting times for TikTok Malaysia: 7–9pm weekdays, 12–2pm weekends
- Affiliate platforms used: Shopee Affiliate, TikTok Shop, Lazada Affiliate
