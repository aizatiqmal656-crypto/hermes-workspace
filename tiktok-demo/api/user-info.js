// Vercel serverless function — fetch TikTok user info (user.info.basic scope).
// POST { access_token } → { display_name, avatar_url, open_id }

function setCors(req, res) {
  const origin = req.headers.origin || ''
  const host = req.headers.host || ''
  if (origin === `https://${host}` || origin === `http://${host}`) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { access_token: accessToken } = req.body || {}
  if (!accessToken) {
    return res.status(400).json({ error: 'Missing required field: access_token' })
  }

  try {
    const fields = 'open_id,display_name,avatar_url'
    const userRes = await fetch(
      `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const payload = await userRes.json()
    const apiError = payload.error
    const user = payload.data && payload.data.user

    if (!userRes.ok || (apiError && apiError.code && apiError.code !== 'ok') || !user) {
      const message = (apiError && apiError.message) || `TikTok user info returned ${userRes.status}`
      console.error('[user-info] fetch failed:', message)
      return res.status(502).json({ error: message })
    }

    return res.status(200).json({
      open_id: user.open_id,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
    })
  } catch (err) {
    console.error('[user-info] unexpected error:', err)
    return res.status(500).json({ error: 'User info fetch failed — check server logs' })
  }
}
