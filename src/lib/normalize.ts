const SUFFIXES: Record<string, string> = {
  STREET: 'ST', AVENUE: 'AVE', BOULEVARD: 'BLVD', DRIVE: 'DR', ROAD: 'RD',
  LANE: 'LN', COURT: 'CT', PLACE: 'PL', CIRCLE: 'CIR', HIGHWAY: 'HWY',
  PARKWAY: 'PKWY', TERRACE: 'TER', TRAIL: 'TRL',
}
const DIRECTIONS: Record<string, string> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
}

export interface AddressParts {
  street: string
  city: string
  state: string
  zip: string
}

export function normalizeAddress(a: AddressParts): string {
  const street = a.street
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIXES[w] ?? DIRECTIONS[w] ?? w)
    .join(' ')
  const zip5 = (a.zip.match(/\d{5}/) ?? [''])[0]
  return [street, a.city.toUpperCase().trim(), a.state.toUpperCase().trim(), zip5]
    .filter(Boolean)
    .join(', ')
}

// stable cache key for the address cache (FNV-1a over the normalized form)
export function cacheKey(a: AddressParts): string {
  const s = normalizeAddress(a)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
