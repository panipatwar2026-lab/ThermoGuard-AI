import { motion, useReducedMotion } from 'motion/react'
import { Flame } from 'lucide-react'

const PIPELINE = ['Hotspot', 'Detection', 'Source', 'Risk', 'Alert', 'Report']

export default function Nav() {
  const reduceMotion = useReducedMotion()

  return (
    <header className="sticky top-0 z-[1100] border-b border-graphite bg-obsidian/95 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-paper-white focus:px-4 focus:py-2 focus:text-[14px] focus:text-black"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-[1216px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Flame size={20} strokeWidth={1.5} className="text-copper" aria-hidden="true" />
          <span className="font-display text-[20px] text-paper-white">ThermoGuard AI</span>
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Analysis pipeline">
          {PIPELINE.map((step, i) => (
            <div key={step} className="flex items-center gap-1">
              <span className="rounded-full px-3 py-1.5 text-[13px] text-fog">{step}</span>
              {i < PIPELINE.length - 1 && (
                <motion.span
                  aria-hidden="true"
                  className="h-[3px] w-[3px] rounded-full bg-smoke"
                  animate={reduceMotion ? undefined : { opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.25 }}
                />
              )}
            </div>
          ))}
        </nav>

        <span className="rounded-full border border-slate px-3 py-1.5 text-[12px] text-mist">
          XGBoost · Live
        </span>
      </div>
    </header>
  )
}
