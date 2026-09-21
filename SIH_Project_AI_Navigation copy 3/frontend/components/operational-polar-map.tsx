"use client"

// Operational polar map (Section 6b). Leaflet in the true Antarctic polar
// stereographic projection (EPSG:3031), rendering the SAME shared data as the
// hero map. MUST be imported with { ssr: false } — Leaflet needs window/document.

import { Fragment, useMemo, useState } from "react"
import { X } from "lucide-react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import proj4 from "proj4"
import "proj4leaflet"
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"

import type { NavigationData } from "@/lib/types"
import { STATIONS, STUDY_AREA } from "@/lib/stations"

// Register the Antarctic polar stereographic CRS with proj4, then build a
// Leaflet CRS from it (proj4leaflet). Resolutions/origin follow NASA's published
// GIBS EPSG:3031 example so the base tiles align.
proj4.defs(
  "EPSG:3031",
  "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
)

const EPSG3031 = new (L as any).Proj.CRS(
  "EPSG:3031",
  "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
  {
    origin: [-4194304, 4194304],
    resolutions: [8192, 4096, 2048, 1024, 512, 256],
    bounds: (L as any).bounds([-4194304, -4194304], [4194304, 4194304]),
  },
)

// NASA GIBS WMTS tile template for EPSG:3031 (see gibs-api-docs). A fixed austral
// summer date guarantees imagery coverage. If tiles fail, the navy map
// background still shows (never a broken white screen).
const GIBS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg"

// PLACEHOLDER_BODY
function lerp(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

function riskColor(v: number): string {
  // Palette-consistent ramp: cyan (safe) -> amber (caution) -> red (hazard). No green.
  const cyan = [63, 208, 224]
  const amber = [255, 179, 71]
  const red = [255, 92, 92]
  const c = v < 0.5 ? lerp(cyan, amber, v / 0.5) : lerp(amber, red, (v - 0.5) / 0.5)
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function riskFeatureCollection(grid: NavigationData["risk"]["grid"]) {
  const latStep = (grid.lat_max - grid.lat_min) / grid.rows
  const lonStep = (grid.lon_max - grid.lon_min) / grid.cols
  const features: any[] = []
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const v = grid.values[r][c]
      if (v < 0.08) continue
      const north = grid.lat_max - r * latStep
      const south = north - latStep
      const west = grid.lon_min + c * lonStep
      const east = west + lonStep
      features.push({
        type: "Feature",
        properties: { risk: v },
        geometry: {
          type: "Polygon",
          coordinates: [[[west, north], [east, north], [east, south], [west, south], [west, north]]],
        },
      })
    }
  }
  return { type: "FeatureCollection", features } as any
}

function FitStudyArea() {
  const map = useMap()
  useMemo(() => {
    try {
      // Fit to the study box but cap the fit zoom so the view opens on the full
      // Weddell-sector hemisphere rather than snapping to max zoom (the old
      // "zoomed-in-only" bug). minZoom on the map still lets the user pull all
      // the way out to the whole polar projection.
      map.fitBounds(
        [
          [STUDY_AREA.lat_min, STUDY_AREA.lon_min],
          [STUDY_AREA.lat_max, STUDY_AREA.lon_max],
        ],
        { padding: [24, 24], maxZoom: 3 },
      )
    } catch (e) {
      console.log("[nav] Leaflet fitBounds error:", e)
    }
    return null
  }, [map])
  return null
}

type Selected =
  | { kind: "iceberg"; id: string; lat: number; lon: number; radiusKm: number; track: { lat: number; lon: number; hours_ahead: number }[] }
  | { kind: "station"; name: string; lat: number; lon: number }
  | { kind: "route"; distanceNm: number; etaHours: number; confidence: number; waypoints: number }

// Interactive overlays live in a child of MapContainer so they can call useMap()
// to fly/zoom on click. Selection is lifted to the parent via onSelect.
function InteractiveLayers({
  data,
  bergIcon,
  onSelect,
}: {
  data: NavigationData
  bergIcon: L.DivIcon
  onSelect: (s: Selected) => void
}) {
  const map = useMap()
  const zoomTo = (lat: number, lon: number) =>
    map.flyTo([lat, lon], Math.max(map.getZoom(), 4), { duration: 0.7 })
  const activeColor = (data.route as { color?: string }).color ?? "#3fd0e0"

  return (
    <>
      {data.drift.icebergs.map((berg) => {
        const cur: [number, number] = [berg.current_position.lat, berg.current_position.lon]
        const track: [number, number][] = berg.predicted_track.map((p) => [p.lat, p.lon])
        const end = track[track.length - 1]
        let cone: [number, number][] | null = null
        if (end) {
          const dLat = end[0] - cur[0]
          const dLon = end[1] - cur[1]
          const mag = Math.hypot(dLat, dLon) || 1
          const rDeg = berg.confidence_radius_km / 111
          const pLat = (-dLon / mag) * rDeg
          const pLon = (dLat / mag) * rDeg
          cone = [cur, [end[0] + pLat, end[1] + pLon], [end[0] - pLat, end[1] - pLon]]
        }
        const select = () => {
          onSelect({ kind: "iceberg", id: berg.id, lat: cur[0], lon: cur[1], radiusKm: berg.confidence_radius_km, track: berg.predicted_track })
          zoomTo(cur[0], cur[1])
        }
        return (
          <Fragment key={berg.id}>
            {cone && (
              <Polygon positions={cone} pathOptions={{ color: "#ff5c5c", weight: 1, fillColor: "#ff5c5c", fillOpacity: 0.15 }} eventHandlers={{ click: select }} />
            )}
            <Polyline positions={[cur, ...track]} pathOptions={{ color: "#ff8f8f", weight: 1.5, dashArray: "4 3" }} eventHandlers={{ click: select }} />
            <Marker position={cur} icon={bergIcon} eventHandlers={{ click: select }}>
              <Tooltip>{berg.id} · ±{berg.confidence_radius_km} km</Tooltip>
            </Marker>
          </Fragment>
        )
      })}
      {/* __ILAYERS_TAIL__ */}
      {/* Alternative (non-selected) route options drawn as faint ghosts so the
          operator can see the corridors they didn't pick. The active route is
          drawn bold on top below. */}
      {data.routes?.map((r) => {
        const activeId = (data.route as { id?: string }).id
        if (r.id === activeId || r.waypoints.length < 2) return null
        return (
          <Polyline
            key={`ghost-${r.id}`}
            positions={r.waypoints.map((w) => [w.lat, w.lon]) as [number, number][]}
            pathOptions={{ color: r.color, weight: 1.8, opacity: 0.4, dashArray: "5 6" }}
            eventHandlers={{
              click: () => {
                const pts = r.waypoints.map((w) => [w.lat, w.lon]) as [number, number][]
                map.fitBounds(pts, { padding: [40, 40], maxZoom: 4 })
                onSelect({
                  kind: "route",
                  distanceNm: r.distance_nm,
                  etaHours: r.estimated_time_hours,
                  confidence: r.route_confidence,
                  waypoints: r.waypoints.length,
                })
              },
            }}
          >
            <Tooltip>{r.label} · {r.distance_nm.toFixed(0)} nm</Tooltip>
          </Polyline>
        )
      })}
      {data.route.waypoints.length > 1 && (
        <Polyline
          positions={data.route.waypoints.map((w) => [w.lat, w.lon]) as [number, number][]}
          pathOptions={{ color: activeColor, weight: 3.4, opacity: 1 }}
          eventHandlers={{
            click: () => {
              const pts = data.route.waypoints.map((w) => [w.lat, w.lon]) as [number, number][]
              map.fitBounds(pts, { padding: [40, 40], maxZoom: 4 })
              onSelect({
                kind: "route",
                distanceNm: data.route.distance_nm,
                etaHours: data.route.estimated_time_hours,
                confidence: data.route.route_confidence,
                waypoints: data.route.waypoints.length,
              })
            },
          }}
        />
      )}

      {[STATIONS.maitri, STATIONS.bharati].map((st) => (
        <CircleMarker
          key={st.key}
          center={[st.lat, st.lon]}
          radius={6}
          pathOptions={{ color: "#3fd0e0", weight: 2, fillColor: "#04070c", fillOpacity: 1 }}
          eventHandlers={{ click: () => { onSelect({ kind: "station", name: st.name, lat: st.lat, lon: st.lon }); zoomTo(st.lat, st.lon) } }}
        >
          <Tooltip permanent direction="top" className="!bg-transparent !border-0 !shadow-none !text-primary !font-mono">
            {st.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}

export default function OperationalPolarMap({ data }: { data: NavigationData | null }) {
  const bergIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: '<div class="leaflet-iceberg-pulse" style="width:12px;height:12px"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
    [],
  )

  const riskFC = useMemo(() => (data ? riskFeatureCollection(data.risk.grid) : null), [data])
  const [selected, setSelected] = useState<Selected | null>(null)

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg" style={{ background: "#06101f" }}>
      <MapContainer
        crs={EPSG3031 as any}
        center={[-70, -40]}
        zoom={2}
        minZoom={0}
        maxZoom={5}
        style={{ height: "100%", width: "100%", background: "#06101f" }}
        attributionControl
      >
        <TileLayer
          url={GIBS_URL}
          // @ts-expect-error custom GIBS params consumed by the template
          layer="MODIS_Terra_CorrectedReflectance_TrueColor"
          time="2021-12-21"
          tileMatrixSet="250m"
          tileSize={512}
          noWrap
          bounds={[
            [-90, -180],
            [-40, 180],
          ]}
          attribution="Imagery &copy; NASA GIBS"
        />
        <FitStudyArea />
        {data && riskFC && (
          <GeoJSON
            key={data.risk.generated_at}
            data={riskFC}
            interactive={false}
            style={(feature: any) => {
              const v = feature.properties.risk as number
              return { fillColor: riskColor(v), fillOpacity: 0.15 + 0.55 * v, weight: 0, color: riskColor(v) }
            }}
          />
        )}

        {data && <InteractiveLayers data={data} bergIcon={bergIcon} onSelect={setSelected} />}
        {/* PLACEHOLDER_LAYERS */}
      </MapContainer>

      {selected && (
        <div className="absolute right-3 top-3 z-[1000] w-60 rounded-lg glass p-3 text-xs shadow-lg">
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="font-mono uppercase tracking-widest text-primary">
              {selected.kind === "iceberg" ? "Iceberg" : selected.kind === "station" ? "Station" : "Route"}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {selected.kind === "iceberg" && (
            <dl className="flex flex-col gap-1.5 font-mono text-muted-foreground">
              <div className="flex justify-between"><dt>ID</dt><dd className="text-foreground">{selected.id}</dd></div>
              <div className="flex justify-between"><dt>Lat</dt><dd className="text-foreground">{selected.lat.toFixed(3)}°</dd></div>
              <div className="flex justify-between"><dt>Lon</dt><dd className="text-foreground">{selected.lon.toFixed(3)}°</dd></div>
              <div className="flex justify-between"><dt>Uncertainty</dt><dd className="text-[#ff8f8f]">±{selected.radiusKm} km</dd></div>
              <div className="flex justify-between"><dt>Track pts</dt><dd className="text-foreground">{selected.track.length}</dd></div>
              {selected.track.length > 0 && (
                <div className="mt-1 border-t border-primary/15 pt-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Predicted drift</div>
                  {selected.track.map((p, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span>+{p.hours_ahead}h</span>
                      <span className="text-foreground">{p.lat.toFixed(2)}, {p.lon.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </dl>
          )}
          {selected.kind === "station" && (
            <dl className="flex flex-col gap-1.5 font-mono text-muted-foreground">
              <div className="flex justify-between"><dt>Name</dt><dd className="text-foreground">{selected.name}</dd></div>
              <div className="flex justify-between"><dt>Lat</dt><dd className="text-foreground">{selected.lat.toFixed(3)}°</dd></div>
              <div className="flex justify-between"><dt>Lon</dt><dd className="text-foreground">{selected.lon.toFixed(3)}°</dd></div>
            </dl>
          )}
          {selected.kind === "route" && (
            <dl className="flex flex-col gap-1.5 font-mono text-muted-foreground">
              <div className="flex justify-between"><dt>Distance</dt><dd className="text-foreground">{selected.distanceNm.toFixed(0)} nm</dd></div>
              <div className="flex justify-between"><dt>ETA @10kn</dt><dd className="text-foreground">{selected.etaHours.toFixed(1)} h</dd></div>
              <div className="flex justify-between"><dt>Confidence</dt><dd className="text-primary">{(selected.confidence * 100).toFixed(0)}%</dd></div>
              <div className="flex justify-between"><dt>Waypoints</dt><dd className="text-foreground">{selected.waypoints}</dd></div>
            </dl>
          )}
        </div>
      )}
      {!data && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center text-xs font-mono text-primary">
          Awaiting data feed…
        </div>
      )}
    </div>
  )
}

