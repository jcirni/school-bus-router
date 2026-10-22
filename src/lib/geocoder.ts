import { normalizeAddress, type AddressParts } from './normalize'

export type FetchLike = typeof fetch

export interface GeocodeResult {
  lat: number
  lng: number
  matchedAddress: string
  quality: 'exact' | 'approximate'
}

const BASE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

export function censusUrl(address: string): string {
  const p = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' })
  return `${BASE}?${p}`
}

interface CensusResponse {
  result?: {
    addressMatches?: {
      coordinates: { x: number; y: number }
      matchedAddress: string
    }[]
  }
}

export async function geocodeOne(fetchFn: FetchLike, parts: AddressParts): Promise<GeocodeResult | null> {
  const address = [parts.street, parts.city, parts.state, parts.zip].filter(Boolean).join(', ')
  const res = await fetchFn(censusUrl(address))
  if (!res.ok) throw new Error(`Census geocoder returned ${res.status}`)
  const data = (await res.json()) as CensusResponse
  const match = data.result?.addressMatches?.[0]
  if (!match) return null
  const quality = normalizeAddress(parts) === match.matchedAddress ? 'exact' : 'approximate'
  return { lat: match.coordinates.y, lng: match.coordinates.x, matchedAddress: match.matchedAddress, quality }
}

// chunked single-address calls; Census batch upload is not browser-friendly
export async function geocodeBatch(
  fetchFn: FetchLike,
  addresses: AddressParts[],
  onProgress?: (done: number, total: number) => void,
  chunkSize = 5,
): Promise<(GeocodeResult | null)[]> {
  const out: (GeocodeResult | null)[] = new Array(addresses.length).fill(null)
  let done = 0
  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize)
    const results = await Promise.all(chunk.map((a) => geocodeOne(fetchFn, a).catch(() => null)))
    results.forEach((r, j) => {
      out[i + j] = r
    })
    done += chunk.length
    onProgress?.(done, addresses.length)
  }
  return out
}
