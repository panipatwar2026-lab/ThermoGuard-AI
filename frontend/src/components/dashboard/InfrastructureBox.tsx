import type { InfrastructureCategory, InfrastructureResponse } from '../../types'

function row(label: string, cat: InfrastructureCategory | undefined, loading: boolean, error: boolean) {
  let value = 'Analyzing…'
  if (error) value = 'Unavailable'
  else if (!loading && cat) value = cat.count > 0 ? `${cat.nearest ?? '—'} (${cat.count} nearby)` : 'None detected'

  return (
    <div key={label} className="flex items-center justify-between border-t border-graphite py-2 text-[13px] first:border-t-0">
      <span className="text-fog">{label}</span>
      <strong className="text-bone">{value}</strong>
    </div>
  )
}

export default function InfrastructureBox({
  infrastructure,
  loading,
  error,
}: {
  infrastructure: InfrastructureResponse | null
  loading: boolean
  error: boolean
}) {
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold tracking-[-0.02em] text-copper">
        INFRASTRUCTURE PROXIMITY
      </div>
      {row('Industrial Area', infrastructure?.industrial, loading, error)}
      {row('Road Network', infrastructure?.roads, loading, error)}
      {row('Settlement', infrastructure?.settlements, loading, error)}
    </div>
  )
}
