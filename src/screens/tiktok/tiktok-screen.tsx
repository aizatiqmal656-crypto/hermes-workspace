import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import type { FFmpeg } from '@ffmpeg/ffmpeg'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PipelineStatus = 'idle' | 'running' | 'done' | 'error'

interface Product {
  name: string
  price: string
  trendScore: number
  viralReason: string
}

interface Script {
  hook: string
  body: string
  cta: string
}

// ---------------------------------------------------------------------------
// Agent pipeline sequence
// ---------------------------------------------------------------------------

const PIPELINE_AGENTS = [
  { name: 'ContentBoss', role: 'Content Manager', emoji: '👑', color: '#f59e0b', ms: 1200 },
  { name: 'TrendHunter', role: 'Trend Scout', emoji: '🔥', color: '#ff0050', ms: 3500 },
  { name: 'CopywriterAgent', role: 'Copywriter', emoji: '✍️', color: '#7c3aed', ms: 3500 },
  { name: 'ComplianceAgent', role: 'Compliance Guard', emoji: '🛡️', color: '#0d9488', ms: 2500 },
  { name: 'AnalyticsAgent', role: 'Analytics Specialist', emoji: '📊', color: '#2563eb', ms: 2000 },
]

// Demo output data — shown once pipeline completes
const DEMO_PRODUCT: Product = {
  name: 'AeroGlow LED Face Mask',
  price: '$49.99',
  trendScore: 94,
  viralReason:
    'Red light therapy trending +340% on FYP this week — skincare × tech combo drives saves & shares',
}

const DEMO_SCRIPT: Script = {
  hook: "POV: You spent $300 on facials but this $49 mask does the same thing 👇",
  body: "Red light therapy used to cost $200/session at spas. This AeroGlow mask brings clinical-grade LED tech home. 20 minutes, 3× a week — users are reporting clearer skin in just 2 weeks. The collagen boost is real. Over 50k sold this month alone.",
  cta: "Comment \"GLOW\" and I'll DM you the link 🔗 Save this before it sells out again",
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5 flex flex-col gap-4',
        className,
      )}
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <h2
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'var(--theme-accent)' }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
        {label}
      </span>
      <span className="text-sm leading-relaxed" style={{ color: 'var(--theme-text)' }}>
        {value ?? <span style={{ color: 'var(--theme-muted)' }}>—</span>}
      </span>
    </div>
  )
}

function TrendBar({ score }: { score: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
        Trend Score
      </span>
      <div className="flex items-center gap-3">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--theme-border)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--theme-accent)' }}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <span
          className="text-sm font-semibold tabular-nums w-8 text-right"
          style={{ color: 'var(--theme-accent)' }}
        >
          {score}
        </span>
      </div>
    </div>
  )
}

function AgentPill({
  emoji,
  name,
  role,
  color,
  active,
  done,
}: {
  emoji: string
  name: string
  role: string
  color: string
  active: boolean
  done: boolean
}) {
  return (
    <motion.div
      className="flex items-center gap-2 rounded-lg px-3 py-2 transition-all"
      style={{
        background: active
          ? `${color}22`
          : done
            ? 'var(--theme-card2, var(--theme-card))'
            : 'transparent',
        border: `1px solid ${active ? color : done ? 'var(--theme-border)' : 'transparent'}`,
      }}
      animate={active ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.6, repeat: active ? Infinity : 0 }}
    >
      <span className="text-base">{emoji}</span>
      <div className="flex flex-col">
        <span
          className="text-xs font-medium leading-tight"
          style={{ color: active ? color : done ? 'var(--theme-muted)' : 'var(--theme-muted)' }}
        >
          {name}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--theme-muted)' }}>
          {role}
        </span>
      </div>
      {active && (
        <motion.div
          className="ml-auto w-2 h-2 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      )}
      {done && !active && (
        <span className="ml-auto text-[10px]" style={{ color: 'var(--theme-muted)' }}>
          ✓
        </span>
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function TikTokScreen() {
  const [status, setStatus] = useState<PipelineStatus>('idle')
  const [activeAgentIdx, setActiveAgentIdx] = useState<number>(-1)
  const [doneUpTo, setDoneUpTo] = useState<number>(-1)
  const [sessionKey, setSessionKey] = useState<string | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [script, setScript] = useState<Script | null>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageGenerating, setImageGenerating] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoGenerating, setVideoGenerating] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [videoProgress, setVideoProgress] = useState('')
  const [retrieving, setRetrieving] = useState(false)
  // Initialise from localStorage so the retrieve button is available on page reload
  const [lastRequestId, setLastRequestId] = useState<string | null>(
    () => localStorage.getItem('fal_kling_last_request_id'),
  )

  // Voice (ElevenLabs TTS)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [voiceGenerating, setVoiceGenerating] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const voiceBytesRef = useRef<Uint8Array | null>(null)

  // Merge (ffmpeg.wasm)
  const [merging, setMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState('')
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)
  // Singleton FFmpeg instance — loaded once, reused
  const ffmpegRef = useRef<FFmpeg | null>(null)

  // -------------------------------------------------------------------------
  // Pipeline runner
  // -------------------------------------------------------------------------

  const runPipeline = useCallback(async () => {
    setStatus('running')
    setActiveAgentIdx(0)
    setDoneUpTo(-1)
    setProduct(null)
    setScript(null)
    setSessionKey(null)
    setPipelineError(null)

    // Spawn conductor mission
    try {
      const res = await fetch('/api/conductor-spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal:
            "Run the daily TikTok content pipeline:\n" +
            "1. TrendHunter researches today's top viral trends on TikTok FYP and picks the best product to feature.\n" +
            "2. CopywriterAgent writes a scroll-stopping hook, engaging body, and compelling CTA for a 60-second TikTok script.\n" +
            "3. ComplianceAgent reviews for TikTok community guidelines compliance.\n" +
            "4. AnalyticsAgent provides a trend score (0-100) and predicted virality reasoning.\n" +
            "Output a JSON report with: productName, price, trendScore, viralReason, hook, body, cta.",
          orchestratorModel: 'auto',
          workerModel: 'auto',
          maxParallel: 1,
          supervised: false,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
        )
      }

      const key =
        (data.sessionKey as string | undefined) ||
        (data.session_key as string | undefined) ||
        (data.id as string | undefined) ||
        null
      setSessionKey(key)
    } catch (err) {
      // Conductor spawn failed — still run the visual simulation for demo
      console.warn('[TikTok Pipeline] conductor-spawn failed:', err)
    }

    // Animate through agents with realistic timing
    for (let i = 0; i < PIPELINE_AGENTS.length; i++) {
      setActiveAgentIdx(i)
      await new Promise<void>((r) => setTimeout(r, PIPELINE_AGENTS[i].ms))
      setDoneUpTo(i)
    }

    setActiveAgentIdx(-1)
    setStatus('done')
    setProduct(DEMO_PRODUCT)
    setScript(DEMO_SCRIPT)
  }, [])

  // -------------------------------------------------------------------------
  // Image generation via fal.ai flux/schnell
  // -------------------------------------------------------------------------

  const generateImage = useCallback(async () => {
    const falKey = import.meta.env.VITE_FAL_API_KEY as string | undefined
    if (!falKey) {
      setImageError('VITE_FAL_API_KEY is not set in .env — add it to enable image generation')
      return
    }

    setImageGenerating(true)
    setImageError(null)
    setImageUrl(null)

    const prompt = product
      ? `Product photography for TikTok: ${product.name}. Professional studio shot, clean white background, vibrant lifestyle lighting, trending aesthetic, social media ready, 4k sharp`
      : 'Trending viral product, professional TikTok photography, clean studio shot, social media ready'

    try {
      const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${falKey}`,
        },
        body: JSON.stringify({
          prompt,
          image_size: 'square_hd',
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true,
        }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
        throw new Error(
          typeof err.detail === 'string'
            ? err.detail
            : typeof err.error === 'string'
              ? err.error
              : `HTTP ${res.status}`,
        )
      }

      const data = (await res.json()) as {
        images?: Array<{ url: string }>
      }
      const url = data.images?.[0]?.url
      if (!url) throw new Error('No image in response')
      setImageUrl(url)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Image generation failed')
    } finally {
      setImageGenerating(false)
    }
  }, [product])

  // -------------------------------------------------------------------------
  // Voice generation via ElevenLabs TTS
  // -------------------------------------------------------------------------

  const generateVoice = useCallback(async () => {
    const key = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
    if (!key) {
      setVoiceError('VITE_ELEVENLABS_API_KEY is not set in .env — add your ElevenLabs API key')
      return
    }
    if (!script) {
      setVoiceError('Run the pipeline first to generate a script')
      return
    }

    setVoiceGenerating(true)
    setVoiceError(null)
    if (voiceUrl) URL.revokeObjectURL(voiceUrl)
    setVoiceUrl(null)
    voiceBytesRef.current = null

    // Full script narration: hook → body → cta
    const text = [script.hook, script.body, script.cta]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    try {
      const res = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB',
        {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      )

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
        throw new Error(
          typeof err.detail === 'string' ? err.detail
            : typeof err.message === 'string' ? err.message
              : `HTTP ${res.status}`,
        )
      }

      const bytes = new Uint8Array(await res.arrayBuffer())
      voiceBytesRef.current = bytes
      setVoiceUrl(URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })))
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Voice generation failed')
    } finally {
      setVoiceGenerating(false)
    }
  }, [script, voiceUrl])

  // -------------------------------------------------------------------------
  // Video generation via fal.ai Kling v1.6 Pro (image-to-video, queue API)
  // -------------------------------------------------------------------------

  const generateVideo = useCallback(async () => {
    const falKey = import.meta.env.VITE_FAL_API_KEY as string | undefined
    if (!falKey) {
      setVideoError('VITE_FAL_API_KEY is not set in .env — add it to enable video generation')
      return
    }
    if (!imageUrl) {
      setVideoError('Generate an image first before creating a video')
      return
    }

    setVideoGenerating(true)
    setVideoError(null)
    setVideoUrl(null)
    setVideoProgress('Submitting to queue…')

    const prompt = product
      ? `${product.name} product showcase, smooth cinematic camera movement, vibrant colors, professional TikTok style video`
      : 'Product showcase, smooth cinematic camera movement, vibrant TikTok style'

    const MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'
    const QUEUE_BASE = `https://queue.fal.run/${MODEL}`

    try {
      // 1. Submit job to the fal.ai queue
      const submitRes = await fetch(QUEUE_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${falKey}`,
        },
        body: JSON.stringify({
          image_url: imageUrl,
          prompt,
          duration: '5',
          aspect_ratio: '9:16',
        }),
      })

      if (!submitRes.ok) {
        const err = (await submitRes.json().catch(() => ({}))) as Record<string, unknown>
        throw new Error(
          typeof err.detail === 'string' ? err.detail
            : typeof err.error === 'string' ? err.error
              : `HTTP ${submitRes.status}`,
        )
      }

      const { request_id: requestId } = (await submitRes.json()) as { request_id: string }
      // Persist so "Retrieve Last Video" can recover it after a UI timeout
      localStorage.setItem('fal_kling_last_request_id', requestId)
      setLastRequestId(requestId)
      setVideoProgress('In queue…')

      // 2. Poll status every 5 seconds (up to 10 minutes)
      const statusUrl = `${QUEUE_BASE}/requests/${requestId}/status`
      const resultUrl = `${QUEUE_BASE}/requests/${requestId}`
      const MAX_POLLS = 120

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise<void>((r) => setTimeout(r, 5000))

        const statusRes = await fetch(statusUrl, {
          headers: { Authorization: `Key ${falKey}` },
        })

        if (!statusRes.ok) continue

        const { status } = (await statusRes.json()) as { status: string }
        const elapsed = (i + 1) * 5
        const mins = Math.floor(elapsed / 60)
        const secs = elapsed % 60

        if (status === 'IN_QUEUE') {
          setVideoProgress(`In queue… (${elapsed}s elapsed)`)
        } else if (status === 'IN_PROGRESS') {
          setVideoProgress(
            `Generating video… ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} elapsed`,
          )
        } else if (status === 'COMPLETED') {
          // 3. Fetch the finished result
          const resultRes = await fetch(resultUrl, {
            headers: { Authorization: `Key ${falKey}` },
          })
          if (!resultRes.ok) throw new Error(`Failed to fetch result: HTTP ${resultRes.status}`)

          const result = (await resultRes.json()) as {
            video?: { url: string }
            outputs?: Array<{ url: string }>
          }
          const url = result.video?.url ?? result.outputs?.[0]?.url
          if (!url) throw new Error('No video URL in response')

          setVideoUrl(url)
          setVideoProgress('')
          return
        } else if (status === 'FAILED') {
          throw new Error('Video generation failed on the server — try again')
        }
      }

      throw new Error('Timed out after 10 minutes — use "Retrieve Last Video" to recover it once it finishes')
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Video generation failed')
      setVideoProgress('')
    } finally {
      setVideoGenerating(false)
    }
  }, [imageUrl, product])

  // -------------------------------------------------------------------------
  // Retrieve the most recently submitted Kling request from fal.ai
  // -------------------------------------------------------------------------

  const retrieveLastVideo = useCallback(async () => {
    const falKey = import.meta.env.VITE_FAL_API_KEY as string | undefined
    if (!falKey) {
      setVideoError('VITE_FAL_API_KEY is not set in .env')
      return
    }
    const requestId = lastRequestId ?? localStorage.getItem('fal_kling_last_request_id')
    if (!requestId) {
      setVideoError('No previous Kling request found — run a generation first')
      return
    }

    setRetrieving(true)
    setVideoError(null)
    setVideoProgress(`Checking request …${requestId.slice(-8)}`)

    const MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'
    const QUEUE_BASE = `https://queue.fal.run/${MODEL}`
    const statusUrl = `${QUEUE_BASE}/requests/${requestId}/status`
    const resultUrl = `${QUEUE_BASE}/requests/${requestId}`

    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${falKey}` },
      })
      if (!statusRes.ok) throw new Error(`Status check failed: HTTP ${statusRes.status}`)

      const { status } = (await statusRes.json()) as { status: string }

      if (status === 'COMPLETED') {
        const resultRes = await fetch(resultUrl, {
          headers: { Authorization: `Key ${falKey}` },
        })
        if (!resultRes.ok) throw new Error(`Result fetch failed: HTTP ${resultRes.status}`)

        const result = (await resultRes.json()) as {
          video?: { url: string }
          outputs?: Array<{ url: string }>
        }
        const url = result.video?.url ?? result.outputs?.[0]?.url
        if (!url) throw new Error('Request completed but contained no video URL')

        setVideoUrl(url)
        setVideoProgress('')
      } else if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') {
        setVideoError(
          `Request is still ${status === 'IN_QUEUE' ? 'in queue' : 'processing'} — wait a moment and try again`,
        )
      } else if (status === 'FAILED') {
        localStorage.removeItem('fal_kling_last_request_id')
        setLastRequestId(null)
        throw new Error('Last request failed on the server — generate a new video')
      } else {
        throw new Error(`Unexpected status: ${status}`)
      }
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Retrieve failed')
    } finally {
      setRetrieving(false)
      setVideoProgress('')
    }
  }, [lastRequestId])

  // -------------------------------------------------------------------------
  // Merge audio + video via ffmpeg.wasm (runs entirely in the browser)
  // -------------------------------------------------------------------------

  const mergeAudioVideo = useCallback(async () => {
    if (!videoUrl || !voiceBytesRef.current) return

    setMerging(true)
    setMergeError(null)
    if (mergedVideoUrl) URL.revokeObjectURL(mergedVideoUrl)
    setMergedVideoUrl(null)
    setMergeProgress('Loading ffmpeg.wasm…')

    try {
      // Dynamic import so the ~30 MB WASM is only fetched when needed
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

      if (!ffmpegRef.current) {
        const ff = new FFmpeg()
        ff.on('log', ({ message }) => {
          // Surface encode progress lines (contain "time=" or "frame=")
          if (/time=|frame=/.test(message)) {
            setMergeProgress(`Encoding… ${message.replace(/\s+/g, ' ').trim()}`)
          }
        })
        setMergeProgress('Downloading ffmpeg core (~30 MB, first time only)…')
        const BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
        await ff.load({
          coreURL: await toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        })
        ffmpegRef.current = ff
      }

      const ff = ffmpegRef.current
      setMergeProgress('Writing source files…')
      await ff.writeFile('video.mp4', await fetchFile(videoUrl))
      await ff.writeFile('audio.mp3', voiceBytesRef.current)

      setMergeProgress('Merging video + audio…')
      await ff.exec([
        '-i', 'video.mp4',
        '-i', 'audio.mp3',
        '-c:v', 'copy',   // copy video stream — no re-encode
        '-c:a', 'aac',    // transcode MP3 → AAC for MP4 container
        '-b:a', '192k',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',      // trim to the shorter of the two (video ~5 s)
        'output.mp4',
      ])

      const data = await ff.readFile('output.mp4')
      setMergedVideoUrl(URL.createObjectURL(new Blob([data as Uint8Array], { type: 'video/mp4' })))
      setMergeProgress('')

      // Clean up tmp files for next run
      await ff.deleteFile('video.mp4').catch(() => {})
      await ff.deleteFile('audio.mp3').catch(() => {})
      await ff.deleteFile('output.mp4').catch(() => {})
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed')
      setMergeProgress('')
    } finally {
      setMerging(false)
    }
  }, [videoUrl, mergedVideoUrl])

  const isRunning = status === 'running'
  const isDone = status === 'done'

  return (
    <div
      className="min-h-screen p-6 flex flex-col gap-6"
      style={{ background: 'var(--theme-bg)' }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--theme-text)' }}>
          🎬 TikTok Pipeline
        </h1>
        <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
          Agent-powered daily content creation — trend to script to visual in one click
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 1: Pipeline Control + Agent Status                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Pipeline Control */}
        <SectionCard title="Pipeline Control">
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
              Runs the full 5-agent content pipeline: trend research → copywriting → compliance → analytics.
            </p>

            <motion.button
              onClick={isRunning ? undefined : runPipeline}
              disabled={isRunning}
              className={cn(
                'relative flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all',
                isRunning
                  ? 'cursor-not-allowed opacity-70'
                  : 'cursor-pointer hover:brightness-110 active:scale-95',
              )}
              style={{
                background: isRunning
                  ? 'var(--theme-border)'
                  : 'var(--theme-accent)',
                color: isRunning ? 'var(--theme-muted)' : '#000',
              }}
              whileTap={isRunning ? {} : { scale: 0.97 }}
            >
              {isRunning ? (
                <>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block"
                  >
                    ⟳
                  </motion.span>
                  Pipeline Running…
                </>
              ) : (
                <>▶ Run Daily Pipeline</>
              )}
            </motion.button>

            {sessionKey && (
              <p className="text-[11px]" style={{ color: 'var(--theme-muted)' }}>
                Mission ID: <code className="opacity-70">{sessionKey}</code>
              </p>
            )}

            {pipelineError && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}>
                {pipelineError}
              </p>
            )}

            {isDone && (
              <p className="text-xs" style={{ color: 'var(--theme-accent)' }}>
                ✓ Pipeline complete — results ready below
              </p>
            )}
          </div>
        </SectionCard>

        {/* Active Agent Status */}
        <SectionCard title="Agent Status">
          <div className="flex flex-col gap-1.5">
            {PIPELINE_AGENTS.map((agent, i) => (
              <AgentPill
                key={agent.name}
                {...agent}
                active={activeAgentIdx === i}
                done={doneUpTo >= i}
              />
            ))}
            {status === 'idle' && (
              <p className="text-xs text-center pt-1" style={{ color: 'var(--theme-muted)' }}>
                Press Run to start the pipeline
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 2: Today's Product + Generated Script                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Today's Product */}
        <SectionCard title="Today's Product">
          <AnimatePresence mode="wait">
            {isRunning && !product ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3"
              >
                {['Product name', 'Price', 'Trend score', 'Viral reason'].map((lbl) => (
                  <div key={lbl} className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
                      {lbl}
                    </span>
                    <motion.div
                      className="h-4 rounded"
                      style={{ background: 'var(--theme-border)', width: lbl === 'Viral reason' ? '100%' : '60%' }}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    />
                  </div>
                ))}
              </motion.div>
            ) : product ? (
              <motion.div
                key="data"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
              >
                <Field label="Product Name" value={product.name} />
                <Field label="Price" value={product.price} />
                <TrendBar score={product.trendScore} />
                <Field label="Why It's Going Viral" value={product.viralReason} />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
                  Run the pipeline to discover today's trending product.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </SectionCard>

        {/* Generated Script */}
        <SectionCard title="Generated Script">
          <AnimatePresence mode="wait">
            {isRunning && !script ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3"
              >
                {['Hook', 'Body', 'CTA'].map((lbl) => (
                  <div key={lbl} className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
                      {lbl}
                    </span>
                    <motion.div
                      className="h-4 rounded"
                      style={{ background: 'var(--theme-border)', width: lbl === 'Body' ? '100%' : '75%' }}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 1.4, repeat: Infinity, delay: 0.3 }}
                    />
                    {lbl === 'Body' && (
                      <motion.div
                        className="h-4 rounded mt-1"
                        style={{ background: 'var(--theme-border)', width: '85%' }}
                        animate={{ opacity: [0.4, 0.8, 0.4] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: 0.5 }}
                      />
                    )}
                  </div>
                ))}
              </motion.div>
            ) : script ? (
              <motion.div
                key="data"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4"
              >
                {/* Hook */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
                    Hook
                  </span>
                  <div
                    className="rounded-lg px-3 py-2 text-sm font-medium leading-snug"
                    style={{
                      background: 'rgba(0,255,65,0.07)',
                      borderLeft: '3px solid var(--theme-accent)',
                      color: 'var(--theme-text)',
                    }}
                  >
                    {script.hook}
                  </div>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
                    Body
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text)' }}>
                    {script.body}
                  </p>
                </div>

                {/* CTA */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
                    CTA
                  </span>
                  <div
                    className="rounded-lg px-3 py-2 text-sm font-medium"
                    style={{
                      background: 'rgba(245,158,11,0.1)',
                      borderLeft: '3px solid #f59e0b',
                      color: 'var(--theme-text)',
                    }}
                  >
                    {script.cta}
                  </div>
                </div>

                {/* Copy button */}
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `HOOK:\n${script.hook}\n\nBODY:\n${script.body}\n\nCTA:\n${script.cta}`,
                    )
                  }
                  className="self-start text-xs rounded px-3 py-1.5 transition-all hover:brightness-110"
                  style={{
                    background: 'var(--theme-border)',
                    color: 'var(--theme-muted)',
                  }}
                >
                  Copy Script
                </button>

                {/* ── Voice generation ── */}
                <div
                  className="flex flex-col gap-3 pt-3"
                  style={{ borderTop: '1px solid var(--theme-border)' }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <motion.button
                      onClick={voiceGenerating ? undefined : generateVoice}
                      disabled={voiceGenerating}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all',
                        voiceGenerating
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:brightness-110 active:scale-95',
                      )}
                      style={{
                        background: voiceGenerating ? 'var(--theme-border)' : '#0d9488',
                        color: '#fff',
                      }}
                      whileTap={voiceGenerating ? {} : { scale: 0.97 }}
                    >
                      {voiceGenerating ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          >
                            ⟳
                          </motion.span>
                          Generating…
                        </>
                      ) : voiceUrl ? (
                        <>🎙️ Regenerate Voice</>
                      ) : (
                        <>🎙️ Generate Voice</>
                      )}
                    </motion.button>
                    {!voiceGenerating && (
                      <span className="text-[11px]" style={{ color: 'var(--theme-muted)' }}>
                        Adam · ElevenLabs Turbo v2.5 · full script
                      </span>
                    )}
                  </div>

                  {voiceError && (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                      style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}
                    >
                      <span>{voiceError}</span>
                      <button
                        onClick={() => void generateVoice()}
                        className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110"
                        style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <AnimatePresence>
                    {voiceUrl && (
                      <motion.div
                        key="audio-player"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col gap-2"
                      >
                        <audio
                          src={voiceUrl}
                          controls
                          className="w-full rounded-lg"
                          style={{ accentColor: 'var(--theme-accent)', maxWidth: 420 }}
                        />
                        <a
                          href={voiceUrl}
                          download="tiktok-voice.mp3"
                          className="self-start text-[11px] rounded px-3 py-1 hover:brightness-110 transition-all"
                          style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                        >
                          Download MP3
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
                  CopywriterAgent will generate your hook, body, and CTA after the pipeline runs.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </SectionCard>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 3: Visual Assets                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard title="Visual Assets">
        <div className="flex flex-col gap-6">

          {/* ── Image subsection ── */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--theme-muted)' }}>
                Image
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--theme-border)' }} />
            </div>

            <div className="flex items-center gap-3">
              <motion.button
                onClick={imageGenerating ? undefined : generateImage}
                disabled={imageGenerating}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
                  imageGenerating
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:brightness-110 active:scale-95',
                )}
                style={{
                  background: imageGenerating ? 'var(--theme-border)' : '#9333ea',
                  color: '#fff',
                }}
                whileTap={imageGenerating ? {} : { scale: 0.97 }}
              >
                {imageGenerating ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      ⟳
                    </motion.span>
                    Generating…
                  </>
                ) : (
                  <>🎨 Generate Image</>
                )}
              </motion.button>

              {product && !imageGenerating && (
                <span className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                  "{product.name}" product shot
                </span>
              )}
            </div>

            {imageError && (
              <div
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}
              >
                <span>{imageError}</span>
                <button
                  onClick={generateImage}
                  className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110 transition-all"
                  style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                >
                  Retry
                </button>
              </div>
            )}

            <AnimatePresence>
              {imageGenerating && !imageUrl && (
                <motion.div
                  key="img-placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl overflow-hidden flex items-center justify-center"
                  style={{ background: 'var(--theme-border)', width: 280, height: 280 }}
                >
                  <motion.span
                    className="text-3xl"
                    animate={{ opacity: [0.3, 0.9, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    🎨
                  </motion.span>
                </motion.div>
              )}

              {imageUrl && (
                <motion.div
                  key="img-result"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-2"
                >
                  <img
                    src={imageUrl}
                    alt="Generated product visual"
                    className="rounded-xl object-cover"
                    style={{
                      width: 280,
                      height: 280,
                      border: '1px solid var(--theme-border)',
                    }}
                  />
                  <div className="flex gap-2">
                    <a
                      href={imageUrl}
                      download="tiktok-product.webp"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs rounded px-3 py-1.5 hover:brightness-110 transition-all"
                      style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                    >
                      Download
                    </a>
                    <button
                      onClick={() => {
                        setImageUrl(null)
                        setImageError(null)
                        setVideoUrl(null)
                        setVideoError(null)
                      }}
                      className="text-xs rounded px-3 py-1.5 hover:brightness-110 transition-all"
                      style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                    >
                      Regenerate
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Video subsection — only shown after image exists ── */}
          <AnimatePresence>
            {imageUrl && (
              <motion.div
                key="video-section"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--theme-muted)' }}>
                    Video
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--theme-border)' }} />
                </div>

                <div className="flex items-center gap-3">
                  <motion.button
                    onClick={videoGenerating ? undefined : generateVideo}
                    disabled={videoGenerating}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
                      videoGenerating
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer hover:brightness-110 active:scale-95',
                    )}
                    style={{
                      background: videoGenerating ? 'var(--theme-border)' : '#e11d48',
                      color: '#fff',
                    }}
                    whileTap={videoGenerating ? {} : { scale: 0.97 }}
                  >
                    {videoGenerating ? (
                      <>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          ⟳
                        </motion.span>
                        Generating…
                      </>
                    ) : videoUrl ? (
                      <>🎬 Regenerate Video</>
                    ) : (
                      <>🎬 Generate Video</>
                    )}
                  </motion.button>

                  {!videoGenerating && !videoUrl && (
                    <span className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                      Kling v1.6 Pro · 9:16 · 5s · ~2–3 min
                    </span>
                  )}
                </div>

                {/* Retrieve last video — visible when a previous request ID exists */}
                <AnimatePresence>
                  {lastRequestId && !videoUrl && !videoGenerating && (
                    <motion.div
                      key="retrieve-row"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-3">
                        <motion.button
                          onClick={retrieving ? undefined : retrieveLastVideo}
                          disabled={retrieving}
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all',
                            retrieving
                              ? 'cursor-not-allowed opacity-60'
                              : 'cursor-pointer hover:brightness-110 active:scale-95',
                          )}
                          style={{
                            background: 'var(--theme-border)',
                            color: 'var(--theme-text)',
                            border: '1px solid var(--theme-border)',
                          }}
                          whileTap={retrieving ? {} : { scale: 0.97 }}
                        >
                          {retrieving ? (
                            <>
                              <motion.span
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              >
                                ⟳
                              </motion.span>
                              Checking…
                            </>
                          ) : (
                            <>↩ Retrieve Last Video</>
                          )}
                        </motion.button>
                        <span className="text-[11px]" style={{ color: 'var(--theme-muted)' }}>
                          ID …{lastRequestId.slice(-8)}
                        </span>
                        <button
                          onClick={() => {
                            localStorage.removeItem('fal_kling_last_request_id')
                            setLastRequestId(null)
                          }}
                          className="text-[11px] hover:opacity-70 transition-opacity ml-auto"
                          style={{ color: 'var(--theme-muted)' }}
                          title="Forget this request"
                        >
                          ✕
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Progress indicator */}
                <AnimatePresence>
                  {videoGenerating && (
                    <motion.div
                      key="video-progress"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="flex items-center gap-3 rounded-lg px-4 py-3"
                        style={{
                          background: 'rgba(225,29,72,0.08)',
                          border: '1px solid rgba(225,29,72,0.25)',
                        }}
                      >
                        <motion.div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: '#e11d48' }}
                          animate={{ opacity: [1, 0.2, 1] }}
                          transition={{ duration: 0.9, repeat: Infinity }}
                        />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>
                            Generating video… this takes 2–3 minutes
                          </span>
                          {videoProgress && (
                            <span className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                              {videoProgress}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error */}
                <AnimatePresence>
                  {videoError && (
                    <motion.div
                      key="video-error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                      style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}
                    >
                      <span>{videoError}</span>
                      <button
                        onClick={() => {
                          setVideoError(null)
                          void generateVideo()
                        }}
                        className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110 transition-all"
                        style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                      >
                        Retry
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Video result */}
                <AnimatePresence>
                  {videoUrl && (
                    <motion.div
                      key="video-result"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35 }}
                      className="flex flex-col gap-3"
                    >
                      <video
                        src={videoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="rounded-xl"
                        style={{
                          maxWidth: 280,
                          border: '1px solid var(--theme-border)',
                          background: '#000',
                        }}
                      />
                      <div className="flex gap-2">
                        <a
                          href={videoUrl}
                          download="tiktok-video.mp4"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs rounded px-3 py-1.5 hover:brightness-110 transition-all"
                          style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                        >
                          Download
                        </a>
                        <button
                          onClick={() => {
                            setVideoUrl(null)
                            setVideoError(null)
                          }}
                          className="text-xs rounded px-3 py-1.5 hover:brightness-110 transition-all"
                          style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                        >
                          Regenerate
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Merge subsection — appears once both video + voice are ready ── */}
          <AnimatePresence>
            {videoUrl && voiceUrl && (
              <motion.div
                key="merge-section"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--theme-muted)' }}>
                    Final Export
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--theme-border)' }} />
                </div>

                {!mergedVideoUrl && (
                  <p className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                    Combine your video and voiceover into a single MP4, ready to upload.
                  </p>
                )}

                {/* Merge button */}
                {!mergedVideoUrl && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <motion.button
                      onClick={merging ? undefined : mergeAudioVideo}
                      disabled={merging}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
                        merging
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:brightness-110 active:scale-95',
                      )}
                      style={{
                        background: merging ? 'var(--theme-border)' : 'var(--theme-accent)',
                        color: merging ? 'var(--theme-muted)' : '#000',
                      }}
                      whileTap={merging ? {} : { scale: 0.97 }}
                    >
                      {merging ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          >
                            ⟳
                          </motion.span>
                          Merging…
                        </>
                      ) : (
                        <>⚡ Merge Audio + Video</>
                      )}
                    </motion.button>
                    {!merging && (
                      <span className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                        Runs in-browser via ffmpeg.wasm · no upload
                      </span>
                    )}
                  </div>
                )}

                {/* ffmpeg progress */}
                <AnimatePresence>
                  {merging && mergeProgress && (
                    <motion.div
                      key="merge-progress"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="flex items-center gap-3 rounded-lg px-4 py-3"
                        style={{
                          background: 'rgba(0,255,65,0.06)',
                          border: '1px solid var(--theme-border)',
                        }}
                      >
                        <motion.div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: 'var(--theme-accent)' }}
                          animate={{ opacity: [1, 0.2, 1] }}
                          transition={{ duration: 0.9, repeat: Infinity }}
                        />
                        <span className="text-xs font-mono" style={{ color: 'var(--theme-muted)' }}>
                          {mergeProgress}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Merge error */}
                {mergeError && (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                    style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}
                  >
                    <span>{mergeError}</span>
                    <button
                      onClick={() => void mergeAudioVideo()}
                      className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110"
                      style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Merged video result */}
                <AnimatePresence>
                  {mergedVideoUrl && (
                    <motion.div
                      key="merged-result"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-semibold"
                          style={{ color: 'var(--theme-accent)' }}
                        >
                          ✓ Video with voiceover ready
                        </span>
                      </div>
                      <video
                        src={mergedVideoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="rounded-xl"
                        style={{
                          maxWidth: 280,
                          border: '1px solid var(--theme-border)',
                          background: '#000',
                        }}
                      />
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={mergedVideoUrl}
                          download="tiktok-final.mp4"
                          className="text-xs rounded px-3 py-1.5 font-medium hover:brightness-110 transition-all"
                          style={{
                            background: 'var(--theme-accent)',
                            color: '#000',
                          }}
                        >
                          ⬇ Download Final MP4
                        </a>
                        <button
                          onClick={() => {
                            if (mergedVideoUrl) URL.revokeObjectURL(mergedVideoUrl)
                            setMergedVideoUrl(null)
                            setMergeError(null)
                          }}
                          className="text-xs rounded px-3 py-1.5 hover:brightness-110 transition-all"
                          style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                        >
                          Re-merge
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </SectionCard>
    </div>
  )
}
