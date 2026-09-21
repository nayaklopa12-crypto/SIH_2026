// TypeScript mirror of the backend Pydantic models (backend/schemas.py).
// Keep these in one-to-one sync with the API contract (Section 9) so a
// backend/frontend shape mismatch is caught at compile time, not in the demo.

export interface Grid {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
  rows: number
  cols: number
  values: number[][]
}

export interface ForecastResponse {
  grid: Grid
  confidence: number
  forecast_horizon_hours: number
  generated_at: string
}

export interface Position {
  lat: number
  lon: number
}

export interface TrackPoint {
  lat: number
  lon: number
  hours_ahead: number
}

export interface Iceberg {
  id: string
  current_position: Position
  predicted_track: TrackPoint[]
  confidence_radius_km: number
}

export interface IcebergDriftResponse {
  icebergs: Iceberg[]
}

export interface RiskMapResponse {
  grid: Grid
  generated_at: string
}

export interface Waypoint {
  lat: number
  lon: number
}

export interface RouteResponse {
  waypoints: Waypoint[]
  distance_nm: number
  estimated_time_hours: number
  route_confidence: number
}

// A selectable route profile: a RouteResponse plus the option metadata the UI
// needs to present it as a choice (Safest / Balanced / Fastest).
export interface RouteOption extends RouteResponse {
  id: string
  label: string
  weight: number
  description: string
  color: string
}

export interface WeatherResponse {
  temperature_c: number
  wind_speed_ms: number
  wind_direction_deg: number
  visibility_km: number
  pressure_hpa: number
  condition: string
  generated_at: string
}

// Convenience bundle shared by both maps (fetched once at page level).
export interface NavigationData {
  forecast: ForecastResponse
  drift: IcebergDriftResponse
  risk: RiskMapResponse
  route: RouteResponse
  routes: RouteOption[]
  weather: WeatherResponse
  source: "live" | "demo"
}
