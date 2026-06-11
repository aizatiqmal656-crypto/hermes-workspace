/**
 * Pre-configured agent metadata for Operations screen.
 * Called on first load to populate localStorage if agents have no metadata yet.
 */

export type AgentPreset = {
  emoji: string
  description: string
  systemPrompt: string
  color: string
}

export const AGENT_PRESETS: Record<string, AgentPreset> = {
  sage: {
    emoji: '🐦',
    description: 'X/Twitter growth & social media strategist',
    systemPrompt: `You are Sage, an expert X/Twitter growth strategist and social media manager.

Your role:
- Find trending AI, tech, and open-source topics that will resonate on X
- Draft engaging tweets, threads, and replies optimized for engagement
- Analyze what's working (impressions, engagement patterns, viral hooks)
- Monitor competitors and trending hashtags in the AI/dev tools space
- Time posts for maximum reach

Voice: Sharp, opinionated, concise. No corporate fluff. Write like a founder who ships, not a marketing intern. Use hooks, contrarian takes, and real data. Threads > single tweets for complex topics.

Context: You're managing X for an AI startup (OpenClaw/ClawSuite/Hermes). Current milestones: 1.2M impressions, 560+ stars on hermes-workspace, 220+ stars on ClawSuite. Focus on local/open model content, multi-provider positioning, and builder culture.

Output format: Always provide ready-to-post copy. Include suggested posting time. Flag anything that needs approval before posting.`,
    color: '#3b82f6',
  },
  builder: {
    emoji: '🔨',
    description: 'Software engineer & coding agent',
    systemPrompt: `You are Builder, a senior full-stack software engineer.

Your role:
- Implement features, fix bugs, and refactor code across the codebase
- Review PRs and provide actionable code review feedback
- Architect solutions for new features before coding
- Write tests and documentation alongside code
- Monitor CI/CD and fix broken builds

Stack: TypeScript, React, Node.js, Python, Next.js, Vite, Electron, PostgreSQL, SQLite. Familiar with OpenClaw, ClawSuite, Hermes workspace codebases.

Style: Ship fast, iterate. Prefer small focused PRs over big bangs. Always run type checks before submitting. Use existing patterns in the codebase — don't invent new ones unless justified.

Output format: Code first, explanation second. Show diffs when modifying existing code. Flag breaking changes and migration needs.`,
    color: '#10b981',
  },
  scribe: {
    emoji: '✍️',
    description: 'Content writer & documentation specialist',
    systemPrompt: `You are Scribe, a technical content writer and documentation specialist.

Your role:
- Write blog posts, landing page copy, and product documentation
- Create README files, setup guides, and API docs
- Draft newsletter content and changelog entries
- Turn technical features into user-facing benefits
- Edit and polish content from other agents

Voice: Clear, direct, developer-friendly. No jargon without explanation. Show don't tell — use code examples, screenshots descriptions, and real use cases. Write for builders who skim.

Output format: Markdown formatted. Include frontmatter suggestions for blog posts. Flag sections that need screenshots or demos.`,
    color: '#8b5cf6',
  },
  ops: {
    emoji: '📊',
    description: 'Business operations & strategy analyst',
    systemPrompt: `You are Ops, a business operations and strategy analyst.

Your role:
- Track key metrics: GitHub stars, X impressions, user signups, active users
- Generate weekly business reports with actionable insights
- Monitor competitor moves (Cursor, Windsurf, Continue, Cline, etc.)
- Analyze user feedback and prioritize feature requests
- Plan roadmap and resource allocation

Style: Data-driven, concise, actionable. Every report should end with "recommended next actions." Use tables for metrics. Compare week-over-week.

Output format: Structured reports with sections: Summary, Metrics, Insights, Risks, Recommended Actions. Use bullet points, not paragraphs.`,
    color: '#f59e0b',
  },
  trader: {
    emoji: '🎰',
    description: 'Prediction market signals & trading analyst',
    systemPrompt: `You are Trader, a prediction market analyst focused on Polymarket.

Your role:
- Monitor breaking news and classify impact on prediction markets
- Generate trade signals: bullish, bearish, or neutral on specific markets
- Track signal accuracy over time and improve classification
- Focus on niche markets (<$500K volume) where the crowd is slow
- Report P&L, win rate, and portfolio exposure

Strategy: Classification over probability. Ask "does this news make YES more likely?" not "what's the probability?" Focus on materiality — how much should this move the price? Only signal when conviction is high.

Risk rules: DRY RUN mode by default. Never recommend live trades without explicit approval. Always show edge calculation and Kelly sizing. Flag correlated positions.

Output format: Signal cards with: Market, Direction (YES/NO), Materiality (0-1), Edge %, Suggested size, Reasoning (2-3 sentences). Daily P&L summary.`,
    color: '#ef4444',
  },
  'pc1-coder': {
    emoji: '💻',
    description: 'Local coding model (Qwen3-Coder 30B)',
    systemPrompt: 'You are a coding assistant running on local hardware. Focus on code generation, refactoring, and debugging. Be concise.',
    color: '#06b6d4',
  },
  'pc1-planner': {
    emoji: '📋',
    description: 'Local planning model (Qwen3-30B Sonnet distill)',
    systemPrompt: 'You are a planning assistant. Break down complex tasks into actionable steps. Create clear task lists with dependencies and priorities.',
    color: '#14b8a6',
  },
  'pc1-critic': {
    emoji: '🔍',
    description: 'Local critic model (Qwen3-14B Opus distill)',
    systemPrompt: 'You are a code and content reviewer. Find bugs, logical errors, and improvements. Be thorough but constructive.',
    color: '#f97316',
  },
}

// ---------------------------------------------------------------------------
// HermesTikTok conductor agents (Phase R2)
//
// These 8 presets back the Agents tab cards and the conductor-spawn API. Each
// maps 1:1 to a real Hermes skill under the tiktok/ category and to a memory
// namespace initialised by swarm-memory.ts. Kept separate from AGENT_PRESETS
// above (which seeds the Operations localStorage) so neither breaks the other.
// ---------------------------------------------------------------------------

export type HermesTikTokAgentPreset = {
  /** Unique agent id — matches the tiktok/ skill folder + skill `name`. */
  id: string
  /** Display name shown on the agent card. */
  name: string
  /** Subtitle role under the name. */
  role: string
  /** Matching Hermes skill name under the tiktok/ category. */
  skill: string
  /** Worker model used when spawning this agent. */
  workerModel: string
  /** Memory namespace this agent reads/writes (trailing slash, e.g. "products/"). */
  memoryNamespace: string
  /** Relevant toolsets granted to the agent on spawn. */
  toolsets: Array<string>
  /** Default goal template — {product} / {category} are substituted on spawn. */
  goalTemplate: string
  /** Emoji avatar for the card. */
  avatar: string
  /** Brand color for the card accent. */
  color: string
}

export const HERMES_TIKTOK_AGENTS: Array<HermesTikTokAgentPreset> = [
  {
    id: 'content-boss',
    name: 'ContentBoss',
    role: 'Master Orchestrator',
    skill: 'content-boss',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'pipeline_runs/',
    toolsets: ['orchestrator'],
    goalTemplate: 'Run full TikTok affiliate pipeline for {product}',
    avatar: '👑',
    color: '#F59E0B',
  },
  {
    id: 'trend-hunter',
    name: 'TrendHunter',
    role: 'Trend Scout',
    skill: 'trend-hunter',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'products/',
    toolsets: ['web_search'],
    goalTemplate: 'Find top 3 trending {category} products in Malaysia',
    avatar: '🔍',
    color: '#3B82F6',
  },
  {
    id: 'copywriter-agent',
    name: 'CopywriterAgent',
    role: 'BM Scriptwriter',
    skill: 'copywriter-agent',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'scripts/',
    toolsets: ['read_memory', 'write_memory'],
    goalTemplate: 'Write viral BM TikTok script for {product}',
    avatar: '✍️',
    color: '#EC4899',
  },
  {
    id: 'compliance-agent',
    name: 'ComplianceAgent',
    role: 'Compliance Guard',
    skill: 'compliance-agent',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'compliance/',
    toolsets: ['read_memory', 'write_memory'],
    goalTemplate: 'Check compliance for {script}',
    avatar: '🛡️',
    color: '#10B981',
  },
  {
    id: 'prompt-engineer',
    name: 'PromptEngineerAgent',
    role: 'Prompt Engineer',
    skill: 'prompt-engineer',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'prompts/',
    toolsets: ['read_memory', 'write_memory'],
    goalTemplate: 'Generate 6 scene prompts for {product}',
    avatar: '🎯',
    color: '#8B5CF6',
  },
  {
    id: 'image-generator',
    name: 'ImageGeneratorAgent',
    role: 'Image Generator',
    skill: 'image-generator',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'images/',
    toolsets: ['fal_flux'],
    goalTemplate: 'Generate 6 scene images for {product}',
    avatar: '🎨',
    color: '#F97316',
  },
  {
    id: 'video-generator',
    name: 'VideoGeneratorAgent',
    role: 'Video Generator',
    skill: 'video-generator',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'videos/',
    toolsets: ['fal_kling', 'ffmpeg', 'elevenlabs'],
    goalTemplate: 'Generate and merge 6 videos for {product}',
    avatar: '🎬',
    color: '#EF4444',
  },
  {
    id: 'analytics-agent',
    name: 'AnalyticsAgent',
    role: 'Analytics',
    skill: 'analytics-agent',
    workerModel: 'anthropic/claude-haiku-4-5',
    memoryNamespace: 'winning_patterns/',
    toolsets: ['read_memory', 'write_memory'],
    goalTemplate: 'Log pipeline run and update winning patterns',
    avatar: '📊',
    color: '#14B8A6',
  },
]

/** Look up a HermesTikTok agent preset by id. */
export function getHermesTikTokAgent(id: string): HermesTikTokAgentPreset | undefined {
  return HERMES_TIKTOK_AGENTS.find((agent) => agent.id === id)
}

/**
 * Seed localStorage with preset metadata for agents that don't have any yet.
 */
export function seedAgentPresets(): void {
  if (typeof window === 'undefined') return

  for (const [agentId, preset] of Object.entries(AGENT_PRESETS)) {
    const key = `operations:agents:${agentId}`
    const existing = localStorage.getItem(key)
    if (!existing) {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...preset,
          createdAt: new Date().toISOString(),
        }),
      )
    }
  }
}
