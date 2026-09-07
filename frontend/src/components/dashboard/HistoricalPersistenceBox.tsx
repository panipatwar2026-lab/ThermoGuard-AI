import type { AiRisk } from '../../types'
import { riskTone } from '../../lib/risk'

/**
 * Synthetic persistence estimate derived purely from the heuristic score —
 * not a real detection-history lookup (no historical archive is queried).
 */
export default function HistoricalPersistenceBox({ ai }: { ai: AiRisk }) {
  const persistenceScore = Math.min(99, Math.round(40 + ai.score * 0.45))
  const detectionCount = Math.max(1, Math.round(persistenceScore / 18))

  let threat: 'PERSISTENT' | 'WATCH' | 'LOW' = 'LOW'
  if (persistenceScore >= 80) threat = 'PERSISTENT'
  else if (persistenceScore >= 60) threat = 'WATCH'

  const tone = riskTone(threat === 'PERSISTENT' ? 'high' : threat === 'WATCH' ? 'medium' : 'low')

  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold tracking-[-0.02em] text-copper">HISTORICAL PERSISTENCE</div>
      <div className="flex items-center justify-between border-t border-graphite py-2 text-[13px] first:border-t-0">
        <span className="text-fog">Fire Persistence</span>
        <strong className="text-bone">{persistenceScore}%</strong>
      </div>
      <div className="flex items-center justify-between border-t border-graphite py-2 text-[13px]">
        <span className="text-fog">Detection Count</span>
        <strong className="text-bone">{detectionCount}</strong>
      </div>
      <div className="flex items-center justify-between border-t border-graphite py-2 text-[13px]">
        <span className="text-fog">Threat Status</span>
        <strong className={tone.text}>{threat}</strong>
      </div>
    </div>
  )
}
