import { useState } from 'react'
import { parseCsv, parseSpreadsheet, parseTextList, type ImportResult, type TextMode } from '../lib/importer'

interface Props {
  onImport: (r: ImportResult) => void
  onSample: () => void
}

export default function ImportPanel({ onImport, onSample }: Props) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<TextMode>('lines')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')

  const onFile = async (f: File) => {
    if (/\.xlsx$/i.test(f.name)) onImport(parseSpreadsheet(await f.arrayBuffer()))
    else onImport(parseCsv(await f.text()))
  }

  return (
    <section>
      <h2>1. Import stops</h2>
      <p>
        <input
          type="file"
          accept=".csv,.txt,.xlsx"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
          }}
        />
        <button onClick={onSample}>Load sample data (works offline)</button>
      </p>
      <textarea
        rows={5}
        style={{ width: '100%' }}
        placeholder={
          mode === 'lines'
            ? 'One full address per line: 123 Main St, Seattle, WA 98101'
            : 'Street addresses separated by commas'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p>
        <label>
          Paste mode{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as TextMode)}>
            <option value="lines">One full address per line</option>
            <option value="fragments">Street list + city/state below</option>
          </select>
        </label>{' '}
        {mode === 'fragments' && (
          <>
            <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} size={10} />{' '}
            <input placeholder="State" value={state} onChange={(e) => setState(e.target.value)} size={5} />{' '}
            <input placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} size={7} />{' '}
          </>
        )}
        <button
          onClick={() => text.trim() && onImport(parseTextList(text, mode, { city, state, zip }))}
        >
          Import pasted addresses
        </button>
      </p>
    </section>
  )
}
