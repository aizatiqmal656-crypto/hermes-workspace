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

interface Scene {
  sceneNumber: number
  angle: string
  action: string
  image_prompt: string
  voiceover_text: string
}

interface SceneImageState {
  url: string | null
  generating: boolean
  error: string | null
}

interface SceneVideoState {
  url: string | null
  generating: boolean
  error: string | null
  progress: string
  requestId: string | null
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

const DEMO_STORYBOARD: Scene[] = [
  {
    sceneNumber: 1,
    angle: 'Wide Shot',
    action: 'Person at home scrolling phone, shocked by expensive spa prices on screen',
    image_prompt: 'Young woman sitting on a cozy modern sofa holding a phone showing expensive spa prices, dramatic shocked expression, warm ambient living room lighting, shallow depth of field, photorealistic, vertical 9:16 composition',
    voiceover_text: 'Pernahkah anda terkejut bila tengok harga rawatan spa yang mencecah ratusan ringgit?',
  },
  {
    sceneNumber: 2,
    angle: 'Close Up',
    action: 'AeroGlow LED Face Mask glowing softly on a clean white surface, hero product shot',
    image_prompt: 'AeroGlow LED face mask product hero shot glowing with warm red and amber light, minimalist white marble background, dramatic studio lighting with soft shadows, premium beauty product photography, photorealistic',
    voiceover_text: 'Tapi kini ada penyelesaian yang lebih berpatutan — mask LED AeroGlow yang canggih.',
  },
  {
    sceneNumber: 3,
    angle: 'POV',
    action: 'POV shot of hands placing the LED mask on face, looking into bathroom mirror',
    image_prompt: 'First-person POV perspective of hands gently placing a glowing red LED face mask, reflection visible in a clean modern bathroom mirror, warm white vanity lighting, satisfying symmetrical composition, photorealistic',
    voiceover_text: 'Teknologi terapi cahaya merah yang sama seperti di klinik kini boleh anda guna di rumah.',
  },
  {
    sceneNumber: 4,
    angle: 'Medium Shot',
    action: 'Person relaxing on sofa wearing the glowing mask, peaceful and content expression',
    image_prompt: 'Person sitting comfortably on a modern white sofa wearing a glowing red LED face mask, calm relaxed posture, cozy living room with warm evening lighting, lifestyle photography aesthetic, soft bokeh background, photorealistic',
    voiceover_text: 'Hanya 20 minit, tiga kali seminggu — dan kulit anda akan berubah dalam masa dua minggu sahaja!',
  },
  {
    sceneNumber: 5,
    angle: 'Extreme Close Up',
    action: 'Extreme macro close up of radiant glowing skin after treatment',
    image_prompt: 'Extreme close up macro shot of beautiful radiant glowing healthy skin, luminous complexion with natural highlight, dewey texture, soft professional beauty lighting, high-end skincare campaign photography, photorealistic',
    voiceover_text: 'Lebih 50,000 pelanggan sudah membuktikan — kolagen meningkat dan kulit semakin cerah dan bersinar!',
  },
  {
    sceneNumber: 6,
    angle: 'Top Down',
    action: 'Top-down flat lay of the product with premium packaging, price tag, and CTA overlay',
    image_prompt: 'Top-down flat lay of AeroGlow LED face mask with elegant premium packaging box on white background, $49.99 price tag visible, clean minimalist product photography, e-commerce style with soft shadows, photorealistic',
    voiceover_text: 'Komen "GLOW" sekarang dan saya akan DM link terus kepada anda — jangan lepaskan peluang ini!',
  },
]

const EMPTY_SCENE_IMAGE = (): SceneImageState => ({ url: null, generating: false, error: null })
const EMPTY_SCENE_VIDEO = (): SceneVideoState => ({
  url: null, generating: false, error: null, progress: '', requestId: null,
})

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
      className={cn('rounded-xl border p-5 flex flex-col gap-4', className)}
      style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
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
          style={{ color: active ? color : 'var(--theme-muted)' }}
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

interface TrackerStep {
  label: string
  done: boolean
  active: boolean
}

function StepTracker({ steps }: { steps: TrackerStep[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1">
          <motion.div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium select-none"
            style={{
              background: step.done
                ? 'rgba(34,197,94,0.15)'
                : step.active
                  ? 'rgba(245,158,11,0.15)'
                  : 'var(--theme-border)',
              border: `1px solid ${
                step.done
                  ? 'rgba(34,197,94,0.4)'
                  : step.active
                    ? 'rgba(245,158,11,0.4)'
                    : 'transparent'
              }`,
              color: step.done ? '#22c55e' : step.active ? '#f59e0b' : 'var(--theme-muted)',
            }}
            animate={step.active ? { opacity: [0.7, 1, 0.7] } : {}}
            transition={{ duration: 1.2, repeat: step.active ? Infinity : 0 }}
          >
            <span>{step.done ? '✓' : step.active ? '◉' : '○'}</span>
            {step.label}
          </motion.div>
          {i < steps.length - 1 && (
            <span className="text-[10px]" style={{ color: 'var(--theme-muted)' }}>
              →
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function TikTokScreen() {
  // ── Agent pipeline ──
  const [status, setStatus] = useState<PipelineStatus>('idle')
  const [activeAgentIdx, setActiveAgentIdx] = useState<number>(-1)
  const [doneUpTo, setDoneUpTo] = useState<number>(-1)
  const [sessionKey, setSessionKey] = useState<string | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [script, setScript] = useState<Script | null>(null)

  // ── Storyboard ──
  const [storyboard, setStoryboard] = useState<Scene[] | null>(null)
  const [storyboardGenerating, setStoryboardGenerating] = useState(false)
  const [storyboardError, setStoryboardError] = useState<string | null>(null)

  // ── Scene images (6 slots) ──
  const [sceneImages, setSceneImages] = useState<SceneImageState[]>(
    () => Array.from({ length: 6 }, EMPTY_SCENE_IMAGE),
  )

  // ── Scene videos (6 slots) ──
  const [sceneVideos, setSceneVideos] = useState<SceneVideoState[]>(
    () => Array.from({ length: 6 }, EMPTY_SCENE_VIDEO),
  )

  // ── Clip merge ──
  const [mergedClipsUrl, setMergedClipsUrl] = useState<string | null>(null)
  const [mergingClips, setMergingClips] = useState(false)
  const [mergeClipsProgress, setMergeClipsProgress] = useState('')
  const [mergeClipsError, setMergeClipsError] = useState<string | null>(null)

  // ── Voice (ElevenLabs TTS) ──
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [voiceGenerating, setVoiceGenerating] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const voiceBytesRef = useRef<Uint8Array | null>(null)

  // ── Final merge (voice + clips) via ffmpeg.wasm ──
  const [merging, setMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState('')
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)

  // ── Immutable state helpers ──
  const updateSceneImage = useCallback((idx: number, update: Partial<SceneImageState>) => {
    setSceneImages((prev) => prev.map((s, i) => (i === idx ? { ...s, ...update } : s)))
  }, [])

  const updateSceneVideo = useCallback((idx: number, update: Partial<SceneVideoState>) => {
    setSceneVideos((prev) => prev.map((s, i) => (i === idx ? { ...s, ...update } : s)))
  }, [])

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
    setStoryboard(null)
    setStoryboardError(null)
    setSceneImages(Array.from({ length: 6 }, EMPTY_SCENE_IMAGE))
    setSceneVideos(Array.from({ length: 6 }, EMPTY_SCENE_VIDEO))
    setMergedClipsUrl(null)
    setMergeClipsError(null)
    setVoiceUrl(null)
    setVoiceError(null)
    voiceBytesRef.current = null
    setMergedVideoUrl(null)
    setMergeError(null)

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
      console.warn('[TikTok Pipeline] conductor-spawn failed:', err)
    }

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
  // Storyboard generation via /api/generate-storyboard (server → Claude API)
  // -------------------------------------------------------------------------

  const generateStoryboard = useCallback(async () => {
    if (!script || !product) return

    setStoryboardGenerating(true)
    setStoryboardError(null)
    setStoryboard(null)
    setSceneImages(Array.from({ length: 6 }, EMPTY_SCENE_IMAGE))
    setSceneVideos(Array.from({ length: 6 }, EMPTY_SCENE_VIDEO))
    setMergedClipsUrl(null)

    try {
      const res = await fetch('/api/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: product.name,
          price: product.price,
          hook: script.hook,
          bodyText: script.body,
          cta: script.cta,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as { scenes?: Scene[]; error?: string }

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const scenes = (data.scenes ?? []) as Scene[]
      if (scenes.length === 0) throw new Error('No scenes returned')
      // Pad to 6 with demo data if API returned fewer
      const padded: Scene[] = Array.from({ length: 6 }, (_, i) => scenes[i] ?? DEMO_STORYBOARD[i])
      setStoryboard(padded)
    } catch (err) {
      // Fall back to demo storyboard on error so user can still explore the UI
      setStoryboard(DEMO_STORYBOARD)
      setStoryboardError(
        `${err instanceof Error ? err.message : 'Storyboard generation failed'} — loaded demo storyboard`,
      )
    } finally {
      setStoryboardGenerating(false)
    }
  }, [script, product])

  // -------------------------------------------------------------------------
  // Scene image generation via fal.ai Flux Dev
  // -------------------------------------------------------------------------

  const generateSingleSceneImage = useCallback(
    async (idx: number, prompt: string) => {
      const falKey = import.meta.env.VITE_FAL_API_KEY as string | undefined
      if (!falKey) {
        updateSceneImage(idx, { error: 'VITE_FAL_API_KEY not set', generating: false })
        return
      }

      updateSceneImage(idx, { generating: true, error: null, url: null })

      try {
        const res = await fetch('https://fal.run/fal-ai/flux/dev', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Key ${falKey}`,
          },
          body: JSON.stringify({
            prompt,
            image_size: 'portrait_4_3',
            num_inference_steps: 28,
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

        const data = (await res.json()) as { images?: Array<{ url: string }> }
        const url = data.images?.[0]?.url
        if (!url) throw new Error('No image URL in response')
        updateSceneImage(idx, { url, generating: false, error: null })
      } catch (err) {
        updateSceneImage(idx, {
          generating: false,
          error: err instanceof Error ? err.message : 'Image generation failed',
        })
      }
    },
    [updateSceneImage],
  )

  const generateAllSceneImages = useCallback(async () => {
    if (!storyboard) return
    await Promise.all(
      storyboard.map((scene, idx) => generateSingleSceneImage(idx, scene.image_prompt)),
    )
  }, [storyboard, generateSingleSceneImage])

  // -------------------------------------------------------------------------
  // Scene video generation via fal.ai Kling v1.6 Pro (queue API)
  // -------------------------------------------------------------------------

  const generateSingleSceneVideo = useCallback(
    async (idx: number, imageUrl: string, scenePrompt: string) => {
      const falKey = import.meta.env.VITE_FAL_API_KEY as string | undefined
      if (!falKey) {
        updateSceneVideo(idx, { error: 'VITE_FAL_API_KEY not set', generating: false })
        return
      }

      updateSceneVideo(idx, { generating: true, error: null, url: null, progress: 'Submitting…' })

      const MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'
      const QUEUE_BASE = `https://queue.fal.run/${MODEL}`

      try {
        const submitRes = await fetch(QUEUE_BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Key ${falKey}`,
          },
          body: JSON.stringify({
            image_url: imageUrl,
            prompt: scenePrompt,
            duration: '5',
            aspect_ratio: '9:16',
          }),
        })

        if (!submitRes.ok) {
          const err = (await submitRes.json().catch(() => ({}))) as Record<string, unknown>
          throw new Error(
            typeof err.detail === 'string'
              ? err.detail
              : typeof err.error === 'string'
                ? err.error
                : `HTTP ${submitRes.status}`,
          )
        }

        const { request_id: requestId } = (await submitRes.json()) as { request_id: string }
        updateSceneVideo(idx, { requestId, progress: 'In queue…' })

        const statusUrl = `${QUEUE_BASE}/requests/${requestId}/status`
        const resultUrl = `${QUEUE_BASE}/requests/${requestId}`
        const MAX_POLLS = 120

        for (let i = 0; i < MAX_POLLS; i++) {
          await new Promise<void>((r) => setTimeout(r, 5000))

          const statusRes = await fetch(statusUrl, {
            headers: { Authorization: `Key ${falKey}` },
          })
          if (!statusRes.ok) continue

          const { status: jobStatus } = (await statusRes.json()) as { status: string }
          const elapsed = (i + 1) * 5
          const mins = Math.floor(elapsed / 60)
          const secs = elapsed % 60

          if (jobStatus === 'IN_QUEUE') {
            updateSceneVideo(idx, { progress: `In queue… (${elapsed}s)` })
          } else if (jobStatus === 'IN_PROGRESS') {
            updateSceneVideo(idx, {
              progress: `Generating… ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}`,
            })
          } else if (jobStatus === 'COMPLETED') {
            const resultRes = await fetch(resultUrl, {
              headers: { Authorization: `Key ${falKey}` },
            })
            if (!resultRes.ok) throw new Error(`Result fetch failed: HTTP ${resultRes.status}`)

            const result = (await resultRes.json()) as {
              video?: { url: string }
              outputs?: Array<{ url: string }>
            }
            const url = result.video?.url ?? result.outputs?.[0]?.url
            if (!url) throw new Error('No video URL in result')

            updateSceneVideo(idx, { url, generating: false, progress: '', error: null })
            return
          } else if (jobStatus === 'FAILED') {
            throw new Error('Video generation failed on server')
          }
        }

        throw new Error('Timed out after 10 minutes')
      } catch (err) {
        updateSceneVideo(idx, {
          generating: false,
          progress: '',
          error: err instanceof Error ? err.message : 'Video generation failed',
        })
      }
    },
    [updateSceneVideo],
  )

  const generateAllSceneVideos = useCallback(async () => {
    if (!storyboard) return
    // Submit all 6 to the queue simultaneously — each polls independently
    await Promise.all(
      storyboard.map((scene, idx) => {
        const imgUrl = sceneImages[idx]?.url
        if (!imgUrl) return Promise.resolve()
        return generateSingleSceneVideo(idx, imgUrl, scene.action)
      }),
    )
  }, [storyboard, sceneImages, generateSingleSceneVideo])

  // -------------------------------------------------------------------------
  // Merge all 6 scene clips via ffmpeg.wasm concat demuxer
  // -------------------------------------------------------------------------

  const mergeAllClips = useCallback(async () => {
    const videoUrls = sceneVideos.map((v) => v.url).filter((u): u is string => u !== null)
    if (videoUrls.length === 0) {
      setMergeClipsError('No scene videos available to merge')
      return
    }

    setMergingClips(true)
    setMergeClipsError(null)
    if (mergedClipsUrl) URL.revokeObjectURL(mergedClipsUrl)
    setMergedClipsUrl(null)
    setMergeClipsProgress('Loading ffmpeg.wasm…')

    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

      if (!ffmpegRef.current) {
        const ff = new FFmpeg()
        ff.on('log', ({ message }) => {
          if (/time=|frame=/.test(message)) {
            setMergeClipsProgress(`Encoding… ${message.replace(/\s+/g, ' ').trim()}`)
          }
        })
        setMergeClipsProgress('Downloading ffmpeg core (~30 MB, first time only)…')
        const BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
        await ff.load({
          coreURL: await toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        })
        ffmpegRef.current = ff
      }

      const ff = ffmpegRef.current

      let concatContent = ''
      for (let i = 0; i < videoUrls.length; i++) {
        setMergeClipsProgress(`Writing clip ${i + 1}/${videoUrls.length}…`)
        await ff.writeFile(`clip${i}.mp4`, await fetchFile(videoUrls[i]))
        concatContent += `file 'clip${i}.mp4'\n`
      }

      await ff.writeFile('concat.txt', new TextEncoder().encode(concatContent))
      setMergeClipsProgress(`Concatenating ${videoUrls.length} clips…`)

      await ff.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'merged_clips.mp4',
      ])

      const data = await ff.readFile('merged_clips.mp4')
      setMergedClipsUrl(
        URL.createObjectURL(new Blob([data as Uint8Array], { type: 'video/mp4' })),
      )
      setMergeClipsProgress('')

      for (let i = 0; i < videoUrls.length; i++) {
        await ff.deleteFile(`clip${i}.mp4`).catch(() => {})
      }
      await ff.deleteFile('concat.txt').catch(() => {})
      await ff.deleteFile('merged_clips.mp4').catch(() => {})
    } catch (err) {
      setMergeClipsError(err instanceof Error ? err.message : 'Merge failed')
      setMergeClipsProgress('')
    } finally {
      setMergingClips(false)
    }
  }, [sceneVideos, mergedClipsUrl])

  // -------------------------------------------------------------------------
  // Voice generation via ElevenLabs TTS — uses storyboard voiceover texts
  // -------------------------------------------------------------------------

  const generateVoice = useCallback(async () => {
    const key = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
    if (!key) {
      setVoiceError('VITE_ELEVENLABS_API_KEY is not set in .env — add your ElevenLabs API key')
      return
    }

    setVoiceGenerating(true)
    setVoiceError(null)
    if (voiceUrl) URL.revokeObjectURL(voiceUrl)
    setVoiceUrl(null)
    voiceBytesRef.current = null

    // Use storyboard voiceover texts when available, otherwise fall back to script
    const text = storyboard
      ? storyboard.map((s) => s.voiceover_text).join(' ').replace(/\s+/g, ' ').trim()
      : script
        ? [script.hook, script.body, script.cta].join(' ').replace(/\s+/g, ' ').trim()
        : ''

    if (!text) {
      setVoiceError('No text to generate voice from — run the pipeline first')
      setVoiceGenerating(false)
      return
    }

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
          typeof err.detail === 'string'
            ? err.detail
            : typeof err.message === 'string'
              ? err.message
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
  }, [storyboard, script, voiceUrl])

  // -------------------------------------------------------------------------
  // Final merge: voice + merged clips via ffmpeg.wasm
  // -------------------------------------------------------------------------

  const mergeFinalVideo = useCallback(async () => {
    if (!mergedClipsUrl || !voiceBytesRef.current) return

    setMerging(true)
    setMergeError(null)
    if (mergedVideoUrl) URL.revokeObjectURL(mergedVideoUrl)
    setMergedVideoUrl(null)
    setMergeProgress('Loading ffmpeg.wasm…')

    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

      if (!ffmpegRef.current) {
        const ff = new FFmpeg()
        ff.on('log', ({ message }) => {
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
      await ff.writeFile('video.mp4', await fetchFile(mergedClipsUrl))
      await ff.writeFile('audio.mp3', voiceBytesRef.current)

      setMergeProgress('Merging video + audio…')
      await ff.exec([
        '-i', 'video.mp4',
        '-i', 'audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        'output.mp4',
      ])

      const data = await ff.readFile('output.mp4')
      setMergedVideoUrl(
        URL.createObjectURL(new Blob([data as Uint8Array], { type: 'video/mp4' })),
      )
      setMergeProgress('')

      await ff.deleteFile('video.mp4').catch(() => {})
      await ff.deleteFile('audio.mp3').catch(() => {})
      await ff.deleteFile('output.mp4').catch(() => {})
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed')
      setMergeProgress('')
    } finally {
      setMerging(false)
    }
  }, [mergedClipsUrl, mergedVideoUrl])

  // ── Derived counts ──
  const imagesReady = sceneImages.filter((s) => s.url !== null).length
  const videosReady = sceneVideos.filter((s) => s.url !== null).length
  const allImagesReady = imagesReady === 6
  const allVideosReady = videosReady === 6

  const isRunning = status === 'running'
  const isDone = status === 'done'

  // ── Progress tracker steps ──
  const trackerSteps: TrackerStep[] = [
    {
      label: 'Script',
      done: script !== null,
      active: isRunning && script === null,
    },
    {
      label: 'Storyboard',
      done: storyboard !== null,
      active: storyboardGenerating,
    },
    {
      label: `Images (${imagesReady}/6)`,
      done: allImagesReady,
      active: sceneImages.some((s) => s.generating),
    },
    {
      label: `Videos (${videosReady}/6)`,
      done: allVideosReady,
      active: sceneVideos.some((s) => s.generating),
    },
    {
      label: 'Merge',
      done: mergedClipsUrl !== null,
      active: mergingClips,
    },
    {
      label: 'Voice',
      done: voiceUrl !== null,
      active: voiceGenerating,
    },
    {
      label: 'Done',
      done: mergedVideoUrl !== null,
      active: merging,
    },
  ]

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
          Agent-powered storyboard pipeline — script to 6-scene cinematic TikTok in one flow
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Progress Tracker                                                    */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard title="Pipeline Progress">
        <StepTracker steps={trackerSteps} />
      </SectionCard>

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
                background: isRunning ? 'var(--theme-border)' : 'var(--theme-accent)',
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
                ✓ Pipeline complete — generate storyboard below
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
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--theme-muted)' }}>
                    Body
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text)' }}>
                    {script.body}
                  </p>
                </div>

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

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `HOOK:\n${script.hook}\n\nBODY:\n${script.body}\n\nCTA:\n${script.cta}`,
                      )
                    }
                    className="text-xs rounded px-3 py-1.5 transition-all hover:brightness-110"
                    style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                  >
                    Copy Script
                  </button>
                  {!storyboard && (
                    <motion.button
                      onClick={storyboardGenerating ? undefined : generateStoryboard}
                      disabled={storyboardGenerating}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all',
                        storyboardGenerating
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:brightness-110 active:scale-95',
                      )}
                      style={{
                        background: storyboardGenerating ? 'var(--theme-border)' : '#7c3aed',
                        color: '#fff',
                      }}
                      whileTap={storyboardGenerating ? {} : { scale: 0.97 }}
                    >
                      {storyboardGenerating ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          >
                            ⟳
                          </motion.span>
                          Generating Storyboard…
                        </>
                      ) : (
                        <>🎞️ Generate Storyboard →</>
                      )}
                    </motion.button>
                  )}
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
      {/* Storyboard                                                          */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {(storyboard || storyboardGenerating) && (
          <motion.div
            key="storyboard-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <SectionCard title="Storyboard">
              <div className="flex flex-col gap-4">
                {storyboardError && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs"
                    style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}
                  >
                    {storyboardError}
                  </div>
                )}

                {storyboardGenerating && !storyboard && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="rounded-xl p-3 flex flex-col gap-2"
                        style={{ background: 'var(--theme-border)', minHeight: 120 }}
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }}
                      />
                    ))}
                  </div>
                )}

                {storyboard && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {storyboard.map((scene) => (
                        <motion.div
                          key={scene.sceneNumber}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: (scene.sceneNumber - 1) * 0.06 }}
                          className="rounded-xl p-3 flex flex-col gap-2"
                          style={{
                            background: 'var(--theme-border)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{ background: 'var(--theme-accent)', color: '#000' }}
                            >
                              S{scene.sceneNumber}
                            </span>
                            <span
                              className="text-[11px] font-medium rounded px-2 py-0.5"
                              style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}
                            >
                              {scene.angle}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--theme-text)' }}>
                            {scene.action}
                          </p>
                          <div
                            className="rounded-lg px-2 py-1.5 text-[10px] leading-relaxed"
                            style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--theme-muted)' }}
                          >
                            <span className="font-medium" style={{ color: '#7c3aed' }}>VO: </span>
                            {scene.voiceover_text}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <motion.button
                        onClick={storyboardGenerating ? undefined : generateStoryboard}
                        disabled={storyboardGenerating}
                        className="text-xs rounded px-3 py-1.5 transition-all hover:brightness-110"
                        style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                      >
                        Regenerate Storyboard
                      </motion.button>
                      {!sceneImages.some((s) => s.url || s.generating) && (
                        <motion.button
                          onClick={generateAllSceneImages}
                          className="flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold hover:brightness-110 active:scale-95 cursor-pointer transition-all"
                          style={{ background: '#9333ea', color: '#fff' }}
                          whileTap={{ scale: 0.97 }}
                        >
                          🎨 Generate All Images →
                        </motion.button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Scene Images Grid                                                   */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {sceneImages.some((s) => s.url || s.generating || s.error) && (
          <motion.div
            key="scene-images-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <SectionCard title={`Scene Images (${imagesReady}/6)`}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sceneImages.map((imgState, idx) => {
                  const scene = storyboard?.[idx]
                  return (
                    <div key={idx} className="flex flex-col gap-2">
                      {/* Label */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: 'var(--theme-accent)', color: '#000' }}
                        >
                          S{idx + 1}
                        </span>
                        {scene && (
                          <span className="text-[10px]" style={{ color: 'var(--theme-muted)' }}>
                            {scene.angle}
                          </span>
                        )}
                      </div>

                      {/* Image slot */}
                      <div
                        className="relative rounded-xl overflow-hidden"
                        style={{
                          aspectRatio: '3/4',
                          background: 'var(--theme-border)',
                          border: '1px solid var(--theme-border)',
                        }}
                      >
                        {imgState.generating && !imgState.url && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <motion.span
                              className="text-2xl"
                              animate={{ opacity: [0.3, 0.9, 0.3] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              🎨
                            </motion.span>
                          </div>
                        )}
                        {imgState.url && (
                          <img
                            src={imgState.url}
                            alt={`Scene ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                        {imgState.error && !imgState.url && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
                            <span className="text-[10px] text-center" style={{ color: '#ff5f6d' }}>
                              {imgState.error}
                            </span>
                            <button
                              onClick={() =>
                                scene && generateSingleSceneImage(idx, scene.image_prompt)
                              }
                              className="text-[10px] rounded px-2 py-1 hover:brightness-110"
                              style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Per-scene regen button */}
                      {imgState.url && (
                        <button
                          onClick={() =>
                            scene && generateSingleSceneImage(idx, scene.image_prompt)
                          }
                          className="text-[10px] rounded px-2 py-1 hover:brightness-110 transition-all self-start"
                          style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                        >
                          Redo
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <motion.button
                  onClick={sceneImages.some((s) => s.generating) ? undefined : generateAllSceneImages}
                  disabled={sceneImages.some((s) => s.generating)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all',
                    sceneImages.some((s) => s.generating)
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:brightness-110 active:scale-95',
                  )}
                  style={{
                    background: sceneImages.some((s) => s.generating)
                      ? 'var(--theme-border)'
                      : '#9333ea',
                    color: sceneImages.some((s) => s.generating) ? 'var(--theme-muted)' : '#fff',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  {sceneImages.some((s) => s.generating) ? (
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
                    <>🎨 {allImagesReady ? 'Regenerate All' : 'Generate All Images'}</>
                  )}
                </motion.button>

                {allImagesReady && !sceneVideos.some((v) => v.url || v.generating) && (
                  <motion.button
                    onClick={generateAllSceneVideos}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold hover:brightness-110 active:scale-95 cursor-pointer transition-all"
                    style={{ background: '#e11d48', color: '#fff' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    🎬 Generate All Videos →
                  </motion.button>
                )}
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Scene Videos Grid                                                   */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {sceneVideos.some((v) => v.url || v.generating || v.error) && (
          <motion.div
            key="scene-videos-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <SectionCard title={`Scene Videos (${videosReady}/6)`}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sceneVideos.map((vidState, idx) => {
                  const scene = storyboard?.[idx]
                  const imgUrl = sceneImages[idx]?.url
                  return (
                    <div key={idx} className="flex flex-col gap-2">
                      {/* Label */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: vidState.url ? '#22c55e' : 'var(--theme-accent)', color: '#000' }}
                        >
                          S{idx + 1}
                        </span>
                        {scene && (
                          <span className="text-[10px]" style={{ color: 'var(--theme-muted)' }}>
                            {scene.angle}
                          </span>
                        )}
                      </div>

                      {/* Video slot */}
                      <div
                        className="relative rounded-xl overflow-hidden"
                        style={{
                          aspectRatio: '9/16',
                          background: '#000',
                          border: '1px solid var(--theme-border)',
                          maxHeight: 220,
                        }}
                      >
                        {vidState.generating && !vidState.url && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
                            <motion.div
                              className="w-2 h-2 rounded-full"
                              style={{ background: '#e11d48' }}
                              animate={{ opacity: [1, 0.2, 1] }}
                              transition={{ duration: 0.9, repeat: Infinity }}
                            />
                            {vidState.progress && (
                              <span
                                className="text-[9px] text-center leading-relaxed"
                                style={{ color: 'var(--theme-muted)' }}
                              >
                                {vidState.progress}
                              </span>
                            )}
                          </div>
                        )}
                        {vidState.url && (
                          <video
                            src={vidState.url}
                            controls
                            autoPlay
                            loop
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          />
                        )}
                        {vidState.error && !vidState.url && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
                            <span className="text-[9px] text-center" style={{ color: '#ff5f6d' }}>
                              {vidState.error}
                            </span>
                            {imgUrl && scene && (
                              <button
                                onClick={() =>
                                  generateSingleSceneVideo(idx, imgUrl, scene.action)
                                }
                                className="text-[10px] rounded px-2 py-1 hover:brightness-110"
                                style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Per-scene redo */}
                      {vidState.url && imgUrl && scene && (
                        <button
                          onClick={() => generateSingleSceneVideo(idx, imgUrl, scene.action)}
                          className="text-[10px] rounded px-2 py-1 hover:brightness-110 transition-all self-start"
                          style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                        >
                          Redo
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <motion.button
                  onClick={sceneVideos.some((v) => v.generating) ? undefined : generateAllSceneVideos}
                  disabled={sceneVideos.some((v) => v.generating)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all',
                    sceneVideos.some((v) => v.generating)
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:brightness-110 active:scale-95',
                  )}
                  style={{
                    background: sceneVideos.some((v) => v.generating) ? 'var(--theme-border)' : '#e11d48',
                    color: sceneVideos.some((v) => v.generating) ? 'var(--theme-muted)' : '#fff',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  {sceneVideos.some((v) => v.generating) ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        ⟳
                      </motion.span>
                      {`Generating… (${videosReady}/6 done)`}
                    </>
                  ) : (
                    <>🎬 {allVideosReady ? 'Regenerate All' : 'Generate All Videos'}</>
                  )}
                </motion.button>

                {allVideosReady && !mergedClipsUrl && !mergingClips && (
                  <motion.button
                    onClick={mergeAllClips}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold hover:brightness-110 active:scale-95 cursor-pointer transition-all"
                    style={{ background: 'var(--theme-accent)', color: '#000' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    ⚡ Merge All Clips →
                  </motion.button>
                )}
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Merge All Clips                                                     */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {(mergingClips || mergedClipsUrl || mergeClipsError) && (
          <motion.div
            key="merge-clips-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <SectionCard title="Merged Video">
              <div className="flex flex-col gap-4">
                {mergeClipsProgress && (
                  <div
                    className="flex items-center gap-3 rounded-lg px-4 py-3"
                    style={{ background: 'rgba(0,255,65,0.06)', border: '1px solid var(--theme-border)' }}
                  >
                    <motion.div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: 'var(--theme-accent)' }}
                      animate={{ opacity: [1, 0.2, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                    />
                    <span className="text-xs font-mono" style={{ color: 'var(--theme-muted)' }}>
                      {mergeClipsProgress}
                    </span>
                  </div>
                )}

                {mergeClipsError && (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                    style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}
                  >
                    <span>{mergeClipsError}</span>
                    <button
                      onClick={() => void mergeAllClips()}
                      className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110"
                      style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {mergedClipsUrl && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col gap-3"
                  >
                    <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                      ✓ All {videosReady} clips merged into one video
                    </p>
                    <video
                      src={mergedClipsUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="rounded-xl"
                      style={{ maxWidth: 280, border: '1px solid var(--theme-border)', background: '#000' }}
                    />
                    <div className="flex gap-2 flex-wrap">
                      <a
                        href={mergedClipsUrl}
                        download="tiktok-merged.mp4"
                        className="text-xs rounded px-3 py-1.5 hover:brightness-110 transition-all"
                        style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                      >
                        Download
                      </a>
                      <button
                        onClick={() => void mergeAllClips()}
                        className="text-xs rounded px-3 py-1.5 hover:brightness-110 transition-all"
                        style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                      >
                        Re-merge
                      </button>
                    </div>
                  </motion.div>
                )}

                {!mergedClipsUrl && !mergingClips && (
                  <motion.button
                    onClick={mergeAllClips}
                    className="self-start flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold hover:brightness-110 active:scale-95 cursor-pointer transition-all"
                    style={{ background: 'var(--theme-accent)', color: '#000' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    ⚡ Merge All Clips
                  </motion.button>
                )}
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Voiceover                                                           */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {(storyboard || script) && (
          <motion.div
            key="voice-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <SectionCard title="Voiceover (Bahasa Malaysia)">
              <div className="flex flex-col gap-3">
                {storyboard && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                    style={{ background: 'var(--theme-border)', color: 'var(--theme-muted)' }}
                  >
                    {storyboard.map((s) => s.voiceover_text).join(' ')}
                  </div>
                )}

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
                      <>🎙️ Generate BM Voiceover</>
                    )}
                  </motion.button>
                  {!voiceGenerating && (
                    <span className="text-[11px]" style={{ color: 'var(--theme-muted)' }}>
                      Adam · ElevenLabs Turbo v2.5 · {storyboard ? '6-scene BM script' : 'full script'}
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
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Final Export — merge voice with merged clips                       */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {mergedClipsUrl && voiceUrl && (
          <motion.div
            key="final-export-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <SectionCard title="Final Export">
              <div className="flex flex-col gap-4">
                {!mergedVideoUrl && (
                  <p className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                    Combine the 6-scene video with your BM voiceover into one final MP4.
                  </p>
                )}

                {!mergedVideoUrl && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <motion.button
                      onClick={merging ? undefined : mergeFinalVideo}
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
                        style={{ background: 'rgba(0,255,65,0.06)', border: '1px solid var(--theme-border)' }}
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

                {mergeError && (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                    style={{ color: '#ff5f6d', background: 'rgba(255,95,109,0.1)' }}
                  >
                    <span>{mergeError}</span>
                    <button
                      onClick={() => void mergeFinalVideo()}
                      className="shrink-0 rounded px-2 py-1 font-medium hover:brightness-110"
                      style={{ background: 'rgba(255,95,109,0.2)', color: '#ff5f6d' }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {mergedVideoUrl && (
                    <motion.div
                      key="merged-result"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col gap-3"
                    >
                      <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                        ✓ Final TikTok video with voiceover ready
                      </p>
                      <video
                        src={mergedVideoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="rounded-xl"
                        style={{ maxWidth: 280, border: '1px solid var(--theme-border)', background: '#000' }}
                      />
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={mergedVideoUrl}
                          download="tiktok-final.mp4"
                          className="text-xs rounded px-3 py-1.5 font-medium hover:brightness-110 transition-all"
                          style={{ background: 'var(--theme-accent)', color: '#000' }}
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
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
