"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  Activity, Anchor, ArrowUpRight, CloudSnow, Compass, RefreshCw, Radio, ShieldCheck, Waves,
} from "lucide-react"

import { GlobeToMapTransform } from "@/components/globe-to-map-transform"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNavigationData } from "@/hooks/use-navigation-data"
import type { Grid, RouteResponse } from "@/lib/types"

// Leaflet must never render on the server (needs window/document) — Section 6b.
const OperationalPolarMap = dynamic(() => import("@/components/operational-polar-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs font-mono text-primary">
      Initializing polar projection…
    </div>
  ),
})

function formatEta(hours: number): string {
  const d = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  return d > 0 ? `${d}d ${String(h).padStart(2, "0")}h` : `${h}h`
}

function mean(grid: number[][]): number {
  let sum = 0, n = 0
  for (const row of grid) for (const v of row) { sum += v; n++ }
  return n ? sum / n : 0
}

// Sample the fused-risk grid along a route's waypoints. Row 0 = north edge
// (lat_max), matching backend cell indexing, so we can read peak/avg exposure
// for whichever corridor the operator selects.
function riskAlong(grid: Grid, route: RouteResponse): { peak: number; avg: number } {
  const { lat_min, lat_max, lon_min, lon_max, rows, cols, values } = grid
  const latStep = (lat_max - lat_min) / rows
  const lonStep = (lon_max - lon_min) / cols
  let peak = 0, sum = 0, n = 0
  for (const w of route.waypoints) {
    const r = Math.max(0, Math.min(rows - 1, Math.floor((lat_max - w.lat) / latStep)))
    const c = Math.max(0, Math.min(cols - 1, Math.floor((w.lon - lon_min) / lonStep)))
    const v = values[r]?.[c] ?? 0
    peak = Math.max(peak, v)
    sum += v
    n++
  }
  return { peak: peak * 100, avg: (n ? sum / n : 0) * 100 }
}

// Count-up animated number for metric tiles (Section 7 motion).
function AnimatedNumber({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<number>(0)
  useEffect(() => {
    const from = ref.current
    const start = Date.now()
    const dur = 900
    let raf = 0
    const tick = () => {
      const t = Math.min((Date.now() - start) / dur, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = from + (value - from) * eased
      setDisplay(cur)
      if (t < 1) raf = requestAnimationFrame(tick)
      else ref.current = value
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span>{display.toFixed(decimals)}{suffix}</span>
}

export default function Page() {
  const { data, loading, error, reload } = useNavigationData()

  const [selectedRouteId, setSelectedRouteId] = useState("balanced")
  const selectedRoute = useMemo(
    () => data?.routes.find((r) => r.id === selectedRouteId) ?? data?.route ?? null,
    [data, selectedRouteId],
  )
  // Feed the selected corridor to both maps so the globe and the operational
  // map always draw the same active route the operator picked here.
  const displayData = useMemo(
    () => (data && selectedRoute ? { ...data, route: selectedRoute } : data),
    [data, selectedRoute],
  )
  const routeRisk = useMemo(
    () => (data && selectedRoute ? riskAlong(data.risk.grid, selectedRoute) : null),
    [data, selectedRoute],
  )

  const iceMean = data ? mean(data.forecast.grid.values) * 100 : 0
  const bergCount = data ? data.drift.icebergs.length : 0
  const routeConf = selectedRoute ? selectedRoute.route_confidence * 100 : 0
  const distanceNm = selectedRoute ? selectedRoute.distance_nm : 0
  const etaHours = selectedRoute ? selectedRoute.estimated_time_hours : 0
  const horizon = data ? data.forecast.forecast_horizon_hours : 18
  const isDemo = data?.source === "demo"
  const stamp = data
    ? new Date(data.forecast.generated_at).toISOString().slice(11, 16) + " UTC"
    : "-- --"

  const metrics = [
    {
      label: "Sea-ice concentration",
      icon: CloudSnow,
      value: iceMean,
      suffix: "%",
      decimals: 0,
      note: `Mean · +${horizon}h forecast`,
    },
    {
      label: "Iceberg alerts",
      icon: Anchor,
      value: bergCount,
      suffix: "",
      decimals: 0,
      note: "Tracked in sector",
    },
    {
      label: "Route confidence",
      icon: ShieldCheck,
      value: routeConf,
      suffix: "%",
      decimals: 0,
      note: routeConf >= 80 ? "High confidence" : routeConf >= 60 ? "Moderate" : "Low — reroute",
    },
  ]

  return (
    <main className="min-h-screen w-full px-4 py-4 md:px-6 md:py-6">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl glass px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 glow-cyan">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Antarctic Navigation Intelligence
            </h1>
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              SIH26059 · NCPOR · Caffeine Geeks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1.5 mr-2">
            <a href="/" className="px-2.5 py-1 rounded text-xs font-mono text-muted-foreground hover:text-primary transition hover:bg-primary/10">Home</a>
            <a href="/radar" className="px-2.5 py-1 rounded text-xs font-mono text-muted-foreground hover:text-primary transition hover:bg-primary/10">3D Radar</a>
            <a href="/navigator" className="px-2.5 py-1 rounded text-xs font-mono text-muted-foreground hover:text-primary transition hover:bg-primary/10">Navigator AI</a>
          </nav>
          <div className="hidden items-center gap-2 text-[11px] font-mono text-muted-foreground sm:flex">
            <Radio className={`h-3.5 w-3.5 ${loading ? "text-[#ffb347]" : isDemo ? "text-[#ffb347]" : "text-primary"}`} />
            {loading ? "Syncing feed…" : isDemo ? "Demo data · offline" : `Live · ${stamp}`}
          </div>
          <button
            onClick={reload}
            className="flex items-center gap-1.5 rounded-md border border-primary/25 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {isDemo && (
        <div className="mb-4 rounded-lg border border-[#ffb347]/40 bg-[#ffb347]/10 px-4 py-2.5 text-xs text-[#ffb347]">
          Live backend unreachable — showing bundled demo data so the dashboard stays fully interactive. Start the API on :8000 and hit Refresh for live feeds.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_300px]">
        {/* Left column: mission brief + metrics */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl glass p-4">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Activity className="h-3.5 w-3.5" /> Mission Brief
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Risk-aware transit <span className="text-foreground">Aurora Base → Horizon Station</span> across the Weddell Sea. Pipeline: sea-ice forecast → iceberg drift → risk fusion → A* optimization.
            </p>
          </section>

          {metrics.map((m) => {
            const Icon = m.icon
            return (
              <section key={m.label} className="rounded-xl glass p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{m.label}</span>
                  <Icon className="h-4 w-4 text-primary/70" />
                </div>
                <div className="text-3xl font-semibold font-mono tabular-nums text-foreground">
                  {data ? <AnimatedNumber value={m.value} decimals={m.decimals} suffix={m.suffix} /> : <span className="text-muted-foreground">—</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{m.note}</p>
              </section>
            )
          })}

          <section className="rounded-xl glass p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Weather · sector</span>
              <CloudSnow className="h-4 w-4 text-primary/70" />
            </div>
            {data ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold font-mono tabular-nums text-foreground">
                    <AnimatedNumber value={data.weather.temperature_c} decimals={1} suffix="°C" />
                  </span>
                  <span className="text-xs font-mono uppercase tracking-wider text-[#ffb347]">{data.weather.condition}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] font-mono text-muted-foreground">
                  <div className="flex justify-between"><span>Wind</span><span className="text-foreground">{data.weather.wind_speed_ms.toFixed(1)} m/s</span></div>
                  <div className="flex justify-between"><span>Dir</span><span className="text-foreground">{data.weather.wind_direction_deg.toFixed(0)}°</span></div>
                  <div className="flex justify-between"><span>Vis</span><span className="text-foreground">{data.weather.visibility_km.toFixed(1)} km</span></div>
                  <div className="flex justify-between"><span>MSLP</span><span className="text-foreground">{data.weather.pressure_hpa.toFixed(0)} hPa</span></div>
                </div>
              </>
            ) : (
              <div className="text-3xl font-semibold font-mono text-muted-foreground">—</div>
            )}
          </section>
        </aside>

        {/* Center: dual-map viewport */}
        <section className="rounded-xl glass p-3">
          <Tabs defaultValue="overview" className="flex h-full flex-col">
            <div className="mb-2 flex items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="overview">Overview Globe</TabsTrigger>
                <TabsTrigger value="operational">Operational Map</TabsTrigger>
              </TabsList>
              <span className="hidden text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground sm:block">
                Weddell Sea · EPSG:3031
              </span>
            </div>
            <TabsContent value="overview" className="mt-0">
              <div className="h-[560px] w-full overflow-hidden rounded-lg">
                <GlobeToMapTransform data={displayData} />
              </div>
            </TabsContent>
            <TabsContent value="operational" className="mt-0">
              <div className="h-[560px] w-full overflow-hidden rounded-lg">
                <OperationalPolarMap data={displayData} />
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* Right column: route + legend + model status */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl glass p-4">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Waves className="h-3.5 w-3.5" /> Recommended Route
            </h2>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-mono text-foreground">Aurora Base</span>
              <ArrowUpRight className="h-4 w-4 text-primary" />
              <span className="font-mono text-foreground">Horizon Station</span>
            </div>

            {/* Route option selector — Safest / Balanced / Fastest, each with
                its own accent color that matches the corridor on the maps. */}
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {(data?.routes ?? []).map((r) => {
                const active = r.id === selectedRouteId
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRouteId(r.id)}
                    title={r.description}
                    style={
                      active
                        ? { borderColor: r.color, color: r.color, backgroundColor: `${r.color}22` }
                        : undefined
                    }
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider transition ${
                      active
                        ? ""
                        : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: r.color, opacity: active ? 1 : 0.5 }}
                    />
                    {r.label}
                  </button>
                )
              })}
            </div>
            {selectedRoute && "description" in selectedRoute && (
              <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                {(selectedRoute as { description?: string }).description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Distance</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
                  {selectedRoute ? <AnimatedNumber value={distanceNm} decimals={0} suffix=" nm" /> : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">ETA @ 10kn</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
                  {selectedRoute ? formatEta(etaHours) : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Confidence</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
                  {selectedRoute ? <AnimatedNumber value={routeConf} decimals={0} suffix="%" /> : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Waypoints</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
                  {selectedRoute ? selectedRoute.waypoints.length : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Peak risk</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
                  {routeRisk ? <AnimatedNumber value={routeRisk.peak} decimals={0} suffix="%" /> : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Avg risk</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
                  {routeRisk ? <AnimatedNumber value={routeRisk.avg} decimals={0} suffix="%" /> : "—"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl glass p-4">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Risk Legend
            </h2>
            <div
              className="mb-1.5 h-2.5 w-full rounded-full"
              style={{ background: "linear-gradient(90deg,#3fd0e0,#ffb347,#ff5c5c)" }}
            />
            <div className="mb-3 flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Safe</span>
              <span>Caution</span>
              <span>Hazard</span>
            </div>
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {(data?.routes ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span
                    className="inline-block h-1 w-5 rounded-full"
                    style={{ background: r.color, opacity: r.id === selectedRouteId ? 1 : 0.45 }}
                  />
                  {r.label} route{r.id === selectedRouteId ? " · active" : ""}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
                Iceberg + drift cone
              </div>
            </div>
          </section>

          <section className="rounded-xl glass p-4">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Activity className="h-3.5 w-3.5" /> Model Status
            </h2>
            <ul className="flex flex-col gap-2 text-xs">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Sea-ice ConvLSTM</span>
                <span className="font-mono text-primary">{data ? `${routeConf.toFixed(0)}% conf` : "—"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Iceberg drift (physics)</span>
                <span className="font-mono text-primary">{data ? `${bergCount} tracks` : "—"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Risk fusion</span>
                <span className="font-mono text-primary">{data ? "OK" : "—"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">A* optimizer</span>
                <span className="font-mono text-primary">
                  {selectedRoute ? `${selectedRoute.waypoints.length} waypoints` : "—"}
                </span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  )
}
