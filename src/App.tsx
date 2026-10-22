import { useMemo, useRef, useState } from 'react'
import ImportPanel from './components/ImportPanel'
import MapView from './components/MapView'
import type { ImportResult } from './lib/importer'
import { geocodeBatch } from './lib/geocoder'
import { buildGraph, buildGridNetwork } from './lib/graph'
import { WALK_LIMIT_MI, proposeGroups, type GroupProposal } from './lib/grouping'
import { runRoute } from './lib/pipeline'
import { parseProject, serializeProject, shareableExport } from './lib/project'
import { SAMPLE_CENTER, emptyWorkspace, sampleStreetLines, sampleWorkspace } from './lib/sample'
import { splitStopsInTwo } from './lib/split'
import type { BusRoute, ProfileId, Stop, Workspace } from './lib/types'
import { DEFAULT_SETTINGS } from './lib/types'

const PROFILE_LABELS: Record<ProfileId, string> = {
  fastest: 'Fastest',
  fuel: 'Lowest Fuel',
  safest: 'Safest / Right-Turn',
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

const fmt = (n: number, digits = 1) => n.toFixed(digits)

// "06:45" + minutes -> "7:32 AM"
function fmtClock(departure: string, addMin: number): string {
  const [h, m] = departure.split(':').map(Number)
  const total = ((h * 60 + m + Math.round(addMin)) % 1440 + 1440) % 1440
  const hh = Math.floor(total / 60)
  const suffix = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(total % 60).padStart(2, '0')} ${suffix}`
}

export default function App() {
  const [ws, setWs] = useState<Workspace>(() => emptyWorkspace())
  const [routeId, setRouteId] = useState('R1')
  const [importInfo, setImportInfo] = useState<ImportResult | null>(null)
  const [status, setStatus] = useState('')
  const [proposals, setProposals] = useState<GroupProposal[]>([])
  const [accepted, setAccepted] = useState<string[]>([])
  const [profile, setProfile] = useState<ProfileId>('fastest')
  const [sampleMode, setSampleMode] = useState(false)
  const projectFileRef = useRef<HTMLInputElement>(null)

  const route = ws.routes.find((r) => r.id === routeId) ?? ws.routes[0]

  const updateRoute = (id: string, fn: (r: BusRoute) => BusRoute) =>
    setWs((w) => ({ ...w, routes: w.routes.map((r) => (r.id === id ? fn(r) : r)) }))

  const acceptedGroups = useMemo(
    () => proposals.filter((p) => accepted.includes(p.id)),
    [proposals, accepted],
  )

  // accepted groups collapse their member stops into one center stop for optimization
  const effectiveStops = useMemo(() => {
    if (!route || !acceptedGroups.length) return route?.stops ?? []
    const grouped = new Set(acceptedGroups.flatMap((g) => g.stopIds))
    const centers: Stop[] = acceptedGroups.map((g) => ({
      id: g.id,
      street: `Grouped stop (${g.stopIds.length} stops)`,
      city: route.stops[0]?.city ?? '',
      state: route.stops[0]?.state ?? '',
      zip: route.stops[0]?.zip ?? '',
      lat: g.center.lat,
      lng: g.center.lng,
    }))
    return [...route.stops.filter((s) => !grouped.has(s.id)), ...centers]
  }, [route, acceptedGroups])

  if (!route) return <p>No routes. Reload the page.</p>

  const onImport = (r: ImportResult) => {
    setSampleMode(false)
    setImportInfo(r)
    setProposals([])
    setAccepted([])
    updateRoute(route.id, (old) => ({ ...old, stops: r.stops, versions: [] }))
    setStatus(`Imported ${r.stops.length} stops.`)
  }

  const onSample = () => {
    if (route.stops.length > 0 && !window.confirm('Load the sample data? It replaces the current workspace.')) return
    const sample = sampleWorkspace()
    setWs(sample)
    setRouteId(sample.routes[0].id)
    setSampleMode(true)
    setImportInfo(null)
    setProposals([])
    setAccepted([])
    setStatus(
      'Sample data loaded — Maplewood is a fictional town: 40 fake stops on a model street grid, split into two routes of 20 so one bus can finish within the 60-minute max ride. No network needed.',
    )
  }

  const splitRoute = () => {
    const [a, b] = splitStopsInTwo(route.stops)
    if (!b.length) {
      setStatus('Could not split this route — too few located stops.')
      return
    }
    const centroidLng = (g: Stop[]) =>
      g.reduce((sum, s) => sum + (s.lng ?? 0), 0) / Math.max(g.length, 1)
    const [westG, eastG] = centroidLng(a) <= centroidLng(b) ? [a, b] : [b, a]
    const mk = (suffix: string, stops: Stop[], id: string): BusRoute => ({
      id,
      name: `${route.name} — ${suffix}`,
      settings: { ...route.settings },
      stops,
      versions: [],
    })
    setWs((w) => ({
      ...w,
      routes: w.routes.flatMap((r) =>
        r.id === route.id ? [mk('West', westG, `${route.id}-W`), mk('East', eastG, `${route.id}-E`)] : [r],
      ),
    }))
    setRouteId(`${route.id}-W`)
    setProposals([])
    setAccepted([])
    setStatus(
      `Split into two routes (${westG.length} west / ${eastG.length} east stops). Optimize each route to check its ride times.`,
    )
  }

  const geocode = async () => {
    const targets = route.stops.filter((s) => s.lat === undefined)
    if (!targets.length) {
      setStatus('All stops already have coordinates.')
      return
    }
    setStatus(`Geocoding ${targets.length} stops via the US Census geocoder…`)
    const results = await geocodeBatch(fetch, targets, (done, total) =>
      setStatus(`Geocoding… ${done}/${total}`),
    )
    const byId = new Map(targets.map((t, i) => [t.id, results[i]]))
    updateRoute(route.id, (old) => ({
      ...old,
      stops: old.stops.map((s) => {
        const r = byId.get(s.id)
        return r ? { ...s, lat: r.lat, lng: r.lng } : s
      }),
    }))
    const found = results.filter(Boolean).length
    setStatus(
      `Geocoded ${found}/${targets.length} stops.${found < targets.length ? ' Unmatched stops are skipped when optimizing.' : ''}`,
    )
  }

  const optimize = () => {
    if (ws.depot.lat === undefined || ws.depot.lng === undefined) {
      setStatus('The school/depot has no coordinates yet — load the sample data, or geocode a depot address first.')
      return
    }
    const located = effectiveStops.filter((s) => s.lat !== undefined)
    if (located.length < 2) {
      setStatus('Need at least 2 stops with coordinates to optimize.')
      return
    }
    const pts = [
      { lat: ws.depot.lat, lng: ws.depot.lng },
      ...located.map((s) => ({ lat: s.lat!, lng: s.lng! })),
    ]
    const net = buildGridNetwork(pts)
    const graph = buildGraph(net.nodes, net.segments)
    const versions = runRoute(graph, { lat: ws.depot.lat, lng: ws.depot.lng }, effectiveStops, route.settings)
    updateRoute(route.id, (old) => ({ ...old, versions }))
    setStatus('Optimized locally on a street-grid model — no coordinates were sent to any routing server.')
  }

  const result = route.versions.find((v) => v.profile === profile)
  const stopById = new Map(effectiveStops.map((s) => [s.id, s]))

  return (
    <div className="layout">
      <aside>
        <h1>🚌 Bus Router</h1>
        <p className="hint">
          Names are stripped at import. Nothing is stored on a server. Routing runs locally in your
          browser — coordinates are never sent to a routing service. The only external call is the
          Census geocoder, if you use it.
        </p>
        <h3>Routes</h3>
        <ul className="routes">
          {ws.routes.map((r) => (
            <li key={r.id} className={r.id === route.id ? 'active' : ''}>
              <button onClick={() => setRouteId(r.id)}>{r.name}</button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => {
            const id = `R${Date.now()}`
            setWs((w) => ({
              ...w,
              routes: [
                ...w.routes,
                { id, name: `Route ${w.routes.length + 1}`, settings: { ...DEFAULT_SETTINGS }, stops: [], versions: [] },
              ],
            }))
            setRouteId(id)
          }}
        >
          + Add route
        </button>{' '}
        <button
          onClick={() => setWs((w) => ({ ...w, routes: w.routes.filter((r) => r.id !== route.id) }))}
          disabled={ws.routes.length <= 1}
        >
          Delete route
        </button>
        <p>
          <label>
            Route name{' '}
            <input
              value={route.name}
              onChange={(e) => updateRoute(route.id, (old) => ({ ...old, name: e.target.value }))}
            />
          </label>
        </p>
        <p>
          <label>
            School / depot{' '}
            <input
              value={ws.depot.street}
              placeholder="Street address"
              onChange={(e) => setWs((w) => ({ ...w, depot: { ...w.depot, street: e.target.value } }))}
            />
          </label>
          <br />
          <span className="hint">
            {ws.depot.lat !== undefined
              ? `Coordinates: ${fmt(ws.depot.lat, 4)}, ${fmt(ws.depot.lng!, 4)}`
              : 'No coordinates yet — sample data sets them.'}
          </span>
        </p>
        <h3>Project file</h3>
        <button onClick={() => download('bus-routes.project.json', serializeProject(ws))}>
          Export project
        </button>{' '}
        <button onClick={() => projectFileRef.current?.click()}>Import project</button>
        <input
          ref={projectFileRef}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              const parsed = parseProject(await f.text())
              setSampleMode(false)
              setWs(parsed)
              setRouteId(parsed.routes[0]?.id ?? '')
              setStatus('Project loaded and redrawn from file — no geocoding or server needed.')
            } catch {
              setStatus('That file is not a valid project file.')
            }
          }}
        />
      </aside>

      <main>
        <ImportPanel onImport={onImport} onSample={onSample} />
        {importInfo && (
          <p className="notice">
            {importInfo.droppedColumns.length > 0 && (
              <>Dropped name columns: <b>{importInfo.droppedColumns.join(', ')}</b>. </>
            )}
            {importInfo.duplicateRows.length > 0 && <>Duplicate rows: {importInfo.duplicateRows.join(', ')}. </>}
            {importInfo.errors.map((e) => (
              <span key={e.row}>Row {e.row}: {e.message}. </span>
            ))}
          </p>
        )}
        {status && <p className="notice">{status}</p>}

        <section>
          <h2>2. Stops ({route.stops.length})</h2>
          <p>
            <button onClick={() => void geocode()}>Geocode missing coordinates (Census)</button>{' '}
            <button
              onClick={() => {
                const limit = WALK_LIMIT_MI[route.settings.level]
                const p = proposeGroups(route.stops, limit)
                setProposals(p)
                setAccepted([])
                setStatus(
                  p.length
                    ? `${p.length} grouped-stop proposals within a ${limit} mi walk.`
                    : 'No grouped-stop proposals — stops are too far apart.',
                )
              }}
            >
              Propose grouped stops
            </button>{' '}
            <span className="hint">Walk limit comes from the Level setting in step 3.</span>
          </p>
          {proposals.map((p) => (
            <p key={p.id} className="group-row">
              <b>{p.id}</b>: {p.stopIds.join(', ')} → 1 stop (saves {p.stopsSaved}), max walk{' '}
              {fmt(p.maxWalkMi, 2)} mi{' '}
              <button
                onClick={() =>
                  setAccepted((a) => (a.includes(p.id) ? a.filter((x) => x !== p.id) : [...a, p.id]))
                }
              >
                {accepted.includes(p.id) ? 'Reject' : 'Accept'}
              </button>
            </p>
          ))}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Street</th><th>City</th><th>ZIP</th><th>Lat</th><th>Lng</th></tr>
              </thead>
              <tbody>
                {route.stops.slice(0, 60).map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.street}</td>
                    <td>{s.city}</td>
                    <td>{s.zip}</td>
                    <td>{s.lat !== undefined ? fmt(s.lat, 4) : '—'}</td>
                    <td>{s.lng !== undefined ? fmt(s.lng, 4) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>3. Settings &amp; optimize</h2>
          <p className="settings">
            <label>
              Period{' '}
              <select
                value={route.settings.period}
                onChange={(e) =>
                  updateRoute(route.id, (o) => ({ ...o, settings: { ...o.settings, period: e.target.value as 'AM' | 'PM' } }))
                }
              >
                <option>AM</option>
                <option>PM</option>
              </select>
            </label>
            <label>
              Departure{' '}
              <input
                type="time"
                value={route.settings.departureTime}
                onChange={(e) =>
                  updateRoute(route.id, (o) => ({ ...o, settings: { ...o.settings, departureTime: e.target.value } }))
                }
              />
            </label>
            <label>
              Level{' '}
              <select
                value={route.settings.level}
                onChange={(e) =>
                  updateRoute(route.id, (o) => ({ ...o, settings: { ...o.settings, level: e.target.value as 'elementary' | 'older' } }))
                }
              >
                <option value="elementary">Elementary (0.25 mi walk)</option>
                <option value="older">Older (0.5 mi walk)</option>
              </select>
            </label>
            <label>
              Bus MPG{' '}
              <input
                type="number"
                min={1}
                max={30}
                value={route.settings.mpg}
                onChange={(e) =>
                  updateRoute(route.id, (o) => ({ ...o, settings: { ...o.settings, mpg: Number(e.target.value) || 8 } }))
                }
              />
            </label>
            <label>
              Fuel $/gal{' '}
              <input
                type="number"
                min={0}
                max={20}
                step={0.1}
                value={route.settings.fuelPrice}
                onChange={(e) =>
                  updateRoute(route.id, (o) => ({ ...o, settings: { ...o.settings, fuelPrice: Number(e.target.value) || 4 } }))
                }
              />
            </label>
            <label>
              Max ride (min){' '}
              <input
                type="number"
                min={5}
                max={240}
                value={route.settings.maxRideMinutes}
                onChange={(e) =>
                  updateRoute(route.id, (o) => ({ ...o, settings: { ...o.settings, maxRideMinutes: Number(e.target.value) || 60 } }))
                }
              />
            </label>
          </p>
          <button className="primary" onClick={optimize}>
            Optimize route
          </button>
        </section>

        {route.versions.length > 0 && (
          <section>
            <h2>4. Results</h2>
            <div className="cards">
              {route.versions.map((v) => (
                <button
                  key={v.profile}
                  className={v.profile === profile ? 'card active' : 'card'}
                  onClick={() => setProfile(v.profile)}
                >
                  <b>{PROFILE_LABELS[v.profile]}</b>
                  <span>
                    {fmt(v.scorecard.totalTimeMin)} min · {fmt(v.scorecard.totalDistanceMi)} mi
                  </span>
                  <span>
                    Fuel {fmt(v.scorecard.fuelGallons, 2)} gal (${fmt(v.scorecard.fuelCost, 2)}) · CO₂{' '}
                    {fmt(v.scorecard.co2Kg)} kg
                  </span>
                  <span>
                    Left turns {v.scorecard.leftTurns} · U-turns {v.scorecard.uTurns}
                  </span>
                  <span>
                    Max ride {fmt(v.scorecard.maxRideMin)} min · Avg {fmt(v.scorecard.avgRideMin)} min
                  </span>
                  {v.rideViolations.length > 0 && (
                    <span className="warn">⚠ {v.rideViolations.length} stops over the ride limit</span>
                  )}
                  {v.profile === profile && <span>● Shown on map &amp; driver sheet below</span>}
                </button>
              ))}
            </div>
            <p className="hint">
              Assumptions: fuel priced at ${fmt(route.settings.fuelPrice, 2)}/gal (change in step 3);
              CO₂ at 10.21 kg per gallon of diesel; {fmt(route.settings.dwellMinutes)} min loading time
              per stop. Max ride is a policy target the optimizer reports against — it is not
              automatic. If every profile is over, the usual fix is a second bus:
            </p>
            {result && result.rideViolations.length > 0 && (
              <p className="notice">
                ⚠ <b>{PROFILE_LABELS[result.profile]}</b> puts {result.rideViolations.length} stops over
                the {route.settings.maxRideMinutes}-minute max ride: {result.rideViolations.join(', ')}.
                One bus serving all {route.stops.length} stops cannot get the first riders to school in
                time.{' '}
                <button onClick={splitRoute}>Split stops into 2 routes</button>
              </p>
            )}
            {result && (
              <>
                <MapView
                  geometry={result.geometry}
                  stops={effectiveStops}
                  depot={ws.depot}
                  center={sampleMode ? SAMPLE_CENTER : undefined}
                  gridLines={sampleMode ? sampleStreetLines() : undefined}
                />
                {sampleMode && (
                  <p className="hint">
                    Maplewood is fictional: the gray streets are the model street grid the sample
                    routes drive on. They sit on top of a real basemap (Kent/Covington, WA) and do
                    not line up with its streets — real-road routing arrives with the real street
                    network in the next phase.
                  </p>
                )}
                <h3>Stop order — {PROFILE_LABELS[result.profile]} (driver sheet)</h3>
                <ol>
                  <li>
                    <b>Start:</b> {ws.depot.street || 'School'} — depart{' '}
                    {fmtClock(route.settings.departureTime, 0)}
                  </li>
                  {result.order.map((id, i) => (
                    <li key={id}>
                      <b>{id}</b> · {stopById.get(id)?.street ?? id}
                      {result.stopTimesMin && (
                        <> · {fmtClock(route.settings.departureTime, result.stopTimesMin[i])}</>
                      )}
                    </li>
                  ))}
                  <li>
                    <b>Return:</b> {ws.depot.street || 'School'} — arrive{' '}
                    {fmtClock(route.settings.departureTime, result.scorecard.totalTimeMin)}
                  </li>
                </ol>
                <button
                  onClick={() =>
                    download(
                      `${route.name.replace(/\s+/g, '-').toLowerCase()}.share.json`,
                      JSON.stringify(shareableExport({ ...route, stops: effectiveStops }, result), null, 2),
                    )
                  }
                >
                  Export shareable route (no addresses)
                </button>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
