/**
 * Web-search tool (TrendHunter) — Phase R4.
 *
 * searchTrendingProducts(category, market) returns the top 5 trending affiliate
 * products for the Malaysian market. Strategy:
 *   1. Hermes built-in web search, if a search endpoint is configured.
 *   2. Otherwise Claude Haiku (direct Anthropic API) to synthesise realistic
 *      trending products from current Malaysian market knowledge.
 *   3. Otherwise a small static fallback list (with a warning) so the pipeline
 *      never hard-fails when no key is present.
 */

export type TrendingProduct = {
  name: string
  price_rm: string
  trend_score: number
  viral_reason: string
  category: string
}

export type WebSearchResult = {
  ok: boolean
  source: 'hermes-web' | 'haiku' | 'fallback'
  products: Array<TrendingProduct>
  warning?: string
  error?: string
}

const STATIC_FALLBACK: Array<TrendingProduct> = [
  { name: 'AeroGlow LED Face Mask', price_rm: 'RM219.00', trend_score: 94, viral_reason: 'Red light therapy tengah viral +340% kat FYP minggu ni', category: 'beauty' },
  { name: 'HydraBoost Serum', price_rm: 'RM59.90', trend_score: 88, viral_reason: 'Ramai influencer skincare tunjuk hasil dalam 2 minggu', category: 'beauty' },
  { name: 'PorTable Neck Massager', price_rm: 'RM89.00', trend_score: 85, viral_reason: 'Gadget kesihatan paling laku kat Shopee untuk WFH', category: 'health' },
  { name: 'MiniChop Food Processor', price_rm: 'RM45.90', trend_score: 82, viral_reason: 'Dapur gadget yang senang viral sebab demo memuaskan', category: 'home' },
  { name: 'GlowDrip Vitamin C', price_rm: 'RM39.90', trend_score: 80, viral_reason: 'Supplement kulit cerah, harga berbaloi untuk impulse buy', category: 'health' },
]

function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY
}

/** Call Claude Haiku and return parsed JSON of type T, or null on any failure. */
async function callHaikuJson<T>(prompt: string, maxTokens = 1200): Promise<T | null> {
  const key = getAnthropicKey()
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { content?: Array<{ type: string; text: string }> }
    const text = (data.content?.[0]?.text ?? '').trim()
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(jsonStr) as T
  } catch {
    return null
  }
}

function coerceProducts(value: unknown, category: string): Array<TrendingProduct> {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .slice(0, 5)
    .map((row) => ({
      name: String(row.name ?? row.product_name ?? 'Unknown product'),
      price_rm: String(row.price_rm ?? row.price ?? 'RM0.00'),
      trend_score: Number(row.trend_score ?? 0) || 0,
      viral_reason: String(row.viral_reason ?? ''),
      category: String(row.category ?? category),
    }))
}

export async function searchTrendingProducts(
  category: string,
  market = 'Malaysia',
): Promise<WebSearchResult> {
  const cat = category.trim() || 'health & beauty'

  // 1. Hermes built-in web search (only if an explicit endpoint is configured).
  const hermesSearchUrl = process.env.HERMES_WEB_SEARCH_URL
  if (hermesSearchUrl) {
    try {
      const res = await fetch(
        `${hermesSearchUrl}?q=${encodeURIComponent(`trending ${cat} affiliate products ${market} TikTok Shopee`)}`,
        { signal: AbortSignal.timeout(8000) },
      )
      if (res.ok) {
        const data = (await res.json()) as { products?: unknown }
        const products = coerceProducts(data.products, cat)
        if (products.length > 0) {
          console.log(`[tool:web_search] hermes-web returned ${products.length} products for ${cat}`)
          return { ok: true, source: 'hermes-web', products }
        }
      }
    } catch {
      // fall through to Haiku
    }
  }

  // 2. Claude Haiku synthesis.
  const haiku = await callHaikuJson<unknown>(
    `You are TrendHunter, a Malaysian TikTok affiliate product researcher. List the top 5 trending ${cat} products for the ${market} market right now (Shopee/Lazada/TikTok Shop).\n\nReturn ONLY a JSON array of 5 objects, no markdown. Each object: {"name": string (keep English brand), "price_rm": "RM##.##", "trend_score": 0-100, "viral_reason": one sentence in Bahasa Malaysia, "category": string}.`,
  )
  const haikuProducts = coerceProducts(haiku, cat)
  if (haikuProducts.length > 0) {
    console.log(`[tool:web_search] haiku returned ${haikuProducts.length} products for ${cat}`)
    return { ok: true, source: 'haiku', products: haikuProducts }
  }

  // 3. Static fallback.
  console.warn('[tool:web_search] no search API or ANTHROPIC_API_KEY — using static fallback list')
  return {
    ok: true,
    source: 'fallback',
    products: STATIC_FALLBACK,
    warning: 'No web search or ANTHROPIC_API_KEY available — returned a static trending list.',
  }
}
