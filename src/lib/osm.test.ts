import { describe, expect, it } from 'vitest'
import { bboxAreaSqMi, bboxForPoints, fetchOsmNetwork, largestComponent, parseMaxspeedMph, parseOverpass } from './osm'
import { buildGraph, dijkstra } from './graph'

const fixture = {
  elements: [
    { type: 'node', id: 1, lat: 47.0, lon: -122.0 },
    { type: 'node', id: 2, lat: 47.0, lon: -121.99 },
    { type: 'node', id: 3, lat: 47.01, lon: -121.99 },
    { type: 'node', id: 4, lat: 47.01, lon: -122.0 },
    // isolated pair, its own tiny component
    { type: 'node', id: 8, lat: 47.05, lon: -121.9 },
    { type: 'node', id: 9, lat: 47.05, lon: -121.89 },
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Maple St', maxspeed: '25 mph' } },
    { type: 'way', id: 11, nodes: [3, 4, 1], tags: { highway: 'residential', name: 'Oak St', oneway: 'yes' } },
    { type: 'way', id: 12, nodes: [4, 3], tags: { highway: 'footway', name: 'Trail' } },
    { type: 'way', id: 13, nodes: [8, 9], tags: { highway: 'service', name: 'Alley' } },
  ],
}

describe('parseOverpass', () => {
  const { nodes, segments } = parseOverpass(fixture)

  it('keeps drivable ways, drops footways, maps speed limits', () => {
    expect(nodes).toHaveLength(6)
    expect(segments.some((s) => s.name === 'Trail')).toBe(false)
    const maple = segments.filter((s) => s.name === 'Maple St')
    expect(maple).toHaveLength(2)
    expect(maple[0].speedMph).toBe(25)
    expect(maple[0].oneway).toBeFalsy()
  })

  it('marks one-way ways so the graph only traverses them forward', () => {
    const g = buildGraph(nodes, segments)
    // Oak St runs 3 -> 4 -> 1 one-way; reverse needs the Maple St loop
    expect(dijkstra(g, 'n3', 'n1')?.nodeIds).toEqual(['n3', 'n4', 'n1'])
    expect(dijkstra(g, 'n1', 'n3')?.nodeIds).toEqual(['n1', 'n2', 'n3'])
  })

  it('reverses oneway=-1 ways', () => {
    const rev = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 47.0, lon: -122.0 },
        { type: 'node', id: 2, lat: 47.0, lon: -121.99 },
        { type: 'way', id: 5, nodes: [1, 2], tags: { highway: 'primary', oneway: '-1' } },
      ],
    })
    expect(rev.segments).toEqual([
      expect.objectContaining({ from: 'n2', to: 'n1', oneway: true, speedMph: 40 }),
    ])
  })
})

describe('largestComponent', () => {
  it('drops the isolated service-road pair', () => {
    const { nodes, segments } = parseOverpass(fixture)
    const big = largestComponent(nodes, segments)
    expect(big.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(big.segments.every((s) => s.name !== 'Alley')).toBe(true)
  })
})

describe('parseMaxspeedMph', () => {
  it('parses mph and converts km/h', () => {
    expect(parseMaxspeedMph({ maxspeed: '25 mph' })).toBe(25)
    expect(parseMaxspeedMph({ maxspeed: '30' })).toBe(30)
    expect(parseMaxspeedMph({ maxspeed: '50 km/h' })).toBeCloseTo(31.07, 1)
    expect(parseMaxspeedMph({})).toBeUndefined()
    expect(parseMaxspeedMph({ maxspeed: 'walk' })).toBeUndefined()
  })
})

describe('bbox helpers', () => {
  it('pads points and measures area', () => {
    const b = bboxForPoints([{ lat: 47.0, lng: -122.0 }, { lat: 47.01, lng: -121.99 }], 0)
    expect(b.south).toBeCloseTo(47.0)
    expect(b.north).toBeCloseTo(47.01)
    const area = bboxAreaSqMi(b)
    expect(area).toBeGreaterThan(0.2)
    expect(area).toBeLessThan(0.6)
  })
})

describe('fetchOsmNetwork', () => {
  // synthetic 6x6 street grid as an Overpass response
  const gridFixture = () => {
    const elements: unknown[] = []
    const id = (r: number, c: number) => r * 10 + c
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 6; c++)
        elements.push({ type: 'node', id: id(r, c), lat: 47 + r * 0.002, lon: -122 + c * 0.003 })
    for (let r = 0; r < 6; r++)
      elements.push({ type: 'way', id: 100 + r, nodes: [0, 1, 2, 3, 4, 5].map((c) => id(r, c)), tags: { highway: 'residential', name: `Row ${r}` } })
    for (let c = 0; c < 6; c++)
      elements.push({ type: 'way', id: 200 + c, nodes: [0, 1, 2, 3, 4, 5].map((r) => id(r, c)), tags: { highway: 'residential', name: `Col ${c}` } })
    return { elements }
  }

  it('posts an Overpass query and returns the network', async () => {
    let seenUrl = ''
    let seenBody = ''
    const fakeFetch = async (url: string, init?: { body?: string }) => {
      seenUrl = url
      seenBody = init?.body ?? ''
      return { ok: true, status: 200, json: async () => gridFixture() }
    }
    const net = await fetchOsmNetwork(fakeFetch, [{ lat: 47.005, lng: -122.008 }])
    expect(seenUrl).toContain('overpass-api.de')
    expect(decodeURIComponent(seenBody)).toContain('"highway"')
    expect(net.nodes).toHaveLength(36)
    expect(net.segments.length).toBe(60)
  })

  it('throws on HTTP failure', async () => {
    const fakeFetch = async () => ({ ok: false, status: 429, json: async () => ({}) })
    await expect(fetchOsmNetwork(fakeFetch, [{ lat: 47.0, lng: -122.0 }])).rejects.toThrow(/429/)
  })
})
