// Vercel serverless function — TikTok Content Posting API (video.upload + video.publish scopes).
// POST { action: 'init',   access_token, video_url, caption } → { publish_id }
// POST { action: 'status', access_token, publish_id }         → { status, fail_reason? }
//
// Uses PULL_FROM_URL: TikTok downloads the video from a publicly accessible URL,
// so the serverless function never has to stream the file itself. Status polling
// is driven by the frontend (one quick call per poll) to stay within Vercel's
// serverless execution time limit.

function setCors(req, res) {
  const origin = req.headers.origin || ''
  const host = req.headers.host || ''
  if (origin === `https://${host}` || origin === `http://${host}`) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function initDirectPost(accessToken, videoUrl, postInfo) {
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: postInfo,
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    }),
  })

  const payload = await initRes.json()
  const apiError = payload.error
  const publishId = payload.data && payload.data.publish_id

  if (!initRes.ok || (apiError && apiError.code && apiError.code !== 'ok') || !publishId) {
    const message = (apiError && apiError.message) || `TikTok video init returned ${initRes.status}`
    throw new Error(message)
  }

  return publishId
}

async function fetchPublishStatus(accessToken, publishId) {
  const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  })

  const payload = await statusRes.json()
  const apiError = payload.error
  const data = payload.data

  if (!statusRes.ok || (apiError && apiError.code && apiError.code !== 'ok') || !data) {
    const message = (apiError && apiError.message) || `TikTok status fetch returned ${statusRes.status}`
    throw new Error(message)
  }

  return {
    status: data.status,
    fail_reason: data.fail_reason,
    publicly_available_post_id: data.publicaly_available_post_id || data.publicly_available_post_id,
  }
}

export default async function handler(req, res) {
  setCors(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, access_token: accessToken } = req.body || {}
  if (!accessToken) {
    return res.status(400).json({ error: 'Missing required field: access_token' })
  }

  try {
    if (action === 'init') {
      const {
        video_url: videoUrl,
        title,
        privacy_level: privacyLevel,
        disable_comment: disableComment,
        disable_duet: disableDuet,
        disable_stitch: disableStitch,
        brand_content_toggle: brandContentToggle,
        brand_organic_toggle: brandOrganicToggle,
      } = req.body

      if (!videoUrl) {
        return res.status(400).json({ error: 'Missing required field: video_url' })
      }
      let parsed
      try {
        parsed = new URL(videoUrl)
      } catch {
        return res.status(400).json({ error: 'video_url is not a valid URL' })
      }
      if (parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'video_url must be HTTPS — TikTok only pulls from secure URLs' })
      }

      // Privacy level is mandatory — the user must explicitly choose one (no default).
      if (!privacyLevel) {
        return res.status(400).json({ error: 'privacy_level is required — the user must select a privacy status' })
      }

      // TikTok forbids Branded Content with a private (SELF_ONLY) audience.
      if (brandContentToggle && privacyLevel === 'SELF_ONLY') {
        return res.status(400).json({ error: 'Branded Content cannot be posted with SELF_ONLY privacy — choose a public audience' })
      }

      const postInfo = {
        title: title || 'Posted via ContentBoss Studio',
        privacy_level: privacyLevel,
        disable_comment: !!disableComment,
        disable_duet: !!disableDuet,
        disable_stitch: !!disableStitch,
        brand_content_toggle: !!brandContentToggle,
        brand_organic_toggle: !!brandOrganicToggle,
      }

      const publishId = await initDirectPost(accessToken, videoUrl, postInfo)
      return res.status(200).json({ publish_id: publishId })
    }

    if (action === 'status') {
      const { publish_id: publishId } = req.body
      if (!publishId) {
        return res.status(400).json({ error: 'Missing required field: publish_id' })
      }
      const result = await fetchPublishStatus(accessToken, publishId)
      return res.status(200).json(result)
    }

    return res.status(400).json({ error: "Invalid action — expected 'init' or 'status'" })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Content Posting API call failed'
    console.error(`[post-video] ${action} failed:`, message)
    return res.status(502).json({ error: message })
  }
}
