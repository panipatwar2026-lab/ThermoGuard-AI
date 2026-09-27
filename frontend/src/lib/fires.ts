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

/** VIIRS confidence is h/n/l; MODIS confidence is a 0-100 percentage. */
export function normalizeConfidence(raw: string | undefined): PredictRequest['confidence'] {
  const c = (raw ?? 'n').toLowerCase()
  const pct = Number(c)
  if (c !== '' && !Number.isNaN(pct)) return pct >= 80 ? 'h' : pct < 30 ? 'l' : 'n'
  if (c === 'h' || c === 'high') return 'h'
  if (c === 'l' || c === 'low') return 'l'
  return 'n'
}

/** "2026-09-27 0550" -> "2026-09-27 05:50 UTC" */
export function formatAcq(date: string | undefined, time: string | undefined): string | null {
  if (!date) return null
  const t = String(time ?? '').padStart(4, '0')
  return `${date} ${t.slice(0, 2)}:${t.slice(2, 4)} UTC`
}

const SOURCE_LABELS: Record<string, string> = {
  VIIRS_SNPP_NRT: 'VIIRS S-NPP',
  VIIRS_NOAA20_NRT: 'VIIRS NOAA-20',
  VIIRS_NOAA21_NRT: 'VIIRS NOAA-21',
  MODIS_NRT: 'MODIS',
}

export function sourceLabel(source: string | undefined): string {
  return (source && SOURCE_LABELS[source]) ?? source ?? 'NASA FIRMS'
}

export function formatObservationTime(acqTime: number): string {
  const padded = String(acqTime).padStart(4, '0')
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:00`
}

/** Maps a selected FIRMS hotspot onto a partial PredictRequest to prefill /analyze. */
export function buildPrefill(fire: FireRecord, ai: AiRisk): Partial<PredictRequest> {
  const latLng = fireLatLng(fire)
  const acqTime = Number(fire.acq_time ?? '1200') || 1200
  const num = (v: string | undefined) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v))
  // VIIRS rows carry bright_ti4/bright_ti5 (I4/I5 bands); MODIS rows carry
  // brightness/bright_t31. Map the matching pair onto the model's inputs.
  const brightT31 = num(fire.bright_t31 ?? fire.bright_ti5)
  const scan = num(fire.scan)
  const track = num(fire.track)

  return {
    ...(latLng ? { latitude: latLng[0], longitude: latLng[1] } : {}),
    brightness: ai.brightness,
    ...(brightT31 !== undefined ? { bright_t31: brightT31 } : {}),
    ...(scan !== undefined ? { scan } : {}),
    ...(track !== undefined ? { track } : {}),
    fire_type: 0,
    frp: ai.frp,
    confidence: normalizeConfidence(fire.confidence ?? fire.confidence_level),
    daynight: fire.daynight === 'N' ? 'N' : 'D',
    acq_time: acqTime,
    observation_date: fire.acq_date ?? new Date().toISOString().slice(0, 10),
    observation_time: formatObservationTime(acqTime),
  }
}
