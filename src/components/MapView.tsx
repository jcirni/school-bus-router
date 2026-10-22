import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, Stop } from '../lib/types'

interface Props {
  geometry: LatLng[]
  stops: Stop[]
  depot: Stop
  center?: LatLng
  // model streets (sample data) drawn under the route so it visibly follows roads
  gridLines?: { name: string; points: LatLng[] }[]
}

// Leaflet with circle markers (avoids bundler icon-asset issues); tiles need network, route draws offline
export default function MapView({ geometry, stops, depot, center, gridLines }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const map = L.map(divRef.current).setView(
      center ? [center.lat, center.lng] : [47.45, -122.3],
      13,
    )
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    const map = mapRef.current
    if (!layer || !map) return
    layer.clearLayers()
    const pts: L.LatLngExpression[] = []
    for (const line of gridLines ?? []) {
      const ll = line.points.map((p) => [p.lat, p.lng] as L.LatLngExpression)
      L.polyline(ll, { color: '#9aa3ad', weight: 5, opacity: 0.55 }).addTo(layer).bindTooltip(line.name)
    }
    if (depot.lat !== undefined && depot.lng !== undefined) {
      L.circleMarker([depot.lat, depot.lng], { color: '#b3001b', radius: 7 }).addTo(layer).bindTooltip('School')
      pts.push([depot.lat, depot.lng])
    }
    for (const s of stops) {
      if (s.lat === undefined || s.lng === undefined) continue
      L.circleMarker([s.lat, s.lng], { color: '#1d4ed8', radius: 4 }).addTo(layer).bindTooltip(s.id)
      pts.push([s.lat, s.lng])
    }
    if (geometry.length > 1) {
      const line = geometry.map((p) => [p.lat, p.lng] as L.LatLngExpression)
      L.polyline(line, { color: '#e07a00', weight: 3 }).addTo(layer)
      pts.push(...line)
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.1))
  }, [geometry, stops, depot, gridLines])

  return <div ref={divRef} style={{ height: 380, width: '100%' }} />
}
