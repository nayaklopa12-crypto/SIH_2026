// Demo station coordinates — mirror backend/config.py STATIONS. Proxy positions
// inside the Weddell Sea study box (the real Maitri/Bharati lie elsewhere; see
// README limitations).

export interface Station {
  key: string
  name: string
  lat: number
  lon: number
}

export const STATIONS: Record<string, Station> = {
  maitri: { key: "maitri", name: "Aurora Base", lat: -69.0, lon: -22.0 },
  bharati: { key: "bharati", name: "Horizon Station", lat: -76.0, lon: -55.0 },
}

// Study-area bounds (Section 3). Kept here so the frontend never hardcodes them
// ad hoc; the grid in each API response also carries these.
export const STUDY_AREA = {
  lat_min: -78,
  lat_max: -60,
  lon_min: -60,
  lon_max: -20,
}
