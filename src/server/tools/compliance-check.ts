/**
 * Compliance-check tool (ComplianceAgent) — Phase R4.
 *
 * checkKKMCompliance(script, productName) screens a script against a KKM
 * Malaysia prohibited-claims list and TikTok community guidelines, returning
 * APPROVED or REJECTED with a specific reason and suggested fix. The decision is
 * recorded to the compliance/ memory namespace.
 */

import { writeTikTokMemory } from '../swarm-memory'

export type ComplianceDecision = {
  decision: 'APPROVED' | 'REJECTED'
  reason: string
  fix?: string
  productName: string
  flags: Array<string>
}

// KKM Malaysia / advertising — prohibited or high-risk claim patterns.
const PROHIBITED_PATTERNS: Array<{ re: RegExp; flag: string; fix: string }> = [
  { re: /\b(cure|cures|sembuh|menyembuhkan)\b/i, flag: 'cure-claim', fix: 'Replace cure claims with "membantu" / "ramai user nampak perubahan".' },
  { re: /\b100\s*%|guarantee|guaranteed|dijamin\b/i, flag: 'absolute-guarantee', fix: 'Remove absolute guarantees; use "berkesan untuk ramai pengguna".' },
  { re: /\b(treat|treats|rawat penyakit|ubat)\b/i, flag: 'medical-treatment', fix: 'Avoid framing a non-registered product as treating disease.' },
  { re: /\b(cancer|kanser|diabetes|kencing manis|covid)\b/i, flag: 'disease-claim', fix: 'Never tie the product to named diseases — KKM violation.' },
  { re: /\b(clinically proven|terbukti secara klinikal)\b/i, flag: 'unverified-clinical', fix: 'Drop clinical claims unless you have registered evidence.' },
  { re: /\b(instant|serta-merta|overnight|dalam sehari)\b/i, flag: 'unrealistic-speed', fix: 'Use realistic timeframes ("dalam beberapa minggu").' },
]

// TikTok community-guideline risk patterns.
const TIKTOK_PATTERNS: Array<{ re: RegExp; flag: string; fix: string }> = [
  { re: /\b(weight loss pills|kurus segera|pil kurus)\b/i, flag: 'tiktok-weight-loss', fix: 'Avoid restricted weight-loss claims per TikTok policy.' },
  { re: /\b(before and after guaranteed|sebelum selepas dijamin)\b/i, flag: 'tiktok-before-after', fix: 'Soften before/after framing; no guaranteed results.' },
]

export function checkKKMCompliance(script: string, productName: string): ComplianceDecision {
  const text = (script || '').trim()
  const flags: Array<string> = []
  let firstReason = ''
  let firstFix = ''

  for (const rule of [...PROHIBITED_PATTERNS, ...TIKTOK_PATTERNS]) {
    if (rule.re.test(text)) {
      flags.push(rule.flag)
      if (!firstReason) {
        firstReason = `Script triggers "${rule.flag}" — ${rule.re.source}`
        firstFix = rule.fix
      }
    }
  }

  const decision: ComplianceDecision =
    flags.length === 0
      ? {
          decision: 'APPROVED',
          reason: 'No KKM-prohibited claims or TikTok guideline violations detected.',
          productName,
          flags,
        }
      : {
          decision: 'REJECTED',
          reason: firstReason,
          fix: firstFix,
          productName,
          flags,
        }

  console.log(`[tool:compliance_check] ${productName}: ${decision.decision}${flags.length ? ` (${flags.join(', ')})` : ''}`)
  writeTikTokMemory('compliance-agent', 'compliance', `check-${Date.now()}`, {
    productName,
    decision: decision.decision,
    reason: decision.reason,
    flags,
  })
  return decision
}
