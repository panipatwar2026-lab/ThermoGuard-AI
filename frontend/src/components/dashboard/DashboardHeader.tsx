import { useNavigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
import LiveClock from './LiveClock'
import ShinyButton from '../fx/ShinyButton'

export default function DashboardHeader() {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-[1100] border-b border-graphite bg-obsidian/95 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-paper-white focus:px-4 focus:py-2 focus:text-[14px] focus:text-black"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-[1216px] flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-2">
          <Flame size={20} strokeWidth={1.5} className="text-copper" aria-hidden="true" />
          <div className="leading-tight">
            <span className="font-display block text-[20px] text-paper-white">ThermoGuard AI</span>
            <span className="block text-[11px] tracking-[0.08em] text-fog">
              WILDFIRE INTELLIGENCE · COMMAND CENTER
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 rounded-full border border-slate px-3 py-1.5 text-[12px] text-mist sm:flex">
            <span className="h-[6px] w-[6px] rounded-full bg-sage" aria-hidden="true" />
            System Operational
          </span>
          <span className="hidden text-[13px] text-fog sm:inline">
            <LiveClock />
          </span>
          <ShinyButton variant="ghost" className="px-5 py-2.5 text-[13px]" onClick={() => navigate('/analyze')}>
            Open Risk Analysis
          </ShinyButton>
        </div>
      </div>
    </header>
  )
}
