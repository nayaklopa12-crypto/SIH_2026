"use client"

// Shared `prefers-reduced-motion` probe for every Part 3 component.
//
// Why a hook and not just the CSS media query: the CSS backstop in tokens.css can
// only collapse a transition's duration. These components start from a hidden
// initial state (opacity 0, translated, blurred, clipped), so collapsing the
// animation would freeze them at frame 0 and the text would simply never appear.
// Reading the query in JS lets each component render its true END state instead —
// which is what the spec asks for ("fall back to the end-state, no animation").
//
// Returns `null` on the first render (server + hydration) so nothing commits to a
// motion path before the real preference is known; treat null as "not yet known".

import { useEffect, useState } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      setReduced(false)
      return
    }
    const mq = window.matchMedia(QUERY)
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    // Safari < 14 only has the deprecated addListener signature.
    if (mq.addEventListener) mq.addEventListener("change", onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  return reduced
}

// Synchronous read, for imperative code paths (GSAP setup) that need the answer
// before the next paint rather than after an effect commits.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}
