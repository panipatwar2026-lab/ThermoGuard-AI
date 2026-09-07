import type { AiRisk, FireRecord, PredictRequest } from '../types'

export function fireId(fire: FireRecord, index: number): string {
  return fire.id ?? fire.hotspot_id ?? `TG-NASA-${index + 1}`
}

export function fireLatLng(fire: FireRecord): [number, number] | null {
  const lat = Number(fire.latitude ?? fire.lat)
  const lon = Number(fire.longitude ?? fire.lon ?? fire.lng)
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  return [lat, lon]
}

function normalizeConfidence(raw: string | undefined): PredictRequest['confidence'] {
  const c = (raw ?? 'n').toLowerCase()
  if (c === 'h' || c === 'high') return 'h'
  if (c === 'l' || c === 'low') return 'l'
  return 'n'
}

function formatObservationTime(acqTime: number): string {
  const padded = String(acqTime).padStart(4, '0')
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:00`
}

/** Maps a selected FIRMS hotspot onto a partial PredictRequest to prefill /analyze. */
export function buildPrefill(fire: FireRecord, ai: AiRisk): Partial<PredictRequest> {
  const latLng = fireLatLng(fire)
  const acqTime = Number(fire.acq_time ?? '1200') || 1200

  return {
    ...(latLng ? { latitude: latLng[0], longitude: latLng[1] } : {}),
    brightness: ai.brightness,
    frp: ai.frp,
    confidence: normalizeConfidence(fire.confidence ?? fire.confidence_level),
    daynight: fire.daynight === 'N' ? 'N' : 'D',
    acq_time: acqTime,
    observation_date: fire.acq_date ?? new Date().toISOString().slice(0, 10),
    observation_time: formatObservationTime(acqTime),
  }
}
