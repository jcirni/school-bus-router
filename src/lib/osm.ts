import type { RoadNode, RoadSegment } from './graph'
import type { LatLng } from './types'

// Real street network from OpenStreetMap, downloaded for the stops' area
// only (same area the map tiles already show). The download is a bounding
// box query to the Overpass API — individual stop addresses are never sent.

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

export function bboxForPoints(points: LatLng[], padMi = 0.6): BBox {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const padLat = padMi / 69
  const padLng = padMi / (69 * Math.cos((midLat * Math.PI) / 180))
  return {
    south: Math.min(...lats) - padLat,
    west: Math.min(...lngs) - padLng,
    north: Math.max(...lats) + padLat,
    east: Math.max(...lngs) + padLng,
  }
}

export function bboxAreaSqMi(b: BBox): number {
  const h = (b.north - b.south) * 69
  const w = (b.east - b.west) * 69 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180)
  return h * w
}

const DRIVABLE = [
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified',
  'residential', 'living_street', 'service', 'road',
]

const CLASS_SPEED_MPH: Record<string, number> = {
  motorway: 60, motorway_link: 35, trunk: 55, trunk_link: 35,
  primary: 40, primary_link: 30, secondary: 35, secondary_link: 30,
  tertiary: 30, tertiary_link: 25, unclassified: 25, residential: 25,
  living_street: 15, service: 15, road: 25,
}

export function overpassQuery(b: BBox): string {
  return `[out:json][timeout:60];way["highway"~"^(${DRIVABLE.join('|')})$"](${b.south},${b.west},${b.north},${b.east});out body;>;out skel qt;`
}

export function parseMaxspeedMph(tags: Record<string, string>): number | undefined {
  const raw = tags.maxspeed
  if (!raw) return undefined
  const num = parseFloat(raw)
  if (Number.isNaN(num) || num <= 0) return undefined
  return /km\/h|kmh/i.test(raw) ? num * 0.621371 : num
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

export function parseOverpass(json: unknown): { nodes: RoadNode[]; segments: RoadSegment[] } {
  const elements = ((json as { elements?: OverpassElement[] })?.elements ?? []) as OverpassElement[]
  const nodeMap = new Map<number, RoadNode>()
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodeMap.set(el.id, { id: `n${el.id}`, lat: el.lat, lng: el.lon })
    }
  }
  const segments: RoadSegment[] = []
  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes || !el.tags) continue
    const highway = el.tags.highway
    if (!highway || !DRIVABLE.includes(highway)) continue
    const onewayTag = el.tags.oneway
    const impliedOneway = highway === 'motorway' || highway === 'motorway_link' || el.tags.junction === 'roundabout'
    const speedMph = parseMaxspeedMph(el.tags) ?? CLASS_SPEED_MPH[highway] ?? 25
    for (let i = 0; i < el.nodes.length - 1; i++) {
      const a = nodeMap.get(el.nodes[i])
      const b = nodeMap.get(el.nodes[i + 1])
      if (!a || !b || a.id === b.id) continue
      if (onewayTag === '-1') {
        segments.push({ from: b.id, to: a.id, name: el.tags.name, speedMph, oneway: true })
      } else {
        segments.push({
          from: a.id,
          to: b.id,
          name: el.tags.name,
          speedMph,
          oneway: onewayTag === 'yes' || onewayTag === 'true' || onewayTag === '1' || impliedOneway,
        })
      }
    }
  }
  const used = new Set(segments.flatMap((s) => [s.from, s.to]))
  return { nodes: [...nodeMap.values()].filter((n) => used.has(n.id)), segments }
}

// disconnected extract pieces (roads clipped at the box edge, parking
// aisles) would strand stops; keep only the biggest connected component
export function largestComponent(nodes: RoadNode[], segments: RoadSegment[]): { nodes: RoadNode[]; segments: RoadSegment[] } {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  for (const s of segments) {
    if (!parent.has(s.from)) parent.set(s.from, s.from)
    if (!parent.has(s.to)) parent.set(s.to, s.to)
    const ra = find(s.from)
    const rb = find(s.to)
    if (ra !== rb) parent.set(ra, rb)
  }
  const sizes = new Map<string, number>()
  for (const id of parent.keys()) sizes.set(find(id), (sizes.get(find(id)) ?? 0) + 1)
  let best: string | null = null
  let bestSize = 0
  for (const [root, size] of sizes) {
    if (size > bestSize) {
      best = root
      bestSize = size
    }
  }
  if (!best) return { nodes: [], segments: [] }
  const keep = new Set([...parent.keys()].filter((id) => find(id) === best))
  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    segments: segments.filter((s) => keep.has(s.from) && keep.has(s.to)),
  }
}

type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

// public Overpass instances; tried in order, each with its own timeout
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

export async function fetchOsmNetwork(
  fetchFn: FetchFn,
  points: LatLng[],
  timeoutMs = 60000,
): Promise<{ nodes: RoadNode[]; segments: RoadSegment[]; bbox: BBox }> {
  const bbox = bboxForPoints(points)
  const body = `data=${encodeURIComponent(overpassQuery(bbox))}`
  let lastError: unknown = null
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res
      try {
        res = await fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) throw new Error(`OpenStreetMap download failed (HTTP ${res.status})`)
      const parsed = parseOverpass(await res.json())
      const network = largestComponent(parsed.nodes, parsed.segments)
      if (network.nodes.length < 20) throw new Error('Too little road data in this area')
      return { ...network, bbox }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OpenStreetMap download failed')
}
