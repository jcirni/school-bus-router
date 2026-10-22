import { describe, expect, it } from 'vitest'
import { PROFILES, solveRoute } from './optimizer'
import type { Matrix } from './graph'

function matrixFrom(coords: [number, number][]): Matrix {
  // coords in "minutes/miles" space; euclidean distance doubles as both, no turns
  const n = coords.length
  const d = (i: number, j: number) => Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1])
  const grid = (f: (i: number, j: number) => number) =>
    Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => f(i, j)))
  return { timeMin: grid(d), distanceMi: grid(d), leftTurns: grid(() => 0) }
}

const line = matrixFrom([
  [0, 0],
  [10, 0],
  [20, 0],
  [30, 0],
])

describe('solveRoute', () => {
  it('visits every stop once and returns to depot totals', () => {
    const r = solveRoute(line, { profile: 'fastest', maxRideMinutes: 120, dwellMinutes: 0, direction: 'pickup' })
    expect([...r.order].sort()).toEqual([1, 2, 3])
    expect(r.totalDistanceMi).toBeCloseTo(60)
  })
  it('orders a line route monotonically from the depot', () => {
    const r = solveRoute(line, { profile: 'fastest', maxRideMinutes: 120, dwellMinutes: 0, direction: 'pickup' })
    expect(r.order).toEqual([1, 2, 3])
  })
  it('2-opt beats naive order on a crossed layout', () => {
    const crossed = matrixFrom([
      [0, 0],
      [10, 10],
      [10, -10],
      [20, 10],
      [20, -10],
    ])
    const r = solveRoute(crossed, { profile: 'fastest', maxRideMinutes: 999, dwellMinutes: 0, direction: 'pickup' })
    expect(r.totalDistanceMi).toBeLessThan(90)
    expect([...r.order].sort()).toEqual([1, 2, 3, 4])
  })
  it('computes pickup ride times: first picked up rides longest', () => {
    const r = solveRoute(line, { profile: 'fastest', maxRideMinutes: 120, dwellMinutes: 0, direction: 'pickup' })
    expect(r.rideTimesMin.get(1)).toBeCloseTo(50)
    expect(r.rideTimesMin.get(3)).toBeCloseTo(30)
  })
  it('computes dropoff ride times from depot departure', () => {
    const r = solveRoute(line, { profile: 'fastest', maxRideMinutes: 120, dwellMinutes: 0, direction: 'dropoff' })
    expect(r.rideTimesMin.get(1)).toBeCloseTo(10)
    expect(r.rideTimesMin.get(3)).toBeCloseTo(30)
  })
  it('flags max-ride-time violations', () => {
    const r = solveRoute(line, { profile: 'fastest', maxRideMinutes: 40, dwellMinutes: 0, direction: 'pickup' })
    expect(r.violations).toEqual([1])
  })
  it('safest profile avoids a left-turn leg the fastest profile takes', () => {
    // stop 2 is quick but needs a left; stop 3 first makes the tour left-free
    const m: Matrix = {
      timeMin: [
        [0, 5, 9],
        [5, 0, 5],
        [8, 5, 0],
      ],
      distanceMi: [
        [0, 5, 9],
        [5, 0, 5],
        [8, 5, 0],
      ],
      leftTurns: [
        [0, 1, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    }
    const fast = solveRoute(m, { profile: 'fastest', maxRideMinutes: 999, dwellMinutes: 0, direction: 'pickup' })
    const safe = solveRoute(m, { profile: 'safest', maxRideMinutes: 999, dwellMinutes: 0, direction: 'pickup' })
    expect(fast.order).toEqual([1, 2])
    expect(safe.order).toEqual([2, 1])
    expect(PROFILES.safest.leftTurn).toBeGreaterThan(PROFILES.fastest.leftTurn)
  })
  it('adds dwell time to the total', () => {
    const a = solveRoute(line, { profile: 'fastest', maxRideMinutes: 999, dwellMinutes: 0, direction: 'pickup' })
    const b = solveRoute(line, { profile: 'fastest', maxRideMinutes: 999, dwellMinutes: 2, direction: 'pickup' })
    expect(b.totalTimeMin - a.totalTimeMin).toBeCloseTo(6)
  })
})
