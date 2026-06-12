# ContentBoss Studio — TikTok Integration Demo

Standalone Vercel project demonstrating the TikTok integration for app review:
**Login Kit OAuth** (`user.info.basic`) + **Content Posting API direct post** (`video.upload`, `video.publish`).

## Project Structure

```
tiktok-demo/
├── public/
│   ├── index.html          # Demo page (served at the Vercel URL root)
│   └── sample-video.mp4    # ⚠ PLACEHOLDER — add a real 9:16 MP4 before deploying
├── api/
│   ├── token.js            # OAuth code → access token exchange (server-side)
│   ├── user-info.js        # Fetch display_name + avatar
│   └── post-video.js       # Content Posting API init + status polling
├── vercel.json
└── README.md
```

> **Sample video:** drop a short (5–15 s) vertical 9:16 MP4 at `public/sample-video.mp4`.
> Any clip exported from the ContentBoss Studio pipeline works. The demo page also
> accepts any publicly accessible HTTPS MP4 URL, so the file is optional but recommended
> so reviewers see a preview immediately.

## Deployment

All commands run from inside the `tiktok-demo/` folder:

```bash
cd tiktok-demo

# 1. Log in to Vercel (one-time)
vercel login

# 2. First deploy (creates the project — accept defaults, no build command needed)
vercel deploy

# 3. Set environment variables (use values from TikTok Developer Portal → your app)
vercel env add CLIENT_KEY        # paste your TikTok Client Key when prompted
vercel env add CLIENT_SECRET     # paste your TikTok Client Secret when prompted
# Select all environments (Production, Preview, Development) when asked.

# 4. Production deploy (picks up the env vars)
vercel deploy --prod
```

The production URL will look like `https://contentboss-demo.vercel.app` (or
`https://<project-name>.vercel.app`). Note it down — you need it for the next step.

## TikTok Developer Portal Setup (REQUIRED after deployment)

1. Go to [developers.tiktok.com](https://developers.tiktok.com/) → **Manage apps** → your app.
2. Under **Login Kit** settings, add the Vercel URL as a **Redirect URI** — in **both
   Sandbox and Production** configurations:
   ```
   https://contentboss-demo.vercel.app/
   ```
   ⚠ Include the trailing slash — it must match the `redirect_uri` the page sends exactly.
3. Ensure these scopes are enabled on the app: `user.info.basic`, `video.upload`, `video.publish`.
4. If TikTok asks for domain verification, add the Vercel domain
   (`contentboss-demo.vercel.app`) under **URL properties** and verify it
   (TikTok provides a signature file or meta tag — the file can be added to `public/`).
5. In **Sandbox** mode, add your test TikTok account as a target user so OAuth login works.

## After Deployment

Update the main ContentBoss Studio homepage nav link: in the repo root,
`public/index.html` contains a `Demo` link pointing at the placeholder
`https://contentboss-demo.vercel.app` — replace it with your actual Vercel URL
if the project name differs.

## How the Demo Works

| Step | Scope | What happens |
|------|-------|--------------|
| 1. Login with TikTok | `user.info.basic` | Redirects to TikTok OAuth with CSRF `state`; on return, `/api/token` exchanges the code server-side, `/api/user-info` shows "Connected as @username" with avatar |
| 2. Select video | `video.upload` | Preview of the sample video, or paste any public HTTPS MP4 URL |
| 3. Post to TikTok | `video.publish` | `/api/post-video` calls the direct post endpoint with `PULL_FROM_URL`, the page polls status: uploading → processing → posted ✅ |

## Security Notes

- `CLIENT_SECRET` lives only in Vercel environment variables and is used exclusively
  inside `api/token.js`. It is **never** sent to the browser.
- `CLIENT_KEY` is public by design (it appears in the TikTok authorize URL).
- OAuth uses a random `state` parameter stored in `sessionStorage` and verified on
  callback to prevent CSRF.
- The post defaults to `privacy_level: SELF_ONLY` (sandbox-safe). After app approval,
  change it in `api/post-video.js` if public posting is desired.
- API responses are sent with `Cache-Control: no-store` so tokens are never cached.
