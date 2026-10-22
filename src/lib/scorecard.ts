import type { Scorecard } from './types'

// diesel CO2 per US gallon
const CO2_KG_PER_GAL = 10.21
// idling/loading allowance, gallons per stop
const IDLE_GAL_PER_STOP = 0.03

export interface ScorecardInput {
  totalTimeMin: number
  totalDistanceMi: number
  leftTurns: number
  uTurns: number
  rideTimesMin: number[]
  stopCount: number
  mpg: number
  fuelPrice: number
  solver?: string
}

export function computeScorecard(i: ScorecardInput): Scorecard {
  const fuelGallons = i.totalDistanceMi / i.mpg + i.stopCount * IDLE_GAL_PER_STOP
  const rides = i.rideTimesMin
  return {
    totalTimeMin: i.totalTimeMin,
    totalDistanceMi: i.totalDistanceMi,
    fuelGallons,
    fuelCost: fuelGallons * i.fuelPrice,
    co2Kg: fuelGallons * CO2_KG_PER_GAL,
    leftTurns: i.leftTurns,
    uTurns: i.uTurns,
    maxRideMin: rides.length ? Math.max(...rides) : 0,
    avgRideMin: rides.length ? rides.reduce((a, b) => a + b, 0) / rides.length : 0,
    stopCount: i.stopCount,
    solver: i.solver ?? 'local-js (NN + 2-opt)',
  }
}
