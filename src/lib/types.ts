export interface LatLng {
  lat: number
  lng: number
}

export interface Stop {
  id: string
  street: string
  city: string
  state: string
  zip: string
  lat?: number
  lng?: number
  groupId?: string
  // stops in different arterial zones are never grouped together
  arterialZone?: string
  liftRequired?: boolean
}

export type Period = 'AM' | 'PM'
export type SchoolLevel = 'elementary' | 'older'
export type ProfileId = 'fastest' | 'fuel' | 'safest'

export interface RouteSettings {
  period: Period
  departureTime: string
  level: SchoolLevel
  mpg: number
  fuelPrice: number
  maxRideMinutes: number
  dwellMinutes: number
  seats?: number
}

export interface Scorecard {
  totalTimeMin: number
  totalDistanceMi: number
  fuelGallons: number
  fuelCost: number
  co2Kg: number
  leftTurns: number
  uTurns: number
  maxRideMin: number
  avgRideMin: number
  stopCount: number
  solver: string
}

export interface RouteResult {
  profile: ProfileId
  order: string[]
  geometry: LatLng[]
  scorecard: Scorecard
  rideViolations: string[]
}

export interface BusRoute {
  id: string
  name: string
  settings: RouteSettings
  stops: Stop[]
  versions: RouteResult[]
}

export interface Workspace {
  name: string
  depot: Stop
  routes: BusRoute[]
}

export const DEFAULT_SETTINGS: RouteSettings = {
  period: 'AM',
  departureTime: '06:45',
  level: 'elementary',
  mpg: 8,
  fuelPrice: 4.0,
  maxRideMinutes: 60,
  dwellMinutes: 1,
}
