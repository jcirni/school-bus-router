import type { Matrix } from './graph'
import type { ProfileId } from './types'

export interface ProfileWeights {
  time: number
  distance: number
  leftTurn: number
}

export const PROFILES: Record<ProfileId, ProfileWeights> = {
  fastest: { time: 1, distance: 0.1, leftTurn: 0.2 },
  fuel: { time: 0.2, distance: 1, leftTurn: 0.5 },
  safest: { time: 0.5, distance: 0.3, leftTurn: 6 },
}

export interface SolveOptions {
  profile: ProfileId
  maxRideMinutes: number
  dwellMinutes: number
  direction: 'pickup' | 'dropoff'
  timeBudgetMs?: number
}

export interface SolveResult {
  // indices into the matrix (0 = depot), in visit order, depot excluded
  order: number[]
  cost: number
  totalTimeMin: number
  totalDistanceMi: number
  rideTimesMin: Map<number, number>
  violations: number[]
}

// index 0 of the matrix is the depot; 1..n are stops
export function solveRoute(m: Matrix, opts: SolveOptions): SolveResult {
  const w = PROFILES[opts.profile]
  const n = m.timeMin.length
  const leg = (i: number, j: number) =>
    w.time * m.timeMin[i][j] + w.distance * m.distanceMi[i][j] + w.leftTurn * m.leftTurns[i][j]
  const tourCost = (tour: number[]) => {
    let c = 0
    for (let i = 0; i < tour.length - 1; i++) c += leg(tour[i], tour[i + 1])
    return c
  }

  // nearest neighbor from the depot
  const unvisited = new Set(Array.from({ length: n - 1 }, (_, i) => i + 1))
  const order: number[] = []
  let cur = 0
  while (unvisited.size) {
    let best = -1
    let bestCost = Infinity
    for (const j of unvisited) {
      const c = leg(cur, j)
      if (c < bestCost) {
        bestCost = c
        best = j
      }
    }
    order.push(best)
    unvisited.delete(best)
    cur = best
  }

  // 2-opt, time-boxed
  const deadline = Date.now() + (opts.timeBudgetMs ?? 1500)
  let improved = true
  while (improved && Date.now() < deadline) {
    improved = false
    for (let i = 0; i < order.length - 1 && !improved; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const before = [0, ...order, 0]
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)]
        if (tourCost([0, ...candidate, 0]) < tourCost(before) - 1e-9) {
          order.splice(0, order.length, ...candidate)
          improved = true
          break
        }
      }
    }
  }

  // ride times from arrival clock, dwell charged at each stop
  const arrival = new Map<number, number>()
  let clock = 0
  let prev = 0
  let totalDistanceMi = 0
  for (const s of order) {
    clock += m.timeMin[prev][s]
    totalDistanceMi += m.distanceMi[prev][s]
    arrival.set(s, clock)
    clock += opts.dwellMinutes
    prev = s
  }
  clock += m.timeMin[prev][0]
  totalDistanceMi += m.distanceMi[prev][0]
  const totalTimeMin = clock

  const rideTimesMin = new Map<number, number>()
  const violations: number[] = []
  for (const s of order) {
    // pickup: arrival at the stop until the bus is back at the depot; dropoff: departure to arrival
    const rideMin = opts.direction === 'pickup' ? totalTimeMin - arrival.get(s)! : arrival.get(s)!
    rideTimesMin.set(s, rideMin)
    if (rideMin > opts.maxRideMinutes) violations.push(s)
  }

  return { order, cost: tourCost([0, ...order, 0]), totalTimeMin, totalDistanceMi, rideTimesMin, violations }
}
