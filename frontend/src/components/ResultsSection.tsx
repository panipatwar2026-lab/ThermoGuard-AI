import { BarChart3, Flame as FlameIcon, Map as MapIcon, ListChecks, Info } from 'lucide-react'
import type { PredictRequest, PredictResponse } from '../types'
import RiskCard from './RiskCard'
import FireSourcePanel from './FireSourcePanel'
import AnalysisCards from './AnalysisCards'
import AlertAssessment from './AlertAssessment'
import RiskProbabilityChart from './RiskProbabilityChart'
import InputSummaryTable from './InputSummaryTable'
import FireMap from './FireMap'
import ReportButton from './ReportButton'
import SectionTitle from './ui/SectionTitle'
import SpotlightCard from './fx/SpotlightCard'
import Reveal from './fx/Reveal'

const RISK_MESSAGE: Record<string, string> = {
  high: 'Immediate attention is recommended.',
  medium: 'Monitoring is recommended.',
  low: 'No immediate high-risk condition detected.',
}

export default function ResultsSection({ form, result }: { form: PredictRequest; result: PredictResponse }) {
  return (
    <section id="results" className="mx-auto max-w-[1216px] space-y-16 px-6 py-16">
      <div>
        <SectionTitle eyebrow="Step 03" title="Prediction Result" icon={<BarChart3 size={26} strokeWidth={1.5} className="text-copper" aria-hidden="true" />} />
        <Reveal>
          <RiskCard
            label="AI RISK ASSESSMENT"
            risk={result.predicted_risk}
            confidence={result.confidence_score}
            message={RISK_MESSAGE[result.predicted_risk.toLowerCase()] ?? 'Assessment complete.'}
          />
        </Reveal>
      </div>

      <div>
        <SectionTitle eyebrow="Source" title="Fire Source Analysis" icon={<FlameIcon size={26} strokeWidth={1.5} className="text-copper" aria-hidden="true" />} />
        <Reveal>
          <FireSourcePanel source={result.fire_source} confidence={result.fire_source_confidence} />
        </Reveal>
      </div>

      <div>
        <SectionTitle eyebrow="Analysis" title="Fire Analysis Dashboard" icon={<ListChecks size={26} strokeWidth={1.5} className="text-copper" aria-hidden="true" />} />
        <AnalysisCards result={result} latitude={form.latitude} longitude={form.longitude} />
      </div>

      <Reveal>
        <SpotlightCard className="p-6">
          <p className="text-[15px] leading-[1.6] text-mist">
            <b className="text-bone">Dataset Limitation:</b> fire source is classified from real ESA WorldCover
            land cover at the hotspot's location — Wildfire, Agricultural Fire, Industrial/Urban Fire, Offshore,
            Other, and Unknown. This is a land-cover correlate of likely fire source, not a confirmed cause.
          </p>
        </SpotlightCard>
      </Reveal>

      <div>
        <SectionTitle eyebrow="Alert" title="Alert Assessment" />
        <Reveal>
          <AlertAssessment predictedRisk={result.predicted_risk} fireSource={result.fire_source} />
        </Reveal>
      </div>

      <div>
        <SectionTitle eyebrow="Probabilities" title="Risk Probability Distribution" />
        <Reveal>
          <SpotlightCard className="p-6">
            <RiskProbabilityChart data={result.prediction_proba} />
          </SpotlightCard>
        </Reveal>
      </div>

      <div>
        <SectionTitle eyebrow="Summary" title="Input Summary" />
        <Reveal>
          <SpotlightCard className="p-6">
            <InputSummaryTable form={form} season={result.season} />
          </SpotlightCard>
        </Reveal>
      </div>

      <div>
        <SectionTitle eyebrow="Geography" title="Fire Location Map" icon={<MapIcon size={26} strokeWidth={1.5} className="text-copper" aria-hidden="true" />} />
        <Reveal>
          <FireMap latitude={form.latitude} longitude={form.longitude} />
        </Reveal>
      </div>

      {result.frp >= 4.97 && (
        <Reveal>
          <SpotlightCard className="border-[#c9974f]/50 bg-[#c9974f]/10 p-6">
            <div className="flex items-center gap-3">
              <Info size={20} strokeWidth={1.5} className="text-[#e6b878]" aria-hidden="true" />
              <p className="text-[15px] text-mist">
                High FRP detected. The current risk label is strongly influenced by FRP in the existing
                dataset/model.
              </p>
            </div>
          </SpotlightCard>
        </Reveal>
      )}

      <Reveal className="flex justify-center">
        <ReportButton form={form} />
      </Reveal>
    </section>
  )
}
