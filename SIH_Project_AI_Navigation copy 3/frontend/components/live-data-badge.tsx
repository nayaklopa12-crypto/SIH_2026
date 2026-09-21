"use client"

// "Live data · last updated Xm ago" indicator (Part 1, Layer 4).
//
// Shows the weakest-link headline AND the per-source breakdown behind it. The
// headline alone is not enough on this project: weather can be genuinely live while
// sea-ice is a day-old cache, and a single "Live" pill would hide that from a judge
// asking which layer is actually current. Expanding the badge names every feed, its
// endpoint, and its own age.
//
// Theming: reads --hairline/--mono-label with the dashboard's --border/--muted-foreground
// as fallbacks, so the same component is correct inside the warm editorial landing
// route and inside the cyan polar console without a variant prop.
//
// Status colour is functional here, not decorative — it encodes how much a reading
// can be trusted, which is exactly what the palette reserves amber/red for.

import { useState } from "react"

import { relativeAge, sourceRows, statusLabel, type Provenance } from "@/lib/provenance"
import { cn } from "@/lib/utils"

const DOT: Record<string, string> = {
  live: "#6FBF8B",
  cached: "var(--signal, #E8944A)",
  synthetic: "#D4553F",
  unknown: "#D4553F",
}

export interface LiveDataBadgeProps {
  provenance: Provenance | null | undefined
  /** True while a background poll is in flight — shown as a subtle pulse. */
  refreshing?: boolean
  /** Most recent fetch error, if the last poll failed. */
  error?: string | null
  className?: string
}

export function LiveDataBadge({ provenance, refreshing, error, className }: LiveDataBadgeProps) {
  const [open, setOpen] = useState(false)

  const status = (provenance?.data_source ?? "unknown") as string
  const rows = sourceRows(provenance)
  const age = relativeAge(provenance?.last_updated)
  const dot = DOT[status] ?? DOT.unknown

  return (
    <div className={cn("inline-block text-left", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 border px-2.5 py-1.5 transition-colors duration-200 ease-out",
          "border-[var(--hairline,var(--border))] hover:border-[var(--hairline-strong,var(--ring))]",
        )}
        style={{ borderRadius: 2 }}
      >
        <span
          aria-hidden="true"
          className={cn("block h-[7px] w-[7px] shrink-0 rounded-full", refreshing && "animate-pulse")}
          style={{ backgroundColor: dot }}
        />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.2em] tabular-nums"
          style={{ color: "var(--mono-label, var(--muted-foreground))" }}
        >
          {statusLabel(provenance?.data_source)}
          {/* No stamp means unknown age. Saying so beats implying "just now". */}
          {age ? ` · ${age}` : " · age unknown"}
        </span>
        <span
          aria-hidden="true"
          className="font-mono text-[9px]"
          style={{ color: "var(--mono-label, var(--muted-foreground))" }}
        >
          {open ? "▲" : "▼"}
        </span>
      </button>

      {error && (
        <p
          className="mt-1 max-w-[42ch] font-mono text-[10px] leading-relaxed"
          style={{ color: "#D4553F" }}
        >
          Last refresh failed — showing the previous real reading. {error}
        </p>
      )}

      {open && (
        <div
          className="mt-1 border p-3 border-[var(--hairline,var(--border))]"
          style={{ borderRadius: 2, background: "var(--bg, var(--card))" }}
        >
          {rows.length === 0 ? (
            <p
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: "var(--mono-label, var(--muted-foreground))" }}
            >
              No per-source provenance reported
            </p>
          ) : (
            <ul className="m-0 grid gap-2 p-0">
              {rows.map((r) => (
                <li key={r.key} className="flex items-start gap-2 list-none">
                  <span
                    aria-hidden="true"
                    className="mt-[5px] block h-[6px] w-[6px] shrink-0 rounded-full"
                    style={{ backgroundColor: DOT[String(r.status)] ?? DOT.unknown }}
                  />
                  <span className="min-w-0">
                    <span
                      className="block text-[11px] leading-tight"
                      style={{ color: "var(--ink, var(--foreground))" }}
                    >
                      {r.label}
                    </span>
                    <span
                      className="block font-mono text-[9px] uppercase tracking-[0.18em] tabular-nums"
                      style={{ color: "var(--mono-label, var(--muted-foreground))" }}
                    >
                      {r.statusLabel}
                      {r.isStatic
                        ? " · static reference"
                        : r.age
                          ? ` · ${r.age}`
                          : " · age unknown"}
                    </span>
                    {r.endpoint && (
                      <span
                        className="mt-0.5 block truncate font-mono text-[9px]"
                        style={{ color: "var(--mono-label, var(--muted-foreground))", opacity: 0.75 }}
                        title={r.endpoint}
                      >
                        {r.endpoint}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p
            className="mt-3 font-mono text-[9px] leading-relaxed"
            style={{ color: "var(--mono-label, var(--muted-foreground))" }}
          >
            Headline status is the weakest link across these feeds; the age shown is the
            oldest contributing observation. Static fields (bathymetry) are excluded from
            the age by the backend.
          </p>
        </div>
      )}
    </div>
  )
}

export default LiveDataBadge
