import { describe, expect, it } from 'vitest'
import { WALK_LIMIT_MI, proposeGroups } from './grouping'
import type { Stop } from './types'

const mk = (id: string, lat: number, lng: number, extra: Partial<Stop> = {}): Stop => ({
  id, street: `${id} Main St`, city: 'Maplewood', state: 'WA', zip: '98001', lat, lng, ...extra,
})

describe('WALK_LIMIT_MI', () => {
  it('matches locked defaults', () => {
    expect(WALK_LIMIT_MI.elementary).toBe(0.25)
    expect(WALK_LIMIT_MI.older).toBe(0.5)
  })
})

describe('proposeGroups', () => {
  it('groups close stops and reports stats', () => {
    const stops = [mk('A', 47.45, -122.3), mk('B', 47.451, -122.301), mk('C', 47.5, -122.35)]
    const groups = proposeGroups(stops, 0.25)
    expect(groups).toHaveLength(1)
    expect(groups[0].stopIds).toEqual(expect.arrayContaining(['A', 'B']))
    expect(groups[0].stopsSaved).toBe(1)
    expect(groups[0].maxWalkMi).toBeLessThanOrEqual(0.25)
  })
  it('does not group distant stops', () => {
    const stops = [mk('A', 47.45, -122.3), mk('B', 47.55, -122.4)]
    expect(proposeGroups(stops, 0.25)).toHaveLength(0)
  })
  it('never groups across an arterial zone boundary', () => {
    const stops = [
      mk('A', 47.45, -122.3, { arterialZone: 'west' }),
      mk('B', 47.4505, -122.3005, { arterialZone: 'east' }),
    ]
    expect(proposeGroups(stops, 0.5)).toHaveLength(0)
  })
  it('older limit groups what elementary limit does not', () => {
    const stops = [mk('A', 47.45, -122.3), mk('B', 47.454, -122.306)]
    expect(proposeGroups(stops, WALK_LIMIT_MI.elementary)).toHaveLength(0)
    expect(proposeGroups(stops, WALK_LIMIT_MI.older)).toHaveLength(1)
  })
  it('ignores stops without coordinates', () => {
    const noCoord: Stop = { id: 'X', street: '1 Main St', city: '', state: '', zip: '' }
    expect(proposeGroups([mk('A', 47.45, -122.3), noCoord], 0.5)).toHaveLength(0)
  })
})
