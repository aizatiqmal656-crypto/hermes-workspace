// Vercel serverless function — TikTok Creator Info query (required before any direct post).
// POST { access_token } → { creator_nickname, creator_username, creator_avatar_url,
//                           privacy_level_options, comment_disabled, duet_disabled,
//                           stitch_disabled, max_video_post_duration_sec }
//
// TikTok Content Sharing Guidelines REQUIRE calling creator_info/query before showing
// the posting UI, so the user sees their real privacy options and any interaction
// settings that are disabled on their account.

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
    const infoRes = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    })

    const payload = await infoRes.json()
    const apiError = payload.error
    const data = payload.data

    if (!infoRes.ok || (apiError && apiError.code && apiError.code !== 'ok') || !data) {
      const message = (apiError && apiError.message) || `TikTok creator info returned ${infoRes.status}`
      console.error('[creator-info] query failed:', message)
      return res.status(502).json({ error: message })
    }

    return res.status(200).json({
      creator_nickname: data.creator_nickname,
      creator_username: data.creator_username,
      creator_avatar_url: data.creator_avatar_url,
      privacy_level_options: data.privacy_level_options || [],
      comment_disabled: !!data.comment_disabled,
      duet_disabled: !!data.duet_disabled,
      stitch_disabled: !!data.stitch_disabled,
      max_video_post_duration_sec: data.max_video_post_duration_sec,
    })
  } catch (err) {
    console.error('[creator-info] unexpected error:', err)
    return res.status(500).json({ error: 'Creator info fetch failed — check server logs' })
  }
}
