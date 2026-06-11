import { useCallback, useEffect, useRef, useState } from 'react'
import { HERMES_TIKTOK_AGENTS } from './agent-presets'
import type { HermesTikTokAgentPreset } from './agent-presets'

// Design tokens — identical to tiktok-screen.tsx for visual consistency
const T = {
  bg:           '#FAFAF9',
  card:         '#FFFFFF',
  border:       '#E8E8E5',
  accent:       '#F59E0B',
  accentSoft:   '#FEF3E2',
  accentLine:   '#F8DFB0',
  accentInk:    '#B45309',
  success:      '#10B981',
  ink:          '#1A1A1A',
  ink2:         '#6B6B6B',
  ink3:         '#9A9A96',
  shadow:       '0 1px 3px rgba(17,17,17,0.05), 0 1px 2px rgba(17,17,17,0.03)',
}

// ---------------------------------------------------------------------------
// Runtime status model
// ---------------------------------------------------------------------------

type AgentStatus = 'idle' | 'spawning' | 'running' | 'completed' | 'failed'

interface AgentRuntime {
  status: AgentStatus
  missionId: string | null
  note: string
}

const STATUS_META: Record<AgentStatus, { label: string; color: string; soft: string }> = {
  idle:      { label: 'Idle',      color: '#9A9A96', soft: '#F4F4F2' },
  spawning:  { label: 'Spawning',  color: '#B45309', soft: '#FEF3E2' },
  running:   { label: 'Running',   color: '#4338CA', soft: '#EEF0FE' },
  completed: { label: 'Completed', color: '#047857', soft: '#ECFDF5' },
  failed:    { label: 'Failed',    color: '#B91C1C', soft: '#FEF2F2' },
}

function initialsFor(name: string): string {
  const caps = name.replace(/[^A-Z]/g, '')
  if (caps.length >= 2) return caps.slice(0, 2)
  return name.slice(0, 2).toUpperCase()
}

function mapMissionStatus(raw: unknown): AgentStatus {
  const status = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return 'running'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
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
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase' as const,
        color: T.ink3,
      }}
    >
      {children}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  subColor,
}: {
  label: string
  value: string
  sub: string
  subColor: string
}) {
  return (
    <Card style={{ flex: 1, minWidth: 180, padding: '18px 22px' }}>
      <SecLabel>{label}</SecLabel>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: T.ink,
          lineHeight: 1.1,
          margin: '6px 0 4px',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: subColor, fontWeight: 500 }}>{sub}</div>
    </Card>
  )
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status]
  const pulsing = status === 'spawning' || status === 'running'
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 999,
        background: meta.soft,
        border: `1px solid ${T.border}`,
        fontSize: 11,
        fontWeight: 600,
        color: meta.color,
        flexShrink: 0,
        whiteSpace: 'nowrap' as const,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: meta.color,
          display: 'inline-block',
          flexShrink: 0,
          animation: pulsing ? 'hxPulse 1.2s ease-in-out infinite' : undefined,
        }}
      />
      {meta.label}
    </div>
  )
}

function AgentCard({
  agent,
  runtime,
  onSpawn,
}: {
  agent: HermesTikTokAgentPreset
  runtime: AgentRuntime
  onSpawn: (agent: HermesTikTokAgentPreset) => void
}) {
  const busy = runtime.status === 'spawning' || runtime.status === 'running'
  return (
    <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Avatar */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: agent.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            color: '#fff',
            flexShrink: 0,
            letterSpacing: '0.02em',
            userSelect: 'none' as const,
          }}
        >
          {initialsFor(agent.name)}
        </div>
        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: T.ink,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {agent.avatar} {agent.name}
          </div>
          <div style={{ fontSize: 12, color: T.ink2, marginTop: 2, lineHeight: 1.3 }}>
            {agent.role}
          </div>
        </div>
        <StatusBadge status={runtime.status} />
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${T.border}`, margin: '0 -1px' }} />

      {/* Memory namespace + note */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 12, color: T.ink2 }}>
          <span style={{ color: T.ink3 }}>memory:</span>{' '}
          <code style={{ fontSize: 11.5, color: agent.color }}>{agent.memoryNamespace}</code>
        </div>
        <div style={{ fontSize: 12, color: T.ink3, minHeight: 16 }}>
          {runtime.note || `tools: ${agent.toolsets.join(', ')}`}
        </div>
      </div>

      {/* Spawn button */}
      <button
        onClick={() => onSpawn(agent)}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 8,
          border: 'none',
          background: busy ? '#F4F4F2' : agent.color,
          color: busy ? T.ink3 : '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? 'not-allowed' : 'pointer',
          transition: 'filter 0.15s',
        }}
      >
        {busy ? 'Working…' : '▶ Spawn Agent'}
      </button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function HermesAgentsScreen() {
  const [product, setProduct] = useState('AeroGlow LED Face Mask')
  const [runtimes, setRuntimes] = useState<Record<string, AgentRuntime>>(() =>
    Object.fromEntries(
      HERMES_TIKTOK_AGENTS.map((a) => [a.id, { status: 'idle', missionId: null, note: '' }]),
    ),
  )

  // Keep a live ref so async poll loops don't write after unmount.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const setRuntime = useCallback((agentId: string, patch: Partial<AgentRuntime>) => {
    if (!mountedRef.current) return
    setRuntimes((prev) => ({ ...prev, [agentId]: { ...prev[agentId], ...patch } }))
  }, [])

  const pollMission = useCallback(
    async (agentId: string, missionId: string) => {
      for (let i = 0; i < 100 && mountedRef.current; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        if (!mountedRef.current) return
        try {
          const res = await fetch(
            `/api/conductor-spawn?missionId=${encodeURIComponent(missionId)}&lines=20`,
            { credentials: 'same-origin' },
          )
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean
            mission?: { status?: unknown }
          }
          if (!res.ok || !data.ok) continue
          const status = mapMissionStatus(data.mission?.status)
          if (status === 'completed') {
            setRuntime(agentId, { status: 'completed', note: 'Mission completed ✓' })
            return
          }
          if (status === 'failed') {
            setRuntime(agentId, { status: 'failed', note: 'Mission failed — click to retry' })
            return
          }
          setRuntime(agentId, { status: 'running', note: 'Running mission…' })
        } catch {
          // transient network error — keep polling
        }
      }
    },
    [setRuntime],
  )

  const handleSpawn = useCallback(
    async (agent: HermesTikTokAgentPreset) => {
      setRuntime(agent.id, { status: 'spawning', note: 'Spawning agent…', missionId: null })
      try {
        const res = await fetch('/api/conductor-spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ agentId: agent.id, product }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          missionId?: string
        }
        if (!res.ok || !data.ok || !data.missionId) {
          setRuntime(agent.id, {
            status: 'failed',
            note: data.error ? data.error.slice(0, 80) : 'Spawn failed — click to retry',
          })
          return
        }
        setRuntime(agent.id, {
          status: 'running',
          missionId: data.missionId,
          note: 'Mission dispatched…',
        })
        void pollMission(agent.id, data.missionId)
      } catch (err) {
        setRuntime(agent.id, {
          status: 'failed',
          note: err instanceof Error ? err.message.slice(0, 80) : 'Spawn failed — click to retry',
        })
      }
    },
    [product, setRuntime, pollMission],
  )

  const runningCount = Object.values(runtimes).filter(
    (r) => r.status === 'running' || r.status === 'spawning',
  ).length
  const completedCount = Object.values(runtimes).filter((r) => r.status === 'completed').length

  return (
    <div
      style={{
        minHeight: '100%',
        background: T.bg,
        padding: '30px 34px 80px',
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: T.ink,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <style>{`@keyframes hxPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 16,
          flexWrap: 'wrap' as const,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: T.ink,
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>🤖</span>
            <span>Agents</span>
          </h1>
          <p
            style={{ margin: '6px 0 0', fontSize: 14, color: T.ink2, lineHeight: 1.4, maxWidth: 520 }}
          >
            Your autonomous content team. Eight specialized agents, orchestrated by
            ContentBoss — spawn each one individually via conductor-spawn.
          </p>
        </div>
      </div>

      {/* ── Product context input ────────────────────────────────────── */}
      <Card style={{ padding: '14px 18px', marginBottom: 24 }}>
        <label
          htmlFor="hx-product"
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.09em',
            textTransform: 'uppercase' as const,
            color: T.ink3,
            marginBottom: 6,
          }}
        >
          Product context
        </label>
        <input
          id="hx-product"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="e.g. AeroGlow LED Face Mask"
          style={{
            width: '100%',
            maxWidth: 480,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            fontSize: 13.5,
            color: T.ink,
            outline: 'none',
            background: '#fff',
          }}
        />
        <p style={{ margin: '6px 0 0', fontSize: 12, color: T.ink3 }}>
          Used to fill each agent's goal template (e.g. “{'{product}'}” → your product).
        </p>
      </Card>

      {/* ── Stats row ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 28,
          flexWrap: 'wrap' as const,
        }}
      >
        <StatCard
          label="Total Agents"
          value={String(HERMES_TIKTOK_AGENTS.length)}
          sub="All registered"
          subColor={T.success}
        />
        <StatCard
          label="Running Now"
          value={String(runningCount)}
          sub={runningCount === 0 ? 'All idle' : 'Active missions'}
          subColor={runningCount === 0 ? T.ink3 : T.accentInk}
        />
        <StatCard
          label="Completed"
          value={String(completedCount)}
          sub={`of ${HERMES_TIKTOK_AGENTS.length} agents`}
          subColor={T.ink3}
        />
      </div>

      {/* ── Roster header ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <SecLabel>Agent Roster — {HERMES_TIKTOK_AGENTS.length} agents</SecLabel>
        <span style={{ fontSize: 12, color: T.ink3 }}>conductor-spawn ready</span>
      </div>

      {/* ── Agent grid ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {HERMES_TIKTOK_AGENTS.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            runtime={runtimes[agent.id]}
            onSpawn={handleSpawn}
          />
        ))}
      </div>
    </div>
  )
}
