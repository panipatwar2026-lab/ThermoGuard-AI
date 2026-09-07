import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { riskTone } from '../../lib/risk'
import type { AiRisk } from '../../types'

const COPY: Record<AiRisk['risk'], { title: string; message: (score: number) => string }> = {
  CRITICAL: {
    title: 'CRITICAL — IMMEDIATE ATTENTION',
    message: (score) => `Heuristic score ${score}/100. Elevated brightness and FRP indicate a high-intensity, fast-developing fire.`,
  },
  HIGH: {
    title: 'HIGH RISK DETECTED',
    message: (score) => `Heuristic score ${score}/100. Sustained thermal signature — prioritize monitoring of this hotspot.`,
  },
  MEDIUM: {
    title: 'MODERATE ACTIVITY',
    message: (score) => `Heuristic score ${score}/100. Moderate thermal signature — continue routine monitoring.`,
  },
  LOW: {
    title: 'MONITORING ACTIVE',
    message: (score) => `Heuristic score ${score}/100. No immediate emergency indicated by this hotspot.`,
  },
}

const ICONS: Record<AiRisk['risk'], typeof ShieldCheck> = {
  CRITICAL: ShieldAlert,
  HIGH: ShieldAlert,
  MEDIUM: AlertTriangle,
  LOW: ShieldCheck,
}

export default function AlertBanner({ ai }: { ai: AiRisk | null }) {
  if (!ai) {
    return (
      <div className="rounded-[10px] border border-graphite bg-onyx p-6 text-[15px] text-mist">
        Select a hotspot on the map to see its AI alert assessment.
      </div>
    )
  }

  const tone = riskTone(ai.risk)
  const Icon = ICONS[ai.risk]
  const copy = COPY[ai.risk]

  return (
    <div className={`rounded-[10px] border ${tone.border} ${tone.bg} p-6`}>
      <div className="flex items-start gap-3">
        <Icon size={20} strokeWidth={1.5} className={tone.text} aria-hidden="true" />
        <div>
          <span className={`text-[13px] font-semibold tracking-[-0.02em] ${tone.text}`}>AI ALERT SYSTEM</span>
          <h3 className="font-display mt-1 text-[20px] text-paper-white">{copy.title}</h3>
          <p className="mt-1 text-[14px] text-mist">{copy.message(ai.score)}</p>
        </div>
      </div>
    </div>
  )
}
