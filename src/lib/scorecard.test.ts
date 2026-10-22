import { describe, expect, it } from 'vitest'
import { computeScorecard } from './scorecard'

describe('computeScorecard', () => {
  it('computes fuel, cost, CO2, ride stats', () => {
    const s = computeScorecard({
      totalTimeMin: 55,
      totalDistanceMi: 16,
      leftTurns: 3,
      uTurns: 1,
      rideTimesMin: [10, 30, 20],
      stopCount: 3,
      mpg: 8,
      fuelPrice: 4,
    })
    // 16/8 = 2 gal driving + 3 * 0.03 idle = 2.09
    expect(s.fuelGallons).toBeCloseTo(2.09)
    expect(s.fuelCost).toBeCloseTo(8.36)
    expect(s.co2Kg).toBeCloseTo(2.09 * 10.21)
    expect(s.maxRideMin).toBe(30)
    expect(s.avgRideMin).toBeCloseTo(20)
    expect(s.stopCount).toBe(3)
  })
  it('handles zero stops', () => {
    const s = computeScorecard({
      totalTimeMin: 0, totalDistanceMi: 0, leftTurns: 0, uTurns: 0,
      rideTimesMin: [], stopCount: 0, mpg: 8, fuelPrice: 4,
    })
    expect(s.maxRideMin).toBe(0)
    expect(s.fuelGallons).toBe(0)
  })
})
