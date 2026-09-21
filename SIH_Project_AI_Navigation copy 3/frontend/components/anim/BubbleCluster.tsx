"use client"

// 3.2 — Bubble cluster + hub/connector interaction.
//
// Deliberately split into two exports so the hub behaviour is NOT welded to the
// ticker's text layout (the spec asks for exactly this):
//
//   <BubbleCluster />        presentational inline SVG, carries the data-* hooks
//   buildClusterTimeline()   the hub/connector motion, as a detached GSAP timeline
//
// HorizontalTicker inserts the returned timeline into its own master timeline at a
// computed label, so the hub stays locked to the ticker's scrub. Any other surface
// can hand the same timeline to its own ScrollTrigger (see ScrollBubbleRow below)
// without importing a line of ticker code.

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"
import { prefersReducedMotion } from "./use-reduced-motion"

type Bubble = { cx: number; cy: number; r: number }

// Four fixed layouts of 3–4 circles, cycled by index. Fixed rather than random so
// the SVG is byte-identical on server and client — a random layout would hydrate
// mismatched, and the connector lengths baked in below would be wrong.
const LAYOUTS: Bubble[][] = [
  [{ cx: 30, cy: 40, r: 11 }, { cx: 66, cy: 24, r: 7 }, { cx: 72, cy: 55, r: 8.5 }],
  [{ cx: 34, cy: 46, r: 12 }, { cx: 68, cy: 30, r: 6.5 }, { cx: 88, cy: 52, r: 5.5 }, { cx: 56, cy: 62, r: 7.5 }],
  [{ cx: 28, cy: 34, r: 9.5 }, { cx: 58, cy: 52, r: 11 }, { cx: 86, cy: 30, r: 7 }],
  [{ cx: 40, cy: 52, r: 12.5 }, { cx: 30, cy: 22, r: 6.5 }, { cx: 70, cy: 34, r: 8 }, { cx: 90, cy: 58, r: 6 }],
]

// Which circle becomes the hub, per layout. Varied so four clusters in a row don't
// all pop the same corner.
const HUB_INDEX = [0, 0, 1, 0]

const VIEW_W = 120
const VIEW_H = 80

export interface BubbleClusterProps {
  /** Selects the layout + hub. Any integer; wraps. */
  index?: number
  /** Rendered height in px. Width follows the 3:2 viewBox. */
  size?: number
  className?: string
}

export function BubbleCluster({ index = 0, size = 34, className }: BubbleClusterProps) {
  const layout = LAYOUTS[((index % LAYOUTS.length) + LAYOUTS.length) % LAYOUTS.length]
  const hubIdx = HUB_INDEX[((index % HUB_INDEX.length) + HUB_INDEX.length) % HUB_INDEX.length]
  const hub = layout[hubIdx]

  return (
    <svg
      data-cluster
      // Decorative punctuation between phrases — the sentence reads fine without it.
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      height={size}
      width={(size * VIEW_W) / VIEW_H}
      className={cn("shrink-0 overflow-visible", className)}
    >
      {/* Connectors are drawn first so they sit behind the circles. Each starts
          fully retracted: dashoffset == its own length. The length is computed here
          rather than measured with getTotalLength(), so the retracted state is
          correct on the very first paint, before GSAP or layout exists. */}
      <g data-connectors stroke="var(--signal)" strokeWidth={1} strokeLinecap="round" fill="none">
        {layout.map((b, i) => {
          if (i === hubIdx) return null
          const len = Math.hypot(b.cx - hub.cx, b.cy - hub.cy)
          return (
            <line
              key={`l${i}`}
              data-connector
              x1={hub.cx}
              y1={hub.cy}
              x2={b.cx}
              y2={b.cy}
              strokeDasharray={len}
              strokeDashoffset={len}
              opacity={0.85}
            />
          )
        })}
      </g>
      {layout.map((b, i) => (
        <circle
          key={`c${i}`}
          data-bubble
          {...(i === hubIdx ? { "data-hub": "" } : {})}
          cx={b.cx}
          cy={b.cy}
          r={b.r}
          fill="none"
          stroke={i === hubIdx ? "var(--signal)" : "var(--hairline-strong)"}
          strokeWidth={i === hubIdx ? 1.4 : 1}
          // transform-box/origin keep scale() centred on the circle itself instead
          // of the SVG's origin, which is what makes the hub grow in place.
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      ))}
    </svg>
  )
}

export default BubbleCluster

// ---------------------------------------------------------------------------
// Hub/connector motion — decoupled from any particular scroll driver.
// ---------------------------------------------------------------------------

type GsapLike = typeof import("gsap").default

export interface ClusterTimelineOptions {
  /** Hub scale at full activation. Spec range 2–2.2. */
  hubScale?: number
  /** Non-hub circles shrink to this while the hub is active. */
  satelliteScale?: number
}

/**
 * A self-contained, normalised timeline for one cluster's hub behaviour.
 *
 * Total duration is exactly 1, so a caller can scale it into whatever slice of its
 * own timeline the cluster occupies. Shape: grow + draw the connectors over the
 * first ~40%, hold, then retract and shrink back over the last ~35% — which is the
 * "previous hub gives way as the next one takes over" handoff, expressed inside a
 * single cluster's own window instead of as cross-cluster bookkeeping.
 *
 * Returns null if the element has no hub (nothing to animate) so callers can skip
 * it without a special case.
 */
export function buildClusterTimeline(
  gsap: GsapLike,
  cluster: Element,
  { hubScale = 2.1, satelliteScale = 0.62 }: ClusterTimelineOptions = {},
) {
  const hub = cluster.querySelector<SVGCircleElement>("[data-hub]")
  if (!hub) return null

  const satellites = Array.from(
    cluster.querySelectorAll<SVGCircleElement>("[data-bubble]:not([data-hub])"),
  )
  const connectors = Array.from(cluster.querySelectorAll<SVGLineElement>("[data-connector]"))

  // Each connector's own retracted offset, read off the attribute rather than
  // measured — lines differ in length, so one shared value would leave the short
  // ones visibly stubbed when retracted.
  const lengths = connectors.map((l) => Number(l.getAttribute("stroke-dasharray")) || 0)

  // `power1.inOut` is the Part 2 register for scroll-scrubbed motion.
  const tl = gsap.timeline({ defaults: { ease: "power1.inOut" } })

  tl.to(hub, { scale: hubScale, strokeWidth: 1.8, duration: 0.35 }, 0)
    .to(satellites, { scale: satelliteScale, duration: 0.35 }, 0)
    .to(connectors, { strokeDashoffset: 0, duration: 0.4, stagger: 0.05 }, 0.08)
    // Retract before shrinking, so the lines look like they are being pulled back
    // into the hub rather than snapping off a shrinking circle.
    .to(connectors, { strokeDashoffset: (i: number) => lengths[i], duration: 0.3 }, 0.62)
    .to(hub, { scale: 1, strokeWidth: 1.4, duration: 0.35 }, 0.65)
    .to(satellites, { scale: 1, duration: 0.35 }, 0.65)

  // Pad to exactly 1 so callers can rely on the duration contract.
  tl.set({}, {}, 1)
  return tl
}

/**
 * Standalone use: a static row of clusters with one scroll-driven hub, for surfaces
 * that want the 3.2 effect without the 3.1 ticker. Same `buildClusterTimeline`, its
 * own ScrollTrigger.
 */
export function ScrollBubbleRow({
  count = 4,
  size = 44,
  className,
}: {
  count?: number
  size?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const clusters = Array.from(el.querySelectorAll("[data-cluster]"))
    if (!clusters.length) return
    // Reduced motion: the SVG already renders its resting state (connectors
    // retracted, no hub scale), so doing nothing IS the end-state fallback.
    if (prefersReducedMotion()) return

    let ctx: { revert: () => void } | null = null
    let cancelled = false

    ;(async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ])
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        const master = gsap.timeline({
          scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 30%", scrub: 1 },
        })
        // Each cluster owns an equal slice, so they hand off in reading order.
        const slice = 1 / clusters.length
        clusters.forEach((c, i) => {
          const sub = buildClusterTimeline(gsap, c)
          if (sub) master.add(sub.duration(slice), i * slice)
        })
      }, el)
    })()

    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [count])

  return (
    <div ref={ref} className={cn("flex items-center gap-10", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <BubbleCluster key={i} index={i} size={size} />
      ))}
    </div>
  )
}
