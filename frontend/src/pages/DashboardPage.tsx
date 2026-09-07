import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Footer from '../components/layout/Footer'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import HotspotMap from '../components/dashboard/HotspotMap'
import MapControls from '../components/dashboard/MapControls'
import AlertBanner from '../components/dashboard/AlertBanner'
import RiskPanel from '../components/dashboard/RiskPanel'
import ForecastPanel from '../components/dashboard/ForecastPanel'
import RiskTrendChart from '../components/dashboard/RiskTrendChart'
import SectionTitle from '../components/ui/SectionTitle'
import { fetchFires, fetchInfrastructure } from '../lib/api'
import { calculateAiRisk } from '../lib/aiRisk'
import { buildPrefill, fireId, fireLatLng } from '../lib/fires'
import type { AiRisk, FireRecord, InfrastructureResponse } from '../types'

const REFRESH_INTERVAL_MS = 10 * 60 * 1000

export default function DashboardPage() {
  const navigate = useNavigate()

  const [fires, setFires] = useState<FireRecord[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [riskFilter, setRiskFilter] = useState('ALL')

  const [selectedFire, setSelectedFire] = useState<FireRecord | null>(null)
  const [selectedAi, setSelectedAi] = useState<AiRisk | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [infrastructure, setInfrastructure] = useState<InfrastructureResponse | null>(null)
  const [infrastructureLoading, setInfrastructureLoading] = useState(false)
  const [infrastructureError, setInfrastructureError] = useState(false)

  const [pickedLocation, setPickedLocation] = useState<[number, number] | null>(null)

  const loadFires = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetchFires(signal)
      setFires(res.fires)
      setFetchError(null)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setFetchError(String(e.message ?? e))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadFires(controller.signal)
    const interval = setInterval(() => loadFires(), REFRESH_INTERVAL_MS)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [loadFires])

  const selectFire = useCallback((fire: FireRecord, ai: AiRisk, id: string) => {
    setSelectedFire(fire)
    setSelectedAi(ai)
    setSelectedId(id)
  }, [])

  // Auto-select the first hotspot once fires load, mirroring the original
  // dashboard's behavior, without re-selecting on every background refresh.
  useEffect(() => {
    if (selectedFire || fires.length === 0) return
    const first = fires.find((f) => fireLatLng(f))
    if (first) selectFire(first, calculateAiRisk(first), fireId(first, fires.indexOf(first)))
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
                selectedId={selectedId}
                onSelect={selectFire}
                pickedLocation={pickedLocation}
                onPickLocation={(lat, lng) => setPickedLocation([lat, lng])}
                onClearPicked={() => setPickedLocation(null)}
                onAnalyzePicked={handleAnalyzePicked}
              />
            </div>

            <div className="space-y-4">
              <AlertBanner ai={selectedAi} />
              <RiskPanel
                fire={selectedFire}
                ai={selectedAi}
                hotspotId={selectedId}
                infrastructure={infrastructure}
                infrastructureLoading={infrastructureLoading}
                infrastructureError={infrastructureError}
              />
            </div>
          </div>

          <div className="mt-10">
            <ForecastPanel ai={selectedAi} />
          </div>

          <div className="mt-10">
            <RiskTrendChart ai={selectedAi} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
