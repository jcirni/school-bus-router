import type { Stop } from './types'
import { haversineMi } from './geo'

export const WALK_LIMIT_MI = { elementary: 0.25, older: 0.5 } as const

// straight-line distance understates walking distance; apply a circuity factor
const CIRCUITY = 1.3

export interface GroupProposal {
  id: string
  stopIds: string[]
  center: { lat: number; lng: number }
  maxWalkMi: number
  stopsSaved: number
}

function walkMi(a: Stop, b: { lat: number; lng: number }): number {
  if (a.lat === undefined || a.lng === undefined) return Infinity
  return haversineMi({ lat: a.lat, lng: a.lng }, b) * CIRCUITY
}

// union-find clustering of nearby stops; stops in different arterial zones never merge
export function proposeGroups(stops: Stop[], maxWalkMi: number): GroupProposal[] {
  const withCoords = stops.filter((s) => s.lat !== undefined && s.lng !== undefined)
  const parent = new Map(withCoords.map((s) => [s.id, s.id]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  for (let i = 0; i < withCoords.length; i++) {
    for (let j = i + 1; j < withCoords.length; j++) {
      const a = withCoords[i]
      const b = withCoords[j]
      if (a.arterialZone && b.arterialZone && a.arterialZone !== b.arterialZone) continue
      if (walkMi(a, { lat: b.lat!, lng: b.lng! }) <= maxWalkMi * 2) {
        parent.set(find(a.id), find(b.id))
      }
    }
  }
  const clusters = new Map<string, Stop[]>()
  for (const s of withCoords) {
    const r = find(s.id)
    clusters.set(r, [...(clusters.get(r) ?? []), s])
  }
  const proposals: GroupProposal[] = []
  let n = 0
  for (const members of clusters.values()) {
    if (members.length < 2) continue
    const center = {
      lat: members.reduce((sum, s) => sum + s.lat!, 0) / members.length,
      lng: members.reduce((sum, s) => sum + s.lng!, 0) / members.length,
    }
    const maxWalk = Math.max(...members.map((s) => walkMi(s, center)))
    if (maxWalk > maxWalkMi) continue
    proposals.push({
      id: `G${++n}`,
      stopIds: members.map((s) => s.id),
      center,
      maxWalkMi: maxWalk,
      stopsSaved: members.length - 1,
    })
  }
  return proposals.sort((a, b) => b.stopsSaved - a.stopsSaved)
}
