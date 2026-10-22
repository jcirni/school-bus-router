import { describe, expect, it } from 'vitest'
import { SAMPLE_CENTER, sampleStreetLines, sampleWorkspace } from './sample'

describe('sampleWorkspace', () => {
  const ws = sampleWorkspace()
  const allStops = ws.routes.flatMap((r) => r.stops)

  it('ships two routes of 20 stops each, 40 unique stops total', () => {
    expect(ws.routes).toHaveLength(2)
    for (const r of ws.routes) expect(r.stops).toHaveLength(20)
    expect(new Set(allStops.map((s) => s.id)).size).toBe(40)
  })

  it('splits west/east: every Westside stop is west of every Eastside stop', () => {
    const [west, east] = ws.routes
    const maxWest = Math.max(...west.stops.map((s) => s.lng!))
    const minEast = Math.min(...east.stops.map((s) => s.lng!))
    expect(maxWest).toBeLessThanOrEqual(minEast)
  })

  it('keeps every stop on residential land, nowhere near Sea-Tac airport', () => {
    // Sea-Tac sits around lng -122.31; the sample box must stay well east of it
    for (const s of allStops) {
      expect(s.lat).toBeGreaterThan(47.35)
      expect(s.lat).toBeLessThan(47.41)
      expect(s.lng).toBeGreaterThan(-122.24)
      expect(s.lng).toBeLessThan(-122.17)
    }
    expect(ws.depot.lat).toBe(SAMPLE_CENTER.lat)
    expect(ws.depot.lng).toBe(SAMPLE_CENTER.lng)
  })
})

describe('sampleStreetLines', () => {
  it('draws 9 streets + 9 avenues including Main St and 1st Ave', () => {
    const lines = sampleStreetLines()
    expect(lines).toHaveLength(18)
    const names = lines.map((l) => l.name)
    expect(names).toContain('Main St')
    expect(names).toContain('1st Ave')
    expect(names).toContain('9th Ave')
    for (const l of lines) expect(l.points).toHaveLength(2)
  })
})
