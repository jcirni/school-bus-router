import type { Stop, Workspace } from './types'
import { DEFAULT_SETTINGS } from './types'

// synthetic town on a 9x9 street grid; all names and addresses are fake
export const SAMPLE_CENTER = { lat: 47.45, lng: -122.3 }
const LAT_STEP = 0.00434 // ~0.30 mi
const LNG_STEP = 0.00637

const STREETS = ['Maple St', 'Oak St', 'Pine St', 'Cedar St', 'Elm St', 'Birch St', 'Walnut St', 'Alder St', 'Main St']

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
    zip: '98001',
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
      zip: '98001',
      lat,
      lng,
      // Main St is the town arterial; stops on it get an east/west zone
      arterialZone: onMain ? (c < 4 ? 'main-west' : 'main-east') : undefined,
    })
  }
  return {
    name: 'Maplewood (sample)',
    depot,
    routes: [
      {
        id: 'R1',
        name: 'Elm St AM',
        settings: { ...DEFAULT_SETTINGS },
        stops,
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
