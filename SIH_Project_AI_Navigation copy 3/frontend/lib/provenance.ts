// Provenance helpers — the TS mirror of backend/schemas.py::Provenance and of the
// aggregation rule in backend/ingestion/live/_cache.py::provenance().
//
// The rules this file preserves, because getting them wrong would misreport how
// trustworthy a screen is:
//
//   * `data_source` is the WEAKEST LINK across the sources an endpoint used
//     (live > cached > synthetic), so a response is never advertised as fresher
//     than its stalest input.
//   * `last_updated` is the OLDEST contributing observation, for the same reason.
//   * `null` means "unknown", not "fine". It is rendered as unknown, never as live.
//   * Sources flagged static upstream (ETOPO1 bathymetry, released 2009) are already
//     excluded from `last_updated` by the backend — do not re-add them here or every
//     route would advertise itself as ~17 years stale.
//
// New module: nothing in lib/types.ts is modified. These fields are additive on the
// wire, so the existing interfaces stay valid.

export type DataSource = "live" | "cached" | "synthetic"

export interface SourceProvenance {
  endpoint?: string | null
  data_source?: DataSource | string | null
  last_updated?: string | null
  /**
   * True for a reference dataset with no update cadence (ETOPO1 bathymetry, 2009).
   * The backend already excludes these from the headline `last_updated`; the UI must
   * also refuse to print their age, or a correct static field reads as a dead feed.
   */
  static?: boolean | null
}

export interface Provenance {
  last_updated?: string | null
  data_source?: DataSource | string | null
  sources?: Record<string, SourceProvenance> | null
}

/** Any endpoint response may carry provenance; none is required to. */
export type WithProvenance<T> = T & Provenance

const RANK: Record<string, number> = { live: 0, cached: 1, synthetic: 2 }

/** Human label per source key, for the per-source breakdown. */
export const SOURCE_LABELS: Record<string, string> = {
  sea_ice: "Sea-ice concentration",
  ocean: "Ocean (SST / currents / salinity)",
  weather: "Weather",
  icebergs: "Iceberg positions",
  coastline: "Coastline & bathymetry",
}

export function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] ?? key.replace(/_/g, " ")
}

/**
 * Combine provenance from several responses using the backend's own weakest-link
 * rule, so a page that shows four endpoints at once reports one honest headline
 * rather than the best of the four.
 */
export function mergeProvenance(parts: Array<Provenance | null | undefined>): Provenance {
  const present = parts.filter((p): p is Provenance => !!p)
  if (!present.length) return { last_updated: null, data_source: null, sources: {} }

  const sources: Record<string, SourceProvenance> = {}
  for (const p of present) {
    for (const [k, v] of Object.entries(p.sources ?? {})) {
      const existing = sources[k]
      // Same source seen twice: keep the weaker/older sighting, matching the
      // backend's rule rather than optimistically overwriting it.
      if (!existing) {
        sources[k] = v
        continue
      }
      const worse = (RANK[String(v.data_source)] ?? 3) > (RANK[String(existing.data_source)] ?? 3)
      const older =
        v.last_updated && existing.last_updated && v.last_updated < existing.last_updated
      if (worse || older) sources[k] = v
    }
  }

  const declared = present.map((p) => p.data_source).filter(Boolean) as string[]
  // An unknown among knowns is itself a weak link — it cannot be assumed live.
  const anyUnknown = present.some((p) => !p.data_source)
  const weakest = anyUnknown
    ? null
    : declared.sort((a, b) => (RANK[a] ?? 3) - (RANK[b] ?? 3)).pop() ?? null

  const stamps = present
    .map((p) => p.last_updated)
    .filter((s): s is string => !!s)
    .sort()

  return { last_updated: stamps[0] ?? null, data_source: weakest, sources }
}

/** Compact relative age, e.g. "4m ago". Returns null when the stamp is unknown. */
export function relativeAge(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const secs = Math.max(0, Math.round((now - t) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Wire value → what the UI should actually claim. */
export function statusLabel(source: Provenance["data_source"]): string {
  switch (source) {
    case "live":
      return "Live data"
    case "cached":
      return "Cached real data"
    case "synthetic":
      return "Synthetic — not real data"
    default:
      return "Provenance unknown"
  }
}

/** Rows for the per-source breakdown, weakest first so problems surface at the top. */
export function sourceRows(p: Provenance | null | undefined, now = Date.now()) {
  const entries = Object.entries(p?.sources ?? {})
  return entries
    .map(([key, v]) => ({
      key,
      label: sourceLabel(key),
      endpoint: v.endpoint ?? null,
      status: (v.data_source ?? null) as DataSource | null,
      statusLabel: statusLabel(v.data_source),
      // A static reference has no meaningful age. Printing "6455d ago" next to a
      // 2009 bathymetry grid would read as a broken feed rather than a constant.
      isStatic: !!v.static,
      age: v.static ? null : relativeAge(v.last_updated, now),
      lastUpdated: v.last_updated ?? null,
    }))
    .sort((a, b) => (RANK[String(b.status)] ?? 3) - (RANK[String(a.status)] ?? 3))
}
