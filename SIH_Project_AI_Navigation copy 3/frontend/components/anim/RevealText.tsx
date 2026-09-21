"use client"

// 3.4 — Letter-by-letter fade + slide-up + blur-reduction reveal.
//
// Per letter: opacity 0 → 1, translateY(24px) → 0, blur(8px) → 0, staggered
// ~0.025s so it reads as one fluid sweep rather than a typewriter. Fires when the
// element scrolls into view.
//
// Splitting: manual span-wrapping (the spec's sanctioned alternative to SplitText).
// Words are wrapped first and kept `nowrap`, so a long line still breaks at word
// boundaries instead of mid-word. The split output is aria-hidden and the real
// string lives on the container's aria-label — otherwise a screen reader can
// announce the headline one letter at a time.

import { useEffect, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"
import { prefersReducedMotion } from "./use-reduced-motion"

export interface RevealTextProps {
  text: string
  className?: string
  /** Element to render as. Headings should pass their own tag. */
  as?: keyof React.JSX.IntrinsicElements
  /** Seconds between letters. Spec range 0.02–0.04. */
  stagger?: number
  /** Stagger by word instead of letter — better for long paragraphs. */
  by?: "letter" | "word"
  /** Delay before the sweep starts, seconds. */
  delay?: number
}

export function RevealText({
  text,
  className,
  as = "span",
  stagger = 0.025,
  by = "letter",
  delay = 0,
}: RevealTextProps) {
  const root = useRef<HTMLElement>(null)
  const Tag = as as React.ElementType

  const words = useMemo(() => text.split(/(\s+)/), [text])

  useEffect(() => {
    const el = root.current
    if (!el) return

    const targets = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal-unit]"))
    if (!targets.length) return

    // Reduced motion: commit the end state and never build a timeline.
    if (prefersReducedMotion()) {
      targets.forEach((t) => {
        t.style.opacity = "1"
        t.style.transform = "none"
        t.style.filter = "none"
      })
      return
    }

    let ctx: { revert: () => void } | null = null
    let cancelled = false

    // Dynamic import keeps GSAP + ScrollTrigger out of the server bundle and off
    // the critical path; the pre-animation state is already set inline below, so
    // there is no flash of laid-out text while it loads.
    ;(async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ])
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)

      ctx = gsap.context(() => {
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.7,
          ease: "power2.out", // Part 2 entrance easing register
          stagger,
          delay,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        })
      }, el)
    })()

    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [text, stagger, delay, by])

  // Inline pre-animation state: set here rather than in CSS so the letters are
  // already hidden on first paint, with no dependence on GSAP having loaded.
  const hidden: React.CSSProperties = {
    display: "inline-block",
    opacity: 0,
    transform: "translateY(24px)",
    filter: "blur(8px)",
    willChange: "opacity, transform, filter",
  }

  return (
    <Tag ref={root as never} className={cn(className)} aria-label={text}>
      <span aria-hidden="true">
        {words.map((chunk, wi) => {
          if (/^\s+$/.test(chunk)) return <span key={`s${wi}`}> </span>
          if (by === "word") {
            return (
              <span key={`w${wi}`} data-reveal-unit style={hidden}>
                {chunk}
              </span>
            )
          }
          return (
            <span key={`w${wi}`} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {Array.from(chunk).map((ch, ci) => (
                <span key={`c${ci}`} data-reveal-unit style={hidden}>
                  {ch}
                </span>
              ))}
            </span>
          )
        })}
      </span>
    </Tag>
  )
}

export default RevealText
