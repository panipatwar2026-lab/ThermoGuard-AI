import type { AiRisk, FireRecord } from '../types'
import { normalizeConfidence } from './fires'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Client-side heuristic risk gauge shown per-hotspot on the dashboard map.
 * This is NOT the trained ML model — it's a lightweight, instant estimate
 * from brightness/FRP/confidence alone. The real prediction comes from
 * POST /api/predict (see lib/api.ts's `predict`), reached via /analyze.
 */
export function calculateAiRisk(fire: FireRecord): AiRisk {
  const brightness = Number(fire.bright_ti4 ?? fire.brightness ?? fire.bright_ti11 ?? 0)
  const frp = Number(fire.frp ?? fire.FRP ?? 0)
  const confidence = normalizeConfidence(fire.confidence ?? fire.confidence_level)

  const brightnessScore = clamp(((brightness - 250) / 150) * 100, 0, 100)
  const frpScore = clamp((frp / 50) * 100, 0, 100)

  const confidenceScore = { h: 100, n: 70, l: 35 }[confidence]

  const score = Math.round(
    clamp(brightnessScore * 0.45 + frpScore * 0.35 + confidenceScore * 0.2, 0, 100),
  )

  let risk: AiRisk['risk'] = 'LOW'
  if (score >= 80) risk = 'CRITICAL'
  else if (score >= 60) risk = 'HIGH'
  else if (score >= 40) risk = 'MEDIUM'

  return { score, risk, brightness, frp, confidence, brightnessScore, frpScore, confidenceScore }
}
