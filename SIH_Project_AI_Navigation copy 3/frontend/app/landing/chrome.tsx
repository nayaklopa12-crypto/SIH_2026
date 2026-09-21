"use client"

// Persistent chrome for the landing route: StaggeredMenu (3.7) + MagnificationDock (3.8).
//
// Both are mounted from the layout, not the page, so they survive navigation within
// the route and there is exactly one of each on screen.
//
// Colours are literal hex here rather than var(--…) on purpose: StaggeredMenu hands
// these straight to GSAP, which tweens computed colour values and cannot interpolate
// an unresolved custom property. They are the same values as tokens.css — if that file
// changes, change these too.

import { MagnificationDock, type DockItem } from "@/components/anim/MagnificationDock"
import { StaggeredMenu } from "@/components/anim/StaggeredMenu"

const BG = "#141210"
const INK = "#EDE6DA"
const SIGNAL = "#E8944A"
const BG_STEP = "#1D1A17"

const MENU_ITEMS = [
  { label: "Overview", href: "#top", meta: "01" },
  { label: "The read", href: "#read", meta: "02" },
  { label: "Signal", href: "#signal", meta: "03" },
  { label: "Sources", href: "#sources", meta: "04" },
  { label: "Live console", href: "/", meta: "05" },
]

// Real institutions from the problem statement — no invented links.
const SOCIALS = [
  { label: "NCPOR", href: "https://ncpor.res.in" },
  { label: "Ministry of Earth Sciences", href: "https://moes.gov.in" },
]

function Icon({ d, filled }: { d: string; filled?: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const DOCK_ITEMS: DockItem[] = [
  { label: "Top", href: "#top", icon: <Icon d="M12 19V5M5 12l7-7 7 7" /> },
  { label: "The read", href: "#read", icon: <Icon d="M4 6h16M4 12h10M4 18h13" /> },
  { label: "Signal", href: "#signal", icon: <Icon d="M3 17l5-6 4 4 4-7 5 5" /> },
  { label: "Sources", href: "#sources", icon: <Icon d="M4 7h16v13H4zM4 7l2-3h12l2 3M9 12h6" /> },
  { label: "Live console", href: "/", icon: <Icon d="M12 3a9 9 0 100 18 9 9 0 000-18zM3.6 9h16.8M3.6 15h16.8M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18" /> },
]

export function LandingChrome() {
  return (
    <>
      <StaggeredMenu
        items={MENU_ITEMS}
        socialItems={SOCIALS}
        // Prelayers sweep dark → step → ink so the panel arrives as one movement.
        colors={[BG_STEP, SIGNAL, INK]}
        accentColor={SIGNAL}
        menuButtonColor={INK}
        openMenuButtonColor={BG}
        displayItemNumbering
        brand={
          <span className="ed-mono-label" style={{ color: INK }}>
            SIH26059 · Caffeine Geeks
          </span>
        }
      />
      <MagnificationDock items={DOCK_ITEMS} />
    </>
  )
}

export default LandingChrome
