"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { feature } from "topojson-client"
import { Button } from "@/components/ui/button"
import type { NavigationData } from "@/lib/types"
import { STATIONS } from "@/lib/stations"

interface GeoFeature {
  type: string
  geometry: any
  properties: any
}

interface Props {
  data?: NavigationData | null
}

function interpolateProjection(raw0: any, raw1: any) {
  const mutate: any = d3.geoProjectionMutator((t: number) => (x: number, y: number) => {
    const [x0, y0] = raw0(x, y)
    const [x1, y1] = raw1(x, y)
    return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)]
  })
  let t = 0
  return Object.assign((mutate as any)(t), {
    alpha(_: number) {
      return arguments.length ? (mutate as any)((t = +_)) : t
    },
  })
}

// Risk color ramp (palette-consistent): cyan (safe) -> amber (caution) -> red (high).
// No green — moderate risk is amber, high risk is red, nothing else.
const riskColor = d3
  .scaleLinear<string>()
  .domain([0, 0.5, 1])
  .range(["#3fd0e0", "#ffb347", "#ff5c5c"])
  .clamp(true)

export function GlobeToMapTransform({ data = null }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [progress, setProgress] = useState([0])
  const [worldData, setWorldData] = useState<GeoFeature[]>([])
  const [rotation, setRotation] = useState([0, 0])
  const [translation, setTranslation] = useState([0, 0])
  const [isDragging, setIsDragging] = useState(false)
  const [lastMouse, setLastMouse] = useState([0, 0])

  const width = 800
  const height = 500

  useEffect(() => {
    const loadWorldData = async () => {
      try {
        const response = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
        const world: any = await response.json()
        const countries = (feature(world, world.objects.countries) as any).features
        setWorldData(countries)
        console.log("[nav] Loaded world data with", countries.length, "countries")
      } catch (error) {
        console.log("[nav] Error loading world data:", error)
        const fallbackData = [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]],
            },
            properties: {},
          },
        ]
        setWorldData(fallbackData)
      }
    }
    loadWorldData()
  }, [])

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true)
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect) setLastMouse([event.clientX - rect.left, event.clientY - rect.top])
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const currentMouse = [event.clientX - rect.left, event.clientY - rect.top]
    const dx = currentMouse[0] - lastMouse[0]
    const dy = currentMouse[1] - lastMouse[1]
    const t = progress[0] / 100
    const sensitivity = t < 0.5 ? 0.5 : 0.25
    setRotation((prev) => [prev[0] + dx * sensitivity, Math.max(-90, Math.min(90, prev[1] - dy * sensitivity))])
    setLastMouse(currentMouse)
  }

  const handleMouseUp = () => setIsDragging(false)

  // PLACEHOLDER_EFFECT
  useEffect(() => {
    if (!svgRef.current || worldData.length === 0) return
    try {
      const svg = d3.select(svgRef.current)
      svg.selectAll("*").remove()

      const t = progress[0] / 100
      const alpha = Math.pow(t, 0.5)
      const scale = d3.scaleLinear().domain([0, 1]).range([200, 120])

      const projection = interpolateProjection(d3.geoOrthographicRaw, d3.geoEquirectangularRaw)
        .scale(scale(alpha))
        .translate([width / 2 + translation[0], height / 2 + translation[1]])
        .rotate([rotation[0], rotation[1]])
        .precision(0.1)
      projection.alpha(alpha)
      const path = d3.geoPath(projection)

      // defs: blur filter used to feather the risk heatmap.
      const defs = svg.append("defs")
      const blur = defs.append("filter").attr("id", "riskBlur").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%")
      blur.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", 3.2)

      // graticule
      const graticule = d3.geoGraticule()
      const gp = path(graticule())
      if (gp) svg.append("path").attr("d", gp).attr("fill", "none").attr("stroke", "#7fb8ff").attr("stroke-width", 0.6).attr("opacity", 0.14)

      // countries
      svg.selectAll(".country").data(worldData).enter().append("path").attr("class", "country")
        .attr("d", (d) => {
          try {
            const s = path(d as any)
            if (!s || s.includes("NaN") || s.includes("Infinity")) return ""
            return s
          } catch { return "" }
        })
        .attr("fill", "rgba(127,184,255,0.05)").attr("stroke", "#7fb8ff").attr("stroke-width", 0.7).attr("opacity", 0.55)

      // sphere outline
      const sphere = path({ type: "Sphere" } as any)
      if (sphere) svg.append("path").attr("d", sphere).attr("fill", "none").attr("stroke", "#3fd0e0").attr("stroke-width", 1).attr("opacity", 0.5)

      // --- Data overlays: only in map mode (t >= 0.5), fading in ---
      if (data && t >= 0.5) {
        // Bounding box of the *rendered* sphere (morph-aware): in globe mode it
        // hugs the globe disc, in flat mode it's the full frame. Used to clip
        // manually-projected markers so none can float outside the globe.
        let sphereBounds: [[number, number], [number, number]] | null = null
        try {
          sphereBounds = path.bounds({ type: "Sphere" } as any)
        } catch {}
        drawOverlays(svg, projection, (t - 0.5) / 0.5, sphereBounds)
      }
      console.log("[nav] Visualization updated, progress:", Math.round(progress[0]), "hasData:", !!data)
    } catch (error) {
      console.log("[nav] Error rendering visualization:", error)
    }
  }, [worldData, progress, rotation, translation, data])

  // PLACEHOLDER_OVERLAY
  function pxPerDeg(projection: any, lat: number, lon: number, deg: number) {
    const a = projection([lon, lat])
    const b = projection([lon, lat + deg])
    if (!a || !b) return 6
    return Math.hypot(a[0] - b[0], a[1] - b[1])
  }

  function drawOverlays(
    svg: any,
    projection: any,
    factor: number,
    sphereBounds: [[number, number], [number, number]] | null,
  ) {
    if (!data) return
    const f = Math.max(0, Math.min(1, factor))

    // Hemisphere clip: in globe / partially-unrolled modes, points on the FAR
    // side of the orthographic sphere still project to valid pixels and would
    // bleed onto the visible face. Skip anything beyond the visible hemisphere
    // (the projection center is at [-rotation]). In near-flat map mode
    // everything is visible. inBox then clamps every point to the *rendered
    // sphere* bounding box (not the whole SVG) so no marker can float outside
    // the globe disc during rotation / the morph.
    const t = progress[0] / 100
    const center: [number, number] = [-rotation[0], -rotation[1]]
    const nearSide = (lon: number, lat: number) =>
      t > 0.92 || d3.geoDistance([lon, lat], center) < Math.PI / 2 - 0.03
    const inBox = (p: [number, number]) => {
      if (sphereBounds) {
        const [[x0, y0], [x1, y1]] = sphereBounds
        return p[0] >= x0 - 1 && p[0] <= x1 + 1 && p[1] >= y0 - 1 && p[1] <= y1 + 1
      }
      return p[0] >= -2 && p[0] <= width + 2 && p[1] >= -2 && p[1] <= height + 2
    }

    // 1. Risk heatmap (feathered via blur filter defined in the effect).
    const grid = data.risk.grid
    const latStep = (grid.lat_max - grid.lat_min) / grid.rows
    const lonStep = (grid.lon_max - grid.lon_min) / grid.cols
    const riskGroup = svg.append("g").attr("filter", "url(#riskBlur)")
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const v = grid.values[r][c]
        if (v < 0.08) continue
        const lat = grid.lat_max - (r + 0.5) * latStep
        const lon = grid.lon_min + (c + 0.5) * lonStep
        if (!nearSide(lon, lat)) continue
        const p = projection([lon, lat])
        if (!p || !inBox(p)) continue
        riskGroup.append("circle").attr("cx", p[0]).attr("cy", p[1]).attr("r", 5)
          .attr("fill", riskColor(v)).attr("opacity", (0.1 + 0.5 * v) * f)
      }
    }

    // 2. Iceberg drift cones + tracks + pulsing markers.
    data.drift.icebergs.forEach((berg) => {
      if (!nearSide(berg.current_position.lon, berg.current_position.lat)) return
      const cur = projection([berg.current_position.lon, berg.current_position.lat])
      if (!cur || !inBox(cur)) return
      const track = berg.predicted_track
        .filter((pt) => nearSide(pt.lon, pt.lat))
        .map((pt) => projection([pt.lon, pt.lat]))
        .filter((p): p is [number, number] => !!p && inBox(p as [number, number]))
      const end = track[track.length - 1]
      if (end) {
        const dx = end[0] - cur[0]
        const dy = end[1] - cur[1]
        const mag = Math.hypot(dx, dy) || 1
        const half = pxPerDeg(projection, berg.current_position.lat, berg.current_position.lon, berg.confidence_radius_km / 111)
        const px = (-dy / mag) * half
        const py = (dx / mag) * half
        const cone = [cur, [end[0] + px, end[1] + py], [end[0] - px, end[1] - py]]
        svg.append("polygon").attr("points", cone.map((p) => p.join(",")).join(" "))
          .attr("fill", "#ff5c5c").attr("opacity", 0.14 * f).attr("stroke", "#ff5c5c").attr("stroke-opacity", 0.3 * f)
        svg.append("path").attr("d", d3.line()([cur, ...track] as any))
          .attr("fill", "none").attr("stroke", "#ff8f8f").attr("stroke-width", 1).attr("stroke-dasharray", "3,2").attr("opacity", 0.7 * f)
      }
      svg.append("circle").attr("cx", cur[0]).attr("cy", cur[1]).attr("r", 3.2)
        .attr("fill", "#ff5c5c").attr("stroke", "#eef3f7").attr("stroke-width", 0.6)
        .attr("class", "iceberg-pulse").attr("opacity", f)
    })

    // 3. Alternative (non-selected) route options as faint dashed ghosts, so
    // the corridors the operator didn't pick are still visible under the active
    // one. The active route is drawn bold on top afterwards.
    const activeId = (data.route as { id?: string }).id
    ;(data.routes ?? []).forEach((r) => {
      if (r.id === activeId) return
      const pts = r.waypoints
        .filter((w) => nearSide(w.lon, w.lat))
        .map((w) => projection([w.lon, w.lat]))
        .filter((p): p is [number, number] => !!p && inBox(p as [number, number]))
      if (pts.length > 1) {
        svg.append("path").attr("d", d3.line()(pts as any)).attr("fill", "none")
          .attr("stroke", r.color).attr("stroke-width", 1.4).attr("stroke-linecap", "round")
          .attr("stroke-dasharray", "4,5").attr("opacity", 0.4 * f)
      }
    })

    // 4. Route polyline with progressive draw.
    const routePts = data.route.waypoints
      .filter((w) => nearSide(w.lon, w.lat))
      .map((w) => projection([w.lon, w.lat]))
      .filter((p): p is [number, number] => !!p && inBox(p as [number, number]))
    if (routePts.length > 1) {
      const activeColor = (data.route as { color?: string }).color ?? "#3fd0e0"
      const line = d3.line()(routePts as any)
      const routePath = svg.append("path").attr("d", line).attr("fill", "none")
        .attr("stroke", activeColor).attr("stroke-width", 2.6).attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round").attr("opacity", 0.95 * f)
        .style("filter", `drop-shadow(0 0 4px ${activeColor})`)
      const node = routePath.node() as SVGPathElement | null
      if (node) {
        const len = node.getTotalLength()
        routePath.attr("stroke-dasharray", len).attr("stroke-dashoffset", len)
          .style("animation", "route-draw 1.6s ease-out forwards")
      }
    }

    // 4. Station markers (Maitri, Bharati).
    ;[STATIONS.maitri, STATIONS.bharati].forEach((st) => {
      if (!nearSide(st.lon, st.lat)) return
      const p = projection([st.lon, st.lat])
      if (!p || !inBox(p)) return
      svg.append("circle").attr("cx", p[0]).attr("cy", p[1]).attr("r", 3.5)
        .attr("fill", "#04070c").attr("stroke", "#3fd0e0").attr("stroke-width", 1.6).attr("opacity", f)
      svg.append("text").attr("x", p[0] + 6).attr("y", p[1] + 3).text(st.name)
        .attr("fill", "#eef3f7").attr("font-size", 9).attr("font-family", "'IBM Plex Mono', monospace")
        .attr("opacity", f).style("text-shadow", "0 0 4px #04070c")
    })
  }

  // PLACEHOLDER_TAIL
  const handleAnimate = () => {
    if (isAnimating) return
    setIsAnimating(true)
    const startProgress = progress[0]
    const endProgress = startProgress === 0 ? 100 : 0
    const duration = 2000
    const startTime = Date.now()
    const animate = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      setProgress([startProgress + (endProgress - startProgress) * eased])
      if (t < 1) requestAnimationFrame(animate)
      else setIsAnimating(false)
    }
    animate()
  }

  const handleReset = () => {
    setRotation([0, 0])
    setTranslation([0, 0])
  }

  const inMapMode = progress[0] > 50

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full rounded-lg bg-transparent cursor-grab active:cursor-grabbing"
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {!inMapMode && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md glass px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-primary">
          {data ? "Unroll globe → reveal Weddell Sea risk field" : "Awaiting data feed…"}
        </div>
      )}
      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        <Button onClick={handleAnimate} disabled={isAnimating} className="cursor-pointer min-w-[120px] rounded glow-cyan">
          {isAnimating ? "Animating…" : progress[0] === 0 ? "Unroll Globe" : "Roll to Globe"}
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          className="cursor-pointer min-w-[80px] border-primary/30 hover:bg-primary/10 bg-transparent rounded"
        >
          Reset
        </Button>
      </div>
    </div>
  )
}




