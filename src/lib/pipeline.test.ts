import { describe, expect, it } from 'vitest'
import { buildGraph, buildGridNetwork } from './graph'
import { runRoute } from './pipeline'
import { sampleWorkspace } from './sample'
import { DEFAULT_SETTINGS, type Stop } from './types'

const stop = (id: string, lat: number, lng: number): Stop => ({
  id, street: `${id} St`, city: 'X', state: 'WA', zip: '98000', lat, lng,
})

describe('runRoute stop times', () => {
  const depot = { lat: 47.45, lng: -122.3 }
  const stops = [stop('A', 47.452, -122.298), stop('B', 47.448, -122.305), stop('C', 47.455, -122.31)]
  const net = buildGridNetwork([depot, ...stops.map((s) => ({ lat: s.lat!, lng: s.lng! }))])
  const graph = buildGraph(net.nodes, net.segments)
  const results = runRoute(graph, depot, stops, { ...DEFAULT_SETTINGS })

  it('gives a per-stop arrival time aligned with the stop order', () => {
    for (const r of results) {
      expect(r.stopTimesMin).toBeDefined()
      expect(r.stopTimesMin).toHaveLength(r.order.length)
      const times = r.stopTimesMin!
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
      // last pickup happens before the bus finishes back at the depot
      expect(times[times.length - 1]).toBeLessThan(r.scorecard.totalTimeMin)
    }
  })
})

describe('sample routes respect the default 60-minute max ride', () => {
  const ws = sampleWorkspace()
  for (const route of ws.routes) {
    it(`${route.name}: fastest profile has no ride-time violations`, () => {
      const net = buildGridNetwork([
        { lat: ws.depot.lat!, lng: ws.depot.lng! },
        ...route.stops.map((s) => ({ lat: s.lat!, lng: s.lng! })),
      ])
      const graph = buildGraph(net.nodes, net.segments)
      const results = runRoute(graph, { lat: ws.depot.lat!, lng: ws.depot.lng! }, route.stops, route.settings)
      const fastest = results.find((r) => r.profile === 'fastest')!
      expect(fastest.rideViolations).toEqual([])
      expect(fastest.scorecard.totalTimeMin).toBeLessThan(75)
    })
  }
})
