// Editorial landing route — composition of the Part 3 component set.
//
// Server component: every animated child is its own "use client" island, so the
// document arrives as real text and the motion layer attaches on top. Copy is
// project-truthful — the model skill figures quoted below are the measured
// hold-out numbers stored in the trained checkpoint, not aspirations.

import { ClipRevealText } from "@/components/anim/ClipRevealText"
import { CreepyButton } from "@/components/anim/CreepyButton"
import { Heading } from "@/components/anim/Heading"
import { HorizontalTicker } from "@/components/anim/HorizontalTicker"
import { LogoTicker, type LogoTickerItem } from "@/components/anim/LogoTicker"
import { RevealText } from "@/components/anim/RevealText"

import { LiveStatus } from "./live-status"

/** The actual upstream feeds. Listing them is attribution as much as decoration. */
const SOURCES: LogoTickerItem[] = [
  { label: "University of Bremen · AMSR2 ASI", href: "https://seaice.uni-bremen.de" },
  { label: "NSIDC · Sea Ice CDR v6", href: "https://nsidc.org" },
  { label: "NOAA ERDDAP · OISST", href: "https://coastwatch.pfeg.noaa.gov/erddap" },
  { label: "ESA SMOS · Sea surface salinity", href: "https://earth.esa.int/eogateway/missions/smos" },
  { label: "Open-Meteo", href: "https://open-meteo.com" },
  { label: "BYU / NIC · Iceberg tracker", href: "https://www.scp.byu.edu/data/iceberg/" },
  { label: "NOAA ETOPO1 · Bathymetry", href: "https://www.ncei.noaa.gov/products/etopo-global-relief-model" },
  { label: "Copernicus Marine", href: "https://marine.copernicus.eu" },
]

const CAPABILITIES = [
  {
    n: "01",
    title: "Sea-ice forecast",
    body:
      "A ConvLSTM over 45 real AMSR2 days, blended with persistence at a weight measured on a chronological hold-out — not hand-tuned. RMSE 0.0509 against persistence at 0.0549: +7.2% skill, +18 hours ahead.",
  },
  {
    n: "02",
    title: "Iceberg drift",
    body:
      "Live tracked positions advected forward with the observed field, each track carrying its own confidence radius. The radius grows with lead time because the uncertainty does.",
  },
  {
    n: "03",
    title: "Risk-aware routing",
    body:
      "A* over a cost surface built from ice concentration, iceberg proximity and a real bathymetric land mask, so a waypoint never crosses ground the vessel cannot.",
  },
  {
    n: "04",
    title: "Honest provenance",
    body:
      "Every response reports its weakest link and its oldest contributing observation. When a feed goes dark the last real cache is served and labelled as cached — nothing is invented to fill the hole.",
  },
]

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto max-w-[1400px] px-6 pt-32 pb-24 sm:px-10 lg:pt-44">
        <ClipRevealText
          text="SIH26059 · Ministry of Earth Sciences · NCPOR"
          as="p"
          className="ed-mono-label"
          trigger="mount"
        />

        <Heading as="h1" scale="hero" depth className="mt-8 max-w-[18ch]">
          Read the ice before it moves
        </Heading>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <RevealText
            as="p"
            by="word"
            stagger={0.022}
            className="ed-body max-w-[52ch] text-[clamp(1rem,1.5vw,1.3rem)]"
            text="Antarctic resupply runs on a narrow window. We turn live satellite passes into an eighteen-hour forecast, an iceberg drift field and a route that respects both — with the provenance of every number on the surface, where a decision can see it."
          />
          <div className="ed-hairline-t pt-6 lg:border-t-0 lg:pt-0">
            <p className="ed-mono-label">Study area</p>
            <p className="ed-body mt-3 text-[13px]" style={{ opacity: 0.78 }}>
              Weddell Sea sector, 78°S–60°S, 60°W–20°W, on a 50 × 50 grid. Maitri and
              Bharati as endpoints — the two Indian stations the routing actually serves.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- pinned ticker (3.1) */}
      <HorizontalTicker />

      {/* -------------------------------------------------------------- the read */}
      <section id="read" className="mx-auto max-w-[1400px] px-6 py-28 sm:px-10">
        <Heading as="h2" scale="section" className="max-w-[24ch]">
          Four systems, one answer
        </Heading>

        <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <article key={c.n} className="ed-hairline-t pt-5">
              <p className="ed-mono-label m-0">{c.n}</p>
              <Heading as="h3" scale="sub" hoverSignal className="mt-3">
                {c.title}
              </Heading>
              <p className="ed-body mt-4 max-w-[46ch] text-[14px]" style={{ opacity: 0.8 }}>
                {c.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ live signal */}
      <section id="signal" className="mx-auto max-w-[1400px] px-6 py-28 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Heading as="h2" scale="section" className="max-w-[20ch]">
            Right now, on the ice
          </Heading>
          <p className="ed-mono-label ed-mono-label--tight max-w-[34ch]">
            Polled from the running backend every 90 seconds
          </p>
        </div>
        <div className="mt-12">
          <LiveStatus />
        </div>
      </section>

      {/* ----------------------------------------------------------------- sources */}
      <section id="sources" className="py-28">
        <div className="mx-auto mb-12 max-w-[1400px] px-6 sm:px-10">
          <Heading as="h2" scale="section" className="max-w-[22ch]">
            Everything traces back
          </Heading>
          <p className="ed-body mt-5 max-w-[54ch] text-[14px]" style={{ opacity: 0.78 }}>
            Eight upstream feeds, each cached to disk on first success so the system keeps
            answering when the link drops. A cached answer says it is cached.
          </p>
        </div>
        <LogoTicker items={SOURCES} durationSeconds={44} />
      </section>

      {/* ------------------------------------------------------------------ footer */}
      <footer className="ed-hairline-t mx-auto max-w-[1400px] px-6 py-16 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <div>
            <Heading as="h2" scale="sub" className="max-w-[16ch]">
              Antarctic Navigation Intelligence
            </Heading>
            <p className="ed-mono-label mt-4">
              Team Caffeine Geeks · Smart India Hackathon 2026
            </p>
            <a
              href="/"
              className="ed-signal mt-6 inline-block text-[14px] underline decoration-[var(--hairline-strong)] underline-offset-4 transition-colors duration-200"
              style={{ transitionTimingFunction: "var(--ease-out)" }}
            >
              Open the live console →
            </a>
          </div>

          {/* One contained easter egg. Tonal outlier — see the note in CreepyButton.tsx. */}
          <div className="flex flex-col items-start gap-3">
            <p className="ed-mono-label">Do not press</p>
            <CreepyButton aria-label="It is watching the ice too">It sees you</CreepyButton>
          </div>
        </div>
      </footer>
    </>
  )
}
