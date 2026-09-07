import { useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { SelectField } from '../ui/fields'
import ShinyButton from '../fx/ShinyButton'

const RISK_OPTIONS = [
  { label: 'All Risk Levels', value: 'ALL' },
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Critical', value: 'CRITICAL' },
]

export default function MapControls({
  riskFilter,
  onRiskFilterChange,
  onSearch,
  onRunPrediction,
  predictionDisabled,
}: {
  riskFilter: string
  onRiskFilterChange: (v: string) => void
  onSearch: (query: string) => void
  onRunPrediction: () => void
  predictionDisabled: boolean
}) {
  const [query, setQuery] = useState('')

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-52">
          <SelectField label="Risk Filter" value={riskFilter} onChange={onRiskFilterChange} options={RISK_OPTIONS} />
        </div>

        <label className="block w-full sm:max-w-xs">
          <span className="mb-2 block text-[13px] font-semibold tracking-[-0.02em] text-fog">Search Hotspot</span>
          <div className="flex items-center gap-2 rounded-full border border-slate px-4 py-3 focus-within:border-copper focus-within:ring-2 focus-within:ring-copper/40">
            <Search size={15} strokeWidth={1.5} className="text-steel" aria-hidden="true" />
            <input
              type="text"
              placeholder="Hotspot ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch(query)}
              className="w-full bg-transparent text-[15px] text-bone outline-none placeholder:text-steel"
            />
          </div>
        </label>
      </div>

      <ShinyButton onClick={onRunPrediction} disabled={predictionDisabled} className="w-full sm:w-auto">
        <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />
        Run AI Prediction
      </ShinyButton>
    </div>
  )
}
