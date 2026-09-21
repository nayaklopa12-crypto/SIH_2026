"use client"

// 3.3 — H3 heading component.
//
// Fluid clamp() sizing, tight tracking, smooth colour transition on hover or via a
// prop-driven state. Uses the Part 2 display family/weight, so it drops into hero
// banners and section headers without restyling.

import { cn } from "@/lib/utils"

type HeadingLevel = "h1" | "h2" | "h3" | "h4"

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: HeadingLevel
  /** Fluid size ramp. `section` is the 3.3 default; `hero` is for the top of a page. */
  scale?: "hero" | "section" | "sub"
  /** Colour-shift on hover: --ink → --signal. */
  hoverSignal?: boolean
  /** Prop-driven active state — same transition, no pointer needed (e.g. current section). */
  active?: boolean
  /** Layered stroke-offset depth. Hero-level headlines ONLY — see tokens.css. */
  depth?: boolean
  children: React.ReactNode
}

const SCALES: Record<NonNullable<HeadingProps["scale"]>, string> = {
  hero: "text-[clamp(2.75rem,9vw,8rem)] tracking-[-0.055em] leading-[0.85]",
  section: "text-[clamp(1.75rem,4vw,3.25rem)] tracking-[-0.03em] leading-[0.9]",
  sub: "text-[clamp(1.125rem,2vw,1.5rem)] tracking-[-0.02em] leading-[1.05]",
}

export function Heading({
  as = "h3",
  scale = "section",
  hoverSignal = false,
  active = false,
  depth = false,
  className,
  children,
  ...rest
}: HeadingProps) {
  const Tag = as

  // The depth layer needs the same glyphs twice, so it only works for plain text.
  // Anything richer renders flat rather than silently dropping the children.
  const depthText = depth && typeof children === "string" ? children : null

  return (
    <Tag
      className={cn(
        "ed-display transition-colors duration-300 ease-out",
        SCALES[scale],
        active ? "text-[var(--signal)]" : "text-[var(--ink)]",
        hoverSignal && !active && "hover:text-[var(--signal)]",
        className,
      )}
      {...rest}
    >
      {depthText ? (
        <span className="ed-depth">
          {/* aria-hidden: the back layer is decoration, not a second heading. */}
          <span data-depth-back aria-hidden="true">
            {depthText}
          </span>
          <span>{depthText}</span>
        </span>
      ) : (
        children
      )}
    </Tag>
  )
}

export default Heading
