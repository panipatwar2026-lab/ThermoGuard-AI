import { MapPin } from 'lucide-react'
import type { AiRisk, FireRecord, InfrastructureResponse } from '../../types'
import { riskTone } from '../../lib/risk'
import { fireLatLng } from '../../lib/fires'
import SpotlightCard from '../fx/SpotlightCard'
import CountUp from '../fx/CountUp'
import ExplainabilityBars from './ExplainabilityBars'
import InfrastructureBox from './InfrastructureBox'
import HistoricalPersistenceBox from './HistoricalPersistenceBox'

const DESCRIPTIONS: Record<AiRisk['risk'], string> = {
  CRITICAL: 'High probability of fire persistence and rapid spread',
  HIGH: 'Elevated thermal signature — close monitoring advised',
  MEDIUM: 'Moderate thermal signature detected',
  LOW: 'Low-intensity thermal signature',
}

export default function RiskPanel({
  fire,
  ai,
  hotspotId,
  infrastructure,
  infrastructureLoading,
  infrastructureError,
  hasFires = true,
}: {
  fire: FireRecord | null
  ai: AiRisk | null
  hotspotId: string | null
  infrastructure: InfrastructureResponse | null
  infrastructureLoading: boolean
  infrastructureError: boolean
  hasFires?: boolean
}) {
  if (!fire || !ai) {
    return (
      <SpotlightCard className="p-6">
        <p className="text-[15px] text-mist">
          {hasFires
            ? 'Select a hotspot on the map for a full risk breakdown.'
            : 'No active hotspots detected in this region right now. Check back later or widen the search area.'}
        </p>
      </SpotlightCard>
    )
  }

  const tone = riskTone(ai.risk)
  const latLng = fireLatLng(fire)

  return (
    <SpotlightCard className="p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <span className={`text-[13px] font-semibold tracking-[-0.02em] ${tone.text}`}>RISK DETAILS</span>
          <div className="font-display text-[32px] text-paper-white">{ai.risk}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-[32px] text-paper-white">
            <CountUp to={ai.score} decimals={0} duration={0.8} />
          </div>
          <span className="text-[12px] text-fog">/100</span>
        </div>
      </div>

      <p className="mb-6 text-[14px] text-mist">{DESCRIPTIONS[ai.risk]}</p>

      <div className="mb-6 border-t border-graphite pt-5">
        <ExplainabilityBars ai={ai} />
      </div>

      <div className="mb-6 border-t border-graphite pt-5">
        <div className="mb-2 flex items-center gap-2 text-bone">
          <MapPin size={15} strokeWidth={1.5} className="text-copper" aria-hidden="true" />
          <h3 className="text-[15px] font-semibold">{hotspotId}</h3>
        </div>
        {latLng && (
          <p className="text-[13px] text-mist">
            {latLng[0].toFixed(4)}°, {latLng[1].toFixed(4)}° · Detection: <span className="text-bone">ACTIVE</span>
          </p>
        )}
      </div>

      <div className="mb-6 border-t border-graphite pt-5">
        <InfrastructureBox
          infrastructure={infrastructure}
          loading={infrastructureLoading}
          error={infrastructureError}
        />
      </div>

      <div className="border-t border-graphite pt-5">
        <HistoricalPersistenceBox ai={ai} />
      </div>
    </SpotlightCard>
  )
}
