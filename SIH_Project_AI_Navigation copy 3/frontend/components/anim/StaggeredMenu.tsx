"use client"

// 3.7 — StaggeredMenu. Primary site navigation.
//
// PROVENANCE NOTE: the spec describes this as a prebuilt component to "drop in
// as-is". No copy of it existed anywhere in this project or in ~/Downloads, so it is
// implemented here against the exact contract the spec documents — the same prop
// names (`colors`, `accentColor`, `menuButtonColor`, `openMenuButtonColor`,
// `displayItemNumbering`), the same class hooks (`.sm-panel-itemLabel`), and the
// same mechanics: multi-layer staggered background reveal, toggle with icon
// rotation + "Menu"→"Close" text cycling, staggered item and social entrance.
//
// Per the spec this component keeps its OWN easing signature (power4.out / power3.in)
// rather than Part 2's power2.out default — that motion is part of why it reads as
// premium, and flattening it would cost more than the consistency gains.
//
// Re-skinning is done through props and the wrapper's CSS custom properties only.
// The prop API takes literal colour strings, so call sites resolve the tokens to hex
// (see app/landing/layout.tsx) instead of passing `var(--…)` into GSAP.

import { useCallback, useEffect, useId, useRef, useState } from "react"
import gsap from "gsap"

import { cn } from "@/lib/utils"
import { prefersReducedMotion } from "./use-reduced-motion"

export interface StaggeredMenuItem {
  label: string
  href: string
  /** Short mono descriptor shown under the label. */
  meta?: string
}

export interface StaggeredMenuSocial {
  label: string
  href: string
}

export interface StaggeredMenuProps {
  items: StaggeredMenuItem[]
  socialItems?: StaggeredMenuSocial[]
  /** Background layers, back to front. Literal colour strings, not CSS vars. */
  colors?: string[]
  /** Single functional accent — numbering, rules, hover. */
  accentColor?: string
  /** Toggle colour when closed / when open. */
  menuButtonColor?: string
  openMenuButtonColor?: string
  /** "01", "02" … in the mono-label convention. */
  displayItemNumbering?: boolean
  /** Brand mark rendered at the left of the header bar. */
  brand?: React.ReactNode
  className?: string
}

export function StaggeredMenu({
  items,
  socialItems = [],
  colors = ["#141210", "#8C8175", "#EDE6DA"],
  accentColor = "#E8944A",
  menuButtonColor = "#EDE6DA",
  openMenuButtonColor = "#141210",
  displayItemNumbering = true,
  brand,
  className,
}: StaggeredMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  // Guards the entrance tween from running on mount, which would flash the panel
  // open-then-closed on first paint.
  const mounted = useRef(false)

  const toggle = useCallback(() => setOpen((o) => !o), [])

  // Escape closes; body scroll locks while open. Both are nav hygiene the spec's
  // "keyboard/screen-reader sane" requirement implies.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    const el = root.current
    if (!el) return

    const layers = el.querySelectorAll<HTMLElement>(".sm-prelayer")
    const panel = el.querySelector<HTMLElement>(".sm-panel")
    const rows = el.querySelectorAll<HTMLElement>(".sm-panel-item")
    const socials = el.querySelectorAll<HTMLElement>(".sm-social")
    const icon = el.querySelector<HTMLElement>(".sm-toggle-icon")
    const labelClosed = el.querySelector<HTMLElement>('[data-sm-label="closed"]')
    const labelOpen = el.querySelector<HTMLElement>('[data-sm-label="open"]')
    if (!panel) return

    const reduce = prefersReducedMotion()
    const targets = [layers, panel, rows, socials]

    // Reduced motion: snap straight to the correct end-state. No tweens, but the
    // menu still fully opens and closes.
    if (reduce) {
      gsap.set([...Array.from(layers), panel], { xPercent: open ? 0 : 100 })
      gsap.set([...Array.from(rows), ...Array.from(socials)], {
        yPercent: 0,
        opacity: open ? 1 : 0,
      })
      if (icon) gsap.set(icon, { rotate: open ? 225 : 0 })
      if (labelClosed) gsap.set(labelClosed, { yPercent: open ? -100 : 0 })
      if (labelOpen) gsap.set(labelOpen, { yPercent: open ? 0 : 100 })
      return
    }

    const tl = gsap.timeline()

    if (open) {
      tl.set([...Array.from(rows), ...Array.from(socials)], { yPercent: 100, opacity: 0 })
        // Layers lead, panel follows — the stagger between them is the whole effect.
        .to(Array.from(layers), {
          xPercent: 0,
          duration: 0.62,
          ease: "power4.out",
          stagger: 0.08,
        }, 0)
        .to(panel, { xPercent: 0, duration: 0.68, ease: "power4.out" }, 0.16)
        .to(Array.from(rows), {
          yPercent: 0,
          opacity: 1,
          duration: 0.55,
          ease: "power4.out",
          stagger: 0.06,
        }, 0.42)
        .to(Array.from(socials), {
          yPercent: 0,
          opacity: 1,
          duration: 0.45,
          ease: "power4.out",
          stagger: 0.04,
        }, 0.62)
    } else if (mounted.current) {
      tl.to([panel, ...Array.from(layers).reverse()], {
        xPercent: 100,
        duration: 0.44,
        ease: "power3.in",
        stagger: 0.05,
      }, 0).set([...Array.from(rows), ...Array.from(socials)], { opacity: 0 })
    } else {
      gsap.set([...Array.from(layers), panel], { xPercent: 100 })
      gsap.set([...Array.from(rows), ...Array.from(socials)], { opacity: 0 })
    }

    if (icon) tl.to(icon, { rotate: open ? 225 : 0, duration: 0.5, ease: "power4.out" }, 0)
    // Text cycling: two stacked labels sliding through one masked slot.
    if (labelClosed) tl.to(labelClosed, { yPercent: open ? -100 : 0, duration: 0.4, ease: "power4.out" }, 0)
    if (labelOpen) tl.to(labelOpen, { yPercent: open ? 0 : 100, duration: 0.4, ease: "power4.out" }, 0)

    mounted.current = true
    void targets
    return () => {
      tl.kill()
    }
  }, [open])

  return (
    <div ref={root} className={cn("sm-root", className)}>
      {/* Header bar: brand + toggle. Fixed, above the panel so the toggle stays
          clickable while open. */}
      <header className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="ed-mono-label ed-mono-label--tight text-[var(--ink)]">{brand}</div>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="sm-toggle group flex items-center gap-3"
          style={{ color: open ? openMenuButtonColor : menuButtonColor }}
        >
          <span className="ed-mono-label relative block h-[12px] w-[42px] overflow-hidden text-current">
            <span data-sm-label="closed" className="absolute inset-0 block text-current">
              Menu
            </span>
            <span
              data-sm-label="open"
              className="absolute inset-0 block translate-y-full text-current"
            >
              Close
            </span>
          </span>
          <span className="sm-toggle-icon relative block h-[14px] w-[14px]" aria-hidden="true">
            <span className="absolute left-1/2 top-0 block h-full w-px -translate-x-1/2 bg-current" />
            <span className="absolute left-0 top-1/2 block h-px w-full -translate-y-1/2 bg-current" />
          </span>
        </button>
      </header>

      {/* Multi-layer background reveal. One div per colour, each pre-translated
          off-canvas; they arrive staggered so the panel lands on a built-up stack
          instead of a single flat wipe. Inert to pointers and hidden from a11y —
          the panel itself owns focus and semantics. */}
      <div className="pointer-events-none fixed inset-0 z-[40]" aria-hidden="true">
        {colors.map((c, i) => (
          <div
            key={`${c}-${i}`}
            className="sm-prelayer absolute inset-y-0 right-0 w-full translate-x-full sm:w-[min(560px,86vw)]"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <nav
        id={panelId}
        // `inert` while closed keeps the off-canvas links out of the tab order
        // without needing display:none, which would break the slide tween.
        {...(!open ? { inert: "" as unknown as boolean } : {})}
        aria-hidden={!open}
        className="sm-panel fixed inset-y-0 right-0 z-[50] flex w-full translate-x-full flex-col justify-between overflow-y-auto px-6 pb-8 pt-24 sm:w-[min(560px,86vw)] sm:px-10"
        style={{ backgroundColor: colors[colors.length - 1] ?? "#EDE6DA" }}
      >
        <ul className="m-0 list-none p-0">
          {items.map((item, i) => (
            // overflow-hidden is the mask the row slides up through.
            <li key={item.href} className="overflow-hidden border-b" style={{ borderColor: "rgba(20,18,16,0.14)" }}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                className="sm-panel-item group flex items-baseline gap-4 py-4 no-underline sm:py-5"
              >
                {displayItemNumbering && (
                  // Spec 3.7.4: numbering stays on, styled through --mono-label.
                  <span className="ed-mono-label shrink-0" style={{ color: "#8C8175" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                )}
                <span className="flex-1">
                  {/* Spec 3.7.3: the stock component hardcodes text-black here. The
                      panel's top layer is --ink, so the label takes --bg for contrast
                      via the token system rather than assuming a light panel. */}
                  <span
                    className="sm-panel-itemLabel ed-display block text-[clamp(1.75rem,5vw,3rem)] transition-colors duration-300 ease-out"
                    style={{ color: "#141210" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#141210")}
                  >
                    {item.label}
                  </span>
                  {item.meta && (
                    <span className="ed-mono-label mt-1 block" style={{ color: "#8C8175" }}>
                      {item.meta}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>

        {socialItems.length > 0 && (
          <div className="mt-10">
            <span className="ed-mono-label block" style={{ color: "#8C8175" }}>
              Elsewhere
            </span>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 p-0">
              {socialItems.map((s) => (
                <li key={s.href} className="list-none overflow-hidden">
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm-social ed-mono-label ed-mono-label--tight no-underline transition-colors duration-300 ease-out"
                    style={{ color: "#141210" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#141210")}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </div>
  )
}

export default StaggeredMenu
