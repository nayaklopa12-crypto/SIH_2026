"use client"

// Live navigation data with provenance, polled (Part 1, Layer 4).
//
// NEW hook, deliberately separate from the existing `use-navigation-data.ts`:
//
//   * It keeps PROVENANCE. The endpoints carry `last_updated` / `data_source` /
//     `sources`; the existing bundle drops them, so a badge built on it could only
//     ever guess at freshness.
//   * It does NOT fall back to synthetic data. `lib/api.ts::fetchNavigationData`
//     silently substitutes `buildDemoNavigationData()` when the backend is
//     unreachable, which contradicts the project's real-data-only rule — a plausible
//     invented grid is worse than a missing one because nobody can tell. This hook
//     surfaces the failure and keeps the last real payload on screen instead.
//     (The existing hook and its fallback are left untouched, only flagged.)
//
// Poll interval: 90s by default. The floor is 60s on purpose — the backend memoises
// each source for 60s and the upstream products refresh on the order of hours, so
// polling faster would add load without ever returning newer numbers.

import { useCallback, useEffect, useRef, useState } from "react"

import { API_BASE, ROUTE_PROFILES } from "@/lib/api"
import { mergeProvenance, type Provenance, type WithProvenance } from "@/lib/provenance"
import type {
  ForecastResponse,
  IcebergDriftResponse,
  RiskMapResponse,
  RouteOption,
  RouteResponse,
  WeatherResponse,
} from "@/lib/types"

const MIN_INTERVAL_MS = 60_000
const DEFAULT_INTERVAL_MS = 90_000

export interface LiveNavigationData {
  forecast: WithProvenance<ForecastResponse>
  drift: WithProvenance<IcebergDriftResponse>
  risk: WithProvenance<RiskMapResponse>
  route: RouteOption
  routes: RouteOption[]
  weather: WithProvenance<WeatherResponse>
  /** Weakest-link headline + per-source breakdown across all of the above. */
  provenance: Provenance
  /** When this client last completed a successful fetch. */
  fetchedAt: string
}

export interface UseLiveNavigationData {
  data: LiveNavigationData | null
  loading: boolean
  /** Set when the most recent attempt failed. Previous good `data` is retained. */
  error: string | null
  /** True while a background poll is in flight over already-rendered data. */
  refreshing: boolean
  reload: () => void
}

async function getJSON<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal, cache: "no-store" })
  if (!res.ok) {
    // 503 is the backend saying a real source has never been cached. Surfacing that
    // verbatim is the whole point — it must not be smoothed into fake numbers.
    let detail = ""
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (body?.detail) detail = ` — ${typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)}`
    } catch {
      /* non-JSON error body; the status line is enough */
    }
    throw new Error(`${path} failed: ${res.status} ${res.statusText}${detail}`)
  }
  return (await res.json()) as T
}

export function useLiveNavigationData(intervalMs = DEFAULT_INTERVAL_MS): UseLiveNavigationData {
  const [data, setData] = useState<LiveNavigationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const hasData = useRef(false)

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const period = Math.max(MIN_INTERVAL_MS, intervalMs)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()

    const run = async () => {
      if (hasData.current) setRefreshing(true)
      try {
        const [forecast, drift, risk, weather, ...routeResponses] = await Promise.all([
          getJSON<WithProvenance<ForecastResponse>>("/forecast", controller.signal),
          getJSON<WithProvenance<IcebergDriftResponse>>("/iceberg-drift", controller.signal),
          getJSON<WithProvenance<RiskMapResponse>>("/risk-map", controller.signal),
          getJSON<WithProvenance<WeatherResponse>>("/weather", controller.signal),
          ...ROUTE_PROFILES.map((p) =>
            getJSON<WithProvenance<RouteResponse>>(
              `/route?start=maitri&end=bharati&fuel_efficiency_weight=${p.weight}`,
              controller.signal,
            ),
          ),
        ])
        if (cancelled) return

        const routes: RouteOption[] = ROUTE_PROFILES.map((p, i) => ({ ...routeResponses[i], ...p }))
        setData({
          forecast,
          drift,
          risk,
          routes,
          route: routes.find((r) => r.id === "balanced") ?? routes[0],
          weather,
          provenance: mergeProvenance([forecast, drift, risk, weather, ...routeResponses]),
          fetchedAt: new Date().toISOString(),
        })
        hasData.current = true
        setError(null)
      } catch (err) {
        const e = err as Error & { name?: string }
        if (cancelled || e?.name === "AbortError") return
        console.log("[live-nav] fetch failed:", e)
        // Keep whatever real data is already on screen; report the failure alongside
        // it rather than blanking the UI or inventing a replacement.
        setError(e?.message ?? "Failed to load live navigation data")
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
          // Chained timeout, not setInterval: a slow response can never stack a
          // second request on top of the first.
          timer = setTimeout(run, period)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [nonce, period])

  return { data, loading, error, refreshing, reload }
}
