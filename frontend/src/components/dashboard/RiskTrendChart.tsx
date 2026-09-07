import { motion } from 'motion/react'
import type { AiRisk } from '../../types'
import SpotlightCard from '../fx/SpotlightCard'
import SectionTitle from '../ui/SectionTitle'

const LABELS = ['NOW', '+1HR', '+2HR', '+3HR', '+4HR', '+5HR', '+6HR']
const WIDTH = 700
const HEIGHT = 180
const PAD = 16

function trendFor(score: number): number[] {
  return [score, score + 5, score + 9, score + 15, score + 20, score + 25, score + 30].map((v) => Math.min(100, v))
}

export default function RiskTrendChart({ ai }: { ai: AiRisk | null }) {
  if (!ai) return null

  const values = trendFor(ai.score)
  const stepX = (WIDTH - PAD * 2) / (values.length - 1)
  const points = values.map((v, i) => {
    const x = PAD + i * stepX
    const y = PAD + (1 - v / 100) * (HEIGHT - PAD * 2)
    return [x, y] as const
  })
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1][0]},${HEIGHT - PAD} L${points[0][0]},${HEIGHT - PAD} Z`

  return (
    <div>
      <SectionTitle eyebrow="RISK TREND" title="Fire Propagation Analysis" />
      <SpotlightCard className="p-6">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: 220 }}>
          <defs>
            <linearGradient id="gilded-trend-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ae9357" />
              <stop offset="45%" stopColor="#fff0cc" />
              <stop offset="100%" stopColor="#ae9357" />
            </linearGradient>
            <linearGradient id="gilded-trend-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ae9357" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ae9357" stopOpacity="0" />
            </linearGradient>
          </defs>

          <motion.path
            d={areaPath}
            fill="url(#gilded-trend-area)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
          <motion.path
            d={linePath}
            fill="none"
            stroke="url(#gilded-trend-line)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
          {points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3} fill="#fff0cc" />
          ))}
        </svg>

        <div className="mt-2 flex justify-between text-[12px] text-fog">
          {LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </SpotlightCard>
    </div>
  )
}
