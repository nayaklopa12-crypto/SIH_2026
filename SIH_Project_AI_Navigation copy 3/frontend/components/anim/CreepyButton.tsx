"use client"

// 3.9 — CreepyButton. ONE contained appearance only.
//
// TONAL CLASH — FLAGGED, NOT SILENTLY SHIPPED (spec 3.9): this is a playful,
// cartoonish novelty (eyes that follow the cursor, "Don't look at me!"). Against
// Part 2's serious editorial/brutalist system it genuinely clashes. It is therefore
// NOT wired as a primary CTA, and not placed anywhere near StaggeredMenu or
// MagnificationDock, where it would read as a mistake rather than a choice. Its one
// use in this project is the self-aware footer easter egg at the very bottom of
// app/landing/page.tsx. Please look at it there and tell me to cut it if you'd
// rather the landing page stayed straight-faced — that is a one-line removal.
//
// PROVENANCE NOTE: same as 3.7/3.8 — described in the spec as prebuilt, not present
// on disk, so written here to the documented contract: plain React, no animation
// library, CSS keyframe blink + inline-style cursor-tracking pupils, themed only
// through its own `--cb-*` variable API.

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { prefersReducedMotion } from "./use-reduced-motion"
import "./creepy-button.css"

export interface CreepyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode
  /** Per-instance `--cb-*` overrides. Defaults are the Part 2 mapping. */
  theme?: Partial<Record<"black" | "gray1" | "primary5" | "primary6" | "primary3", string>>
  wrapperClassName?: string
}

const MAX_OFFSET = 7 // px the pupil may travel from centre

export function CreepyButton({
  children = "Don't look at me!",
  theme,
  wrapperClassName,
  className,
  ...rest
}: CreepyButtonProps) {
  const root = useRef<HTMLDivElement>(null)
  const [pupil, setPupil] = useState({ x: 0, y: 0 })

  useEffect(() => {
    // Pointer-driven only: a coarse-pointer device has no cursor to track, so the
    // listener is never attached and the pupils rest centred. Reduced motion opts
    // out for the same reason the CSS does — the resting state is the honest one.
    if (typeof window === "undefined") return
    if (window.matchMedia?.("(pointer: coarse)").matches) return
    if (prefersReducedMotion()) return

    let frame = 0
    let latest: { x: number; y: number } | null = null

    const onMove = (e: PointerEvent) => {
      const el = root.current
      if (!el) return
      const box = el.getBoundingClientRect()
      const dx = e.clientX - (box.left + box.width / 2)
      const dy = e.clientY - (box.top + box.height / 2)
      const dist = Math.hypot(dx, dy) || 1
      // Normalised direction × a fixed radius, so the pupils point at the cursor
      // instead of drifting further the further away it gets.
      const reach = Math.min(dist / 220, 1) * MAX_OFFSET
      latest = { x: (dx / dist) * reach, y: (dy / dist) * reach }
      // Coalesce to one state update per frame: pointermove fires far faster than
      // the display refreshes, and a re-render per event is wasted work.
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          if (latest) setPupil(latest)
        })
      }
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  // Only the per-instance variable overrides go inline — everything static is in
  // creepy-button.css, imported once above.
  const styleVars: React.CSSProperties = {}
  if (theme?.black) (styleVars as Record<string, string>)["--cb-black"] = theme.black
  if (theme?.gray1) (styleVars as Record<string, string>)["--cb-gray1"] = theme.gray1
  if (theme?.primary5) (styleVars as Record<string, string>)["--cb-primary5"] = theme.primary5
  if (theme?.primary6) (styleVars as Record<string, string>)["--cb-primary6"] = theme.primary6
  if (theme?.primary3) (styleVars as Record<string, string>)["--cb-primary3"] = theme.primary3

  const pupilStyle = { transform: `translate(${pupil.x}px, ${pupil.y}px)` }

  return (
    <div ref={root} className={cn("creepy-btn-root", wrapperClassName)} style={styleVars}>
      {/* Decorative: the button's own label carries all the meaning. */}
      <div className="creepy-btn-eyes" aria-hidden="true">
        <span className="creepy-btn-eye">
          <span className="creepy-btn-pupil" style={pupilStyle} />
          <span className="creepy-btn-lid" />
        </span>
        <span className="creepy-btn-eye">
          <span className="creepy-btn-pupil" style={pupilStyle} />
          <span className="creepy-btn-lid" />
        </span>
      </div>
      <button type="button" className={cn("creepy-btn", className)} {...rest}>
        {children}
      </button>
    </div>
  )
}

export default CreepyButton
