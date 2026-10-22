import { haversineMi } from './geo'
import type { Stop } from './types'

// split stops into two geographic clusters (deterministic 2-means on
// coordinates) so an overloaded route can become two bus routes.
// Stops without coordinates go to the first group. Input order is
// preserved within each group.
export function splitStopsInTwo(stops: Stop[]): [Stop[], Stop[]] {
  const located = stops.filter((s) => s.lat !== undefined && s.lng !== undefined)
  const unlocated = stops.filter((s) => s.lat === undefined || s.lng === undefined)
  if (located.length < 2) return [[...stops], []]

  // seed with the westernmost and easternmost stops
  const sorted = [...located].sort((a, b) => a.lng! - b.lng!)
  let cA = { lat: sorted[0].lat!, lng: sorted[0].lng! }
  let cB = { lat: sorted[sorted.length - 1].lat!, lng: sorted[sorted.length - 1].lng! }

  let assign = new Map<string, 0 | 1>()
  for (let iter = 0; iter < 25; iter++) {
    assign = new Map(
      located.map((s) => [
        s.id,
        haversineMi(s as { lat: number; lng: number }, cA) <= haversineMi(s as { lat: number; lng: number }, cB) ? 0 : (1 as const),
      ]),
    )
    const next = [cA, cB].map((_, gi) => {
      const members = located.filter((s) => assign.get(s.id) === gi)
      if (!members.length) return gi === 0 ? cA : cB
      return {
        lat: members.reduce((sum, s) => sum + s.lat!, 0) / members.length,
        lng: members.reduce((sum, s) => sum + s.lng!, 0) / members.length,
      }
    })
    if (Math.abs(next[0].lat - cA.lat) < 1e-9 && Math.abs(next[0].lng - cA.lng) < 1e-9 &&
        Math.abs(next[1].lat - cB.lat) < 1e-9 && Math.abs(next[1].lng - cB.lng) < 1e-9) {
      cA = next[0]
      cB = next[1]
      break
    }
    cA = next[0]
    cB = next[1]
  }

  const groupA = stops.filter((s) => unlocated.includes(s) || assign.get(s.id) === 0)
  const groupB = stops.filter((s) => assign.get(s.id) === 1)
  return [groupA, groupB]
}
