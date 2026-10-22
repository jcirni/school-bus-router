import type { LatLng } from './types'
import { bearingDeg, classifyTurn, haversineMi, headingChangeDeg } from './geo'

export interface RoadNode extends LatLng {
  id: string
}

export interface RoadSegment {
  from: string
  to: string
  name?: string
  speedMph?: number
  oneway?: boolean
}

interface AdjEdge {
  to: string
  lengthMi: number
  timeMin: number
  name?: string
}

export interface Graph {
  nodes: Map<string, RoadNode>
  adj: Map<string, AdjEdge[]>
}

const DEFAULT_SPEED = 25

export function buildGraph(nodes: RoadNode[], segments: RoadSegment[]): Graph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const adj = new Map<string, AdjEdge[]>(nodes.map((n) => [n.id, []]))
  const add = (a: RoadNode, b: RoadNode, s: RoadSegment) => {
    const lengthMi = haversineMi(a, b)
    const timeMin = (lengthMi / (s.speedMph ?? DEFAULT_SPEED)) * 60
    adj.get(a.id)!.push({ to: b.id, lengthMi, timeMin, name: s.name })
  }
  for (const s of segments) {
    const a = nodeMap.get(s.from)
    const b = nodeMap.get(s.to)
    if (!a || !b) continue
    add(a, b, s)
    if (!s.oneway) add(b, a, s)
  }
  return { nodes: nodeMap, adj }
}

export interface PathResult {
  nodeIds: string[]
  distanceMi: number
  timeMin: number
}

export function dijkstra(g: Graph, start: string, end: string): PathResult | null {
  if (!g.nodes.has(start) || !g.nodes.has(end)) return null
  const dist = new Map<string, number>([[start, 0]])
  const time = new Map<string, number>([[start, 0]])
  const prev = new Map<string, string>()
  const open: [number, string][] = [[0, start]]
  const settled = new Set<string>()
  while (open.length) {
    open.sort((a, b) => a[0] - b[0])
    const [d, u] = open.shift()!
    if (settled.has(u)) continue
    settled.add(u)
    if (u === end) break
    for (const e of g.adj.get(u) ?? []) {
      const nd = d + e.lengthMi
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd)
        time.set(e.to, (time.get(u) ?? 0) + e.timeMin)
        prev.set(e.to, u)
        open.push([nd, e.to])
      }
    }
  }
  if (!settled.has(end) && start !== end) return null
  const nodeIds: string[] = []
  let cur: string | undefined = end
  while (cur) {
    nodeIds.unshift(cur)
    if (cur === start) break
    cur = prev.get(cur)
  }
  if (nodeIds[0] !== start) return null
  return { nodeIds, distanceMi: dist.get(end) ?? 0, timeMin: time.get(end) ?? 0 }
}

export function nearestNode(g: Graph, p: LatLng): RoadNode | null {
  let best: RoadNode | null = null
  let bestD = Infinity
  for (const n of g.nodes.values()) {
    const d = haversineMi(p, n)
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

export interface LegResult {
  geometry: LatLng[]
  distanceMi: number
  timeMin: number
  leftTurns: number
  rightTurns: number
  uTurns: number
}

function countTurns(geometry: LatLng[], names: (string | undefined)[]): { left: number; right: number; uturn: number } {
  let left = 0
  let right = 0
  let uturn = 0
  for (let i = 1; i < geometry.length - 1; i++) {
    const b1 = bearingDeg(geometry[i - 1], geometry[i])
    const b2 = bearingDeg(geometry[i], geometry[i + 1])
    if (b1 === b2) continue
    const kind = classifyTurn(headingChangeDeg(b1, b2))
    // gentle bends on the same street are not maneuvers
    if (kind === 'straight' && names[i] === names[i - 1]) continue
    if (kind === 'left') left++
    else if (kind === 'right') right++
    else if (kind === 'uturn') uturn++
  }
  return { left, right, uturn }
}

export function routeLeg(g: Graph, a: LatLng, b: LatLng): LegResult | null {
  const na = nearestNode(g, a)
  const nb = nearestNode(g, b)
  if (!na || !nb) return null
  const path = dijkstra(g, na.id, nb.id)
  if (!path) return null
  const geometry: LatLng[] = []
  const names: (string | undefined)[] = []
  for (let i = 0; i < path.nodeIds.length; i++) {
    const n = g.nodes.get(path.nodeIds[i])!
    geometry.push({ lat: n.lat, lng: n.lng })
    if (i === 0) names.push(undefined)
    else {
      const e = (g.adj.get(path.nodeIds[i - 1]) ?? []).find((x) => x.to === path.nodeIds[i])
      names.push(e?.name)
    }
  }
  if (a.lat !== na.lat || a.lng !== na.lng) {
    geometry.unshift({ lat: a.lat, lng: a.lng })
    names.unshift(undefined)
  }
  if (b.lat !== nb.lat || b.lng !== nb.lng) {
    geometry.push({ lat: b.lat, lng: b.lng })
    names.push(names[names.length - 1])
  }
  const t = countTurns(geometry, names)
  return {
    geometry,
    distanceMi: path.distanceMi,
    timeMin: path.timeMin,
    leftTurns: t.left,
    rightTurns: t.right,
    uTurns: t.uturn,
  }
}

// full route through points in order; geometry stitched from legs
export function routeThrough(g: Graph, points: LatLng[]): LegResult | null {
  let geometry: LatLng[] = []
  let distanceMi = 0
  let timeMin = 0
  let left = 0
  let right = 0
  let uturn = 0
  for (let i = 0; i < points.length - 1; i++) {
    const leg = routeLeg(g, points[i], points[i + 1])
    if (!leg) return null
    geometry = geometry.length ? [...geometry, ...leg.geometry.slice(1)] : leg.geometry
    distanceMi += leg.distanceMi
    timeMin += leg.timeMin
    left += leg.leftTurns
    right += leg.rightTurns
    uturn += leg.uTurns
  }
  return { geometry, distanceMi, timeMin, leftTurns: left, rightTurns: right, uTurns: uturn }
}

export interface Matrix {
  timeMin: number[][]
  distanceMi: number[][]
  leftTurns: number[][]
}

// pairwise legs between all points; unreachable pairs fall back to a straight-line estimate
export function buildMatrix(g: Graph, points: LatLng[]): Matrix {
  const n = points.length
  const timeMin = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const distanceMi = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const leftTurns = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const leg = routeLeg(g, points[i], points[j])
      if (leg) {
        timeMin[i][j] = leg.timeMin
        distanceMi[i][j] = leg.distanceMi
        leftTurns[i][j] = leg.leftTurns + leg.uTurns * 2
      } else {
        const d = haversineMi(points[i], points[j])
        distanceMi[i][j] = d
        timeMin[i][j] = (d / 20) * 60
      }
    }
  }
  return { timeMin, distanceMi, leftTurns }
}

// synthetic street grid over a bounding box, used for the offline demo and tests
export function buildGridNetwork(points: LatLng[]): { nodes: RoadNode[]; segments: RoadSegment[] } {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const pad = 0.01
  const minLat = Math.min(...lats) - pad
  const maxLat = Math.max(...lats) + pad
  const minLng = Math.min(...lngs) - pad
  const maxLng = Math.max(...lngs) + pad
  const rows = 9
  const cols = 9
  const nodes: RoadNode[] = []
  const segments: RoadSegment[] = []
  const id = (r: number, c: number) => `g${r}_${c}`
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({
        id: id(r, c),
        lat: minLat + ((maxLat - minLat) * r) / (rows - 1),
        lng: minLng + ((maxLng - minLng) * c) / (cols - 1),
      })
    }
  }
  const midRow = Math.floor(rows / 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1)
        segments.push({
          from: id(r, c),
          to: id(r, c + 1),
          name: r === midRow ? 'Main St' : `${(r + 1) * 100} Oak St`,
          speedMph: r === midRow ? 35 : 25,
        })
      if (r < rows - 1)
        segments.push({
          from: id(r, c),
          to: id(r + 1, c),
          name: `${c + 1}th Ave`,
          speedMph: 25,
          // center avenue is one-way north, like a real downtown street
          oneway: c === Math.floor(cols / 2),
        })
    }
  }
  return { nodes, segments }
}
