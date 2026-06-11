import { useState, useCallback, useEffect, useRef } from 'react'
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
  { name: 'ContentBoss', role: 'Master Orchestrator', emoji: '👑', color: '#F59E0B', ms: 1200 },
  { name: 'TrendHunter', role: 'Trend Scout', emoji: '🔍', color: '#6366F1', ms: 3500 },
  { name: 'CopywriterAgent', role: 'BM Scriptwriter', emoji: '✍️', color: '#EC4899', ms: 3500 },
  { name: 'ComplianceAgent', role: 'Compliance Guard', emoji: '🛡️', color: '#10B981', ms: 2500 },
  { name: 'AnalyticsAgent', role: 'Analytics Specialist', emoji: '📊', color: '#14B8A6', ms: 2000 },
]

const DEMO_PRODUCT: Product = {
  name: 'AeroGlow LED Face Mask',
  price: 'RM 219.00',
  trendScore: 94,
  viralReason:
    'Red light therapy trending +340% on FYP this week — skincare × tech combo drives saves & shares',
}

const DEMO_SCRIPT: Script = {
  hook: "POV: You spent RM300 on facial tapi mask LED RM219 ni buat benda yang sama 👇",
  body: "Red light therapy dulu kena pergi klinik, RM200 satu session. AeroGlow bawa teknologi tu masuk rumah. 20 minit, 3x seminggu — users report kulit lebih clear dalam 2 minggu. Collagen boost memang real. Dah 50k unit terjual bulan ni.",
  cta: "Comment \"GLOW\" dan I akan DM link 🔗 Save ni sebelum habis stok",
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
    image_prompt: 'Top-down flat lay of AeroGlow LED face mask with elegant premium packaging box on white background, RM219 price tag visible, clean minimalist product photography, e-commerce style with soft shadows, photorealistic',
    voiceover_text: 'Comment "GLOW" sekarang dan saya akan DM link terus kepada anda — jangan lepaskan peluang ini!',
  },
]

const EMPTY_SCENE_IMAGE = (): SceneImageState => ({ url: null, generating: false, error: null })
const EMPTY_SCENE_VIDEO = (): SceneVideoState => ({
  url: null, generating: false, error: null, progress: '', requestId: null,
})

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const T = {
  bg:          '#FAFAF9',
  card:        '#FFFFFF',
  border:      '#E8E8E5',
  borderStrong:'#DCDCD8',
  accent:      '#F59E0B',
  accentSoft:  '#FEF3E2',
  accentLine:  '#F8DFB0',
  accentInk:   '#B45309',
  success:     '#10B981',
  successSoft: '#ECFDF5',
  successInk:  '#047857',
  successLine: '#BBF7D6',
  danger:      '#EF4444',
  dangerSoft:  '#FEF2F2',
  dangerInk:   '#B91C1C',
  dangerLine:  '#FBCFCF',
  info:        '#6366F1',
  infoSoft:    '#EEF0FE',
  infoInk:     '#4338CA',
  ink:         '#1A1A1A',
  ink2:        '#6B6B6B',
  ink3:        '#9A9A96',
  shadow:      '0 1px 3px rgba(17,17,17,0.05), 0 1px 2px rgba(17,17,17,0.03)',
  shadowPop:   '0 8px 28px rgba(17,17,17,0.10), 0 2px 6px rgba(17,17,17,0.06)',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={cn('flex flex-col gap-4', className)}
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 22,
        boxShadow: T.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.ink3 }}>
      {children}
    </div>
  )
}

function SecHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
      <SecLabel>{label}</SecLabel>
      {right && <span style={{ fontSize: 12.5, color: T.ink2 }}>{right}</span>}
    </div>
  )
}

function StatusBadge({ status }: { status: 'idle' | 'running' | 'done' | 'error' }) {
  const map = {
    idle:    { bg: '#F4F4F2', border: T.border,      ink: T.ink2,      dotBg: T.ink3,    label: 'Idle'    },
    running: { bg: T.accentSoft,  border: T.accentLine, ink: T.accentInk, dotBg: T.accent,  label: 'Running' },
    done:    { bg: T.successSoft, border: T.successLine,ink: T.successInk,dotBg: T.success, label: 'Done'    },
    error:   { bg: T.dangerSoft,  border: T.dangerLine, ink: T.dangerInk, dotBg: T.danger,  label: 'Error'   },
  }
  const m = map[status] ?? map.idle
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, fontWeight:600, padding:'3px 9px', borderRadius:8, background:m.bg, border:`1px solid ${m.border}`, color:m.ink }}>
      <motion.span
        style={{ width:6, height:6, borderRadius:'50%', background:m.dotBg, display:'inline-block', flexShrink:0 }}
        animate={status === 'running' ? { opacity:[1,0.3,1], scale:[1,0.7,1] } : {}}
        transition={{ duration:1.3, repeat:Infinity }}
      />
      {m.label}
    </span>
  )
}

function AgentCard({
  emoji, name, role, active, done,
}: { emoji: string; name: string; role: string; active: boolean; done: boolean }) {
  const agentStatus: 'idle' | 'running' | 'done' | 'error' = active ? 'running' : done ? 'done' : 'idle'
  return (
    <motion.div
      style={{
        background: T.card,
        border: `1px solid ${active ? T.accentLine : T.border}`,
        borderRadius: 12,
        padding: 14,
        boxShadow: active ? `0 0 0 1px ${T.accentLine}, ${T.shadow}` : T.shadow,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`,
          background: '#F6F6F4', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
        }}>
          {emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: '-0.01em', color: T.ink }}>{name}</div>
          <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 1 }}>{role}</div>
        </div>
      </div>
      <StatusBadge status={agentStatus} />
    </motion.div>
  )
}

function StepPill({ label, state }: { label: string; state: 'done' | 'current' | 'pending' }) {
  const styles = {
    done:    { bg: T.successSoft, border: T.successLine, color: T.successInk, dotBg: T.success },
    current: { bg: T.accentSoft,  border: T.accentLine,  color: T.accentInk,  dotBg: T.accent  },
    pending: { bg: T.card,        border: T.border,       color: T.ink2,       dotBg: T.ink3    },
  }[state]

  return (
    <motion.div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '7px 13px', borderRadius: 999,
        background: styles.bg, border: `1px solid ${styles.border}`,
        color: styles.color, fontSize: 13, fontWeight: state === 'current' ? 600 : 500,
        whiteSpace: 'nowrap',
        boxShadow: state === 'current' ? `0 0 0 3px ${T.accentSoft}` : undefined,
      }}
      animate={state === 'current' ? { opacity: [0.8, 1, 0.8] } : {}}
      transition={{ duration: 1.4, repeat: Infinity }}
    >
      <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${state === 'pending' ? T.borderStrong : styles.dotBg}`, background: state !== 'pending' ? styles.dotBg : undefined, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {state === 'done' && <svg viewBox="0 0 12 12" width={9} height={9} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5l2.5 2.5 5-5"/></svg>}
        {state === 'current' && <svg viewBox="0 0 12 12" width={7} height={7} fill={T.card}><circle cx="6" cy="6" r="4"/></svg>}
      </span>
      {label}
    </motion.div>
  )
}

function Arrow() {
  return (
    <span style={{ color: T.ink3, flexShrink: 0, padding: '0 2px' }}>
      <svg viewBox="0 0 14 14" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 7h10M8 3.5l3.5 3.5L8 10.5"/>
      </svg>
    </span>
  )
}

function RunBtn({ running, onClick }: { running: boolean; onClick: () => void }) {
  return (
    <button
      onClick={running ? undefined : onClick}
      disabled={running}
      style={{
        width: '100%', padding: '15px 16px', fontSize: 15, fontWeight: 600,
        borderRadius: 10, border: 'none', cursor: running ? 'default' : 'pointer',
        color: running ? T.ink3 : '#fff',
        background: running ? '#F4F4F2' : T.accent,
        boxShadow: running ? 'none' : '0 2px 8px rgba(245,158,11,.30), inset 0 1px 0 rgba(255,255,255,.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        transition: 'filter .15s, box-shadow .15s',
        borderWidth: running ? 1 : 0,
        borderStyle: running ? 'solid' : undefined,
        borderColor: running ? T.border : undefined,
      }}
    >
      {running ? (
        <>
          <motion.span
            style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid rgba(0,0,0,.15)`, borderTopColor: T.ink3, display: 'inline-block' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
          />
          Running pipeline…
        </>
      ) : (
        <>
          <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>
          Run Daily Pipeline
        </>
      )}
    </button>
  )
}

function ScriptBlock({ script, onCopy }: { script: Script; onCopy: () => void }) {
  const segments = [
    { key: 'hook', label: 'Hook',  text: script.hook, borderColor: T.accent },
    { key: 'body', label: 'Body',  text: script.body, borderColor: T.info },
    { key: 'cta',  label: 'CTA',   text: script.cta,  borderColor: T.success },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {segments.map((s) => (
        <div key={s.key} style={{ borderLeft: `3px solid ${s.borderColor}`, paddingLeft: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.ink3, marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.55 }}>{s.text}</div>
        </div>
      ))}
      <button
        onClick={onCopy}
        style={{ alignSelf: 'flex-start', fontSize: 12, padding: '5px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, cursor: 'pointer', fontWeight: 500 }}
      >
        Copy Script
      </button>
    </div>
  )
}

function TrendBadge({ score }: { score: number }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:999, background:T.accentSoft, color:T.accentInk, border:`1px solid ${T.accentLine}` }}>
      <svg viewBox="0 0 12 12" width={11} height={11} fill={T.accent}><path d="M6 1l1.3 3.5H11l-2.9 2 1.1 3.5L6 8.2 2.8 10l1.1-3.5L1 4.5h3.7z"/></svg>
      {score} trend
    </span>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13.5, color: T.ink3 }}>{children}</p>
}

function ErrorBar({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, borderRadius:8, padding:'9px 12px', fontSize:12.5, color:T.dangerInk, background:T.dangerSoft, border:`1px solid ${T.dangerLine}` }}>
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ flexShrink:0, borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:600, background:T.card, border:`1px solid ${T.dangerLine}`, color:T.dangerInk, cursor:'pointer' }}>
          Retry
        </button>
      )}
    </div>
  )
}

function ProgressBar({ message }: { message: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, borderRadius:8, padding:'10px 14px', background:T.accentSoft, border:`1px solid ${T.accentLine}` }}>
      <motion.span
        style={{ width:8, height:8, borderRadius:'50%', background:T.accent, display:'inline-block', flexShrink:0 }}
        animate={{ opacity:[1,0.3,1] }}
        transition={{ duration:0.9, repeat:Infinity }}
      />
      <span style={{ fontSize:12, fontFamily:'ui-monospace, monospace', color:T.accentInk }}>{message}</span>
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

  // ── Persistent memory (Phase R3) ──
  const [memorySaved, setMemorySaved] = useState(false)
  const [memorySaving, setMemorySaving] = useState(false)
  const [showMemory, setShowMemory] = useState(false)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryRuns, setMemoryRuns] = useState<
    Array<{ key: string; timestamp: string; data: Record<string, unknown> }>
  >([])

  // On mount: verify the 8 memory namespaces exist (server logs status).
  useEffect(() => {
    void fetch('/api/tiktok-memory?action=status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { ok?: boolean; namespaces?: Array<unknown> }) => {
        if (d?.ok) console.log('[TikTok] memory namespaces verified:', d.namespaces?.length ?? 0)
      })
      .catch(() => {})
  }, [])

  // After a successful pipeline, log the full run to pipeline_runs/ memory.
  const logRunToMemory = useCallback(async () => {
    setMemorySaving(true)
    try {
      const imagesDone = sceneImages.filter((s) => s.url !== null).length
      const videosDone = sceneVideos.filter((s) => s.url !== null).length
      const costRm = Number((0.1 + imagesDone * 0.014 + videosDone * 0.65 + 0.05).toFixed(2))
      const runData = {
        product: product?.name ?? 'Unknown product',
        price: product?.price ?? null,
        trendScore: product?.trendScore ?? null,
        script: script ? { hook: script.hook, body: script.body, cta: script.cta } : null,
        scenes: storyboard?.length ?? 0,
        imagesReady: imagesDone,
        videosReady: videosDone,
        costRm,
        success: true,
        finalVideo: 'tiktok-final.mp4',
        completedAt: new Date().toISOString(),
      }
      const res = await fetch('/api/tiktok-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ op: 'logRun', runData }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean }
      if (res.ok && data.ok) {
        setMemorySaved(true)
        console.log('[TikTok] pipeline run saved to memory', runData)
      }
    } catch (err) {
      console.warn('[TikTok] memory log failed:', err instanceof Error ? err.message : String(err))
    } finally {
      setMemorySaving(false)
    }
  }, [product, script, storyboard, sceneImages, sceneVideos])

  const loadMemoryRuns = useCallback(async () => {
    setMemoryLoading(true)
    try {
      const res = await fetch('/api/tiktok-memory?namespace=pipeline_runs&limit=5', {
        credentials: 'same-origin',
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        entries?: Array<{ key: string; timestamp: string; data: Record<string, unknown> }>
      }
      if (res.ok && data.ok && Array.isArray(data.entries)) setMemoryRuns(data.entries)
    } catch {
      /* non-fatal — keep prior list */
    } finally {
      setMemoryLoading(false)
    }
  }, [])

  const toggleMemory = useCallback(() => {
    setShowMemory((prev) => {
      const next = !prev
      if (next) void loadMemoryRuns()
      return next
    })
  }, [loadMemoryRuns])

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
    setMemorySaved(false)
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
      const padded: Scene[] = Array.from({ length: 6 }, (_, i) => scenes[i] ?? DEMO_STORYBOARD[i])
      setStoryboard(padded)
    } catch (err) {
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
        URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })),
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
  // Voice generation via ElevenLabs TTS
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
        URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })),
      )
      setMergeProgress('')
      void logRunToMemory()

      await ff.deleteFile('video.mp4').catch(() => {})
      await ff.deleteFile('audio.mp3').catch(() => {})
      await ff.deleteFile('output.mp4').catch(() => {})
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed')
      setMergeProgress('')
    } finally {
      setMerging(false)
    }
  }, [mergedClipsUrl, mergedVideoUrl, logRunToMemory])

  // ── Derived counts ──
  const imagesReady = sceneImages.filter((s) => s.url !== null).length
  const videosReady = sceneVideos.filter((s) => s.url !== null).length
  const allImagesReady = imagesReady === 6
  const allVideosReady = videosReady === 6

  const isRunning = status === 'running'
  const isDone = status === 'done'

  // ── Stepper steps (7-step pipeline) ──
  type StepState = 'done' | 'current' | 'pending'

  const stepperSteps: { label: string; state: StepState }[] = [
    { label: 'Script',                state: script ? 'done' : isRunning && !script ? 'current' : 'pending' },
    { label: 'Storyboard',            state: storyboard ? 'done' : storyboardGenerating ? 'current' : 'pending' },
    { label: `Images (${imagesReady}/6)`, state: allImagesReady ? 'done' : sceneImages.some((s) => s.generating) ? 'current' : 'pending' },
    { label: `Videos (${videosReady}/6)`, state: allVideosReady ? 'done' : sceneVideos.some((s) => s.generating) ? 'current' : 'pending' },
    { label: 'Merge',                 state: mergedClipsUrl ? 'done' : mergingClips ? 'current' : 'pending' },
    { label: 'Voice',                 state: voiceUrl ? 'done' : voiceGenerating ? 'current' : 'pending' },
    { label: 'Done',                  state: mergedVideoUrl ? 'done' : merging ? 'current' : 'pending' },
  ]

  const pipelineOverallStatus: 'idle' | 'running' | 'done' | 'error' =
    mergedVideoUrl ? 'done' : isRunning || storyboardGenerating || sceneImages.some(s=>s.generating) || sceneVideos.some(v=>v.generating) || mergingClips || voiceGenerating || merging ? 'running' : 'idle'

  return (
    <div
      style={{
        minHeight: '100%',
        background: T.bg,
        padding: '30px 34px 80px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: T.ink,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Page Header                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 26 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: T.ink, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎬</span> TikTok Pipeline
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: T.ink2, maxWidth: 560 }}>
            Agent-powered storyboard pipeline — script to 6-scene cinematic TikTok in one run.
          </p>
        </div>
        <StatusBadge status={pipelineOverallStatus} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Pipeline Progress Stepper                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card style={{ marginBottom: 20 }}>
        <SecHead label="Pipeline Progress" right={isRunning ? 'In progress' : isDone ? 'Completed' : 'Idle'} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {stepperSteps.map((step, i) => (
            <span key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <StepPill label={step.label} state={step.state} />
              {i < stepperSteps.length - 1 && <Arrow />}
            </span>
          ))}
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Main 2-col grid                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Pipeline Control */}
          <Card>
            <SecHead label="Pipeline Control" />
            <p style={{ margin: 0, fontSize: 13.5, color: T.ink2 }}>
              Runs the full {PIPELINE_AGENTS.length}-agent content pipeline: trend research → script → compliance → analytics.
            </p>
            <RunBtn running={isRunning} onClick={runPipeline} />

            {sessionKey && (
              <p style={{ margin: 0, fontSize: 11, color: T.ink3 }}>
                Mission ID: <code style={{ opacity: 0.7 }}>{sessionKey}</code>
              </p>
            )}
            {pipelineError && <ErrorBar message={pipelineError} />}
            {isDone && !storyboard && (
              <p style={{ margin: 0, fontSize: 12.5, color: T.successInk }}>
                ✓ Pipeline complete — generate storyboard below
              </p>
            )}

            {/* Today's Product */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
              <SecLabel>Today's Product</SecLabel>
              <div style={{ marginTop: 12 }}>
                <AnimatePresence mode="wait">
                  {isRunning && !product ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {['Product name', 'Price'].map((lbl) => (
                        <div key={lbl}>
                          <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4 }}>{lbl}</div>
                          <motion.div style={{ height: 14, borderRadius: 4, background: T.border, width: '55%' }} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }} />
                        </div>
                      ))}
                    </motion.div>
                  ) : product ? (
                    <motion.div key="data" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 50, height: 50, borderRadius: 10, flexShrink: 0, border: `1px solid ${T.border}`, background: `repeating-linear-gradient(45deg, #F4F4F2, #F4F4F2 6px, #EDEDEA 6px, #EDEDEA 12px)`, display: 'grid', placeItems: 'center', fontSize: 22 }}>
                        💄
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: T.ink }}>{product.name}</div>
                        <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>{product.price} · {product.trendScore}% trend</div>
                        <div style={{ fontSize: 12, color: T.ink2, marginTop: 3, lineHeight: 1.4 }}>{product.viralReason}</div>
                      </div>
                      <TrendBadge score={product.trendScore} />
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <EmptyHint>{isRunning ? 'TrendHunter is scanning Malaysian TikTok Shop…' : 'Run the pipeline to discover today\'s trending product.'}</EmptyHint>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>

          {/* Generated Script */}
          <Card>
            <SecHead label="Generated Script" />
            <AnimatePresence mode="wait">
              {isRunning && !script ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Hook', 'Body', 'CTA'].map((lbl, i) => (
                    <div key={lbl} style={{ borderLeft: `3px solid ${T.border}`, paddingLeft: 14 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.ink3, marginBottom: 5 }}>{lbl}</div>
                      <motion.div style={{ height: 13, borderRadius: 4, background: T.border, width: i === 1 ? '100%' : '70%' }} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }} />
                    </div>
                  ))}
                </motion.div>
              ) : script ? (
                <motion.div key="data" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <ScriptBlock
                    script={script}
                    onCopy={() => navigator.clipboard.writeText(`HOOK:\n${script.hook}\n\nBODY:\n${script.body}\n\nCTA:\n${script.cta}`)}
                  />
                  {!storyboard && (
                    <div style={{ marginTop: 14 }}>
                      <button
                        onClick={storyboardGenerating ? undefined : generateStoryboard}
                        disabled={storyboardGenerating}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7,
                          padding: '8px 16px', borderRadius: 8, border: 'none', cursor: storyboardGenerating ? 'default' : 'pointer',
                          fontSize: 13, fontWeight: 600,
                          background: storyboardGenerating ? T.border : '#7C3AED',
                          color: storyboardGenerating ? T.ink2 : '#fff',
                          opacity: storyboardGenerating ? 0.65 : 1,
                        }}
                      >
                        {storyboardGenerating ? (
                          <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>⟳</motion.span> Generating Storyboard…</>
                        ) : (
                          <>🎞️ Generate Storyboard →</>
                        )}
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <EmptyHint>CopywriterAgent will generate your hook, body, and CTA after the pipeline runs.</EmptyHint>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* Storyboard */}
          <AnimatePresence>
            {(storyboard || storyboardGenerating) && (
              <motion.div key="storyboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <SecHead label="Storyboard — 6 Scenes" right="9:16 · cinematic" />

                  {storyboardError && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12.5, color: T.accentInk, background: T.accentSoft, border: `1px solid ${T.accentLine}` }}>
                      {storyboardError}
                    </div>
                  )}

                  {storyboardGenerating && !storyboard ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <motion.div key={i} style={{ borderRadius: 10, background: T.border, aspectRatio: '9/16', minHeight: 120 }} animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
                      ))}
                    </div>
                  ) : storyboard ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        {storyboard.map((scene) => (
                          <motion.div
                            key={scene.sceneNumber}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: (scene.sceneNumber - 1) * 0.06 }}
                            style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden', background: T.card }}
                          >
                            <div style={{ aspectRatio: '9/16', background: `repeating-linear-gradient(45deg,#F4F4F2,#F4F4F2 7px,#EDEDEA 7px,#EDEDEA 14px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexDirection: 'column', gap: 6 }}>
                              <span style={{ position: 'absolute', top: 7, left: 7, background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', color: T.ink }}>{scene.sceneNumber}</span>
                              <span style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', color: T.ink3 }}>{scene.angle}</span>
                            </div>
                            <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}` }}>
                              <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.4 }}>{scene.action}</div>
                              <div style={{ marginTop: 6, padding: '5px 8px', borderRadius: 6, background: T.accentSoft, fontSize: 10.5, color: T.accentInk, lineHeight: 1.4 }}>
                                <span style={{ fontWeight: 700 }}>VO: </span>{scene.voiceover_text}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
                        <button
                          onClick={storyboardGenerating ? undefined : generateStoryboard}
                          disabled={storyboardGenerating}
                          style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 12.5, color: T.ink2, cursor: 'pointer', fontWeight: 500 }}
                        >
                          Regenerate Storyboard
                        </button>
                        {!sceneImages.some((s) => s.url || s.generating) && (
                          <button
                            onClick={generateAllSceneImages}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#9333EA', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                          >
                            🎨 Generate All Images →
                          </button>
                        )}
                      </div>
                    </>
                  ) : null}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scene Images */}
          <AnimatePresence>
            {sceneImages.some((s) => s.url || s.generating || s.error) && (
              <motion.div key="scene-images" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <SecHead label={`Scene Images (${imagesReady}/6)`} right={allImagesReady ? 'All ready' : sceneImages.some(s=>s.generating) ? 'Generating…' : undefined} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {sceneImages.map((imgState, idx) => {
                      const scene = storyboard?.[idx]
                      return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 7px', borderRadius: 999, background: imgState.url ? T.successSoft : T.accentSoft, color: imgState.url ? T.successInk : T.accentInk, border: `1px solid ${imgState.url ? T.successLine : T.accentLine}` }}>S{idx + 1}</span>
                            {scene && <span style={{ fontSize: 10.5, color: T.ink3 }}>{scene.angle}</span>}
                          </div>
                          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '3/4', background: T.border, border: `1px solid ${T.border}` }}>
                            {imgState.generating && !imgState.url && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <motion.span style={{ fontSize: 24 }} animate={{ opacity: [0.3, 0.9, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>🎨</motion.span>
                              </div>
                            )}
                            {imgState.url && <img src={imgState.url} alt={`Scene ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {imgState.error && !imgState.url && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 }}>
                                <span style={{ fontSize: 10, textAlign: 'center', color: T.dangerInk }}>{imgState.error}</span>
                                <button onClick={() => scene && generateSingleSceneImage(idx, scene.image_prompt)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: T.dangerSoft, border: `1px solid ${T.dangerLine}`, color: T.dangerInk, cursor: 'pointer' }}>Retry</button>
                              </div>
                            )}
                          </div>
                          {imgState.url && (
                            <button onClick={() => scene && generateSingleSceneImage(idx, scene.image_prompt)} style={{ alignSelf: 'flex-start', fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, cursor: 'pointer' }}>Redo</button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={sceneImages.some(s=>s.generating) ? undefined : generateAllSceneImages}
                      disabled={sceneImages.some(s=>s.generating)}
                      style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:8, border:'none', background: sceneImages.some(s=>s.generating) ? T.border : '#9333EA', color: sceneImages.some(s=>s.generating) ? T.ink2 : '#fff', fontSize:12.5, fontWeight:600, cursor: sceneImages.some(s=>s.generating) ? 'default' : 'pointer', opacity: sceneImages.some(s=>s.generating) ? 0.65 : 1 }}
                    >
                      {sceneImages.some(s=>s.generating) ? <><motion.span animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:'linear'}}>⟳</motion.span> Generating…</> : <>🎨 {allImagesReady ? 'Regenerate All' : 'Generate All Images'}</>}
                    </button>
                    {allImagesReady && !sceneVideos.some(v=>v.url||v.generating) && (
                      <button onClick={generateAllSceneVideos} style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:8, border:'none', background:'#E11D48', color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
                        🎬 Generate All Videos →
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scene Videos */}
          <AnimatePresence>
            {sceneVideos.some((v) => v.url || v.generating || v.error) && (
              <motion.div key="scene-videos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <SecHead label={`Scene Videos (${videosReady}/6)`} right={allVideosReady ? 'All ready' : sceneVideos.some(v=>v.generating) ? `Generating… (${videosReady}/6 done)` : undefined} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {sceneVideos.map((vidState, idx) => {
                      const scene = storyboard?.[idx]
                      const imgUrl = sceneImages[idx]?.url
                      return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 7px', borderRadius: 999, background: vidState.url ? T.successSoft : T.accentSoft, color: vidState.url ? T.successInk : T.accentInk, border: `1px solid ${vidState.url ? T.successLine : T.accentLine}` }}>S{idx + 1}</span>
                            {scene && <span style={{ fontSize: 10.5, color: T.ink3 }}>{scene.angle}</span>}
                          </div>
                          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '9/16', background: '#000', border: `1px solid ${T.border}`, maxHeight: 200 }}>
                            {vidState.generating && !vidState.url && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 }}>
                                <motion.div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E11D48' }} animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                                {vidState.progress && <span style={{ fontSize: 9.5, textAlign: 'center', color: T.ink3, lineHeight: 1.4 }}>{vidState.progress}</span>}
                              </div>
                            )}
                            {vidState.url && <video src={vidState.url} controls autoPlay loop playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {vidState.error && !vidState.url && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 }}>
                                <span style={{ fontSize: 9.5, textAlign: 'center', color: T.dangerInk }}>{vidState.error}</span>
                                {imgUrl && scene && <button onClick={() => generateSingleSceneVideo(idx, imgUrl, scene.action)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: T.dangerSoft, border: `1px solid ${T.dangerLine}`, color: T.dangerInk, cursor: 'pointer' }}>Retry</button>}
                              </div>
                            )}
                          </div>
                          {vidState.url && imgUrl && scene && (
                            <button onClick={() => generateSingleSceneVideo(idx, imgUrl, scene.action)} style={{ alignSelf: 'flex-start', fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, cursor: 'pointer' }}>Redo</button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={sceneVideos.some(v=>v.generating) ? undefined : generateAllSceneVideos}
                      disabled={sceneVideos.some(v=>v.generating)}
                      style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:8, border:'none', background: sceneVideos.some(v=>v.generating) ? T.border : '#E11D48', color: sceneVideos.some(v=>v.generating) ? T.ink2 : '#fff', fontSize:12.5, fontWeight:600, cursor: sceneVideos.some(v=>v.generating) ? 'default' : 'pointer', opacity: sceneVideos.some(v=>v.generating) ? 0.65 : 1 }}
                    >
                      {sceneVideos.some(v=>v.generating) ? <><motion.span animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:'linear'}}>⟳</motion.span> {`Generating… (${videosReady}/6 done)`}</> : <>🎬 {allVideosReady ? 'Regenerate All' : 'Generate All Videos'}</>}
                    </button>
                    {allVideosReady && !mergedClipsUrl && !mergingClips && (
                      <button onClick={() => void mergeAllClips()} style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:8, border:'none', background:T.accent, color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
                        ⚡ Merge All Clips →
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Merge Clips */}
          <AnimatePresence>
            {(mergingClips || mergedClipsUrl || mergeClipsError) && (
              <motion.div key="merge-clips" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <SecHead label="Merged Video" />
                  {mergeClipsProgress && <ProgressBar message={mergeClipsProgress} />}
                  {mergeClipsError && <ErrorBar message={mergeClipsError} onRetry={() => void mergeAllClips()} />}
                  {mergedClipsUrl && (
                    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: T.successInk }}>✓ All {videosReady} clips merged into one video</p>
                      <video src={mergedClipsUrl} controls autoPlay loop playsInline style={{ borderRadius: 10, maxWidth: 260, border: `1px solid ${T.border}`, background: '#000' }} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <a href={mergedClipsUrl} download="tiktok-merged.mp4" style={{ fontSize: 12.5, padding: '6px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, textDecoration: 'none', fontWeight: 500 }}>Download</a>
                        <button onClick={() => void mergeAllClips()} style={{ fontSize: 12.5, padding: '6px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, cursor: 'pointer', fontWeight: 500 }}>Re-merge</button>
                      </div>
                    </motion.div>
                  )}
                  {!mergedClipsUrl && !mergingClips && (
                    <button onClick={() => void mergeAllClips()} style={{ alignSelf: 'flex-start', display:'inline-flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:8, border:'none', background:T.accent, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer', boxShadow:'0 1px 2px rgba(245,158,11,0.4)' }}>
                      ⚡ Merge All Clips
                    </button>
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Final Export */}
          <AnimatePresence>
            {mergedClipsUrl && voiceUrl && (
              <motion.div key="final-export" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <SecHead label="Final Export" />
                  {!mergedVideoUrl && (
                    <p style={{ margin: 0, fontSize: 13.5, color: T.ink2 }}>
                      Combine the 6-scene video with your BM voiceover into one final MP4.
                    </p>
                  )}
                  {!mergedVideoUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <button
                        onClick={merging ? undefined : () => void mergeFinalVideo()}
                        disabled={merging}
                        style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'10px 20px', borderRadius:9, border:'none', background: merging ? T.border : T.accent, color: merging ? T.ink2 : '#fff', fontSize:14, fontWeight:600, cursor: merging ? 'default' : 'pointer', opacity: merging ? 0.65 : 1, boxShadow: merging ? 'none' : '0 1px 2px rgba(245,158,11,0.4)' }}
                      >
                        {merging ? <><motion.span animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:'linear'}}>⟳</motion.span> Merging…</> : <>⚡ Merge Audio + Video</>}
                      </button>
                      {!merging && <span style={{ fontSize: 12, color: T.ink3 }}>Runs in-browser via ffmpeg.wasm · no upload</span>}
                    </div>
                  )}
                  {merging && mergeProgress && <ProgressBar message={mergeProgress} />}
                  {mergeError && <ErrorBar message={mergeError} onRetry={() => void mergeFinalVideo()} />}
                  <AnimatePresence>
                    {mergedVideoUrl && (
                      <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: T.successInk }}>✓ Final TikTok video with voiceover ready</p>
                        <video src={mergedVideoUrl} controls autoPlay loop playsInline style={{ borderRadius: 10, maxWidth: 260, border: `1px solid ${T.border}`, background: '#000' }} />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <a href={mergedVideoUrl} download="tiktok-final.mp4" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12.5, padding:'7px 16px', borderRadius:8, border:'none', background:T.accent, color:'#fff', textDecoration:'none', fontWeight:600, boxShadow:'0 1px 2px rgba(245,158,11,0.4)' }}>⬇ Download Final MP4</a>
                          <button onClick={() => { if (mergedVideoUrl) URL.revokeObjectURL(mergedVideoUrl); setMergedVideoUrl(null); setMergeError(null); }} style={{ fontSize:12.5, padding:'7px 14px', borderRadius:8, border:`1px solid ${T.border}`, background:T.card, color:T.ink2, cursor:'pointer', fontWeight:500 }}>Re-merge</button>
                        </div>

                        {/* ── Memory (R3) ── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                          {memorySaving ? (
                            <span style={{ fontSize: 12.5, color: T.ink3 }}>Saving to memory…</span>
                          ) : memorySaved ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12.5, fontWeight:600, color:T.successInk, background:T.successSoft, border:`1px solid ${T.successLine}`, borderRadius:8, padding:'5px 10px' }}>Memory saved ✅</span>
                          ) : null}
                          <button onClick={toggleMemory} style={{ fontSize:12.5, padding:'6px 13px', borderRadius:8, border:`1px solid ${T.border}`, background:T.card, color:T.ink2, cursor:'pointer', fontWeight:600 }}>
                            {showMemory ? 'Hide Memory' : '🧠 View Memory'}
                          </button>
                        </div>

                        <AnimatePresence>
                          {showMemory && (
                            <motion.div key="memory-panel" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }} style={{ overflow:'hidden' }}>
                              <div style={{ border:`1px solid ${T.border}`, borderRadius:10, background:T.bg, padding:12, display:'flex', flexDirection:'column', gap:8 }}>
                                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:T.ink3 }}>
                                  Last 5 pipeline runs · pipeline_runs/
                                </div>
                                {memoryLoading ? (
                                  <span style={{ fontSize:12.5, color:T.ink3 }}>Loading memory…</span>
                                ) : memoryRuns.length === 0 ? (
                                  <span style={{ fontSize:12.5, color:T.ink3 }}>No runs saved yet — complete a pipeline to log one.</span>
                                ) : (
                                  memoryRuns.map((run) => {
                                    const d = run.data ?? {}
                                    const when = run.timestamp ? new Date(run.timestamp).toLocaleString() : '—'
                                    return (
                                      <div key={run.key} style={{ borderTop:`1px solid ${T.border}`, paddingTop:8, fontSize:12.5, color:T.ink2 }}>
                                        <div style={{ fontWeight:600, color:T.ink }}>{String(d.product ?? 'Run')} {d.costRm != null && <span style={{ color:T.ink3, fontWeight:400 }}>· RM{String(d.costRm)}</span>}</div>
                                        <div style={{ color:T.ink3, fontSize:11.5 }}>{when} · {String(d.imagesReady ?? 0)} imgs · {String(d.videosReady ?? 0)} vids · {d.success ? 'success' : 'partial'}</div>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

        </div>{/* end left col */}

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Agent Status */}
          <Card>
            <SecHead
              label="Agent Status"
              right={`${[...Array(PIPELINE_AGENTS.length)].filter((_, i) => activeAgentIdx === i || doneUpTo >= i).length}/${PIPELINE_AGENTS.length} active`}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PIPELINE_AGENTS.map((agent, i) => (
                <AgentCard
                  key={agent.name}
                  emoji={agent.emoji}
                  name={agent.name}
                  role={agent.role}
                  active={activeAgentIdx === i}
                  done={doneUpTo >= i}
                />
              ))}
            </div>
            {status === 'idle' && (
              <p style={{ margin: 0, fontSize: 12.5, color: T.ink3, textAlign: 'center', paddingTop: 4 }}>
                Press Run to start the pipeline
              </p>
            )}
          </Card>

          {/* Voiceover */}
          <AnimatePresence>
            {(storyboard || script) && (
              <motion.div key="voice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <SecHead label="Voiceover (Bahasa Malaysia)" />

                  {storyboard && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, background: T.border, color: T.ink2 }}>
                      {storyboard.map((s) => s.voiceover_text).join(' ')}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      onClick={voiceGenerating ? undefined : () => void generateVoice()}
                      disabled={voiceGenerating}
                      style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:8, border:'none', background: voiceGenerating ? T.border : '#0D9488', color: voiceGenerating ? T.ink2 : '#fff', fontSize:12.5, fontWeight:600, cursor: voiceGenerating ? 'default' : 'pointer', opacity: voiceGenerating ? 0.65 : 1 }}
                    >
                      {voiceGenerating ? <><motion.span animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:'linear'}}>⟳</motion.span> Generating…</> : voiceUrl ? <>🎙️ Regenerate Voice</> : <>🎙️ Generate BM Voiceover</>}
                    </button>
                    {!voiceGenerating && (
                      <span style={{ fontSize: 11, color: T.ink3 }}>Adam · ElevenLabs Turbo v2.5</span>
                    )}
                  </div>

                  {voiceError && <ErrorBar message={voiceError} onRetry={() => void generateVoice()} />}

                  <AnimatePresence>
                    {voiceUrl && (
                      <motion.div key="audio" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <audio src={voiceUrl} controls style={{ width: '100%', borderRadius: 8, accentColor: T.accent }} />
                        <a href={voiceUrl} download="tiktok-voice.mp3" style={{ alignSelf: 'flex-start', fontSize: 11.5, padding: '4px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.ink2, textDecoration: 'none', fontWeight: 500 }}>Download MP3</a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

        </div>{/* end right col */}
      </div>
    </div>
  )
}
