import type {
  FiresResponse,
  InfrastructureResponse,
  MetaResponse,
  PredictRequest,
  PredictResponse,
} from '../types'

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function predict(req: PredictRequest, signal?: AbortSignal): Promise<PredictResponse> {
  const res = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  return jsonOrThrow<PredictResponse>(res)
}

export async function fetchMeta(): Promise<MetaResponse> {
  const res = await fetch('/api/meta')
  return jsonOrThrow<MetaResponse>(res)
}

export async function fetchFires(signal?: AbortSignal): Promise<FiresResponse> {
  const res = await fetch('/api/fires', { signal })
  return jsonOrThrow<FiresResponse>(res)
}

export async function fetchInfrastructure(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<InfrastructureResponse> {
  const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) })
  const res = await fetch(`/api/infrastructure?${params}`, { signal })
  return jsonOrThrow<InfrastructureResponse>(res)
}

export async function downloadReport(req: PredictRequest): Promise<void> {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ThermoGuard_AI_Report.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
