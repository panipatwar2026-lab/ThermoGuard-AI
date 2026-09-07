import type { MetaResponse } from '../types'
import AnimatedAccordion from './fx/AnimatedAccordion'
import FeatureImportanceChart from './FeatureImportanceChart'
import SectionTitle from './ui/SectionTitle'
import Reveal from './fx/Reveal'

export default function InfoSection({ meta }: { meta: MetaResponse }) {
  return (
    <section className="mx-auto max-w-[1216px] px-6 py-16">
      <SectionTitle eyebrow="Reference" title="Model Information" />
      <div className="space-y-4">
        <Reveal>
          <AnimatedAccordion title="ThermoGuard AI Risk Model">
            <div className="space-y-2 text-[15px] leading-[1.6] text-mist">
              <p>Algorithm: XGBoost Classifier</p>
              <p>Features: {meta.performance.features}</p>
              <p>Classes: {meta.risk_classes.join(', ')}</p>
              <p>The model uses satellite hotspot and temporal environmental features.</p>
              <p className="text-[13px] text-[#e6b878]">
                Important: the current dataset's risk labels are strongly related to FRP, so the reported{' '}
                {meta.performance.accuracy}% accuracy should not be interpreted as independent real-world wildfire
                prediction accuracy.
              </p>
            </div>
          </AnimatedAccordion>
        </Reveal>

        <Reveal delay={0.05}>
          <AnimatedAccordion title="Feature Importance">
            <FeatureImportanceChart data={meta.feature_importances} />
          </AnimatedAccordion>
        </Reveal>

        <Reveal delay={0.1}>
          <AnimatedAccordion title="Fire Source Model Information">
            {meta.fire_source_available && meta.fire_source_performance ? (
              <div className="space-y-2 text-[15px] leading-[1.6] text-mist">
                <p>Algorithm: {meta.fire_source_performance.model} Classifier</p>
                <p>Source categories: {meta.fire_source_performance.classes.join(', ')}</p>
                <p>
                  Cross-validated accuracy: {meta.fire_source_performance.accuracy}% (
                  {meta.fire_source_performance.dataset_rows} rows)
                </p>
                <p className="text-[13px] text-[#e6b878]">{meta.fire_source_performance.caveat}</p>
              </div>
            ) : (
              <p className="text-[15px] text-mist">Fire Source model files are not available.</p>
            )}
          </AnimatedAccordion>
        </Reveal>

        <Reveal delay={0.15}>
          <AnimatedAccordion title="Fire Detection Information">
            <div className="space-y-2 text-[15px] leading-[1.6] text-mist">
              <p>
                The Fire Detection stage performs a transparent rule-based thermal hotspot screening before risk and
                source analysis.
              </p>
              <p>Screening indicators: FRP ≥ 2.40, Brightness Difference ≥ 15.</p>
              <p className="text-[13px] text-[#e6b878]">
                Important: this is NOT a separately trained binary Fire / No-Fire machine learning classifier. A
                genuine binary ML classifier would require a labelled dataset containing both confirmed fire and
                confirmed non-fire observations.
              </p>
            </div>
          </AnimatedAccordion>
        </Reveal>
      </div>
    </section>
  )
}
