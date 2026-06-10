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

interface AgentDef {
  initials: string
  name: string
  role: string
  activity: string
  avatarColor: string
  healthColor: string
  healthColorSoft: string
}

const AGENTS: AgentDef[] = [
  {
    initials: 'CB',
    name: 'ContentBoss',
    role: 'Master Orchestrator',
    activity: 'Coordinated 0 runs',
    avatarColor: '#F59E0B',
    healthColor: '#F59E0B',
    healthColorSoft: '#FEF3E2',
  },
  {
    initials: 'TH',
    name: 'TrendHunter',
    role: 'Trend Scout',
    activity: 'Scanned 0 products',
    avatarColor: '#3B82F6',
    healthColor: '#3B82F6',
    healthColorSoft: '#EFF6FF',
  },
  {
    initials: 'CW',
    name: 'CopywriterAgent',
    role: 'BM Scriptwriter',
    activity: 'Wrote 0 scripts',
    avatarColor: '#EC4899',
    healthColor: '#EC4899',
    healthColorSoft: '#FDF2F8',
  },
  {
    initials: 'CG',
    name: 'ComplianceAgent',
    role: 'Compliance Guard',
    activity: '0 violations flagged',
    avatarColor: '#10B981',
    healthColor: '#10B981',
    healthColorSoft: '#ECFDF5',
  },
  {
    initials: 'PE',
    name: 'PromptEngineerAgent',
    role: 'Prompt Engineer',
    activity: 'Tuned 0 prompts',
    avatarColor: '#8B5CF6',
    healthColor: '#8B5CF6',
    healthColorSoft: '#F5F3FF',
  },
  {
    initials: 'IG',
    name: 'ImageGeneratorAgent',
    role: 'Image Generator',
    activity: 'Rendered 0 frames',
    avatarColor: '#F97316',
    healthColor: '#F97316',
    healthColorSoft: '#FFF7ED',
  },
  {
    initials: 'VG',
    name: 'VideoGeneratorAgent',
    role: 'Video Generator',
    activity: 'Generated 0 videos',
    avatarColor: '#EF4444',
    healthColor: '#EF4444',
    healthColorSoft: '#FEF2F2',
  },
  {
    initials: 'AN',
    name: 'AnalyticsAgent',
    role: 'Analytics',
    activity: 'Tracked 0 videos',
    avatarColor: '#14B8A6',
    healthColor: '#14B8A6',
    healthColorSoft: '#F0FDFA',
  },
]

const STATS = [
  { label: 'Total Agents', value: '8', sub: 'All operational', subColor: T.success },
  { label: 'Running Now',  value: '0', sub: 'All idle',         subColor: T.ink3  },
  { label: 'Completed Today', value: '0', sub: 'of 8 agents',   subColor: T.ink3  },
]

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

function AgentCard({ agent }: { agent: AgentDef }) {
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
            background: agent.avatarColor,
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
          {agent.initials}
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
            {agent.name}
          </div>
          <div style={{ fontSize: 12, color: T.ink2, marginTop: 2, lineHeight: 1.3 }}>
            {agent.role}
          </div>
        </div>
        {/* Idle status badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 999,
            background: '#F4F4F2',
            border: `1px solid ${T.border}`,
            fontSize: 11,
            fontWeight: 600,
            color: T.ink3,
            flexShrink: 0,
            whiteSpace: 'nowrap' as const,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: T.ink3,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          Idle
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${T.border}`, margin: '0 -1px' }} />

      {/* Activity */}
      <div style={{ fontSize: 12.5, color: T.ink2 }}>{agent.activity}</div>

      {/* Health bar */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <SecLabel>Health</SecLabel>
          <span
            style={{ fontSize: 11, fontWeight: 600, color: agent.healthColor }}
          >
            100%
          </span>
        </div>
        <div
          style={{
            width: '100%',
            height: 5,
            borderRadius: 999,
            background: agent.healthColorSoft,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 999,
              background: agent.healthColor,
            }}
          />
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function HermesAgentsScreen() {
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
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 28,
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
            ContentBoss.
          </p>
        </div>
        <button
          disabled
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            background: T.accent,
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'not-allowed',
            opacity: 0.5,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          New Session
        </button>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 28,
          flexWrap: 'wrap' as const,
        }}
      >
        {STATS.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            sub={s.sub}
            subColor={s.subColor}
          />
        ))}
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
        <SecLabel>Agent Roster — 8 agents</SecLabel>
        <span style={{ fontSize: 12, color: T.ink3 }}>All operational</span>
      </div>

      {/* ── Agent grid (2×4) ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {AGENTS.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </div>
    </div>
  )
}
