import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  TIKTOK_MEMORY_NAMESPACES,
  clearTikTokNamespace,
  logPipelineRun,
  readAllNamespaceMemory,
  verifyTikTokMemoryNamespaces,
} from '../../server/swarm-memory'

/**
 * HermesTikTok persistent-memory API (Phase R3).
 *
 * GET  ?action=status                     → verify + list all 8 namespaces (startup check)
 * GET  ?namespace=<ns>&limit=<n>          → last n entries of a namespace (newest first)
 * POST { op: 'logRun', runData }          → log a completed pipeline run
 * POST { op: 'clear', namespace }         → clear a namespace (keeps README)
 */

function isValidNamespace(value: unknown): value is string {
  return typeof value === 'string' && (TIKTOK_MEMORY_NAMESPACES as ReadonlyArray<string>).includes(value)
}

export const Route = createFileRoute('/api/tiktok-memory')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const action = url.searchParams.get('action')?.trim()

        if (action === 'status') {
          const namespaces = verifyTikTokMemoryNamespaces()
          return json({ ok: true, namespaces })
        }

        const namespace = url.searchParams.get('namespace')?.trim()
        if (!isValidNamespace(namespace)) {
          return json({ ok: false, error: 'valid namespace required' }, { status: 400 })
        }
        const rawLimit = Number(url.searchParams.get('limit') ?? '5')
        const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.round(rawLimit))) : 5
        const all = readAllNamespaceMemory(namespace)
        return json({ ok: true, namespace, total: all.length, entries: all.slice(0, limit) })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as {
            op?: unknown
            runData?: unknown
            namespace?: unknown
          }
          const op = typeof body.op === 'string' ? body.op : ''

          if (op === 'logRun') {
            const runData =
              body.runData && typeof body.runData === 'object'
                ? (body.runData as Record<string, unknown>)
                : {}
            const entry = logPipelineRun(runData)
            return json({ ok: true, entry })
          }

          if (op === 'clear') {
            if (!isValidNamespace(body.namespace)) {
              return json({ ok: false, error: 'valid namespace required' }, { status: 400 })
            }
            const removed = clearTikTokNamespace(body.namespace)
            return json({ ok: true, namespace: body.namespace, removed })
          }

          return json({ ok: false, error: `unknown op: ${op || '(none)'}` }, { status: 400 })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
        }
      },
    },
  },
})
