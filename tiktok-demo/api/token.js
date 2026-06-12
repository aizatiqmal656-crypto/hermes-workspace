// Vercel serverless function — TikTok OAuth token exchange.
// GET  → returns the public client_key so the frontend can build the authorize URL.
// POST → exchanges an authorization code for an access token.
// CLIENT_SECRET stays server-side only and is never returned to the frontend.

function setCors(req, res) {
  const origin = req.headers.origin || ''
  const host = req.headers.host || ''
  // Only allow the deployment's own domain
  if (origin === `https://${host}` || origin === `http://${host}`) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const clientKey = process.env.CLIENT_KEY
  const clientSecret = process.env.CLIENT_SECRET

  if (req.method === 'GET') {
    if (!clientKey) {
      return res.status(500).json({ error: 'CLIENT_KEY not configured — run: vercel env add CLIENT_KEY' })
    }
    // client_key is public by design (it appears in the authorize URL)
    return res.status(200).json({ client_key: clientKey })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!clientKey || !clientSecret) {
    return res.status(500).json({ error: 'CLIENT_KEY / CLIENT_SECRET not configured on server' })
  }

  const { code, redirect_uri: redirectUri } = req.body || {}
  if (!code || !redirectUri) {
    return res.status(400).json({ error: 'Missing required fields: code, redirect_uri' })
  }

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    const data = await tokenRes.json()

    if (!tokenRes.ok || data.error || !data.access_token) {
      const message = data.error_description || data.error || `TikTok token endpoint returned ${tokenRes.status}`
      console.error('[token] exchange failed:', message)
      return res.status(502).json({ error: message })
    }

    // Return only what the frontend needs — never the client_secret
    return res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      open_id: data.open_id,
      scope: data.scope,
    })
  } catch (err) {
    console.error('[token] unexpected error:', err)
    return res.status(500).json({ error: 'Token exchange failed — check server logs' })
  }
}
