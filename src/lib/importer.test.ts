import { describe, expect, it } from 'vitest'
import { detectColumns, parseCsv, parseFullAddress, parseSpreadsheet, parseTextList } from './importer'

const CSV = `Student Name,First Name,Address,City,State,ZIP
Doe Jane,Jane,123 Main St,Seattle,WA,98101
Roe Sam,Sam,456 Oak Ave,Seattle,WA,98102
Doe Jane,Jane,123 Main St,Seattle,WA,98101
,,789 Pine St,Seattle,WA,98103
,,,,,`

describe('detectColumns', () => {
  it('flags name columns and maps address fields', () => {
    const { map, dropped } = detectColumns(['Student Name', 'Address', 'City', 'State', 'ZIP'])
    expect(dropped).toEqual(['Student Name'])
    expect(map.street).toBe('Address')
    expect(map.zip).toBe('ZIP')
  })
})

describe('parseCsv', () => {
  it('drops name columns, keeps no name data on stops', () => {
    const r = parseCsv(CSV)
    expect(r.droppedColumns).toEqual(expect.arrayContaining(['Student Name', 'First Name']))
    expect(JSON.stringify(r.stops)).not.toContain('Jane')
    expect(r.stops).toHaveLength(4)
    expect(r.stops[0]).toMatchObject({ street: '123 Main St', city: 'Seattle', state: 'WA', zip: '98101' })
  })
  it('flags duplicates and missing street', () => {
    const r = parseCsv(CSV)
    expect(r.duplicateRows).toEqual([4])
  })
  it('reports a row error when street is missing but row has data', () => {
    const r = parseCsv('Address,City\n,Seattle\n9 Elm St,Seattle')
    expect(r.errors).toHaveLength(1)
    expect(r.stops).toHaveLength(1)
  })
})

describe('parseFullAddress', () => {
  it('parses street, city, state ZIP', () => {
    expect(parseFullAddress('4600 Silver Hill Rd, Washington, DC 20276')).toEqual({
      street: '4600 Silver Hill Rd', city: 'Washington', state: 'DC', zip: '20276',
    })
  })
  it('returns null for a single fragment', () => {
    expect(parseFullAddress('just a street')).toBeNull()
  })
})

describe('parseTextList', () => {
  it('lines mode', () => {
    const r = parseTextList('123 Main St, Seattle, WA 98101\n456 Oak Ave, Kent, WA 98030', 'lines', {
      city: '', state: '', zip: '',
    })
    expect(r.stops).toHaveLength(2)
    expect(r.stops[1].city).toBe('Kent')
  })
  it('fragments mode applies supplied city/state/zip', () => {
    const r = parseTextList('123 Main St, 456 Oak Ave; 789 Pine St', 'fragments', {
      city: 'Seattle', state: 'WA', zip: '98101',
    })
    expect(r.stops).toHaveLength(3)
    expect(r.stops.every((s) => s.city === 'Seattle' && s.zip === '98101')).toBe(true)
  })
})

describe('parseSpreadsheet', () => {
  it('parses an xlsx workbook in memory', async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Address', 'City', 'State', 'Zip'],
      ['Kid A', '1 First St', 'Seattle', 'WA', '98101'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const r = parseSpreadsheet(buf)
    expect(r.droppedColumns).toEqual(['Name'])
    expect(r.stops[0].street).toBe('1 First St')
  })
})
