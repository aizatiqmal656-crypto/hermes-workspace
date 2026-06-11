/**
 * HermesTikTok video streaming + download endpoint — Phase R6.
 *
 * GET /api/tiktok-video/:missionId        → inline stream (browser playback)
 * GET /api/tiktok-video/:missionId?dl=1   → attachment download
 *
 * If finalVideoUrl is a local file path, the file is read and streamed with
 * correct Content-Type and range support. If it is a remote URL (fal.ai CDN),
 * the response is proxied transparently so the browser never needs the CDN key.
 *
 * Returns 404 while the pipeline is still running or if no video was produced.
 */

import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getPipelineMission } from '../../server/tiktok-pipeline'

function safeStatSize(filePath: string): number | null {
  try {
    return statSync(filePath).size
  } catch {
    return null
  }
}

function isLocalPath(url: string): boolean {
  return url.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(url)
}

function productSlug(product: string): string {
  return product
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function nodeReadableToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      })
      nodeStream.on('end', () => controller.close())
      nodeStream.on('error', (err) => controller.error(err))
    },
    cancel() {
      nodeStream.destroy()
    },
  })
}

export const Route = createFileRoute('/api/tiktok-video/$missionId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response('Unauthorized', { status: 401 })
        }

        const { missionId } = params
        const mission = getPipelineMission(missionId)

        if (!mission) {
          return new Response(
            JSON.stringify({ ok: false, error: `No pipeline mission: ${missionId}` }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const videoUrl = mission.finalVideoUrl
        if (!videoUrl) {
          const still = mission.status === 'running'
          return new Response(
            JSON.stringify({
              ok: false,
              error: still
                ? 'Video not ready yet — pipeline still running'
                : 'No final video was produced (ffmpeg may not be installed on the server)',
              status: mission.status,
              videos: mission.outputs.videos,
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const url = new URL(request.url)
        const forceDownload = url.searchParams.get('dl') === '1'
        const filename = `tiktok-${productSlug(mission.product)}-${dateStamp()}.mp4`
        const disposition = forceDownload
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`

        // ── Local file ────────────────────────────────────────────────────────
        if (isLocalPath(videoUrl)) {
          const fileSize = safeStatSize(videoUrl)
          if (fileSize === null) {
            return new Response('Video file not found on server', { status: 404 })
          }

          const rangeHeader = request.headers.get('range')

          // Range request (video seeking support)
          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
            if (!match) {
              return new Response('Invalid Range header', { status: 416 })
            }
            const start = parseInt(match[1], 10)
            const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
            const chunkSize = end - start + 1

            const nodeStream = createReadStream(videoUrl, { start, end })
            return new Response(nodeReadableToWeb(nodeStream) as BodyInit, {
              status: 206,
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': String(chunkSize),
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Disposition': disposition,
                'Cache-Control': 'no-store',
              },
            })
          }

          // Full file
          const nodeStream = createReadStream(videoUrl)
          return new Response(nodeReadableToWeb(nodeStream) as BodyInit, {
            status: 200,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': String(fileSize),
              'Accept-Ranges': 'bytes',
              'Content-Disposition': disposition,
              'Cache-Control': 'no-store',
            },
          })
        }

        // ── Remote URL (fal.ai CDN) — proxy ──────────────────────────────────
        try {
          const upstream = await fetch(videoUrl, {
            headers: request.headers.get('range')
              ? { Range: request.headers.get('range') as string }
              : {},
          })
          if (!upstream.ok && upstream.status !== 206) {
            return new Response(
              `Upstream video fetch failed: HTTP ${upstream.status}`,
              { status: 502 },
            )
          }

          const proxyHeaders: Record<string, string> = {
            'Content-Type': upstream.headers.get('Content-Type') ?? 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Content-Disposition': disposition,
            'Cache-Control': 'no-store',
          }
          const upLen = upstream.headers.get('Content-Length')
          if (upLen) proxyHeaders['Content-Length'] = upLen
          const upRange = upstream.headers.get('Content-Range')
          if (upRange) proxyHeaders['Content-Range'] = upRange

          return new Response(upstream.body, {
            status: upstream.status,
            headers: proxyHeaders,
          })
        } catch (err) {
          return new Response(
            `Proxy error: ${err instanceof Error ? err.message : String(err)}`,
            { status: 502 },
          )
        }
      },
    },
  },
})
