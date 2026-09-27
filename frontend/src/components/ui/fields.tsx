import type { ChangeEvent, ReactNode } from 'react'

const labelClass = 'mb-2 block text-[13px] font-semibold tracking-[-0.02em] text-fog'
const inputClass =
  'w-full rounded-full border border-slate bg-transparent px-5 py-3 text-[15px] text-bone outline-none transition-colors placeholder:text-steel focus-visible:border-copper focus-visible:ring-2 focus-visible:ring-copper/40'
const selectStyle = { backgroundColor: '#121317', color: '#e2e3e9' }

function toName(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

interface FieldShellProps {
  label: string
  children: ReactNode
}

function FieldShell({ label, children }: FieldShellProps) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <FieldShell label={label}>
      <input
        type="number"
        inputMode="decimal"
        name={toName(label)}
        autoComplete="off"
        className={inputClass}
        value={Number.isNaN(value) ? '' : value}
        step={step}
        min={min}
        max={max}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.valueAsNumber)}
      />
    </FieldShell>
  )
}

export function SelectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { label: string; value: T }[]
}) {
  return (
    <FieldShell label={label}>
      <select
        name={toName(label)}
        className={inputClass}
        style={selectStyle}
        value={value}
        onChange={(e) => {
          const raw = e.target.value
          const match = options.find((o) => String(o.value) === raw)
          onChange((match ? match.value : raw) as T)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value} style={selectStyle}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <FieldShell label={label}>
      <input
        type="date"
        name={toName(label)}
        autoComplete="off"
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}
