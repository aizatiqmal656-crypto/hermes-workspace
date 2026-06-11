/**
 * ffmpeg merge tool (VideoGeneratorAgent) — Phase R4.
 *
 * mergeVideoClips(videoUrls, audioUrl) downloads the clips + audio, concatenates
 * the clips in sequence, muxes the audio track, and returns the output file
 * path. Uses a server-side ffmpeg binary. If ffmpeg is unavailable it returns a
 * fallback result (never throws) so the browser-side ffmpeg.wasm path can still
 * be used as the primary merge route.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeTikTokMemory } from '../swarm-memory'

export type MergeResult = {
  ok: boolean
  outputPath?: string
  clipCount: number
  fallback?: boolean
  error?: string
}

function ffmpegBin(): string {
  return process.env.HERMES_FFMPEG_BIN || process.env.FFMPEG_BIN || 'ffmpeg'
}

function runFfmpeg(args: Array<string>): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let stderr = ''
    let proc
    try {
      proc = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
      return
    }
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('close', (code) =>
      resolve(code === 0 ? { ok: true } : { ok: false, error: stderr.split('\n').slice(-4).join(' ').trim() || `ffmpeg exit ${code}` }),
    )
  })
}

async function ffmpegAvailable(): Promise<boolean> {
  const result = await runFfmpeg(['-version'])
  return result.ok
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download HTTP ${res.status} for ${url.slice(0, 60)}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

export async function mergeVideoClips(videoUrls: Array<string>, audioUrl: string): Promise<MergeResult> {
  const clips = videoUrls.filter((u) => typeof u === 'string' && u.length > 0)
  if (clips.length === 0) {
    return { ok: false, clipCount: 0, error: 'no video URLs provided' }
  }

  if (!(await ffmpegAvailable())) {
    console.warn('[tool:ffmpeg] ffmpeg binary not available — use browser ffmpeg.wasm fallback')
    return {
      ok: false,
      clipCount: clips.length,
      fallback: true,
      error: 'Server ffmpeg not installed — merge in-browser via ffmpeg.wasm instead.',
    }
  }

  try {
    const work = mkdtempSync(join(tmpdir(), 'tiktok-merge-'))
    const t0 = Date.now()

    // 1. Download clips.
    const localClips: Array<string> = []
    for (let i = 0; i < clips.length; i++) {
      const dest = join(work, `clip-${i}.mp4`)
      await download(clips[i], dest)
      localClips.push(dest)
    }

    // 2. Concat clips (re-encode for safe concatenation of heterogeneous inputs).
    const listPath = join(work, 'list.txt')
    writeFileSync(listPath, localClips.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))
    const mergedPath = join(work, 'merged.mp4')
    const concat = await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mergedPath])
    if (!concat.ok) throw new Error(`concat failed: ${concat.error}`)

    // 3. Mux audio if provided.
    let outputPath = mergedPath
    if (audioUrl) {
      const audioPath = join(work, 'audio.mp3')
      await download(audioUrl, audioPath)
      const finalPath = join(work, 'tiktok-final.mp4')
      const mux = await runFfmpeg([
        '-y', '-i', mergedPath, '-i', audioPath,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-map', '0:v:0', '-map', '1:a:0', '-shortest', finalPath,
      ])
      if (!mux.ok) throw new Error(`audio mux failed: ${mux.error}`)
      outputPath = finalPath
    }

    console.log(`[tool:ffmpeg] merged ${clips.length} clips${audioUrl ? ' + audio' : ''} in ${Math.round((Date.now() - t0) / 1000)}s → ${outputPath}`)
    writeTikTokMemory('video-generator', 'videos', `merged-${Date.now()}`, {
      outputPath,
      clipCount: clips.length,
      hasAudio: Boolean(audioUrl),
    })
    return { ok: true, outputPath, clipCount: clips.length }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[tool:ffmpeg] merge failed:', error)
    return { ok: false, clipCount: clips.length, error }
  }
}
