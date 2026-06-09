# Skill: Storyboard Generator

## Trigger Conditions

This skill activates when:
- A product name is provided but no storyboard has been generated yet
- The user asks to "create a storyboard" or "generate scenes" for a product
- The pipeline reaches the storyboard stage after script generation is complete
- The user requests storyboard regeneration for an existing product

## What This Skill Does

Generates a 6-scene visual storyboard JSON for a TikTok video about a given product. Each scene is a complete unit of cinematic direction, specifying what the camera sees, how it moves, what voiceover is spoken, and what prompt to use for image generation.

The storyboard forms the backbone of the entire visual pipeline — all 6 images and 6 videos are generated directly from this storyboard's data.

## API Used

**Claude Haiku via Anthropic API**
- Endpoint: `POST https://api.anthropic.com/v1/messages`
- Model: `claude-haiku-4-5-20251001`
- Auth: Server-side `ANTHROPIC_API_KEY` (never exposed to browser)
- Called via: `POST /api/generate-storyboard`
- Response time: ~3–5 seconds
- Cost: ~RM0.10 per call

## Input Required

```typescript
interface StoryboardInput {
  productName: string      // e.g., "AeroGlow LED Face Mask"
  price: string            // e.g., "RM49.99"
  hook: string             // BM hook from CopywriterAgent
  bodyText: string         // BM body from CopywriterAgent
  cta: string              // BM CTA from CopywriterAgent
}
```

## Output Format

```typescript
interface Scene {
  sceneNumber: number      // 1–6
  angle: string            // "Wide Shot" | "Close Up" | "Extreme Close Up" | "Top Down" | "POV" | "Medium Shot"
  action: string           // Brief description of visual action (English, 1–2 sentences)
  image_prompt: string     // Detailed Flux-optimised image generation prompt (English, 50–80 words)
  voiceover_text: string   // BM narration for this scene (1–2 sentences)
}

// Full output: Scene[] with exactly 6 elements
```

## Scene Structure Template

The 6 scenes must follow this narrative arc:

| Scene | Purpose | Angle | Content |
|-------|---------|-------|---------|
| 1 | Establish problem or hook | Wide Shot or POV | Viewer sees relatable pain point |
| 2 | Product reveal | Close Up | Hero shot of the product |
| 3 | How it works | POV or Medium Shot | Application or usage demonstration |
| 4 | In use / experience | Medium Shot | Lifestyle scene, relaxed usage |
| 5 | Results | Extreme Close Up | Before-after, transformation result |
| 6 | CTA | Top Down | Flat lay / product + pricing + action |

## Prompt Instructions (sent to Claude Haiku)

```
You are a creative director for TikTok content. Generate a storyboard with exactly 6 scenes for a TikTok video.

Product: {productName} ({price})
Script:
- Hook: {hook}
- Body: {bodyText}  
- CTA: {cta}

Return ONLY a valid JSON array with exactly 6 scene objects. No markdown, no explanation, just the JSON array.

Each scene object must have exactly these fields:
- "sceneNumber": integer 1 through 6
- "angle": exactly one of: "Wide Shot", "Close Up", "Extreme Close Up", "Top Down", "POV", "Medium Shot"
- "action": brief description of the visual action in this scene (English, 1-2 sentences)
- "image_prompt": detailed visual description optimized for Flux image generation (English, 2-3 sentences, very descriptive with lighting, style, composition)
- "voiceover_text": narration for this scene in Bahasa Malaysia (1-2 sentences, conversational)

Scenes 1-2 cover the hook, scenes 3-4 cover the body, scenes 5-6 cover the CTA.
```

## Fallback Behaviour

If the API call fails (Claude API down, ANTHROPIC_API_KEY missing, JSON parse failure):
1. Load `DEMO_STORYBOARD` from `tiktok-screen.tsx` (hardcoded AeroGlow LED Face Mask storyboard)
2. Show warning to user: "Storyboard API gagal — menggunakan storyboard demo"
3. Continue pipeline normally — user can still generate images/videos from demo storyboard
4. Log error to console for debugging

## Implementation Location

- **API endpoint:** `src/routes/api/generate-storyboard.ts`
- **Called from:** `src/screens/tiktok/tiktok-screen.tsx` → `generateStoryboard()` function
- **Fallback data:** `DEMO_STORYBOARD` constant in `tiktok-screen.tsx`

## Quality Standards

A valid storyboard must:
- [ ] Have exactly 6 scenes (pad with demo data if fewer returned)
- [ ] Each scene has all 5 required fields
- [ ] `angle` is one of the 6 allowed values (not a custom string)
- [ ] `image_prompt` is in English and detailed enough for Flux (>30 words)
- [ ] `voiceover_text` is in Bahasa Malaysia
- [ ] Scenes flow as a coherent narrative (problem → product → results → CTA)
