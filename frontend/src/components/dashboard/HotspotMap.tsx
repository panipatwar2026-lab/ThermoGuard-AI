import { Fragment, useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { X } from 'lucide-react'
import type { AiRisk, FireRecord } from '../../types'
import { calculateAiRisk } from '../../lib/aiRisk'
import { fireId, fireLatLng } from '../../lib/fires'
import { riskHex } from '../../lib/risk'
import ShinyButton from '../fx/ShinyButton'

const INDIA_BOUNDS: LatLngBoundsExpression = [
  [6.0, 68.0],
  [37.5, 97.5],
]
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    const targetZoom = Math.max(map.getZoom(), 9)
    map.stop() // cancel any in-flight pan/zoom animation before retargeting
    map.setView([lat, lng], targetZoom, { animate: false })
  }, [lat, lng, map])
  return null
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
  selectedId,
  onSelect,
  pickedLocation,
  onPickLocation,
  onClearPicked,
  onAnalyzePicked,
}: {
  fires: FireRecord[]
  riskFilter: string
  selectedId: string | null
  onSelect: (fire: FireRecord, ai: AiRisk, id: string) => void
  pickedLocation: [number, number] | null
  onPickLocation: (lat: number, lng: number) => void
  onClearPicked: () => void
  onAnalyzePicked: () => void
}) {
  const markers = fires
    .map((fire, index) => {
      const latLng = fireLatLng(fire)
      if (!latLng) return null
      const ai = calculateAiRisk(fire)
      const id = fireId(fire, index)
      return { fire, ai, id, latLng }
    })
    .filter((m): m is { fire: FireRecord; ai: AiRisk; id: string; latLng: [number, number] } => m !== null)
    .filter((m) => riskFilter === 'ALL' || m.ai.risk === riskFilter)

  const selected = markers.find((m) => m.id === selectedId)

  return (
    <div className="relative overflow-hidden rounded-[10px] border border-graphite" style={{ height: 620 }}>
      <MapContainer
        bounds={INDIA_BOUNDS}
        maxBounds={INDIA_BOUNDS}
        maxBoundsViscosity={1.0}
        minZoom={5}
        maxZoom={19}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        <TileLayer
          attribution="Labels &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />

        <ClickPicker onPick={onPickLocation} />

        {markers.map((m) => (
          <Fragment key={m.id}>
            <CircleMarker
              center={m.latLng}
              radius={m.id === selectedId ? 11 : 8}
              pathOptions={{
                className: 'hotspot-pulse-ring',
                color: riskHex(m.ai.risk),
                fillColor: riskHex(m.ai.risk),
                fillOpacity: 0.35,
                weight: 2,
              }}
              interactive={false}
            />
            <CircleMarker
              center={m.latLng}
              radius={m.id === selectedId ? 11 : 8}
              pathOptions={{
                className: 'hotspot-dot',
                color: '#ffffff',
                fillColor: riskHex(m.ai.risk),
                fillOpacity: m.id === selectedId ? 0.95 : 0.9,
                weight: m.id === selectedId ? 3 : 2,
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

        {selected && <Recenter lat={selected.latLng[0]} lng={selected.latLng[1]} />}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[1200] flex flex-wrap gap-3 rounded-[10px] border border-graphite bg-onyx/85 px-4 py-2.5 text-[12px] text-fog backdrop-blur-sm">
        <span>
          Source <strong className="text-bone">NASA FIRMS</strong>
        </span>
        <span>
          Satellite <strong className="text-bone">MODIS · VIIRS</strong>
        </span>
        <span>
          Hotspots <strong className="text-bone">{markers.length}</strong>
        </span>
      </div>

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

      <div className="pointer-events-none absolute bottom-4 right-4 z-[1200] rounded-[10px] border border-graphite bg-onyx/85 px-4 py-3 text-[12px] backdrop-blur-sm">
        <div className="mb-2 font-semibold text-fog">RISK LEVEL</div>
        <div className="flex flex-col gap-1.5">
          {RISK_LEVELS.map((level) => (
            <div key={level} className="flex items-center gap-2 text-mist">
              <span
                className="h-[9px] w-[9px] rounded-full border border-white/80"
                style={{ backgroundColor: riskHex(level) }}
                aria-hidden="true"
              />
              {level}
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[1200] rounded-full border border-graphite bg-onyx/85 px-3 py-1.5 text-[11px] text-fog backdrop-blur-sm">
        Click anywhere on the map to pick a precise location
      </div>
    </div>
  )
}
