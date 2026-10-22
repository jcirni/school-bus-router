import { describe, expect, it } from 'vitest'
import { bearingDeg, classifyTurn, haversineMi, headingChangeDeg } from './geo'

const seattle = { lat: 47.6062, lng: -122.3321 }
const bellevue = { lat: 47.6101, lng: -122.2015 }

describe('haversineMi', () => {
  it('is zero for same point and ~6.0 mi Seattle-Bellevue', () => {
    expect(haversineMi(seattle, seattle)).toBe(0)
    expect(haversineMi(seattle, bellevue)).toBeGreaterThan(5.8)
    expect(haversineMi(seattle, bellevue)).toBeLessThan(6.3)
  })
})

describe('bearing / turns', () => {
  it('east is ~90, north is ~0', () => {
    expect(bearingDeg(seattle, bellevue)).toBeGreaterThan(80)
    expect(bearingDeg(seattle, bellevue)).toBeLessThan(100)
    expect(bearingDeg(seattle, { lat: 47.7, lng: -122.3321 })).toBeCloseTo(0, 0)
  })
  it('wraps heading change', () => {
    expect(headingChangeDeg(350, 10)).toBe(20)
    expect(headingChangeDeg(10, 350)).toBe(-20)
  })
  it('classifies turns', () => {
    expect(classifyTurn(90)).toBe('right')
    expect(classifyTurn(-90)).toBe('left')
    expect(classifyTurn(179)).toBe('uturn')
    expect(classifyTurn(5)).toBe('straight')
  })
})
