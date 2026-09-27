import { MapPin } from 'lucide-react'
import type { PredictRequest } from '../types'
import { DateField, NumberField, SelectField } from './ui/fields'
import Reveal from './fx/Reveal'
import SectionTitle from './ui/SectionTitle'
import SpotlightCard from './fx/SpotlightCard'

interface InputFormProps {
  form: PredictRequest
  onChange: <K extends keyof PredictRequest>(key: K, value: PredictRequest[K]) => void
}

export default function InputForm({ form, onChange }: InputFormProps) {
  return (
    <section id="input" className="mx-auto max-w-[1216px] px-6 py-16">
      <SectionTitle eyebrow="Step 01" title="Fire Risk Input" icon={<MapPin size={26} strokeWidth={1.5} className="text-copper" aria-hidden="true" />} />

      <div className="grid gap-6 md:grid-cols-3">
        <Reveal delay={0.05}>
          <SpotlightCard className="h-full p-6">
            <h3 className="mb-5 text-[16px] font-semibold text-silver">Location & Hotspot</h3>
            <div className="space-y-5">
              <NumberField label="Latitude" value={form.latitude} step={0.000001} onChange={(v) => onChange('latitude', v)} />
              <NumberField label="Longitude" value={form.longitude} step={0.000001} onChange={(v) => onChange('longitude', v)} />
              <NumberField label="Brightness" value={form.brightness} step={0.01} onChange={(v) => onChange('brightness', v)} />
              <NumberField label="Scan" value={form.scan} step={0.01} onChange={(v) => onChange('scan', v)} />
              <NumberField label="Track" value={form.track} step={0.01} onChange={(v) => onChange('track', v)} />
            </div>
          </SpotlightCard>
        </Reveal>

        <Reveal delay={0.1}>
          <SpotlightCard className="h-full p-6">
            <h3 className="mb-5 text-[16px] font-semibold text-silver">Satellite Parameters</h3>
            <div className="space-y-5">
              <NumberField label="Acquisition Time (UTC HHMM)" value={form.acq_time} min={0} max={2359} onChange={(v) => onChange('acq_time', v)} />
              <SelectField
                label="Confidence"
                value={form.confidence}
                onChange={(v) => onChange('confidence', v)}
                options={[
                  { label: 'High (h)', value: 'h' },
                  { label: 'Low (l)', value: 'l' },
                  { label: 'Nominal (n)', value: 'n' },
                ]}
              />
              <SelectField
                label="Satellite Version"
                value={form.version}
                onChange={(v) => onChange('version', v)}
                options={[{ label: '2.0NRT', value: '2.0NRT' }]}
              />
              <SelectField
                label="Day / Night"
                value={form.daynight}
                onChange={(v) => onChange('daynight', v)}
                options={[
                  { label: 'Day (D)', value: 'D' },
                  { label: 'Night (N)', value: 'N' },
                ]}
              />
              <SelectField
                label="Fire / Hotspot Type"
                value={form.fire_type}
                onChange={(v) => onChange('fire_type', v)}
                options={[
                  { label: 'Vegetation fire (0)', value: 0 },
                  { label: 'Other static land source (2)', value: 2 },
                  { label: 'Offshore (3)', value: 3 },
                ]}
              />
            </div>
          </SpotlightCard>
        </Reveal>

        <Reveal delay={0.15}>
          <SpotlightCard className="h-full p-6">
            <h3 className="mb-5 text-[16px] font-semibold text-silver">Thermal & Time</h3>
            <div className="space-y-5">
              <NumberField label="Brightness T31" value={form.bright_t31} step={0.01} onChange={(v) => onChange('bright_t31', v)} />
              <NumberField label="FRP" value={form.frp} step={0.01} min={0} onChange={(v) => onChange('frp', v)} />
              <DateField label="Observation Date (UTC)" value={form.observation_date} onChange={(v) => onChange('observation_date', v)} />
            </div>
          </SpotlightCard>
        </Reveal>
      </div>
    </section>
  )
}
