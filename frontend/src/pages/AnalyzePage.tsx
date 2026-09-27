import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Flame, Loader2 } from 'lucide-react'
import Nav from '../components/layout/Nav'
import Footer from '../components/layout/Footer'
import Hero from '../components/Hero'
import InputForm from '../components/InputForm'
import LiveInteraction from '../components/LiveInteraction'
import ResultsSection from '../components/ResultsSection'
import PerformanceStats from '../components/PerformanceStats'
import InfoSection from '../components/InfoSection'
import ShinyButton from '../components/fx/ShinyButton'
import { fetchMeta, predict } from '../lib/api'
import { formatObservationTime } from '../lib/fires'
import type { MetaResponse, PredictRequest, PredictResponse } from '../types'

// FIRMS acq_date/acq_time are UTC, so defaults are too.
const now = new Date()
const NOW_ACQ_TIME = now.getUTCHours() * 100 + now.getUTCMinutes()

const DEFAULT_FORM: PredictRequest = {
  latitude: 20.0,
  longitude: 73.0,
  brightness: 330.0,
  scan: 1.0,
  track: 1.0,
  acq_time: NOW_ACQ_TIME,
  confidence: 'h',
  version: '2.0NRT',
  daynight: 'D',
  fire_type: 0,
  bright_t31: 310.0,
  frp: 5.0,
  observation_date: now.toISOString().slice(0, 10),
  observation_time: formatObservationTime(NOW_ACQ_TIME),
}

interface AnalyzeLocationState {
  prefill?: Partial<PredictRequest>
}

export default function AnalyzePage() {
  const location = useLocation()
  const prefill = (location.state as AnalyzeLocationState | null)?.prefill

  const [form, setForm] = useState<PredictRequest>(() => ({ ...DEFAULT_FORM, ...prefill }))
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [result, setResult] = useState<PredictResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMeta()
      .then(setMeta)
      .catch((e) => console.error('Failed to load model meta', e))
  }, [])

  const handleChange = <K extends keyof PredictRequest>(key: K, value: PredictRequest[K]) => {
    // observation_time mirrors acq_time; the model derives hour from acq_time.
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'acq_time' ? { observation_time: formatObservationTime(value as number) } : {}),
    }))
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setError(null)
    try {
      const res = await predict(form)
      setResult(res)
      requestAnimationFrame(() => {
        document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (e: any) {
      setError(String(e.message ?? e))
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-obsidian">
      <Nav />
      <main id="main">
        <Hero />
        <InputForm form={form} onChange={handleChange} />
        <LiveInteraction baseForm={form} />

        <div className="mx-auto max-w-[1216px] px-6 pb-16">
          <div className="flex flex-col items-center gap-3">
            <ShinyButton onClick={handleAnalyze} disabled={analyzing} className="w-full sm:w-auto sm:px-10 sm:py-4 sm:text-[16px]">
              {analyzing ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                <Flame size={18} strokeWidth={1.5} aria-hidden="true" />
              )}
              {analyzing ? 'Analyzing…' : 'Analyze Fire Risk'}
            </ShinyButton>
            <p role="status" aria-live="polite" className="text-[14px] text-[#e8a898]">
              {error ?? ''}
            </p>
          </div>
        </div>

        {result && <ResultsSection form={form} result={result} />}

        {meta && (
          <>
            <PerformanceStats meta={meta} />
            <InfoSection meta={meta} />
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
