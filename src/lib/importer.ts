import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { Stop } from './types'
import { normalizeAddress } from './normalize'

export interface RowError {
  row: number
  message: string
}

export interface ImportResult {
  stops: Stop[]
  droppedColumns: string[]
  duplicateRows: number[]
  errors: RowError[]
}

const NAME_RE = /(^|[\s_])(student|name|first|last|fname|lname|child|kid|passenger|guardian|parent)([\s_]|$)/i

export function isNameColumn(header: string): boolean {
  return NAME_RE.test(header.trim())
}

const FIELD_ALIASES: Record<string, string[]> = {
  street: ['street', 'address', 'street address', 'street_address', 'addr', 'location'],
  city: ['city', 'town'],
  state: ['state', 'st'],
  zip: ['zip', 'zipcode', 'zip code', 'postal', 'postal code'],
  id: ['id', 'stop', 'stop id', 'stop_id', 'stopid'],
}

export function detectColumns(headers: string[]): { map: Record<string, string>; dropped: string[] } {
  const map: Record<string, string> = {}
  const dropped: string[] = []
  for (const h of headers) {
    if (isNameColumn(h)) {
      dropped.push(h)
      continue
    }
    const key = h.trim().toLowerCase()
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(key) && !map[field]) map[field] = h
    }
  }
  return { map, dropped }
}

function rowsToResult(rows: Record<string, string>[]): ImportResult {
  const headers = rows.length ? Object.keys(rows[0]) : []
  const { map, dropped } = detectColumns(headers)
  const stops: Stop[] = []
  const errors: RowError[] = []
  const duplicateRows: number[] = []
  const seen = new Map<string, number>()

  rows.forEach((r, i) => {
    const row = i + 2 // account for header row
    const get = (f: string) => (map[f] ? String(r[map[f]] ?? '').trim() : '')
    const street = get('street')
    if (!street) {
      if (Object.values(r).some((v) => String(v).trim())) errors.push({ row, message: 'missing street address' })
      return
    }
    const stop: Stop = {
      id: get('id') || `S${stops.length + 1}`,
      street,
      city: get('city'),
      state: get('state'),
      zip: get('zip'),
    }
    const key = normalizeAddress(stop)
    if (seen.has(key)) duplicateRows.push(row)
    else seen.set(key, row)
    stops.push(stop)
  })
  return { stops, droppedColumns: dropped, duplicateRows, errors }
}

export function parseCsv(text: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  })
  return rowsToResult(parsed.data)
}

export function parseSpreadsheet(data: ArrayBuffer): ImportResult {
  const wb = XLSX.read(data)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const csv = XLSX.utils.sheet_to_csv(sheet)
  return parseCsv(csv)
}

// "4600 Silver Hill Rd, Washington, DC 20276"
export function parseFullAddress(line: string): Omit<Stop, 'id'> | null {
  const parts = line.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const street = parts[0]
  const city = parts.length >= 3 ? parts[1] : ''
  const last = parts[parts.length - 1]
  const m = last.match(/^([A-Za-z]{2})\s*(\d{5})?$/)
  let state = ''
  let zip = ''
  if (m && parts.length >= 3) {
    state = m[1].toUpperCase()
    zip = m[2] ?? ''
  } else if (parts.length === 2) {
    const m2 = parts[1].match(/^(.+?)\s+([A-Za-z]{2})\s*(\d{5})?$/)
    if (m2) return { street, city: m2[1], state: m2[2].toUpperCase(), zip: m2[3] ?? '' }
    return { street, city: parts[1], state: '', zip: '' }
  }
  return { street, city, state, zip }
}

export type TextMode = 'lines' | 'fragments'

export function parseTextList(
  text: string,
  mode: TextMode,
  supplied: { city: string; state: string; zip: string },
): ImportResult {
  const errors: RowError[] = []
  const stops: Stop[] = []
  const seen = new Map<string, number>()
  const duplicateRows: number[] = []
  const add = (s: Omit<Stop, 'id'>, row: number) => {
    const stop: Stop = { id: `S${stops.length + 1}`, ...s }
    const key = normalizeAddress(stop)
    if (seen.has(key)) duplicateRows.push(row)
    else seen.set(key, row)
    stops.push(stop)
  }

  if (mode === 'lines') {
    text.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim()
      if (!t) return
      const s = parseFullAddress(t)
      if (!s) errors.push({ row: i + 1, message: `could not parse address: ${t}` })
      else add(s, i + 1)
    })
  } else {
    // fragments: street addresses separated by commas, semicolons, or newlines
    text
      .split(/[,;\n]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((street, i) => add({ street, ...supplied }, i + 1))
  }
  return { stops, droppedColumns: [], duplicateRows, errors }
}
