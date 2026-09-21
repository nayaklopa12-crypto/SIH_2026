// API client for the FastAPI backend. Base URL comes from the environment
// (NEXT_PUBLIC_API_URL) so it is never hardcoded — Docker passes the service
// URL in, local dev falls back to localhost:8000 (Section 10).

import type {
  ForecastResponse,
  Grid,
  IcebergDriftResponse,
  NavigationData,
  RiskMapResponse,
  RouteOption,
  RouteResponse,
  WeatherResponse,
} from "./types"

// NOTE: default is 127.0.0.1 (not "localhost"). On Windows, browsers resolve
// "localhost" to IPv6 ::1 first, but uvicorn binds IPv4 127.0.0.1 by default —
// so a "localhost" fetch hits a dead ::1:8000 and every request fails. Using
// the explicit IPv4 address avoids the mismatch. Override via NEXT_PUBLIC_API_URL.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000"

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal, cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export function fetchForecast(signal?: AbortSignal) {
  return getJSON<ForecastResponse>("/forecast", signal)
}

export function fetchDrift(signal?: AbortSignal) {
  return getJSON<IcebergDriftResponse>("/iceberg-drift", signal)
}

export function fetchRiskMap(signal?: AbortSignal) {
  return getJSON<RiskMapResponse>("/risk-map", signal)
}

export function fetchWeather(signal?: AbortSignal) {
  return getJSON<WeatherResponse>("/weather", signal)
}

export function fetchRoute(
  start = "maitri",
  end = "bharati",
  weight = 0.5,
  signal?: AbortSignal,
) {
  return getJSON<RouteResponse>(
    `/route?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` +
      `&fuel_efficiency_weight=${weight}`,
    signal,
  )
}

// Selectable route profiles. The backend's A* blends safety vs distance by
// fuel_efficiency_weight (0 = safest detour, 1 = shortest/fastest), so one
// endpoint gives us three genuinely different corridors to offer as options.
// Each profile carries its own accent color so the corridors stay visually
// distinct on both maps (kept clear of the cyan→amber→red risk ramp).
export const ROUTE_PROFILES: {
  id: string
  label: string
  weight: number
  description: string
  color: string
}[] = [
  { id: "safest", label: "Safest", weight: 0.0, description: "Maximum clearance from ice & bergs", color: "#4ade80" },
  { id: "balanced", label: "Balanced", weight: 0.5, description: "Trades a little safety for a shorter transit", color: "#a78bfa" },
  { id: "fastest", label: "Fastest", weight: 1.0, description: "Shortest path — accepts higher risk", color: "#f472b6" },
]

// Fetch everything the dashboard needs in one shot. Both maps consume the same
// bundle (Section 6c) so they can never disagree. If the live backend is
// unreachable, fall back to deterministic demo data so the dashboard is never
// blank (Section 11 fallback requirement) — flagged via `source`.
export async function fetchNavigationData(
  signal?: AbortSignal,
): Promise<NavigationData> {
  try {
    const [forecast, drift, risk, weather, ...routeResponses] = await Promise.all([
      fetchForecast(signal),
      fetchDrift(signal),
      fetchRiskMap(signal),
      fetchWeather(signal),
      ...ROUTE_PROFILES.map((p) => fetchRoute("maitri", "bharati", p.weight, signal)),
    ])
    const routes: RouteOption[] = ROUTE_PROFILES.map((p, i) => ({ ...routeResponses[i], ...p }))
    const route = routes.find((r) => r.id === "balanced") ?? routes[0]
    return { forecast, drift, risk, route, routes, weather, source: "live" }
  } catch (err) {
    // Never propagate an abort (component unmount / reload) as demo data.
    if (signal?.aborted) throw err
    if (process.env.NODE_ENV !== "production") {
      console.warn("[api] live backend unreachable, using demo data:", err)
    }
    return buildDemoNavigationData()
  }
}

// --- Deterministic demo fallback ---------------------------------------------
// Mirrors backend/config.py + the seeded synthetic generators closely enough
// for a convincing offline demo. Pure functions of grid position => identical
// output every render, so both maps agree exactly like the live pipeline.

const GRID = {
  lat_min: -78,
  lat_max: -60,
  lon_min: -60,
  lon_max: -20,
  rows: 50,
  cols: 50,
}
const STATIONS = {
  maitri: { lat: -69, lon: -22 },
  bharati: { lat: -76, lon: -55 },
}
const NOW = () => new Date().toISOString()

function makeGrid(fn: (lat: number, lon: number) => number): Grid {
  const { lat_min, lat_max, lon_min, lon_max, rows, cols } = GRID
  const values: number[][] = []
  for (let r = 0; r < rows; r++) {
    const lat = lat_min + ((lat_max - lat_min) * r) / (rows - 1)
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      const lon = lon_min + ((lon_max - lon_min) * c) / (cols - 1)
      row.push(Math.round(clamp01(fn(lat, lon)) * 1e4) / 1e4)
    }
    values.push(row)
  }
  return { lat_min, lat_max, lon_min, lon_max, rows, cols, values }
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

// Sea-ice: heavier concentration toward the pole (south), smooth gradient.
function iceConcentration(lat: number, lon: number): number {
  const southness = (GRID.lat_max - lat) / (GRID.lat_max - GRID.lat_min)
  const swirl = 0.12 * Math.sin(lon / 6) * Math.cos(lat / 5)
  return 0.15 + 0.7 * southness + swirl
}

function buildDemoForecast(): ForecastResponse {
  return {
    grid: makeGrid(iceConcentration),
    confidence: 0.88,
    forecast_horizon_hours: 18,
    generated_at: NOW(),
  }
}

function buildDemoDrift(): IcebergDriftResponse {
  // A handful of bergs seeded across the sector, each with a short drift track.
  const seeds = [
    { id: "A-68", lat: -67.5, lon: -30, r: 14 },
    { id: "B-15", lat: -71.2, lon: -40, r: 9 },
    { id: "C-22", lat: -74.0, lon: -48, r: 18 },
    { id: "D-07", lat: -69.8, lon: -25, r: 6 },
    { id: "D-31", lat: -72.5, lon: -34, r: 11 },
    { id: "E-12", lat: -75.1, lon: -52, r: 22 },
    { id: "F-03", lat: -66.6, lon: -45, r: 8 },
  ]
  return {
    icebergs: seeds.map((s) => {
      const track = [0, 6, 12].map((h) => ({
        lat: s.lat - 0.05 * h,
        lon: s.lon + 0.08 * h,
        hours_ahead: h,
      }))
      return {
        id: s.id,
        current_position: { lat: s.lat, lon: s.lon },
        predicted_track: track,
        confidence_radius_km: s.r,
      }
    }),
  }
}

function buildDemoRisk(forecast: ForecastResponse): RiskMapResponse {
  // Risk fuses ice cover with proximity to seeded bergs — same spirit as the
  // backend risk_fusion so the demo map reads plausibly.
  const bergs = buildDemoDrift().icebergs.map((b) => b.current_position)
  const grid = makeGrid((lat, lon) => {
    const ice = iceConcentration(lat, lon)
    let hazard = 0
    for (const b of bergs) {
      const d = Math.hypot(lat - b.lat, lon - b.lon)
      hazard = Math.max(hazard, Math.exp(-(d * d) / 4))
    }
    return 0.6 * ice + 0.55 * hazard
  })
  return { grid, generated_at: NOW() }
}

function buildDemoRoute(bowDeg: number, confidence: number): RouteResponse {
  // Aurora Base -> Horizon Station. `bowDeg` is how far north the path bows to
  // skirt pack ice: a bigger bow = safer but longer. Straight = shortest/riskier.
  const { maitri, bharati } = STATIONS
  const n = 40
  const waypoints = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const lat = maitri.lat + (bharati.lat - maitri.lat) * t + bowDeg * Math.sin(Math.PI * t)
    const lon = maitri.lon + (bharati.lon - maitri.lon) * t
    return { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 }
  })
  // Approximate distance in nm from the waypoint chain.
  let distance_nm = 0
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]
    const b = waypoints[i]
    const dLat = (b.lat - a.lat) * 60
    const dLon = (b.lon - a.lon) * 60 * Math.cos((a.lat * Math.PI) / 180)
    distance_nm += Math.hypot(dLat, dLon)
  }
  distance_nm = Math.round(distance_nm * 10) / 10
  return {
    waypoints,
    distance_nm,
    estimated_time_hours: Math.round((distance_nm / 10) * 10) / 10, // @10 kn
    route_confidence: confidence,
  }
}

// Demo variants per profile: safest bows far north (long, high confidence),
// fastest goes nearly straight (short, lower confidence).
const DEMO_ROUTE_SHAPES: Record<string, { bow: number; conf: number }> = {
  safest: { bow: 6.5, conf: 0.9 },
  balanced: { bow: 2.6, conf: 0.72 },
  fastest: { bow: 0.4, conf: 0.55 },
}

function buildDemoWeather(forecast: ForecastResponse): WeatherResponse {
  const flat = forecast.grid.values.flat()
  const iceMean = flat.reduce((s, v) => s + v, 0) / flat.length
  const pressure = 992.4
  return {
    temperature_c: Math.round((-4 - 22 * iceMean + (pressure - 1000) * 0.05) * 10) / 10,
    wind_speed_ms: 3.3,
    wind_direction_deg: 61,
    visibility_km: 11,
    pressure_hpa: pressure,
    condition: "Overcast",
    generated_at: NOW(),
  }
}

export function buildDemoNavigationData(): NavigationData {
  const forecast = buildDemoForecast()
  const routes: RouteOption[] = ROUTE_PROFILES.map((p) => {
    const shape = DEMO_ROUTE_SHAPES[p.id] ?? { bow: 2.6, conf: 0.7 }
    return { ...buildDemoRoute(shape.bow, shape.conf), ...p }
  })
  const route = routes.find((r) => r.id === "balanced") ?? routes[0]
  return {
    forecast,
    drift: buildDemoDrift(),
    risk: buildDemoRisk(forecast),
    route,
    routes,
    weather: buildDemoWeather(forecast),
    source: "demo",
  }
}
