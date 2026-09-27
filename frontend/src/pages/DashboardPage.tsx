import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import Footer from '../components/layout/Footer'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import HotspotMap from '../components/dashboard/HotspotMap'
import MapControls from '../components/dashboard/MapControls'
import AlertBanner from '../components/dashboard/AlertBanner'
import RiskPanel from '../components/dashboard/RiskPanel'
import SectionTitle from '../components/ui/SectionTitle'
import BootLoader, { type BootStep } from '../components/dashboard/BootLoader'
import { fetchFires, fetchHealth, fetchInfrastructure } from '../lib/api'
import { calculateAiRisk } from '../lib/aiRisk'
import { buildPrefill, fireId, fireLatLng, formatAcq } from '../lib/fires'
import type { AiRisk, FireRecord, InfrastructureResponse } from '../types'

const REFRESH_INTERVAL_MS = 60 * 1000

// Render's free tier sleeps when idle; waking it can take ~30-60s.
const HEALTH_TIMEOUT_MS = 90 * 1000
const SLOW_BACKEND_HINT_MS = 6 * 1000
// Map tiles and the OSM lookup are nice-to-have: don't hold the loader for them.
const OPTIONAL_STEP_TIMEOUT_MS = 10 * 1000

const INITIAL_BOOT: BootStep[] = [
  { key: 'backend', label: 'Connecting to analysis server', weight: 30, status: 'active' },
  { key: 'fires', label: 'Fetching live NASA FIRMS detections', weight: 40, status: 'pending' },
  { key: 'map', label: 'Loading satellite basemap', weight: 15, status: 'active' },
  { key: 'context', label: 'Checking infrastructure near the first hotspot', weight: 15, status: 'pending' },
]

// The boot screen shows once per page load, not every time you come back
// to the dashboard from /analyze.
let bootedThisPageLoad = false

function describeFires(count: number, sources: number, latest: string | null | undefined, stale: boolean): string {
  if (count === 0) return 'No active detections in the current window'
  // Time only; the date is today unless stale, which is called out separately.
  const when = latest ? `, newest ${formatAcq(latest.slice(0, 10), latest.slice(11))?.slice(11)}` : ''
  const window = stale ? 'in the last 48h (none in the last 24h)' : 'in the last 24h'
  return `${count.toLocaleString()} detections ${window} from ${sources} satellite${sources === 1 ? '' : 's'}${when}`
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const [fires, setFires] = useState<FireRecord[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [staleFires, setStaleFires] = useState(false)
  const [latest, setLatest] = useState<string | null>(null)
  const [riskFilter, setRiskFilter] = useState('ALL')

  const [selectedFire, setSelectedFire] = useState<FireRecord | null>(null)
  const [selectedAi, setSelectedAi] = useState<AiRisk | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [infrastructure, setInfrastructure] = useState<InfrastructureResponse | null>(null)
  const [infrastructureLoading, setInfrastructureLoading] = useState(false)
  const [infrastructureError, setInfrastructureError] = useState(false)

  const [pickedLocation, setPickedLocation] = useState<[number, number] | null>(null)
  const [focusSelected, setFocusSelected] = useState(false)

  const [boot, setBoot] = useState<BootStep[] | null>(() => (bootedThisPageLoad ? null : INITIAL_BOOT))
  const [bootRun, setBootRun] = useState(0)
  const patchStep = useCallback((key: string, patch: Partial<BootStep>) => {
    setBoot((steps) => steps?.map((s) => (s.key === key ? { ...s, ...patch } : s)) ?? null)
  }, [])
  const bootActive = boot !== null
  const contextStatus = boot?.find((s) => s.key === 'context')?.status

  const loadFires = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetchFires(signal)
      setFires(res.fires)
      setStaleFires(Boolean(res.stale))
      setLatest(res.latest ?? null)
      setFetchError(null)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setFetchError(String(e.message ?? e))
    }
  }, [])

  // Boot sequence: wake the backend, then pull the first set of hotspots.
  // Each step only turns green once its real request has succeeded.
  useEffect(() => {
    if (bootedThisPageLoad) return
    const controller = new AbortController()
    const slowHint = setTimeout(
      () => patchStep('backend', { detail: 'Server is waking up. The first visit after idle can take up to a minute.' }),
      SLOW_BACKEND_HINT_MS,
    )

    const run = async () => {
      try {
        const health = await fetchHealth(AbortSignal.any([controller.signal, AbortSignal.timeout(HEALTH_TIMEOUT_MS)]))
        clearTimeout(slowHint)
        patchStep(
          'backend',
          health.risk_model_ready
            ? { status: 'done', detail: 'Risk and fire-source models loaded' }
            : { status: 'warn', detail: `Online, but the risk model is unavailable: ${health.error ?? 'unknown error'}` },
        )
      } catch (e: any) {
        clearTimeout(slowHint)
        if (controller.signal.aborted) return
        patchStep('backend', {
          status: 'error',
          detail: e?.name === 'TimeoutError' ? 'No response after 90 seconds.' : `Unreachable: ${e?.message ?? e}`,
        })
        return
      }

      patchStep('fires', { status: 'active', detail: 'Querying VIIRS S-NPP, NOAA-20, NOAA-21 and MODIS' })
      try {
        const res = await fetchFires(controller.signal)
        setFires(res.fires)
        setStaleFires(Boolean(res.stale))
        setLatest(res.latest ?? null)
        setFetchError(null)
        const sources = new Set(res.fires.map((f) => f.source)).size
        patchStep('fires', { status: 'done', detail: describeFires(res.count, sources, res.latest, Boolean(res.stale)) })
        patchStep(
          'context',
          res.count > 0 ? { status: 'active' } : { status: 'done', detail: 'Skipped, no hotspot to inspect' },
        )
      } catch (e: any) {
        if (controller.signal.aborted) return
        setFetchError(String(e?.message ?? e))
        patchStep('fires', { status: 'error', detail: String(e?.message ?? e) })
      }
    }
    run()

    return () => {
      clearTimeout(slowHint)
      controller.abort()
    }
  }, [bootRun, patchStep])

  // Optional steps settle as "warn" if they run long, so a slow tile server
  // or Overpass mirror never traps the user on the loader.
  useEffect(() => {
    if (!bootActive) return
    const t = setTimeout(() => {
      setBoot(
        (steps) =>
          steps?.map((s) =>
            (s.key === 'map' || s.key === 'context') && s.status === 'active'
              ? { ...s, status: 'warn' as const, detail: 'Still loading in the background' }
              : s,
          ) ?? null,
      )
    }, OPTIONAL_STEP_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [bootActive, bootRun, contextStatus])

  // Mirror the first infrastructure lookup into the boot screen.
  useEffect(() => {
    if (contextStatus !== 'active' || infrastructureLoading) return
    if (infrastructure) patchStep('context', { status: 'done', detail: 'OpenStreetMap proximity data ready' })
    else if (infrastructureError)
      patchStep('context', { status: 'warn', detail: 'OpenStreetMap is busy, retried when you select a hotspot' })
  }, [contextStatus, infrastructure, infrastructureError, infrastructureLoading, patchStep])

  // Loader reached 100% with every step settled: hold briefly, then reveal.
  const handleBootDone = useCallback(() => {
    bootedThisPageLoad = true
    setTimeout(() => setBoot(null), 700)
  }, [])

  useEffect(() => {
    if (!bootActive) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [bootActive])

  const retryBoot = () => {
    setBoot((steps) =>
      INITIAL_BOOT.map((s) => {
        const current = steps?.find((c) => c.key === s.key)
        return s.key === 'map' && current ? current : s
      }),
    )
    setBootRun((n) => n + 1)
  }

  const skipBoot = () => {
    bootedThisPageLoad = true
    setBoot(null)
    // Boot stopped early, so the first fetch may never have run.
    loadFires()
  }

  const handleTilesReady = useCallback(
    () => patchStep('map', { status: 'done', detail: 'Esri World Imagery' }),
    [patchStep],
  )

  useEffect(() => {
    const controller = new AbortController()
    // First load is done by the boot sequence; later visits load directly.
    if (bootedThisPageLoad) loadFires(controller.signal)
    const interval = setInterval(() => loadFires(controller.signal), REFRESH_INTERVAL_MS)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [loadFires])

  const selectFire = useCallback((fire: FireRecord, ai: AiRisk, id: string, focus = true) => {
    setFocusSelected(focus)
    setSelectedFire(fire)
    setSelectedAi(ai)
    setSelectedId(id)
  }, [])

  // Auto-select the first hotspot once fires load, mirroring the original
  // dashboard's behavior, without re-selecting on every background refresh.
  useEffect(() => {
    if (selectedFire || fires.length === 0) return
    const first = fires.find((f) => fireLatLng(f))
    // focus=false: fill the risk panel but keep the map framed on all of India.
    if (first) selectFire(first, calculateAiRisk(first), fireId(first, fires.indexOf(first)), false)
  }, [fires, selectedFire, selectFire])

  useEffect(() => {
    const latLng = selectedFire ? fireLatLng(selectedFire) : null
    if (!latLng) {
      setInfrastructure(null)
      return
    }

    const controller = new AbortController()
    setInfrastructureLoading(true)
    setInfrastructureError(false)

    fetchInfrastructure(latLng[0], latLng[1], controller.signal)
      .then(setInfrastructure)
      .catch((e) => {
        if (e?.name === 'AbortError') return
        setInfrastructureError(true)
      })
      .finally(() => setInfrastructureLoading(false))

    return () => controller.abort()
  }, [selectedFire])

  const handleSearch = (query: string) => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return
    const index = fires.findIndex((f, i) => fireId(f, i).toLowerCase() === trimmed)
    if (index === -1) return
    const fire = fires[index]
    selectFire(fire, calculateAiRisk(fire), fireId(fire, index))
  }

  const handleRunPrediction = () => {
    if (!selectedFire || !selectedAi) return
    navigate('/analyze', { state: { prefill: buildPrefill(selectedFire, selectedAi) } })
  }

  const handleAnalyzePicked = () => {
    if (!pickedLocation) return
    navigate('/analyze', { state: { prefill: { latitude: pickedLocation[0], longitude: pickedLocation[1] } } })
  }

  return (
    <div className="min-h-screen bg-obsidian">
      <AnimatePresence>
        {boot && (
          <BootLoader
            steps={boot}
            detections={fires.map(fireLatLng).filter((p): p is [number, number] => p !== null)}
            onRetry={retryBoot}
            onSkip={skipBoot}
            onDone={handleBootDone}
          />
        )}
      </AnimatePresence>

      {/* Rendered during boot so the map can size itself and fetch tiles,
          but invisible and inert so nothing shows through the loader. */}
      <div
        inert={bootActive}
        aria-hidden={bootActive}
        className={`transition-opacity duration-700 ease-out ${bootActive ? 'opacity-0' : 'opacity-100'}`}
      >
      <DashboardHeader />

      <main id="main">
        <div className="mx-auto max-w-[1216px] px-6 py-10">
          <SectionTitle eyebrow="THERMAL ACTIVITY" title="Live Wildfire Command Center" />

          {fetchError && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#d9503e]/50 bg-[#d9503e]/10 p-4 text-[14px] text-[#f0b3a8]">
              <span>
                Unable to load live NASA FIRMS data: {fetchError}. Confirm NASA_FIRMS_MAP_KEY is configured on the backend.
              </span>
              <button
                type="button"
                onClick={() => loadFires()}
                className="shrink-0 rounded-full border border-[#d9503e]/60 px-4 py-1.5 text-[13px] font-medium text-[#f0b3a8] transition-colors hover:bg-[#d9503e]/15"
              >
                Retry
              </button>
            </div>
          )}

          {!fetchError && staleFires && fires.length > 0 && (
            <div className="mb-6 rounded-[10px] border border-amber-500/40 bg-amber-500/10 p-4 text-[14px] text-amber-200">
              No hotspots detected in the last 24 hours. Showing the last 48 hours of NASA FIRMS data.
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
            <div className="space-y-4">
              <MapControls
                riskFilter={riskFilter}
                onRiskFilterChange={setRiskFilter}
                onSearch={handleSearch}
                onRunPrediction={handleRunPrediction}
                predictionDisabled={!selectedFire}
              />
              <HotspotMap
                fires={fires}
                riskFilter={riskFilter}
                latest={latest}
                selectedId={selectedId}
                focusSelected={focusSelected}
                onTilesReady={handleTilesReady}
                onSelect={selectFire}
                pickedLocation={pickedLocation}
                onPickLocation={(lat, lng) => setPickedLocation([lat, lng])}
                onClearPicked={() => setPickedLocation(null)}
                onAnalyzePicked={handleAnalyzePicked}
              />
            </div>

            <div className="space-y-4">
              <AlertBanner ai={selectedAi} hasFires={fires.length > 0} />
              <RiskPanel
                fire={selectedFire}
                ai={selectedAi}
                hotspotId={selectedId}
                infrastructure={infrastructure}
                infrastructureLoading={infrastructureLoading}
                infrastructureError={infrastructureError}
                hasFires={fires.length > 0}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
      </div>
    </div>
  )
}
