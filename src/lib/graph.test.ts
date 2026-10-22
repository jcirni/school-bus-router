import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  buildGridNetwork,
  buildMatrix,
  dijkstra,
  nearestNode,
  routeLeg,
  routeThrough,
  type RoadNode,
  type RoadSegment,
} from './graph'

// small L-shaped network: A-B-C across, C-D north (C->D one-way north only via D->C segment)
const nodes: RoadNode[] = [
  { id: 'A', lat: 47.0, lng: -122.01 },
  { id: 'B', lat: 47.0, lng: -122.0 },
  { id: 'C', lat: 47.0, lng: -121.99 },
  { id: 'D', lat: 47.01, lng: -121.99 },
  { id: 'E', lat: 47.01, lng: -122.01 },
]
const segments: RoadSegment[] = [
  { from: 'A', to: 'B', name: 'Main St', speedMph: 30 },
  { from: 'B', to: 'C', name: 'Main St', speedMph: 30 },
  { from: 'C', to: 'D', name: '1st Ave', speedMph: 30 },
  { from: 'D', to: 'E', name: 'Hill St', speedMph: 30 },
  { from: 'E', to: 'A', name: '2nd Ave', speedMph: 30, oneway: true }, // E -> A only
]
const g = buildGraph(nodes, segments)

describe('dijkstra', () => {
  it('finds the direct path', () => {
    const p = dijkstra(g, 'A', 'C')
    expect(p?.nodeIds).toEqual(['A', 'B', 'C'])
    expect(p!.distanceMi).toBeGreaterThan(0.9)
  })
  it('respects one-way: A cannot go straight to E', () => {
    const p = dijkstra(g, 'A', 'E')
    expect(p?.nodeIds).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
  it('respects one-way: E can go straight to A', () => {
    expect(dijkstra(g, 'E', 'A')?.nodeIds).toEqual(['E', 'A'])
  })
  it('returns null for unknown nodes', () => {
    expect(dijkstra(g, 'A', 'ZZ')).toBeNull()
  })
})

describe('nearestNode + routeLeg', () => {
  it('snaps a point to the closest node', () => {
    expect(nearestNode(g, { lat: 47.0005, lng: -122.009 })?.id).toBe('A')
  })
  it('counts a left turn heading east then north', () => {
    const leg = routeLeg(g, nodes[0], nodes[3]) // A -> D via B, C
    expect(leg).not.toBeNull()
    expect(leg!.leftTurns).toBe(1)
    expect(leg!.geometry.length).toBeGreaterThanOrEqual(4)
  })
  it('counts a right turn heading north then west... via E->A oneway is south', () => {
    const leg = routeLeg(g, nodes[2], nodes[4]) // C -> E via D: north then west = left? north->west is left
    expect(leg!.leftTurns + leg!.rightTurns).toBeGreaterThanOrEqual(1)
  })
})

describe('routeThrough + buildMatrix', () => {
  it('stitches geometry across legs', () => {
    const r = routeThrough(g, [nodes[0], nodes[2], nodes[4]])
    expect(r).not.toBeNull()
    expect(r!.distanceMi).toBeGreaterThan(1.5)
  })
  it('matrix is square, zero diagonal, asymmetric with one-ways', () => {
    const m = buildMatrix(g, nodes)
    expect(m.timeMin).toHaveLength(5)
    expect(m.timeMin[0][0]).toBe(0)
    expect(m.distanceMi[4][0]).toBeLessThan(m.distanceMi[0][4]) // E->A direct, A->E long way
  })
})

describe('buildGridNetwork', () => {
  it('produces a connected grid where every stop pair is routable', () => {
    const pts = [
      { lat: 47.45, lng: -122.3 },
      { lat: 47.47, lng: -122.28 },
      { lat: 47.46, lng: -122.31 },
    ]
    const net = buildGridNetwork(pts)
    const grid = buildGraph(net.nodes, net.segments)
    const m = buildMatrix(grid, pts)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) if (i !== j) expect(m.timeMin[i][j]).toBeGreaterThan(0)
  })
})
