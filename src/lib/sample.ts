import type { LatLng, Stop, Workspace } from './types'
import { DEFAULT_SETTINGS } from './types'

// synthetic town on a 9x9 street grid; all names and addresses are fake.
// Centered on residential land (Kent East Hill / Covington, WA area) so no
// stop lands on Sea-Tac airport, water, or a freeway on the real basemap.
export const SAMPLE_CENTER = { lat: 47.3775, lng: -122.208 }
const LAT_STEP = 0.00434 // ~0.30 mi
const LNG_STEP = 0.00637

const STREETS = ['Maple St', 'Oak St', 'Pine St', 'Cedar St', 'Elm St', 'Birch St', 'Walnut St', 'Alder St', 'Main St']
const AVENUES = ['1st Ave', '2nd Ave', '3rd Ave', '4th Ave', '5th Ave', '6th Ave', '7th Ave', '8th Ave', '9th Ave']

// the model streets the sample routes actually drive on, for drawing on the map
export function sampleStreetLines(): { name: string; points: LatLng[] }[] {
  const lines: { name: string; points: LatLng[] }[] = []
  const minLng = SAMPLE_CENTER.lng - 4.6 * LNG_STEP
  const maxLng = SAMPLE_CENTER.lng + 4.6 * LNG_STEP
  const minLat = SAMPLE_CENTER.lat - 4.6 * LAT_STEP
  const maxLat = SAMPLE_CENTER.lat + 4.6 * LAT_STEP
  for (let r = 0; r < 9; r++) {
    const lat = SAMPLE_CENTER.lat + (r - 4) * LAT_STEP
    lines.push({ name: STREETS[r], points: [{ lat, lng: minLng }, { lat, lng: maxLng }] })
  }
  for (let c = 0; c < 9; c++) {
    const lng = SAMPLE_CENTER.lng + (c - 4) * LNG_STEP
    lines.push({ name: AVENUES[c], points: [{ lat: minLat, lng }, { lat: maxLat, lng }] })
  }
  return lines
}

// deterministic pseudo-random, stable across runs
function lcg(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

export function sampleWorkspace(): Workspace {
  const depot: Stop = {
    id: 'DEPOT',
    street: '100 School Way',
    city: 'Maplewood',
    state: 'WA',
    zip: '98042',
    lat: SAMPLE_CENTER.lat,
    lng: SAMPLE_CENTER.lng,
  }
  const rand = lcg(42)
  const used = new Set<string>(['4,4'])
  const stops: Stop[] = []
  while (stops.length < 40) {
    const r = Math.floor(rand() * 9)
    const c = Math.floor(rand() * 9)
    const key = `${r},${c}`
    if (used.has(key)) continue
    used.add(key)
    const lat = SAMPLE_CENTER.lat + (r - 4) * LAT_STEP
    const lng = SAMPLE_CENTER.lng + (c - 4) * LNG_STEP
    const onMain = r === 4
    stops.push({
      id: `S${stops.length + 1}`,
      street: `${101 + stops.length * 7} ${STREETS[r]}`,
      city: 'Maplewood',
      state: 'WA',
      zip: '98042',
      lat,
      lng,
      // Main St is the town arterial; stops on it get an east/west zone
      arterialZone: onMain ? (c < 4 ? 'main-west' : 'main-east') : undefined,
    })
  }
  // two routes of 20: one bus cannot serve all 40 stops within a 60-minute
  // max ride, so the sample is split west/east by longitude from the start
  const byLng = [...stops].sort((a, b) => a.lng! - b.lng!)
  const west = byLng.slice(0, 20)
  const east = byLng.slice(20)
  return {
    name: 'Maplewood (sample)',
    depot,
    routes: [
      {
        id: 'R1',
        name: 'Westside AM',
        settings: { ...DEFAULT_SETTINGS },
        stops: west,
        versions: [],
      },
      {
        id: 'R2',
        name: 'Eastside AM',
        settings: { ...DEFAULT_SETTINGS },
        stops: east,
        versions: [],
      },
    ],
  }
}

export function emptyWorkspace(): Workspace {
  return {
    name: 'My school',
    depot: { id: 'DEPOT', street: '', city: '', state: '', zip: '' },
    routes: [
      { id: 'R1', name: 'Route 1 AM', settings: { ...DEFAULT_SETTINGS }, stops: [], versions: [] },
    ],
  }
}
