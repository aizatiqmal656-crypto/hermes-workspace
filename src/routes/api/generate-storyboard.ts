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

        const prompt = `You are a creative director for TikTok video content. Generate a visual storyboard with exactly 6 scenes for a TikTok video.

Product: ${productName} (${price})
Script:
- Hook: ${hook}
- Body: ${bodyText}
- CTA: ${cta}

Return ONLY a valid JSON array with exactly 6 scene objects. No markdown, no explanation, just the JSON array.

Each scene object must have exactly these fields:
- "sceneNumber": integer 1 through 6
- "angle": exactly one of: "Wide Shot", "Close Up", "Extreme Close Up", "Top Down", "POV", "Medium Shot"
- "action": brief description of the visual action in this scene (English, 1-2 sentences)
- "image_prompt": detailed visual description optimized for Flux image generation (English, 2-3 sentences, very descriptive with lighting, style, composition)
- "voiceover_text": narration for this scene in Bahasa Malaysia (1-2 sentences, conversational)

Scenes 1-2 cover the hook, scenes 3-4 cover the body, scenes 5-6 cover the CTA.`

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
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
          const scenes = JSON.parse(jsonStr) as unknown[]
          if (!Array.isArray(scenes)) {
            throw new Error('Response is not an array')
          }
          return json({ scenes: scenes.slice(0, 6) })
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
