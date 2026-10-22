# School Bus Routing Optimizer

A stupid-simple, free, open-source app that lets any US school import a list of
student addresses and get an optimized, drivable school bus route — with ranked
options scored on time, fuel, and safety. Phase 1 runs entirely in the browser.

## Privacy model (read this first)

- **Names are stripped at import.** Columns that look like student/name data are
  detected and dropped before anything is stored or sent anywhere, and the UI
  shows you exactly what was dropped.
- **No data is stored on any server.** There is no backend and no account. Your
  workspace lives in the browser tab; export a project file to keep it.
- **Routing is local-only.** Stop coordinates are **never** sent to public
  routing servers (including the public Valhalla demo server). Routes are
  computed in your browser on a locally built road graph.
- **The only external call is the US Census geocoder** — and only when you
  click "Geocode". Address text goes to census.gov (a US federal service, free,
  no key) to become coordinates. Map tiles, if loaded, are downloads only.

## What it does

1. **Import** — CSV, Excel (.xlsx), or pasted text (one full address per line,
   or a comma-separated street list plus city/state/ZIP). Duplicates and bad
   rows are flagged; the preview shows dropped name columns.
2. **Geocode** — via the Census Geocoder, with an in-app progress readout.
   Or use the bundled sample data — the fictional town of Maplewood: 40 fake
   stops on a model street grid, pre-split into two routes of 20 so one bus can
   finish within the default 60-minute max ride. The whole demo works offline.
3. **Group stops (optional)** — proposes grouped stops within a max walk of
   0.25 mi (elementary) or 0.5 mi (older students); stops in different arterial
   zones are never grouped together. You accept or reject each proposal.
4. **Optimize** — a local solver (nearest neighbor + 2-opt) orders the stops
   from and back to the school, separately for AM pickup and PM drop-off.
5. **Compare three profiles** — Fastest, Lowest Fuel, and Safest / Right-Turn —
   each with a scorecard: total time, miles, estimated fuel gallons + cost, CO₂,
   left/U-turn counts, and max/average student ride time, with violations of
   your max ride time flagged. The driver sheet lists every stop with its ID
   and scheduled time. Max ride is a policy target, not an automatic
   constraint — when no profile can meet it, the app says so and offers to
   split the stops into two routes (geographic split) so a second bus can.
6. **Export** — a project file (reopen later with no server) and a sanitized
   shareable route file that contains coordinates, order, and the scorecard —
   no street addresses.

## Known Phase 1 simplifications

- The in-browser road network is a **street-grid model** built over the stop
  area (with a one-way avenue and an arterial), not a downloaded OpenStreetMap
  extract. It proves the local-routing pipeline; real OSM graph loading is the
  next step. Treat Phase 1 routes as planning estimates.
- The solver is a strong heuristic, not a proof of optimality.
- One bus per route in the solver; a manual "split stops into 2 routes"
  action covers the common second-bus case. Optimized multi-bus splitting is
  Phase 2 (Python + OR-Tools, self-hosted).
- The sample town's model streets are drawn on the map in gray; they sit on a
  real basemap (Kent/Covington, WA) and deliberately do not line up with its
  streets. Sample stops are placed on residential land only.

## Develop

```sh
npm install
npm run dev     # local dev server
npm test        # vitest — every library feature has tests, all offline
npm run build   # type-check + production build
```

Or open the repo in GitHub Codespaces — `.devcontainer/` defines the light
profile (Node 24, dependencies installed, sample data included).

## Layout

- `src/lib/` — pure TypeScript core: import parsing, address normalization,
  Census geocoder client, road graph + Dijkstra, grouped stops, optimizer,
  scorecard, project file. Each module has a sibling `.test.ts`.
- `src/components/` — import panel and Leaflet map.
- `src/App.tsx` — workspace sidebar, stops, settings, results.

Phase 2 adds a self-hosted Python backend (OR-Tools, self-hosted Valhalla for
polished directions, WSDOT AADT traffic prototype for Washington).

## License

MIT. Road data concepts © OpenStreetMap contributors (ODbL) where applicable.
