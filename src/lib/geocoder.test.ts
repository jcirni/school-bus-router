import { describe, expect, it, vi } from 'vitest'
import { censusUrl, geocodeBatch, geocodeOne, type FetchLike } from './geocoder'

const MATCH = {
  result: {
    addressMatches: [
      {
        coordinates: { x: -76.9284, y: 38.8451 },
        matchedAddress: '4600 SILVER HILL RD, WASHINGTON, DC, 20233',
      },
    ],
  },
}
const NO_MATCH = { result: { addressMatches: [] } }

function fakeFetch(handler: (url: string) => unknown): FetchLike {
  return (async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => handler(url),
  })) as unknown as FetchLike
}

const parts = { street: '4600 Silver Hill Rd', city: 'Washington', state: 'DC', zip: '20276' }

describe('censusUrl', () => {
  it('targets the Census onelineaddress endpoint', () => {
    expect(censusUrl('1 Main St')).toContain('geocoding.geo.census.gov/geocoder/locations/onelineaddress')
  })
})

describe('geocodeOne', () => {
  it('parses coordinates and flags approximate match', async () => {
    const r = await geocodeOne(fakeFetch(() => MATCH), parts)
    expect(r).toMatchObject({ lat: 38.8451, lng: -76.9284, quality: 'approximate' })
  })
  it('flags an exactly normalized match as exact', async () => {
    const r = await geocodeOne(fakeFetch(() => MATCH), { ...parts, zip: '20233' })
    expect(r?.quality).toBe('exact')
  })
  it('returns null on no match', async () => {
    expect(await geocodeOne(fakeFetch(() => NO_MATCH), parts)).toBeNull()
  })
  it('throws on HTTP error', async () => {
    const bad = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as FetchLike
    await expect(geocodeOne(bad, parts)).rejects.toThrow('503')
  })
})

describe('geocodeBatch', () => {
  it('geocodes all, reports progress, tolerates failures', async () => {
    let n = 0
    const fetchFn = fakeFetch(() => (++n % 3 === 0 ? NO_MATCH : MATCH))
    const progress = vi.fn()
    const out = await geocodeBatch(fetchFn, [parts, parts, parts, parts, parts, parts], progress, 2)
    expect(out).toHaveLength(6)
    expect(out.filter(Boolean)).toHaveLength(4)
    expect(progress).toHaveBeenLastCalledWith(6, 6)
  })
})
