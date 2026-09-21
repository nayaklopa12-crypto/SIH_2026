"use client"

// 3.8 — MagnificationDock. Fixed quick-actions surface.
//
// PROVENANCE NOTE: as with StaggeredMenu, the spec describes a prebuilt component to
// import as-is; no copy existed in this project or in ~/Downloads, so it is written
// here to the contract the spec documents — Framer Motion `useMotionValue` /
// `useSpring` / `useTransform` proximity magnification, hover tooltips, and the
// spring defaults `{ mass: 0.1, stiffness: 150, damping: 12 }` kept exactly, since
// those numbers *are* the component's feel.
//
// Only the container styling is Part 2's: the stock theme classes (`bg-card`,
// `border-border`, `text-foreground`, `bg-card/50`) are replaced with --bg at reduced
// opacity + backdrop-blur for the panel, a --bg-step item surface with a --hairline
// border, and --ink icons. The blur is kept deliberately — it reads as premium and
// doesn't fight the hairline system.
//
// Role: per the spec this is a UTILITY surface (layer toggles, recenter, live/cached,
// export), not app navigation — StaggeredMenu owns navigation, and the two must not
// compete for the same job.

import { useRef } from "react"
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "./use-reduced-motion"

const SPRING = { mass: 0.1, stiffness: 150, damping: 12 } as const
const BASE = 44 // resting item size, px
const PEAK = 78 // magnified size at the cursor, px
const RANGE = 150 // proximity falloff, px

export interface DockItem {
  label: string
  icon: React.ReactNode
  onClick?: () => void
  href?: string
  /** Renders in the accent — reserve for the single active/primary action. */
  active?: boolean
}

export interface MagnificationDockProps {
  items: DockItem[]
  className?: string
}

export function MagnificationDock({ items, className }: MagnificationDockProps) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const reduced = useReducedMotion()

  return (
    <div
      role="toolbar"
      aria-label="Quick actions"
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2",
        "flex items-end gap-3 px-3 pb-2 pt-2",
        // Part 2 container: translucent --bg + blur, hairline border, 2px radius.
        "rounded-[2px] border border-[var(--hairline)] bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] backdrop-blur-md",
        className,
      )}
    >
      {items.map((item) => (
        <DockButton key={item.label} item={item} mouseX={mouseX} reduced={reduced === true} />
      ))}
    </div>
  )
}

function DockButton({
  item,
  mouseX,
  reduced,
}: {
  item: DockItem
  mouseX: MotionValue<number>
  reduced: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const hovered = useMotionValue(0)

  // Distance from the cursor to this item's centre, measured live so the falloff
  // stays correct when the dock itself moves or the page scrolls horizontally.
  const distance = useTransform(mouseX, (x) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return Number.POSITIVE_INFINITY
    return x - (box.left + window.scrollX) - box.width / 2
  })

  const sizeTarget = useTransform(distance, [-RANGE, 0, RANGE], [BASE, PEAK, BASE], {
    clamp: true,
  })
  const size = useSpring(sizeTarget, SPRING)

  // Reduced motion: fixed size, no spring. The dock stays fully usable — only the
  // magnification is dropped.
  const style = reduced ? { width: BASE, height: BASE } : { width: size, height: size }

  const Inner = (
    <motion.div
      ref={ref}
      style={style}
      onHoverStart={() => hovered.set(1)}
      onHoverEnd={() => hovered.set(0)}
      className={cn(
        "relative flex aspect-square items-center justify-center rounded-[2px] border",
        item.active
          ? "border-[var(--signal)] text-[var(--signal)]"
          : "border-[var(--hairline)] text-[var(--ink)]",
        "bg-[var(--bg-step)] transition-colors duration-200 ease-out hover:border-[var(--hairline-strong)]",
      )}
    >
      <DockLabel hovered={hovered} label={item.label} />
      <span className="pointer-events-none grid place-items-center [&_svg]:h-[45%] [&_svg]:w-[45%]">
        {item.icon}
      </span>
    </motion.div>
  )

  const common = { "aria-label": item.label, title: item.label, className: "outline-offset-4" }

  return item.href ? (
    <a href={item.href} {...common}>
      {Inner}
    </a>
  ) : (
    <button type="button" onClick={item.onClick} {...common}>
      {Inner}
    </button>
  )
}

// Tooltip. Border/background from --hairline/--bg, text in --mono-label at the Part 2
// small-mono tracking, so it reads as the same family of technical label used
// everywhere else on the page.
function DockLabel({ hovered, label }: { hovered: MotionValue<number>; label: string }) {
  const opacity = useTransform(hovered, [0, 1], [0, 1])
  const y = useTransform(hovered, [0, 1], [4, -6])

  return (
    <AnimatePresence>
      <motion.span
        style={{ opacity, y }}
        aria-hidden="true"
        className="ed-mono-label ed-mono-label--tight pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1"
      >
        {label}
      </motion.span>
    </AnimatePresence>
  )
}

export default MagnificationDock
