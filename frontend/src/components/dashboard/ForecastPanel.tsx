import { Gauge, TrendingUp, Wind, Zap } from 'lucide-react'
import type { AiRisk } from '../../types'
import SpotlightCard from '../fx/SpotlightCard'
import CountUp from '../fx/CountUp'
import Reveal from '../fx/Reveal'
import SectionTitle from '../ui/SectionTitle'

const RECOMMENDATIONS: Record<AiRisk['risk'], { title: string; message: string }> = {
  CRITICAL: {
    title: 'Escalate — deploy resources to this zone',
    message: 'Prediction model indicates rapid thermal growth. Immediate ground verification recommended.',
  },
  HIGH: {
    title: 'Prioritize monitoring of this zone',
    message: 'Prediction model indicates increasing thermal persistence. Continuous monitoring is recommended.',
  },
  MEDIUM: {
    title: 'Maintain routine monitoring',
    message: 'Thermal signature is moderate. Re-check on the next satellite pass.',
  },
  LOW: {
    title: 'No action required',
    message: 'Thermal signature is low-intensity and consistent with background activity.',
  },
}

function forecastFor(ai: AiRisk) {
  const spread = 4 + ai.score * 0.08
  const confidence = Math.min(96, 82 + ai.confidenceScore * 0.14)
  const persistence = Math.min(99, 55 + ai.score * 0.38)
  const wind = ai.score >= 70 ? { level: 'HIGH', speed: '18 km/h' } : ai.score >= 40 ? { level: 'MEDIUM', speed: '12 km/h' } : { level: 'LOW', speed: '7 km/h' }
  return { spread, confidence, persistence, wind }
}

export default function ForecastPanel({ ai }: { ai: AiRisk | null }) {
  if (!ai) return null

  const { spread, confidence, persistence, wind } = forecastFor(ai)
  const rec = RECOMMENDATIONS[ai.risk]

  return (
    <div>
      <SectionTitle eyebrow="AI FORECAST ENGINE" title="Fire Spread Prediction" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Reveal delay={0}>
          <SpotlightCard className="p-5">
            <div className="mb-3 flex items-center gap-2 text-fog">
              <TrendingUp size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[13px] font-semibold tracking-[-0.02em]">Predicted Spread</span>
            </div>
            <div className="font-display text-[28px] text-paper-white">
              <CountUp to={spread} decimals={1} suffix=" km" duration={1} />
            </div>
            <span className="text-[12px] text-fog">Next 6 hours</span>
          </SpotlightCard>
        </Reveal>

        <Reveal delay={0.05}>
          <SpotlightCard className="p-5">
            <div className="mb-3 flex items-center gap-2 text-fog">
              <Gauge size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[13px] font-semibold tracking-[-0.02em]">Model Confidence</span>
            </div>
            <div className="font-display text-[28px] text-paper-white">
              <CountUp to={confidence} decimals={1} suffix="%" duration={1} />
            </div>
            <span className="text-[12px] text-fog">Heuristic estimate</span>
          </SpotlightCard>
        </Reveal>

        <Reveal delay={0.1}>
          <SpotlightCard className="p-5">
            <div className="mb-3 flex items-center gap-2 text-fog">
              <Wind size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[13px] font-semibold tracking-[-0.02em]">Wind Impact</span>
            </div>
            <div className="font-display text-[28px] text-paper-white">{wind.level}</div>
            <span className="text-[12px] text-fog">{wind.speed}</span>
          </SpotlightCard>
        </Reveal>

        <Reveal delay={0.15}>
          <SpotlightCard className="p-5">
            <div className="mb-3 flex items-center gap-2 text-fog">
              <Zap size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[13px] font-semibold tracking-[-0.02em]">Fire Persistence</span>
            </div>
            <div className="font-display text-[28px] text-paper-white">
              <CountUp to={persistence} decimals={0} suffix="%" duration={1} />
            </div>
            <span className="text-[12px] text-fog">Next 6 hours</span>
          </SpotlightCard>
        </Reveal>
      </div>

      <Reveal delay={0.2}>
        <SpotlightCard className="mt-4 p-6">
          <span className="text-[13px] font-semibold tracking-[-0.02em] text-copper">AI RECOMMENDATION</span>
          <h3 className="font-display mt-1 text-[20px] text-paper-white">{rec.title}</h3>
          <p className="mt-2 text-[14px] text-mist">{rec.message}</p>
        </SpotlightCard>
      </Reveal>
    </div>
  )
}
