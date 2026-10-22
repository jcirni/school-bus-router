import { describe, expect, it } from 'vitest'
import { cacheKey, normalizeAddress } from './normalize'

describe('normalizeAddress', () => {
  it('uppercases, strips punctuation, standardizes suffixes, ZIP-5', () => {
    expect(
      normalizeAddress({ street: '123 Main Street.', city: 'seattle', state: 'wa', zip: '98101-1234' }),
    ).toBe('123 MAIN ST, SEATTLE, WA, 98101')
  })
  it('standardizes directionals', () => {
    expect(
      normalizeAddress({ street: '45 North Oak Avenue', city: 'Kent', state: 'WA', zip: '98030' }),
    ).toBe('45 N OAK AVE, KENT, WA, 98030')
  })
})

describe('cacheKey', () => {
  it('matches equivalent addresses written differently', () => {
    const a = cacheKey({ street: '123 Main Street', city: 'Seattle', state: 'WA', zip: '98101' })
    const b = cacheKey({ street: '123 main st.', city: 'SEATTLE', state: 'wa', zip: '98101-9999' })
    expect(a).toBe(b)
  })
  it('differs for different addresses', () => {
    const a = cacheKey({ street: '123 Main St', city: 'Seattle', state: 'WA', zip: '98101' })
    const b = cacheKey({ street: '124 Main St', city: 'Seattle', state: 'WA', zip: '98101' })
    expect(a).not.toBe(b)
  })
})
