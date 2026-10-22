import type { LatLng } from './types'

const R_MI = 3958.8
const toRad = (d: number) => (d * Math.PI) / 180

export function haversineMi(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_MI * Math.asin(Math.sqrt(s))
}

// compass bearing a -> b, degrees clockwise from north
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (Math.atan2(y, x) * 180) / Math.PI
}

// signed heading change, -180..180; positive = right turn
export function headingChangeDeg(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

export type TurnKind = 'left' | 'right' | 'uturn' | 'straight'

export function classifyTurn(changeDeg: number): TurnKind {
  const a = Math.abs(changeDeg)
  if (a >= 150) return 'uturn'
  if (a < 30) return 'straight'
  return changeDeg > 0 ? 'right' : 'left'
}
