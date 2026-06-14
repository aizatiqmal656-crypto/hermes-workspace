import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/generate-storyboard')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const { productName, price, hook, bodyText, cta } = body as {
          productName: string
          price: string
          hook: string
          bodyText: string
          cta: string
        }

        const anthropicKey = process.env.ANTHROPIC_API_KEY
        if (!anthropicKey) {
          return json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 })
        }

        // ── Visual DNA — injected verbatim into every scene image_prompt ──────
        // Never changes across scenes. Ensures consistent hand, background, and
        // lighting regardless of what Claude generates.
        const BASE_DNA =
          'aesthetic product photography, feminine hand wearing cream knit oversized sleeve, ' +
          'soft natural window light from left side, white linen cloth background, ' +
          'ASMR close-up macro style, minimal clean desk setup, consistent warm neutral tone, ' +
          'shot on iPhone vertical, no text no watermark, ultra realistic, 8k'

        // ── 6 fixed scene angle templates (image prompts built server-side) ───
        // Product name is injected here. Claude cannot override these.
        const SCENE_TEMPLATES = [
          {
            sceneNumber: 1,
            angle: 'Top Down',
            imagePromptPrefix: `overhead flat lay, ${productName} placed on white linen, hand gently reaches into frame from bottom`,
          },
          {
            sceneNumber: 2,
            angle: 'Close Up',
            imagePromptPrefix: `hand holds ${productName} upright facing camera, front angle close up, fingers wrapped around product naturally`,
          },
          {
            sceneNumber: 3,
            angle: 'Medium Shot',
            imagePromptPrefix: `hand slowly rotates ${productName} to show side profile, 45 degree angle, product label visible`,
          },
          {
            sceneNumber: 4,
            angle: 'Extreme Close Up',
            imagePromptPrefix: `extreme close up macro shot, hand demonstrates main product feature or button on ${productName}, fingertip detail visible`,
          },
          {
            sceneNumber: 5,
            angle: 'POV',
            imagePromptPrefix: `${productName} placed beside aesthetic props — small plant or ceramic coffee cup, hand lightly touches product, lifestyle context`,
          },
          {
            sceneNumber: 6,
            angle: 'Wide Shot',
            imagePromptPrefix: `${productName} inside or next to its packaging or box, hand lifts product out gently, unboxing moment`,
          },
        ] as const

        // ── Claude only generates action descriptions + BM voiceover ──────────
        // image_prompts are built above — Claude never touches the visual DNA.
        const prompt = `You are a TikTok video director for the Malaysian market. Generate scene descriptions for a 6-scene TikTok video about ${productName} (${price}).

Script:
- Hook: ${hook}
- Body: ${bodyText}
- CTA: ${cta}

The 6 scenes are already decided (fixed camera angles). Your job is ONLY to write:
1. What physically happens in the shot (action description)
2. What the narrator says in Bahasa Malaysia (voiceover)

Scene order you must follow:
Scene 1 — Hook: overhead flat lay reveal of the product
Scene 2 — Hook reinforce: hand holds product front-facing camera
Scene 3 — Body: hand rotates product to show label/side
Scene 4 — Body demo: close-up fingertip interaction with product feature
Scene 5 — Proof: product in lifestyle setting beside props
Scene 6 — CTA: unboxing reveal from packaging

Return ONLY a valid JSON array with exactly 6 objects. No markdown, no explanation.

Each object must have ONLY these two fields:
- "action": 1-2 sentence English description of the camera and subject movement for this scene
- "voiceover_text": 1-2 sentence Bahasa Malaysia narration (conversational, use BM slang like korang, memang, confirm, jom, berbaloi)`

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1200,
            messages: [{ role: 'user', content: prompt }],
          }),
        })

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
          const msg = (err as { error?: { message?: string } })?.error?.message ?? `Claude API error: HTTP ${res.status}`
          return json({ error: msg }, { status: 500 })
        }

        const data = (await res.json()) as {
          content?: Array<{ type: string; text: string }>
        }
        const text = (data.content?.[0]?.text ?? '').trim()

        try {
          const jsonStr = text
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim()

          type ClaudeScene = { action?: string; voiceover_text?: string }
          const claudeScenes = JSON.parse(jsonStr) as ClaudeScene[]
          if (!Array.isArray(claudeScenes)) throw new Error('Response is not an array')

          // Merge fixed image prompts with Claude's action + voiceover output
          const scenes = SCENE_TEMPLATES.map((t, i) => ({
            sceneNumber: t.sceneNumber,
            angle: t.angle,
            action: claudeScenes[i]?.action ?? `Scene ${t.sceneNumber} — ${t.angle}`,
            image_prompt: `${t.imagePromptPrefix}, ${BASE_DNA}`,
            voiceover_text: claudeScenes[i]?.voiceover_text ?? '',
          }))

          return json({ scenes })
        } catch (err) {
          return json(
            {
              error: `Failed to parse storyboard JSON: ${err instanceof Error ? err.message : 'parse error'}`,
              raw: text,
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
