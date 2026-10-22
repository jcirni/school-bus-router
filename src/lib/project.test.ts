import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject, shareableExport } from './project'
import { sampleWorkspace } from './sample'
import { buildGraph, buildGridNetwork } from './graph'
import { runRoute } from './pipeline'

describe('project file', () => {
  it('round-trips a workspace', () => {
    const ws = sampleWorkspace()
    const back = parseProject(serializeProject(ws))
    expect(back).toEqual(ws)
  })
  it('rejects other JSON', () => {
    expect(() => parseProject('{"format":"other"}')).toThrow()
    expect(() => parseProject('{"format":"school-bus-router-project","version":1}')).toThrow()
  })
})

describe('sample data + pipeline', () => {
  it('ships 40 fake stops with coordinates', () => {
    const ws = sampleWorkspace()
    expect(ws.routes[0].stops).toHaveLength(40)
    expect(ws.routes[0].stops.every((s) => s.lat !== undefined && s.lng !== undefined)).toBe(true)
  })
  it('runs all three profiles fully offline on the sample grid', () => {
    const ws = sampleWorkspace()
    const route = ws.routes[0]
    const pts = [{ lat: ws.depot.lat!, lng: ws.depot.lng! }, ...route.stops.map((s) => ({ lat: s.lat!, lng: s.lng! }))]
    const net = buildGridNetwork(pts)
    const graph = buildGraph(net.nodes, net.segments)
    const results = runRoute(graph, ws.depot as { lat: number; lng: number }, route.stops, route.settings)
    expect(results.map((r) => r.profile)).toEqual(['fastest', 'fuel', 'safest'])
    for (const r of results) {
      expect(r.order).toHaveLength(40)
      expect(new Set(r.order).size).toBe(40)
      expect(r.scorecard.totalDistanceMi).toBeGreaterThan(0)
      expect(r.scorecard.totalTimeMin).toBeGreaterThan(0)
      expect(r.geometry.length).toBeGreaterThan(40)
    }
  })
})

describe('shareableExport', () => {
  it('contains coordinates and scorecard but no street addresses', () => {
    const ws = sampleWorkspace()
    const route = ws.routes[0]
    const result = {
      profile: 'fastest' as const,
      order: route.stops.slice(0, 3).map((s) => s.id),
      geometry: [{ lat: 47.45, lng: -122.3 }],
      scorecard: {
        totalTimeMin: 10, totalDistanceMi: 3, fuelGallons: 0.4, fuelCost: 1.6, co2Kg: 4,
        leftTurns: 1, uTurns: 0, maxRideMin: 9, avgRideMin: 5, stopCount: 3, solver: 'test',
      },
      rideViolations: [],
    }
    const share = shareableExport(route, result)
    const text = JSON.stringify(share)
    expect(text).not.toContain('Maple St')
    expect(text).not.toContain('street')
    expect(share.stops).toHaveLength(3)
    expect(share.stops[0].lat).toBeDefined()
    expect(share.scorecard.stopCount).toBe(3)
  })
})
