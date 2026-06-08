/**
 * Agent Personas — Named agents with specific roles for visual identity.
 * When agents are spawned, they get assigned a persona based on their task type.
 */

export type AgentPersona = {
  name: string
  role: string
  emoji: string
  color: string // Tailwind color class
  specialties: string[]
}

/** TikTok content production crew — 7 specialists + 1 manager */
export const AGENT_PERSONAS: AgentPersona[] = [
  {
    name: 'TrendHunter',
    role: 'Trend Scout',
    emoji: '🔥',
    color: 'text-pink-400',
    specialties: [
      'trend',
      'viral',
      'fyp',
      'hashtag',
      'discover',
      'popular',
      'trending',
      'music',
      'sound',
      'niche',
      'explore',
      'topic',
    ],
  },
  {
    name: 'CopywriterAgent',
    role: 'Copywriter',
    emoji: '✍️',
    color: 'text-violet-400',
    specialties: [
      'copy',
      'caption',
      'script',
      'hook',
      'text',
      'write',
      'cta',
      'headline',
      'story',
      'voiceover',
      'description',
      'bio',
    ],
  },
  {
    name: 'ComplianceAgent',
    role: 'Compliance Guard',
    emoji: '🛡️',
    color: 'text-teal-400',
    specialties: [
      'compliance',
      'moderate',
      'safe',
      'policy',
      'review',
      'flag',
      'filter',
      'guideline',
      'rule',
      'audit',
      'restrict',
      'approve',
    ],
  },
  {
    name: 'PromptEngineerAgent',
    role: 'Prompt Engineer',
    emoji: '⚡',
    color: 'text-yellow-400',
    specialties: [
      'prompt',
      'engineer',
      'optimize',
      'refine',
      'instruct',
      'template',
      'system',
      'generate',
      'llm',
      'ai',
      'tune',
      'context',
    ],
  },
  {
    name: 'AnalyticsAgent',
    role: 'Analytics Specialist',
    emoji: '📊',
    color: 'text-blue-400',
    specialties: [
      'analytics',
      'metric',
      'data',
      'insight',
      'performance',
      'report',
      'kpi',
      'engagement',
      'view',
      'reach',
      'conversion',
      'ctr',
    ],
  },
  {
    name: 'ImageGeneratorAgent',
    role: 'Visual Creator',
    emoji: '🎨',
    color: 'text-fuchsia-400',
    specialties: [
      'image',
      'visual',
      'graphic',
      'thumbnail',
      'picture',
      'art',
      'design',
      'creative',
      'banner',
      'cover',
      'illustration',
      'background',
    ],
  },
  {
    name: 'VideoGeneratorAgent',
    role: 'Video Producer',
    emoji: '🎬',
    color: 'text-rose-400',
    specialties: [
      'video',
      'reel',
      'clip',
      'edit',
      'render',
      'tiktok',
      'film',
      'scene',
      'cut',
      'transition',
      'animation',
      'short',
    ],
  },
  {
    name: 'ContentBoss',
    role: 'Content Manager',
    emoji: '👑',
    color: 'text-amber-400',
    specialties: [
      'manage',
      'orchestrate',
      'plan',
      'coordinate',
      'strategy',
      'brief',
      'direct',
      'schedule',
      'publish',
      'campaign',
      'calendar',
      'brand',
    ],
  },
]

/**
 * Deterministic hash from session key → stable persona index.
 * This survives HMR and ensures the same session always gets the same persona.
 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash + ch) | 0
  }
  return Math.abs(hash)
}

/** Global registry: tracks active session → persona assignments */
const assignedPersonas = new Map<string, AgentPersona>()

/**
 * Assign a persona to a session. Uses keyword matching first (skipping taken names),
 * then falls back to a deterministic hash of the session key for stable assignment.
 * Each active session gets a unique persona (up to 8 agents).
 */
export function assignPersona(
  sessionKey: string,
  taskText?: string,
): AgentPersona {
  // Return existing assignment
  const existing = assignedPersonas.get(sessionKey)
  if (existing) return existing

  // Track which persona names are already taken
  const takenNames = new Set<string>()
  for (const p of assignedPersonas.values()) {
    takenNames.add(p.name)
  }

  const available = AGENT_PERSONAS.filter((p) => !takenNames.has(p.name))

  // Try keyword matching among available personas
  let bestMatch: AgentPersona | null = null
  let bestScore = 0

  if (taskText && available.length > 0) {
    const lower = taskText.toLowerCase()
    for (const persona of available) {
      const score = persona.specialties.reduce((sum, keyword) => {
        return sum + (lower.includes(keyword) ? 1 : 0)
      }, 0)
      if (score > bestScore) {
        bestScore = score
        bestMatch = persona
      }
    }
  }

  let persona: AgentPersona
  if (bestMatch && bestScore > 0) {
    persona = bestMatch
  } else if (available.length > 0) {
    // Deterministic pick from available based on session key hash
    persona = available[hashCode(sessionKey) % available.length]
  } else {
    // All 8 taken — hash into the full pool (allows duplicates beyond 8)
    persona = AGENT_PERSONAS[hashCode(sessionKey) % AGENT_PERSONAS.length]
  }

  assignedPersonas.set(sessionKey, persona)
  return persona
}

/** Remove a session's persona assignment (call when sessions disappear) */
export function releasePersona(sessionKey: string): void {
  assignedPersonas.delete(sessionKey)
}

/** Clear all assignments */
export function clearAllPersonas(): void {
  assignedPersonas.clear()
}

/** Get persona for a session (without assigning) */
export function getPersona(sessionKey: string): AgentPersona | undefined {
  return assignedPersonas.get(sessionKey)
}

/** Get display name for an agent session */
export function getAgentDisplayName(
  sessionKey: string,
  taskText?: string,
): string {
  const persona = assignPersona(sessionKey, taskText)
  return `${persona.emoji} ${persona.name}`
}

/** Get role label for an agent session */
export function getAgentRoleLabel(
  sessionKey: string,
  taskText?: string,
): string {
  const persona = assignPersona(sessionKey, taskText)
  return persona.role
}
