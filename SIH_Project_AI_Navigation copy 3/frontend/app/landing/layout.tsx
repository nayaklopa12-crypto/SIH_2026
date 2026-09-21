import type { Metadata } from "next"

import "../../styles/tokens.css"

import { LandingChrome } from "./chrome"

export const metadata: Metadata = {
  title: "Read the ice before it moves | Antarctic Navigation Intelligence",
  description:
    "Sea-ice forecasting, iceberg drift and risk-aware routing for Antarctic resupply, built on live satellite and model data.",
}

/**
 * Nested layout for the editorial landing route.
 *
 * This route lives inside the existing root layout, which paints a cyan `polar-bg`
 * body plus a fixed Three.js ice canvas at z-index 0. Rather than edit that file,
 * `.editorial-root` is an opaque positioned wrapper at z-index 2 — it covers both
 * and keeps the two palettes apart. See the scoping note in styles/tokens.css.
 *
 * Fonts: Archivo is requested here with a plain <link>, not next/font, because
 * next/font fetches at build time and would fail a build on a venue with no
 * network. If the request fails the display face degrades to IBM Plex Sans, which
 * the root layout already loads — the page stays correct, just less distinctive.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;900&family=Londrina+Solid:wght@400&display=swap"
      />
      <div className="editorial-root">
        {/* One global grain pass for the whole route — never per component. */}
        <svg className="editorial-noise" aria-hidden="true" focusable="false">
          <filter id="ed-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.82"
              numOctaves="4"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#ed-grain)" />
        </svg>

        <LandingChrome />
        <main id="top">{children}</main>
      </div>
    </>
  )
}
