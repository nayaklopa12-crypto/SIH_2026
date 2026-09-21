"use client"

// 3.5 — Vertical text-clip slide-down, letter by letter.
//
// Each letter sits in an `overflow-hidden` mask; the inner glyph starts at
// translateY(-100%) (clipped above the mask) and slides down to 0, so the line
// reveals top-down. Stagger ~0.04s and the same `power2.out` register as 3.4, so
// the two letter-animation components read as relatives rather than two libraries.
//
// Same a11y approach as RevealText: the split output is aria-hidden and the real
// string is on the container's aria-label.

import { useEffect, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"
import { prefersReducedMotion } from "./use-reduced-motion"

export interface ClipRevealTextProps {
  text: string
  className?: string
  as?: keyof React.JSX.IntrinsicElements
  /** Seconds between letters. Spec range 0.03–0.05. */
  stagger?: number
  delay?: number
  /** Reveal on scroll-into-view (default) or immediately on mount. */
  trigger?: "scroll" | "mount"
}

export function ClipRevealText({
  text,
  className,
  as = "span",
  stagger = 0.04,
  delay = 0,
  trigger = "scroll",
}: ClipRevealTextProps) {
  const root = useRef<HTMLElement>(null)
  const Tag = as as React.ElementType

  const words = useMemo(() => text.split(/(\s+)/), [text])

  useEffect(() => {
    const el = root.current
    if (!el) return

    const glyphs = Array.from(el.querySelectorAll<HTMLElement>("[data-clip-glyph]"))
    if (!glyphs.length) return

    if (prefersReducedMotion()) {
      glyphs.forEach((g) => {
        g.style.transform = "none"
      })
      return
    }

    let ctx: { revert: () => void } | null = null
    let cancelled = false

    ;(async () => {
      const mods: Promise<unknown>[] = [import("gsap")]
      if (trigger === "scroll") mods.push(import("gsap/ScrollTrigger"))
      const loaded = await Promise.all(mods)
      if (cancelled) return
      const gsap = (loaded[0] as { default: typeof import("gsap").default }).default
      if (trigger === "scroll") {
        const { ScrollTrigger } = loaded[1] as typeof import("gsap/ScrollTrigger")
        gsap.registerPlugin(ScrollTrigger)
      }

      ctx = gsap.context(() => {
        gsap.to(glyphs, {
          yPercent: 0,
          duration: 0.75,
          ease: "power2.out",
          stagger,
          delay,
          ...(trigger === "scroll"
            ? { scrollTrigger: { trigger: el, start: "top 85%", once: true } }
            : {}),
        })
      }, el)
    })()

    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [text, stagger, delay, trigger])

  // `lineHeight: 1` + `verticalAlign: bottom` on the mask stops descenders (g, y, p)
  // from being clipped by the overflow box once the glyph has landed.
  const mask: React.CSSProperties = {
    display: "inline-block",
    overflow: "hidden",
    verticalAlign: "bottom",
    lineHeight: 1.05,
  }
  const glyph: React.CSSProperties = {
    display: "inline-block",
    transform: "translateY(-100%)",
    willChange: "transform",
  }

  return (
    <Tag ref={root as never} className={cn(className)} aria-label={text}>
      <span aria-hidden="true">
        {words.map((chunk, wi) => {
          if (/^\s+$/.test(chunk)) return <span key={`s${wi}`}> </span>
          return (
            <span key={`w${wi}`} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {Array.from(chunk).map((ch, ci) => (
                <span key={`m${ci}`} style={mask}>
                  <span data-clip-glyph style={glyph}>
                    {ch}
                  </span>
                </span>
              ))}
            </span>
          )
        })}
      </span>
    </Tag>
  )
}

export default ClipRevealText
