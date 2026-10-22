import type { BusRoute, LatLng, RouteResult, Workspace } from './types'

export interface ProjectFile {
  format: 'school-bus-router-project'
  version: 1
  workspace: Workspace
}

export function serializeProject(ws: Workspace): string {
  const file: ProjectFile = { format: 'school-bus-router-project', version: 1, workspace: ws }
  return JSON.stringify(file, null, 2)
}

export function parseProject(json: string): Workspace {
  const data = JSON.parse(json) as ProjectFile
  if (data.format !== 'school-bus-router-project' || data.version !== 1) {
    throw new Error('Not a school-bus-router project file')
  }
  if (!data.workspace || !Array.isArray(data.workspace.routes) || !data.workspace.depot) {
    throw new Error('Project file is missing its workspace')
  }
  return data.workspace
}

export interface ShareableRoute {
  format: 'school-bus-route-share'
  version: 1
  routeName: string
  profile: string
  // no street addresses in a shareable file — coordinates, order, geometry, scorecard only
  stops: { stopId: string; position: number; lat?: number; lng?: number }[]
  geometry: LatLng[]
  scorecard: RouteResult['scorecard']
}

export function shareableExport(route: BusRoute, result: RouteResult): ShareableRoute {
  const byId = new Map(route.stops.map((s) => [s.id, s]))
  return {
    format: 'school-bus-route-share',
    version: 1,
    routeName: route.name,
    profile: result.profile,
    stops: result.order.map((id, i) => {
      const s = byId.get(id)
      return { stopId: id, position: i + 1, lat: s?.lat, lng: s?.lng }
    }),
    geometry: result.geometry,
    scorecard: result.scorecard,
  }
}
