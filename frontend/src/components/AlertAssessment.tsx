import { AlertOctagon, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import SpotlightCard from './fx/SpotlightCard'

// Vegetation-like sources (natural vegetation, current + legacy model) get the
// generic risk copy; unclassified sentinels (model unavailable / errored) get
// neither. Everything else — Agricultural, Industrial/Urban, Offshore, Other,
// Unknown, and the legacy 'Other Land Source' — is a land-source alert.
const VEGETATION_LIKE = ['Wildfire', 'Vegetation Fire']
const UNCLASSIFIED = ['Not Available', 'Prediction Error']

export default function AlertAssessment({ predictedRisk, fireSource }: { predictedRisk: string; fireSource: string }) {
  const landSource = !VEGETATION_LIKE.includes(fireSource) && !UNCLASSIFIED.includes(fireSource)
  const highRisk = predictedRisk.toLowerCase() === 'high'

  if (landSource && highRisk) {
    return (
      <SpotlightCard className="border-[#c47768]/50 bg-[#c47768]/10 p-6">
        <div className="flex items-start gap-3">
          <AlertOctagon size={22} strokeWidth={1.5} className="text-[#e8a898]" aria-hidden="true" />
          <div>
            <h3 className="text-[18px] font-semibold text-[#e8a898]">High Priority Alert</h3>
            <p className="mt-1 text-[15px] text-mist">
              The detected hotspot is classified as <b className="text-bone">{fireSource}</b> and the
              predicted fire risk is <b className="text-bone">HIGH</b>. Immediate verification and monitoring are
              recommended.
            </p>
          </div>
        </div>
      </SpotlightCard>
    )
  }

  if (highRisk) {
    return (
      <SpotlightCard className="border-[#c9974f]/50 bg-[#c9974f]/10 p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle size={22} strokeWidth={1.5} className="text-[#e6b878]" aria-hidden="true" />
          <p className="text-[15px] text-mist">
            <b className="text-bone">HIGH</b> fire risk detected. Immediate monitoring is recommended.
          </p>
        </div>
      </SpotlightCard>
    )
  }

  if (landSource) {
    return (
      <SpotlightCard className="p-6">
        <div className="flex items-center gap-3">
          <Info size={22} strokeWidth={1.5} className="text-fog" aria-hidden="true" />
          <p className="text-[15px] text-mist">{fireSource} detected. Additional verification is recommended.</p>
        </div>
      </SpotlightCard>
    )
  }

  return (
    <SpotlightCard className="border-[#7fae8e]/50 bg-[#7fae8e]/10 p-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 size={22} strokeWidth={1.5} className="text-[#9fcaac]" aria-hidden="true" />
        <p className="text-[15px] text-mist">No high-priority alert condition detected.</p>
      </div>
    </SpotlightCard>
  )
}
