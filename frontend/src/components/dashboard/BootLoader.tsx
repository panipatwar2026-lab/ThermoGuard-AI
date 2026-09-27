import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useAnimationFrame, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'

export type BootStatus = 'pending' | 'active' | 'done' | 'warn' | 'error'

export interface BootStep {
  key: string
  label: string
  /** Share of the 0-100 bar this step owns. */
  weight: number
  status: BootStatus
  detail?: string
}

const SIZE = 240
const C = SIZE / 2
const RING_R = 108
const SCOPE_R = 86

// India bbox (matches backend INDIA_BBOX) projected into the scope circle,
// so detections appear where they really are, relative to each other.
const LON_MIN = 68.0
const LON_MAX = 97.5
const LAT_MIN = 6.0
const LAT_MAX = 37.5
const DEG_PX = (SCOPE_R * 1.9) / (LAT_MAX - LAT_MIN)

function project([lat, lon]: [number, number]): [number, number] | null {
  const x = C + (lon - (LON_MIN + LON_MAX) / 2) * DEG_PX
  const y = C - (lat - (LAT_MIN + LAT_MAX) / 2) * DEG_PX
  return Math.hypot(x - C, y - C) <= SCOPE_R - 3 ? [x, y] : null
}

function isSettled(s: BootStatus) {
  return s === 'done' || s === 'warn'
}

// Minimum time the boot screen takes, even on a fast connection. On a slow
// one it simply takes longer: the bar is capped by what has really loaded.
// ~12.5s of pacing + page load, final settle and reveal lands at about 15s total.
const MIN_DURATION_MS = 12500
// While a step is still running, the cap creeps into that step's share so
// the bar keeps moving, but never past 90% of it until the step finishes.
const CREEP_TAU_MS = 6000
// Per-frame smoothing toward the target; larger = lazier.
const SMOOTH_TAU_MS = 280
// Top speed in %/s, so a late backend reply glides to 100 instead of jumping.
// Normal pacing peaks around 10%/s, so this only bites when catching up.
const MAX_SPEED_PCT_PER_S = 14

/** S-curve blended with a linear ramp: moves from the first second, steady middle, soft landing. */
function pace(t: number) {
  const x = Math.min(Math.max(t, 0), 1)
  return 0.6 * (0.5 - 0.5 * Math.cos(Math.PI * x)) + 0.4 * x
}

export default function BootLoader({
  steps,
  detections,
  onRetry,
  onSkip,
  onDone,
}: {
  steps: BootStep[]
  detections: [number, number][]
  onRetry: () => void
  onSkip: () => void
  /** Called once the bar has visibly reached 100% and every step has settled. */
  onDone: () => void
}) {
  const reduce = useReducedMotion()
  const failed = steps.some((s) => s.status === 'error')

  // Each step owns a slice of the bar, in order: [start, end).
  const ranges = useMemo(
    () =>
      steps.map((_, i) => {
        const start = steps.slice(0, i).reduce((sum, s) => sum + s.weight, 0)
        return [start, start + steps[i].weight] as const
      }),
    [steps],
  )

  // Real cap: through the last step that is settled in order, plus a creep
  // into the first unsettled one.
  const firstOpen = steps.findIndex((s) => !isSettled(s.status))
  const capBase = firstOpen === -1 ? 100 : ranges[firstOpen][0]
  const capRoom = firstOpen === -1 ? 0 : steps[firstOpen].weight * 0.9

  // Frame loop reads the latest values from this ref (synced after render).
  const live = useRef({ capBase: 0, capRoom: 0, failed: false, onDone, openSince: 0, startedAt: 0 })
  const openKey = firstOpen === -1 ? 'all-settled' : steps[firstOpen].key
  useLayoutEffect(() => {
    Object.assign(live.current, { capBase, capRoom, failed, onDone })
  })
  useLayoutEffect(() => {
    live.current.openSince = performance.now()
  }, [openKey])
  useLayoutEffect(() => {
    live.current.startedAt = performance.now()
  }, [])

  const progress = useMotionValue(0)
  const doneFired = useRef(false)

  useAnimationFrame((_, delta) => {
    const l = live.current
    if (l.failed) return
    const creep = l.capRoom * (1 - Math.exp(-(performance.now() - l.openSince) / CREEP_TAU_MS))
    const cap = l.capBase + creep
    const paced = 100 * pace((performance.now() - l.startedAt) / MIN_DURATION_MS)
    const target = Math.min(paced, cap)
    const current = progress.get()
    const k = reduce ? 1 : 1 - Math.exp(-delta / SMOOTH_TAU_MS)
    // Never move backwards; never faster than MAX_SPEED_PCT_PER_S.
    const step = Math.min((target - current) * k, (MAX_SPEED_PCT_PER_S * delta) / 1000)
    const next = Math.max(current, current + step)
    if (next !== current) progress.set(next)
    if (!doneFired.current && l.capBase === 100 && next >= 99.95) {
      doneFired.current = true
      progress.set(100)
      l.onDone()
    }
  })

  // Steps are shown completing in order as the bar passes them, so the list
  // reads as one smooth sequence. Errors show immediately.
  const [shown, setShown] = useState(0)
  useMotionValueEvent(progress, 'change', (v) => {
    const passed = ranges.filter(([, end]) => v >= end - 0.05).length
    if (passed !== shown) setShown(passed)
  })

  const visual = steps.map((s, i): { status: BootStatus; detail?: string } => {
    if (s.status === 'error') return { status: 'error', detail: s.detail }
    if (i < shown && isSettled(s.status)) return { status: s.status, detail: s.detail }
    if (i === shown || (i < shown && !isSettled(s.status))) {
      // Surface live hints (e.g. "server is waking up") while really running.
      return { status: 'active', detail: s.status === 'active' ? s.detail : undefined }
    }
    return { status: 'pending' }
  })
  const firesShown = steps.findIndex((s) => s.key === 'fires') < shown
  const shownPct = Math.round(ranges[Math.min(shown, ranges.length) - 1]?.[1] ?? 0)

  const pctText = useTransform(progress, (v) => `${Math.floor(v)}`)
  const arc = useTransform(progress, (v) => v / 100)
  const tipAngle = useTransform(progress, (v) => (v / 100) * 360)

  const blips = useMemo(
    () =>
      detections
        .slice(0, 600)
        .map(project)
        .filter((p): p is [number, number] => p !== null),
    [detections],
  )

  return (
    <motion.div
      className="fixed inset-0 z-[5000] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-obsidian px-4 py-10"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] } }}
      role="dialog"
      aria-modal="true"
      aria-label="Loading ThermoGuard AI"
    >
      {/* Faint warm glow behind the scope; fixed, non-interactive. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(circle at 50% 42%, rgba(204,145,102,0.10), transparent 55%)' }}
        aria-hidden="true"
      />

      <div className="relative grid w-full max-w-[880px] items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-14">
        <div
          className="relative mx-auto aspect-square w-full max-w-[300px] md:max-w-[340px]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shownPct}
          aria-valuetext={failed ? 'Loading failed' : `${shownPct} percent loaded`}
        >
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="boot-arc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ae9357" />
                <stop offset="100%" stopColor="#cc9166" />
              </linearGradient>
              <radialGradient id="boot-scope" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#121317" />
                <stop offset="100%" stopColor="#08080a" />
              </radialGradient>
              <clipPath id="boot-scope-clip">
                <circle cx={C} cy={C} r={SCOPE_R} />
              </clipPath>
            </defs>

            {/* Progress ring: hairline track + copper arc starting at 12 o'clock. */}
            <circle cx={C} cy={C} r={RING_R} fill="none" stroke="#1c1d22" strokeWidth={2} />
            <motion.circle
              cx={C}
              cy={C}
              r={RING_R}
              fill="none"
              stroke={failed ? '#d9503e' : 'url(#boot-arc)'}
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ pathLength: arc, rotate: -90, transformOrigin: 'center', transformBox: 'fill-box' }}
            />

            {/* Scope: graticule, sweep, real detections. */}
            <circle cx={C} cy={C} r={SCOPE_R} fill="url(#boot-scope)" stroke="#2e3038" strokeWidth={1} />
            <g clipPath="url(#boot-scope-clip)">
              {[0.33, 0.66].map((f) => (
                <circle key={f} cx={C} cy={C} r={SCOPE_R * f} fill="none" stroke="#1c1d22" strokeWidth={1} />
              ))}
              <line x1={C - SCOPE_R} y1={C} x2={C + SCOPE_R} y2={C} stroke="#1c1d22" strokeWidth={1} />
              <line x1={C} y1={C - SCOPE_R} x2={C} y2={C + SCOPE_R} stroke="#1c1d22" strokeWidth={1} />

              {!failed && !reduce && (
                <foreignObject x={C - SCOPE_R} y={C - SCOPE_R} width={SCOPE_R * 2} height={SCOPE_R * 2}>
                  <div
                    className="boot-sweep h-full w-full rounded-full"
                    style={{
                      background: 'conic-gradient(from 0deg, rgba(204,145,102,0.28), rgba(204,145,102,0) 70deg, transparent 360deg)',
                    }}
                  />
                </foreignObject>
              )}

              {firesShown && blips.map(([x, y], i) => (
                <motion.circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={1.5}
                  fill="#e8a898"
                  initial={reduce ? false : { opacity: 0, scale: 0 }}
                  animate={{ opacity: 0.75, scale: 1 }}
                  transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(i * 0.004, 1.2) }}
                />
              ))}
              {/* Quiet disc so the percentage stays readable over the detections. */}
              <circle cx={C} cy={C} r={34} fill="#08080a" fillOpacity={0.82} />
            </g>
          </svg>

          {/* Satellite riding the arc tip (HTML layer so it rotates about the ring's true center). */}
          <motion.div className="pointer-events-none absolute inset-0" style={{ rotate: tipAngle }} aria-hidden="true">
            <span
              className="absolute left-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-copper shadow-[0_0_0_5px_rgba(204,145,102,0.18)]"
              style={{ top: `${((C - RING_R) / SIZE) * 100}%` }}
            />
          </motion.div>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex items-start text-paper-white">
              <motion.span className="text-[48px] font-light leading-none tabular-nums tracking-[-0.04em] sm:text-[56px]">
                {pctText}
              </motion.span>
              <span className="mt-2 text-[18px] font-light text-fog">%</span>
            </div>
          </div>
        </div>

        <div className="w-full">
          <h1 className="font-display text-[30px] leading-tight text-paper-white sm:text-[36px]">ThermoGuard AI</h1>
          <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-mist">
            Syncing live satellite fire detections across India.
          </p>

          <ol className="mt-8 space-y-4" aria-live="polite">
            {steps.map((step, i) => {
              const s = { ...step, status: visual[i].status, detail: visual[i].detail }
              return (
              <li key={s.key} className="flex gap-3">
                <span className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center" aria-hidden="true">
                  {s.status === 'done' && <Check size={16} strokeWidth={2} className="text-sage" />}
                  {s.status === 'warn' && <AlertTriangle size={15} strokeWidth={1.75} className="text-amber-dim" />}
                  {s.status === 'error' && <AlertTriangle size={15} strokeWidth={1.75} className="text-rose" />}
                  {s.status === 'active' && <Loader2 size={15} strokeWidth={1.75} className="animate-spin text-copper" />}
                  {s.status === 'pending' && <span className="h-[6px] w-[6px] rounded-full bg-slate" />}
                </span>
                <div className="min-w-0">
                  <div
                    className={`text-[15px] transition-colors duration-500 ${
                      s.status === 'pending' ? 'text-ash' : s.status === 'error' ? 'text-[#f0b3a8]' : 'text-bone'
                    }`}
                  >
                    {s.label}
                  </div>
                  {s.detail && (
                    <motion.div
                      key={s.detail}
                      className={`mt-0.5 text-[13px] ${s.status === 'error' ? 'text-[#e8a898]' : 'text-fog'}`}
                      initial={reduce ? false : { opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {s.detail}
                    </motion.div>
                  )}
                </div>
              </li>
              )
            })}
          </ol>

          {failed && (
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-copper px-5 py-2 text-[14px] font-medium text-obsidian transition-transform hover:bg-[#d9a27a] active:scale-[0.98]"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-full border border-slate px-5 py-2 text-[14px] text-bone transition-colors hover:border-smoke active:scale-[0.98]"
              >
                Open dashboard anyway
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
