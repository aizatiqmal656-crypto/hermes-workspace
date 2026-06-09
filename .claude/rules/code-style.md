# Code Style Rules

These rules apply to all code written for the HermesTikTok pipeline. Claude Code must follow these when writing or modifying any file in `src/`.

## TypeScript

**Always use TypeScript with proper types.** No `any` types unless absolutely necessary and always comment why.

```typescript
// Bad
const handleData = (data: any) => { ... }

// Good
interface FalImageResponse {
  images: Array<{ url: string; content_type: string }>
  timings?: Record<string, number>
}
const handleData = (data: FalImageResponse) => { ... }
```

Define interfaces for all API responses, state objects, and function parameters.

## Async Patterns

**Always use async/await, not .then() chains.**

```typescript
// Bad
fetch('/api/generate-storyboard')
  .then(res => res.json())
  .then(data => setStoryboard(data.scenes))
  .catch(err => setError(err.message))

// Good
try {
  const res = await fetch('/api/generate-storyboard', { ... })
  const data = await res.json() as { scenes: Scene[] }
  setStoryboard(data.scenes)
} catch (err) {
  setError(err instanceof Error ? err.message : 'Generation failed')
}
```

## Error Handling

**Always add try/catch around every API call.** Never let an unhandled rejection reach the user.

```typescript
// Required pattern for every API call:
try {
  // API call here
  const res = await fetch(...)
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new Error(typeof err.detail === 'string' ? err.detail : `HTTP ${res.status}`)
  }
  // process response
} catch (err) {
  setError(err instanceof Error ? err.message : 'Operation failed')
} finally {
  setLoading(false)
}
```

## Variable Naming

**Use descriptive camelCase variable names.** No abbreviations except well-known acronyms (url, id, api, bm).

```typescript
// Bad
const d = await res.json()
const u = d.images[0].url
const gen = true

// Good
const responseData = await res.json() as FalImageResponse
const imageUrl = responseData.images[0].url
const isGenerating = true
```

State setter naming convention:
- `setXxxGenerating` for loading states
- `setXxxError` for error states
- `setXxxUrl` for generated asset URLs

## Pipeline Step Logging

**Add a console.log for each pipeline step with step name and timing.**

```typescript
// At start of each generation function:
console.log('[Pipeline] Starting scene image generation', { sceneIdx: idx, prompt: prompt.slice(0, 50) })

// On success:
console.log('[Pipeline] Scene image ready', { sceneIdx: idx, url: imageUrl })

// On error:
console.error('[Pipeline] Scene image failed', { sceneIdx: idx, error: err.message })
```

Format: `[StepName] action description`, followed by relevant data object.

## Component Size

**Keep components under 200 lines. Split if larger.**

If a section of JSX grows beyond ~80 lines, extract it into a named sub-component:

```typescript
// Instead of 300-line TikTokScreen with everything inlined:
function SceneImagesGrid({ scenes, sceneImages, ... }: SceneImagesGridProps) {
  // focused component, under 100 lines
}

// Then in TikTokScreen:
<SceneImagesGrid scenes={storyboard} sceneImages={sceneImages} ... />
```

Exceptions: `tiktok-screen.tsx` is intentionally large due to all state living in one place. When adding new sections, keep each UI section clearly separated with comments like `{/* ── Scene Images Grid ── */}`.

## Loading States

**Always show loading state during API calls.** Never leave the UI frozen without feedback.

Every async operation must have:
1. `setXxxGenerating(true)` at the start
2. Visual indicator in JSX (spinner, pulsing placeholder, progress text)
3. `setXxxGenerating(false)` in the `finally` block

```typescript
// Loading indicator pattern:
{isGenerating && !resultUrl && (
  <motion.div
    className="..."
    animate={{ opacity: [0.3, 0.9, 0.3] }}
    transition={{ duration: 1.5, repeat: Infinity }}
  >
    {/* pulsing placeholder */}
  </motion.div>
)}
```

## Import Order

1. React imports
2. Third-party imports (framer-motion, etc.)
3. Internal imports (`@/lib/...`, `@/components/...`)
4. Types (inline or from `./types`)

## File Naming

- React components: `PascalCase.tsx`
- Utilities and hooks: `camelCase.ts`
- API routes: `kebab-case.ts`
- Config files: `camelCase.ts` or standard names (`vite.config.ts`)
