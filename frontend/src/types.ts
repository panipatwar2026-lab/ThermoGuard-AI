export interface PredictRequest {
  latitude: number
  longitude: number
  brightness: number
  scan: number
  track: number
  acq_time: number
  confidence: 'h' | 'l' | 'n'
  version: '2.0NRT'
  daynight: 'D' | 'N'
  fire_type: -1 | 0 | 2 | 3
  bright_t31: number
  frp: number
  observation_date: string
  observation_time: string
}

export interface RiskProbability {
  risk_level: string
  probability: number
}

export interface PredictResponse {
  predicted_risk: string
  confidence_score: number
  prediction_proba: RiskProbability[]

  fire_source: string
  fire_source_confidence: number

  fire_detected: boolean
  brightness_difference: number

  intensity: string
  intensity_message: string

  thermal_status: string
  thermal_message: string

  season: string

  latitude: number
  longitude: number
  brightness: number
  frp: number
  daynight: 'D' | 'N'
}

export interface FeatureImportance {
  feature: string
  importance: number
}

export interface MetaResponse {
  feature_columns: string[]
  risk_classes: string[]
  feature_importances: FeatureImportance[]
  fire_source_available: boolean
  performance: {
    model: string
    features: number
    test_samples: number
    accuracy: number
    verified: boolean
    caveat: string
  }
  fire_source_performance: {
    model: string
    classes: string[]
    dataset_rows: number
    accuracy: number
    verified: boolean
    caveat: string
  } | null
}

export type RiskLevel = 'Low' | 'Medium' | 'High' | string

/** Raw NASA FIRMS hotspot row — CSV columns passed through as strings. */
export interface FireRecord {
  latitude?: string
  longitude?: string
  lat?: string
  lon?: string
  lng?: string
  bright_ti4?: string
  brightness?: string
  bright_ti11?: string
  frp?: string
  FRP?: string
  confidence?: string
  confidence_level?: string
  acq_date?: string
  acq_time?: string
  daynight?: string
  satellite?: string
  id?: string
  hotspot_id?: string
  [key: string]: string | undefined
}

export interface FiresResponse {
  success: boolean
  count: number
  source: string
  satellite: string
  fires: FireRecord[]
}

export interface InfrastructureCategory {
  count: number
  nearest: string | null
}

export interface InfrastructureResponse {
  success: boolean
  source: string
  searchRadius: string
  location: { latitude: number; longitude: number }
  industrial: InfrastructureCategory
  roads: InfrastructureCategory
  settlements: InfrastructureCategory
}

export type AiRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface AiRisk {
  score: number
  risk: AiRiskLevel
  brightness: number
  frp: number
  confidence: string
  brightnessScore: number
  frpScore: number
  confidenceScore: number
}
