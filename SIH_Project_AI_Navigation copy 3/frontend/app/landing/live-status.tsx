"use client"

// Live figures + provenance for the landing page.
//
// Every number here comes from the running backend. Nothing is filled in when a
// fetch fails: a stat with no reading renders as an em dash with the reason beside
// it, which is the whole point of the badge sitting above it. See
// hooks/use-live-navigation-data.ts.

import { LiveDataBadge } from "@/components/live-data-badge"
import { useLiveNavigationData } from "@/hooks/use-live-navigation-data"

/** Mean of the finite cells of a grid. NaN cells are skipped, not treated as zero. */
function gridMean(values: number[][] | undefined): number | null {
  if (!values?.length) return null
  let sum = 0
  let n = 0
  for (const row of values) {
    for (const v of row) {
      if (Number.isFinite(v)) {
        sum += v
        n += 1
      }
    }
  }
  return n ? sum / n : null
}

function Stat({
  label,
  value,
  unit,
  note,
}: {
  label: string
  value: string | null
  unit?: string
  note?: string
}) {
  return (
    <div className="ed-hairline-t pt-3">
      <p className="ed-mono-label m-0">{label}</p>
      <p className="ed-display m-0 mt-2 text-[clamp(1.5rem,3vw,2.5rem)] leading-none tabular-nums">
        {value ?? "—"}
        {value && unit ? (
          <span className="ed-mono-label ml-1.5 align-baseline">{unit}</span>
        ) : null}
      </p>
      {note ? (
        <p className="ed-mono-label m-0 mt-2" style={{ opacity: 0.8 }}>
          {note}
        </p>
      ) : null}
    </div>
  )
}

export function LiveStatus() {
  const { data, loading, error, refreshing } = useLiveNavigationData()

  const ice = gridMean(data?.forecast.grid.values)
  const risk = gridMean(data?.risk.grid.values)
  const bergs = data?.drift.icebergs.length ?? null
  const route = data?.route

  const pending = loading ? "waiting on backend" : undefined
  const unreachable = !data && error ? "backend unreachable" : undefined
  const gap = unreachable ?? pending

  return (
    <div>
      <LiveDataBadge provenance={data?.provenance} refreshing={refreshing} error={error} />

      <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Mean ice concentration"
          value={ice === null ? null : (ice * 100).toFixed(0)}
          unit="%"
          note={ice === null ? gap : `+${data?.forecast.forecast_horizon_hours}h forecast, Weddell grid`}
        />
        <Stat
          label="Icebergs tracked"
          value={bergs === null ? null : String(bergs)}
          note={bergs === null ? gap : "BYU/NIC tracker, live positions"}
        />
        <Stat
          label="Mean route risk"
          value={risk === null ? null : risk.toFixed(2)}
          note={risk === null ? gap : "0 = clear, 1 = highest"}
        />
        <Stat
          label="Maitri → Bharati"
          value={route ? route.distance_nm.toFixed(0) : null}
          unit="nm"
          note={
            route
              ? `${route.estimated_time_hours.toFixed(0)} h · confidence ${(route.route_confidence * 100).toFixed(0)}%`
              : gap
          }
        />
      </div>

      {/* Currents are a known real gap, not an oversight — say so on the page. */}
      <p className="ed-body mt-8 max-w-[62ch] text-[13px]" style={{ opacity: 0.72 }}>
        Where a feed cannot see something, this page shows nothing rather than a guess.
        No open source observes ocean currents under Antarctic pack ice, and L-band
        salinity cannot penetrate winter sea ice — both are reported as unavailable by
        the backend rather than filled in.
      </p>
    </div>
  )
}

export default LiveStatus
