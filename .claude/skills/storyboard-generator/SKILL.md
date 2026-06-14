# Skill: Storyboard Generator

## Trigger Conditions

This skill activates when:
- A product name is provided but no storyboard has been generated yet
- The user asks to "create a storyboard" or "generate scenes" for a product
- The pipeline reaches the storyboard stage after script generation is complete
- The user requests storyboard regeneration for an existing product

## What This Skill Does

Generates a 6-scene visual storyboard JSON for a TikTok video about a given product. All 6 scenes share the same visual DNA (background, hand style, lighting) — only the camera angle changes per scene. This makes the final video look professionally shot on a single day, not obviously AI-generated.

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
  angle: string            // Fixed per scene — see Scene Structure below
  action: string           // Claude-generated: brief English description of visual action
  image_prompt: string     // Server-built: fixed angle prefix + BASE_DNA (Claude cannot override)
  voiceover_text: string   // Claude-generated: BM narration for this scene (1–2 sentences)
}

// Full output: Scene[] with exactly 6 elements
```

## Visual DNA (BASE_DNA)

Every `image_prompt` ends with this verbatim string. Never modify it:

```
aesthetic product photography, feminine hand wearing cream knit oversized sleeve,
soft natural window light from left side, white linen cloth background,
ASMR close-up macro style, minimal clean desk setup, consistent warm neutral tone,
shot on iPhone vertical, no text no watermark, ultra realistic, 8k
```

This ensures the hand, background, and lighting are identical across all 6 scenes.

## Scene Structure (Fixed — Do Not Change Angles)

| Scene | Angle | Image prompt prefix | Script arc |
|-------|-------|---------------------|------------|
| 1 | Top Down | overhead flat lay, product on white linen, hand reaches in from bottom | Hook |
| 2 | Close Up | hand holds product upright facing camera, fingers wrapped naturally | Hook reinforce |
| 3 | Medium Shot | hand rotates product to side profile, 45°, label visible | Body |
| 4 | Extreme Close Up | macro fingertip on main product feature/button | Body demo |
| 5 | POV | product beside small plant or ceramic coffee cup, hand lightly touches | Proof / lifestyle |
| 6 | Wide Shot | product beside/inside packaging box, hand lifts product out | CTA / unboxing |

**The image prompts are built server-side** by concatenating the angle prefix + product name + BASE_DNA. Claude only generates `action` and `voiceover_text` — it cannot override the visual DNA.

## Architecture: Server vs Claude Responsibility

```
Server builds → image_prompt = "{anglePrefix}, {productName}, {BASE_DNA}"
Claude builds → action (English), voiceover_text (Bahasa Malaysia)
Server merges → complete Scene[] array
```

This split is intentional. Giving Claude control over `image_prompt` resulted in random backgrounds, lighting, and hand styles across scenes — breaking visual consistency.

## Prompt Instructions (sent to Claude Haiku)

Claude is told the 6 scene angles are fixed and is asked **only** for action descriptions and BM voiceover text — no image prompts:

```
Generate scene descriptions for a 6-scene TikTok video about {productName} ({price}).
[script provided]
Return ONLY a JSON array with exactly 6 objects, each with:
- "action": 1-2 sentence English description of camera/subject movement
- "voiceover_text": 1-2 sentence BM narration (conversational, BM slang)
No other fields. No image_prompt. No markdown.
```

## Fallback Behaviour

If the API call fails (Claude API down, ANTHROPIC_API_KEY missing, JSON parse failure):
1. Load `DEMO_STORYBOARD` from `tiktok-screen.tsx` (hardcoded AeroGlow LED Face Mask — all 6 scenes use BASE_DNA)
2. Show warning to user: "Storyboard API gagal — menggunakan storyboard demo"
3. Continue pipeline normally — user can still generate images/videos from demo storyboard
4. Log error to console for debugging

## Implementation Location

- **API endpoint:** `src/routes/api/generate-storyboard.ts`
- **Called from:** `src/screens/tiktok/tiktok-screen.tsx` → `generateStoryboard()` function
- **Fallback data:** `DEMO_STORYBOARD` constant in `tiktok-screen.tsx`

## Quality Standards

A valid storyboard must:
- [ ] Have exactly 6 scenes in the fixed angle order (Top Down → Close Up → Medium → Extreme Close Up → POV → Wide Shot)
- [ ] Every `image_prompt` contains the full BASE_DNA suffix verbatim
- [ ] `image_prompt` is built server-side — never from Claude output
- [ ] `angle` matches the fixed per-scene value, not a random pick
- [ ] `voiceover_text` is in Bahasa Malaysia with BM slang
- [ ] Scenes flow as a coherent narrative (hook → body → proof → CTA)
