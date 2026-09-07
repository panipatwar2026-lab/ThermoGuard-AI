import { motion } from 'motion/react'
import type { AiRisk } from '../../types'

function metricRow(label: string, value: number, key: string, delay: number) {
  return (
    <div key={key} className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="text-fog">{label}</span>
        <strong className="text-bone">{Math.round(value)}%</strong>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-graphite/60">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #ae9357, #fff0cc)' }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ duration: 0.6, delay }}
        />
      </div>
    </div>
  )
}

/**
 * Heuristic explainability bars derived from the client-side risk score —
 * persistence and infrastructure-impact are synthetic proxies (not the
 * real infrastructure lookup shown in InfrastructureBox), same as the
 * original dashboard prototype.
 */
export default function ExplainabilityBars({ ai }: { ai: AiRisk }) {
  const persistence = Math.min(100, Math.round(50 + ai.score * 0.45))
  const infrastructureImpact = Math.min(100, Math.round(35 + ai.score * 0.5))

  return (
    <div>
      <div className="mb-3 text-[13px] font-semibold tracking-[-0.02em] text-copper">EXPLAINABLE AI</div>
      {metricRow('Brightness', ai.brightnessScore, 'brightness', 0)}
      {metricRow('Persistence', persistence, 'persistence', 0.1)}
      {metricRow('Infrastructure Impact', infrastructureImpact, 'infrastructure', 0.2)}
    </div>
  )
}
