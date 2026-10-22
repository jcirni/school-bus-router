import { describe, expect, it } from 'vitest'
import { splitStopsInTwo } from './split'
import type { Stop } from './types'

const stop = (id: string, lat: number, lng: number): Stop => ({
  id, street: `${id} St`, city: 'X', state: 'WA', zip: '98000', lat, lng,
})

describe('splitStopsInTwo', () => {
  const west = [stop('W1', 47.38, -122.24), stop('W2', 47.37, -122.23), stop('W3', 47.39, -122.235)]
  const east = [stop('E1', 47.38, -122.18), stop('E2', 47.37, -122.17), stop('E3', 47.39, -122.175)]
  const all = [...west, ...east]

  it('separates two clear geographic clusters', () => {
    const [a, b] = splitStopsInTwo(all)
    const ids = (g: Stop[]) => g.map((s) => s.id).sort()
    const groups = [ids(a), ids(b)]
    expect(groups).toContainEqual(['W1', 'W2', 'W3'])
    expect(groups).toContainEqual(['E1', 'E2', 'E3'])
  })

  it('assigns every stop exactly once and is deterministic', () => {
    const [a1, b1] = splitStopsInTwo(all)
    const [a2, b2] = splitStopsInTwo(all)
    expect([...a1, ...b1].map((s) => s.id).sort()).toEqual(all.map((s) => s.id).sort())
    expect(a1.map((s) => s.id)).toEqual(a2.map((s) => s.id))
    expect(b1.map((s) => s.id)).toEqual(b2.map((s) => s.id))
  })

  it('puts unlocated stops in the first group', () => {
    const noCoords: Stop = { id: 'N1', street: 'x', city: 'X', state: 'WA', zip: '98000' }
    const [a, b] = splitStopsInTwo([...all, noCoords])
    expect(a.map((s) => s.id)).toContain('N1')
    expect(b.map((s) => s.id)).not.toContain('N1')
  })
})
