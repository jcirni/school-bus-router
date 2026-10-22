import type { Graph } from './graph'
import { buildMatrix, routeThrough } from './graph'
import { solveRoute } from './optimizer'
import { computeScorecard } from './scorecard'
import type { LatLng, ProfileId, RouteResult, RouteSettings, Stop } from './types'

const ALL_PROFILES: ProfileId[] = ['fastest', 'fuel', 'safest']

// stops + depot -> optimized result for each profile, all local
export function runRoute(graph: Graph, depot: LatLng, stops: Stop[], settings: RouteSettings): RouteResult[] {
  const located = stops.filter((s) => s.lat !== undefined && s.lng !== undefined)
  const points: LatLng[] = [{ lat: depot.lat, lng: depot.lng }, ...located.map((s) => ({ lat: s.lat!, lng: s.lng! }))]
  const matrix = buildMatrix(graph, points)
  return ALL_PROFILES.map((profile) => {
    const solved = solveRoute(matrix, {
      profile,
      maxRideMinutes: settings.maxRideMinutes,
      dwellMinutes: settings.dwellMinutes,
      direction: settings.period === 'AM' ? 'pickup' : 'dropoff',
    })
    const orderedPoints = [points[0], ...solved.order.map((i) => points[i]), points[0]]
    const routed = routeThrough(graph, orderedPoints)
    const rideTimes = solved.order.map((i) => solved.rideTimesMin.get(i) ?? 0)
    const scorecard = computeScorecard({
      totalTimeMin: solved.totalTimeMin,
      totalDistanceMi: solved.totalDistanceMi,
      leftTurns: routed?.leftTurns ?? 0,
      uTurns: routed?.uTurns ?? 0,
      rideTimesMin: rideTimes,
      stopCount: located.length,
      mpg: settings.mpg,
      fuelPrice: settings.fuelPrice,
    })
    return {
      profile,
      order: solved.order.map((i) => located[i - 1].id),
      stopTimesMin: solved.order.map((i) => solved.arrivalMin.get(i) ?? 0),
      geometry: routed?.geometry ?? orderedPoints,
      scorecard,
      rideViolations: solved.violations.map((i) => located[i - 1].id),
    }
  })
}
