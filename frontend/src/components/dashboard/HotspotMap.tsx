import { Fragment, useEffect, useRef, useState } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import type { GeoJsonObject } from 'geojson'
import type { LatLngBoundsExpression } from 'leaflet'
import { Maximize2, X } from 'lucide-react'
import type { AiRisk, FireRecord } from '../../types'
import { calculateAiRisk } from '../../lib/aiRisk'
import { AGE_BUCKETS, acquiredAt, ageHex, fireId, fireLatLng, formatAge, formatIst, latestAt, sourceLabel } from '../../lib/fires'
import ShinyButton from '../fx/ShinyButton'

// Same box the backend fetches (firms.INDIA_BBOX).
const INDIA_BOUNDS: LatLngBoundsExpression = [
  [6.0, 68.0],
  [37.5, 97.5],
]
// A little slack around it so edge hotspots are not pinned to the frame.
const PAN_BOUNDS: LatLngBoundsExpression = [
  [2.0, 62.0],
  [41.5, 103.5],
]

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    const targetZoom = Math.max(map.getZoom(), 9)
    map.stop() // cancel any in-flight pan/zoom animation before retargeting
    map.setView([lat, lng], targetZoom, { animate: false })
  }, [lat, lng, map])
  return null
}

/** Frames the whole India bbox on mount and whenever `nonce` changes. */
function FitIndia({ nonce }: { nonce: number }) {
  const map = useMap()
  useEffect(() => {
    map.stop()
    map.invalidateSize()
    map.fitBounds(INDIA_BOUNDS, { padding: [12, 12], animate: nonce > 0 })
  }, [nonce, map])
  return null
}

/** India's boundary (Government of India map, via DataMeet), drawn as a thin outline. */
function IndiaOutline() {
  const [data, setData] = useState<GeoJsonObject | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/india-outline.geojson', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {})
    return () => controller.abort()
  }, [])
  if (!data) return null
  return (
    <GeoJSON
      data={data}
      interactive={false}
      attribution="Boundary &copy; DataMeet"
      style={{ color: '#f0b27a', weight: 2, opacity: 0.95, fill: false }}
    />
  )
}

/** Reports the map zoom so marker size can follow it. */
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  useEffect(() => onZoom(map.getZoom()), [map, onZoom])
  return null
}

// Small dots at country scale (like the FIRMS map) so nearby detections stay
// distinct instead of merging into blobs; full-size once zoomed in.
function markerRadius(zoom: number, selected: boolean) {
  const base = zoom < 5.5 ? 3.5 : zoom < 7 ? 5 : 8
  return selected ? base + 3 : base
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function HotspotMap({
  fires,
  riskFilter,
  latest,
  selectedId,
  focusSelected,
  onTilesReady,
  onSelect,
  pickedLocation,
  onPickLocation,
  onClearPicked,
  onAnalyzePicked,
}: {
  fires: FireRecord[]
  riskFilter: string
  latest?: string | null
  selectedId: string | null
  /** Zoom to the selected hotspot. False for the automatic first selection so the map opens on all of India. */
  focusSelected: boolean
  /** Called once, when the first full set of basemap tiles has loaded. */
  onTilesReady?: () => void
  onSelect: (fire: FireRecord, ai: AiRisk, id: string) => void
  pickedLocation: [number, number] | null
  onPickLocation: (lat: number, lng: number) => void
  onClearPicked: () => void
  onAnalyzePicked: () => void
}) {
  // Clock for "3h ago" labels and age colours; ticks once a minute.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  const markers = fires
    .map((fire, index) => {
      const latLng = fireLatLng(fire)
      if (!latLng) return null
      const ai = calculateAiRisk(fire)
      const id = fireId(fire, index)
      const at = acquiredAt(fire.acq_date, fire.acq_time)
      return { fire, ai, id, latLng, at, hex: ageHex(at, now) }
    })
    .filter((m) => m !== null)
    .filter((m) => riskFilter === 'ALL' || m.ai.risk === riskFilter)

  const selected = markers.find((m) => m.id === selectedId)
  const [fitNonce, setFitNonce] = useState(0)
  const [zoom, setZoom] = useState(5)
  const tilesReported = useRef(false)
  const reportTiles = () => {
    if (tilesReported.current) return
    tilesReported.current = true
    onTilesReady?.()
  }

  return (
    <div className="relative h-[460px] overflow-hidden rounded-[10px] border border-graphite sm:h-[620px]">
      <MapContainer
        bounds={INDIA_BOUNDS}
        maxBounds={PAN_BOUNDS}
        maxBoundsViscosity={1.0}
        minZoom={3}
        zoomSnap={0.25}
        zoomControl={false}
        maxZoom={19}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
          eventHandlers={{ load: reportTiles, tileerror: reportTiles }}
        />
        <TileLayer
          attribution="Labels &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />

        <ZoomControl position="bottomleft" />
        <IndiaOutline />
        <FitIndia nonce={fitNonce} />
        <ZoomWatcher onZoom={setZoom} />
        <ClickPicker onPick={onPickLocation} />

        {markers.map((m) => (
          <Fragment key={m.id}>
            {/* Pulse only where it means something: the selection and serious risk. */}
            {(m.id === selectedId || m.ai.risk === 'HIGH' || m.ai.risk === 'CRITICAL') && (
            <CircleMarker
              center={m.latLng}
              radius={markerRadius(zoom, m.id === selectedId)}
              pathOptions={{
                className: 'hotspot-pulse-ring',
                color: m.hex,
                fillColor: m.hex,
                fillOpacity: 0.35,
                weight: 2,
              }}
              interactive={false}
            />
            )}
            <CircleMarker
              center={m.latLng}
              radius={markerRadius(zoom, m.id === selectedId)}
              pathOptions={{
                className: 'hotspot-dot',
                color: '#ffffff',
                fillColor: m.hex,
                fillOpacity: m.id === selectedId ? 0.95 : 0.9,
                weight: m.id === selectedId ? 3 : zoom < 5.5 ? 1 : 2,
                opacity: m.id === selectedId ? 1 : 0.9,
              }}
              eventHandlers={{ click: () => onSelect(m.fire, m.ai, m.id) }}
            >
              <Popup autoPan={false}>
                <div className="text-[13px]">
                  <strong>{m.id}</strong>
                  <br />
                  Risk: {m.ai.risk} ({m.ai.score})
                  <br />
                  Brightness: {m.ai.brightness.toFixed(1)}
                  <br />
                  FRP: {m.ai.frp.toFixed(1)}
                  <br />
                  {sourceLabel(m.fire.source)}
                  <br />
                  Detected {formatIst(m.at)} ({formatAge(m.at, now)})
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        ))}

        {pickedLocation && (
          <CircleMarker
            center={pickedLocation}
            radius={9}
            pathOptions={{ color: '#cc9166', fillColor: '#cc9166', fillOpacity: 0.25, weight: 2, dashArray: '4 3' }}
          />
        )}

        {selected && focusSelected && <Recenter lat={selected.latLng[0]} lng={selected.latLng[1]} />}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[1200] flex max-w-[calc(100%-5rem)] flex-wrap gap-x-3 gap-y-1 rounded-[10px] border border-graphite bg-onyx/85 px-3 py-2 sm:max-w-[calc(100%-10.5rem)] sm:px-4 sm:py-2.5 text-[12px] text-fog backdrop-blur-sm">
        <span className="hidden sm:inline">
          Source <strong className="text-bone">NASA FIRMS</strong>
        </span>
        <span className="hidden sm:inline">
          Satellite <strong className="text-bone">VIIRS ×3 · MODIS</strong>
        </span>
        {latest && (
          <span>
            Latest{' '}
            <strong className="text-bone">
              <span className="sm:hidden">{formatIst(latestAt(latest), true)}</span>
              <span className="hidden sm:inline">
                {formatIst(latestAt(latest))} ({formatAge(latestAt(latest), now)})
              </span>
            </strong>
          </span>
        )}
        <span>
          Hotspots (24h) <strong className="text-bone">{markers.length}</strong>
        </span>
      </div>

      {!pickedLocation && (
        <button
          type="button"
          onClick={() => setFitNonce((n) => n + 1)}
          aria-label="Show all India"
          className="absolute right-4 top-4 z-[1200] flex items-center gap-2 rounded-full border border-graphite bg-onyx/85 p-2 sm:px-3 sm:py-1.5 text-[12px] text-mist backdrop-blur-sm transition-colors hover:border-slate hover:text-bone active:scale-[0.98]"
        >
          <Maximize2 size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden sm:inline">Show all India</span>
        </button>
      )}

      {pickedLocation && (
        <div className="absolute right-4 top-4 z-[1200] w-64 rounded-[10px] border border-copper/50 bg-onyx/90 p-4 text-[12px] backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold tracking-[-0.02em] text-copper">CUSTOM LOCATION</span>
            <button type="button" onClick={onClearPicked} className="text-steel hover:text-bone" aria-label="Clear picked location">
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
          <p className="mb-3 text-bone">
            {pickedLocation[0].toFixed(4)}°, {pickedLocation[1].toFixed(4)}°
          </p>
          <ShinyButton onClick={onAnalyzePicked} className="w-full px-4 py-2 text-[13px]">
            Analyze This Location
          </ShinyButton>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-7 right-3 z-[1200] rounded-[10px] border border-graphite bg-onyx/85 px-3 py-2 text-[11px] backdrop-blur-sm sm:bottom-4 sm:right-4 sm:px-4 sm:py-3 sm:text-[12px]">
        <div className="mb-1.5 font-semibold text-fog sm:mb-2">DETECTED</div>
        <div className="flex flex-col gap-1 sm:gap-1.5">
          {AGE_BUCKETS.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-mist">
              <span
                className="h-[9px] w-[9px] rounded-full border border-white/80"
                style={{ backgroundColor: b.hex }}
                aria-hidden="true"
              />
              {b.label}
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-16 z-[1200] hidden rounded-full sm:block border border-graphite bg-onyx/85 px-3 py-1.5 text-[11px] text-fog backdrop-blur-sm">
        Click anywhere on the map to pick a precise location
      </div>
    </div>
  )
}
