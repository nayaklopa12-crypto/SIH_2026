"use client"

// 3.1 + 3.2 — Horizontal ticker-tape scroll with scroll-driven bubble hubs.
//
// One pinned section, one flex track holding a single continuous sentence, and one
// GSAP master timeline. Vertical scroll scrubs the track's `x`, so the sentence is
// read horizontally. The 3.2 hub/connector behaviour is added to THAT SAME master
// timeline at each cluster's computed offset — not as a second ScrollTrigger per
// cluster — which is what keeps the hubs locked to the ticker's own scrub instead
// of drifting out of sync with it.
//
// Gaps are per-item margins from a cycling ramp, not a uniform `gap`, so the line
// breathes like set type rather than a grid.

import { useEffect, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"
import { BubbleCluster, buildClusterTimeline } from "./BubbleCluster"
import { useReducedMotion } from "./use-reduced-motion"

// Variable gaps, cycled per item (rem).
const GAP_RAMP = [3.5, 6.5, 4, 8, 5, 3]

export interface HorizontalTickerProps {
  /** Phrases of one continuous sentence; a bubble cluster punctuates each join. */
  phrases?: string[]
  className?: string
  /** Scroll distance as a multiple of the track's overflow. 1 = 1:1 with pixels. */
  scrollFactor?: number
}

const DEFAULT_PHRASES = [
  "In every satellite pass,",
  "we read the ice before it moves,",
  "turning forecast into confidence",
  "and confidence into a safe course",
  "from Maitri to Bharati.",
]

export function HorizontalTicker({
  phrases = DEFAULT_PHRASES,
  className,
  scrollFactor = 1,
}: HorizontalTickerProps) {
  const section = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  // Interleave phrase / cluster / phrase / cluster / … so the glyphs act as
  // punctuation inside the sentence and are never a section of their own.
  const items = useMemo(() => {
    const out: Array<{ kind: "text"; value: string } | { kind: "cluster"; index: number }> = []
    phrases.forEach((p, i) => {
      out.push({ kind: "text", value: p })
      if (i < phrases.length - 1) out.push({ kind: "cluster", index: i })
    })
    return out
  }, [phrases])

  useEffect(() => {
    // `null` = preference not yet read; `true` = static fallback, no pin at all.
    if (reduced !== false) return
    const sectionEl = section.current
    const trackEl = track.current
    if (!sectionEl || !trackEl) return

    let ctx: { revert: () => void } | null = null
    let cancelled = false
    let resizeTimer: ReturnType<typeof setTimeout> | undefined

    const build = async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ])
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)

      ctx = gsap.context(() => {
        const vw = window.innerWidth
        const overflow = Math.max(0, trackEl.scrollWidth - vw)
        // Nothing overflows (very wide screen, very short sentence): leave it
        // static rather than pinning a section that has nothing to scrub.
        if (overflow < 8) return

        const master = gsap.timeline({
          scrollTrigger: {
            trigger: sectionEl,
            start: "top top",
            end: `+=${Math.round(overflow * scrollFactor)}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })

        // The position tween is linear on purpose. Easing the scrubbed `x` would
        // make the sentence speed up and slow down under a steady scroll, which
        // reads as lag; the Part 2 `power1.inOut` register applies to the cluster
        // motion below, where it belongs.
        master.to(trackEl, { x: -overflow, duration: 1, ease: "none" }, 0)

        // Place each cluster's hub window at the scroll progress where that cluster
        // actually crosses the viewport centre:
        //   viewport_x(t) = centre_in_track - overflow * t   →   t = (c - vw/2) / overflow
        const clusters = Array.from(trackEl.querySelectorAll<SVGElement>("[data-cluster]"))
        const trackLeft = trackEl.getBoundingClientRect().left
        const W = 0.09 // half-window, in timeline units

        clusters.forEach((c) => {
          const box = c.getBoundingClientRect()
          const centreInTrack = box.left - trackLeft + box.width / 2
          const tCentre = (centreInTrack - vw / 2) / overflow
          const sub = buildClusterTimeline(gsap, c)
          if (!sub) return
          // Clamped so the first and last clusters — which cross centre slightly
          // outside the scrub range — still take their turn at the nearest edge
          // instead of silently never firing.
          const at = Math.min(Math.max(tCentre - W, 0), 1 - 2 * W)
          master.add(sub.duration(2 * W), at)
        })
      }, sectionEl)
    }

    // Web fonts change text metrics, which moves every cluster's centre. Building
    // after they settle means the hub fires where the glyph actually is.
    const ready = (document as Document & { fonts?: FontFaceSet }).fonts?.ready
    if (ready) ready.then(build).catch(build)
    else build()

    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        ctx?.revert()
        ctx = null
        void build()
      }, 200)
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelled = true
      clearTimeout(resizeTimer)
      window.removeEventListener("resize", onResize)
      ctx?.revert()
    }
  }, [reduced, items, scrollFactor])

  const isStatic = reduced === true

  return (
    <section
      ref={section}
      aria-label="Mission statement"
      className={cn(
        "relative w-full overflow-hidden",
        isStatic ? "py-24" : "flex min-h-screen items-center",
        className,
      )}
    >
      <div
        ref={track}
        className={cn(
          "flex items-center",
          // Static fallback: the same items simply wrap as normal prose.
          isStatic
            ? "max-w-4xl flex-wrap gap-x-3 gap-y-2 px-6"
            : "w-max flex-nowrap pl-[10vw] pr-[10vw] will-change-transform",
        )}
      >
        {items.map((item, i) =>
          item.kind === "text" ? (
            <span
              key={`t${i}`}
              className="ed-display whitespace-pre text-[clamp(2rem,7vw,5.5rem)] text-[var(--ink)]"
              style={isStatic ? undefined : { marginInline: `${GAP_RAMP[i % GAP_RAMP.length]}rem` }}
            >
              {item.value}
            </span>
          ) : (
            <BubbleCluster key={`c${i}`} index={item.index} size={isStatic ? 26 : 62} />
          ),
        )}
      </div>
    </section>
  )
}

export default HorizontalTicker
