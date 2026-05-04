import { useState, useRef, useEffect } from 'react'
import { MapPin, Undo2, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { geocodeAddress } from '@/lib/satellite-measure/geocode'
import type { MeasurementResult, FallbackReason, SatelliteMeasureProps } from '@/lib/satellite-measure/types'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
const SQM_TO_SQFT = 10.7639
const M_TO_FT = 3.28084
// Tap within this many metres of first vertex to auto-close (mobile-friendly)
const CLOSE_TOLERANCE_M = 10

// Singleton load — avoids duplicate script tags on remount
let mapsPromise: Promise<void> | null = null
function loadMapsJs(): Promise<void> {
  if ((window as any).google?.maps?.geometry) return Promise.resolve()
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&libraries=geometry`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { mapsPromise = null; reject(new Error('Maps JS load failed')) }
    document.head.appendChild(s)
  })
  return mapsPromise
}

interface PolygonResult { areaSqft: number; perimeterFt: number }

interface Props {
  serviceCategory: SatelliteMeasureProps['serviceCategory']
  initialAddress: string
  onMeasure: (r: MeasurementResult) => void
  onFallback?: (reason: FallbackReason, address: string) => void
  onFail: () => void // signals Maps JS unavailable → caller falls back to ManualEntryForm
}

export function PolygonDraw({ serviceCategory, initialAddress, onMeasure, onFallback, onFail }: Props) {
  const [address, setAddress] = useState(initialAddress)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'input' | 'drawing' | 'done'>('input')
  const [result, setResult] = useState<PolygonResult | null>(null)
  const [vertexCount, setVertexCount] = useState(0)

  // Refs — stable across renders, no re-init
  const geoRef = useRef<{ lat: number; lng: number; addr: string } | null>(null)
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const pathRef = useRef<google.maps.LatLng[]>([])
  const previewPolyRef = useRef<google.maps.Polyline | null>(null)
  const closingLineRef = useRef<google.maps.Polyline | null>(null)
  const firstMarkerRef = useRef<google.maps.Marker | null>(null)
  const polygonRef = useRef<google.maps.Polygon | null>(null)
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null)

  async function handleShowMap() {
    if (!address.trim()) return
    setLoading(true)
    const geo = await geocodeAddress(address)
    if (!geo) {
      setLoading(false)
      onFallback?.('geocode_failed', address)
      onFail()
      return
    }
    geoRef.current = { lat: geo.lat, lng: geo.lng, addr: geo.canonicalAddress }

    try {
      await loadMapsJs()
    } catch {
      setLoading(false)
      onFallback?.('service_api_failed', geo.canonicalAddress)
      onFail()
      return
    }
    setLoading(false)
    setPhase('drawing')
  }

  // Init map after phase flips to 'drawing' and the div mounts
  useEffect(() => {
    if (phase !== 'drawing' || !mapDivRef.current || mapRef.current || !geoRef.current) return
    const { lat, lng } = geoRef.current

    const map = new google.maps.Map(mapDivRef.current, {
      center: { lat, lng },
      zoom: 19,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    })
    mapRef.current = map

    // Preview polyline — vertices placed so far
    const previewPoly = new google.maps.Polyline({
      map,
      path: [],
      strokeColor: '#2563eb',
      strokeWeight: 2,
      strokeOpacity: 1,
    })
    previewPolyRef.current = previewPoly

    // Dotted closing line from last vertex back to first
    const closingLine = new google.maps.Polyline({
      map,
      path: [],
      strokeColor: '#2563eb',
      strokeWeight: 1.5,
      strokeOpacity: 0.5,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '8px' }],
    })
    closingLineRef.current = closingLine

    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      const path = pathRef.current

      // Tap near first vertex with ≥3 pts → close polygon
      if (path.length >= 3) {
        const dist = google.maps.geometry.spherical.computeDistanceBetween(e.latLng, path[0])
        if (dist <= CLOSE_TOLERANCE_M) {
          closePolygon()
          return
        }
      }

      path.push(e.latLng)
      setVertexCount(path.length)
      updatePreview()

      // Show close-target marker on first vertex after ≥3 points placed
      if (path.length === 3 && !firstMarkerRef.current) {
        firstMarkerRef.current = new google.maps.Marker({
          map,
          position: path[0],
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#ffffff',
            fillOpacity: 1,
            strokeColor: '#2563eb',
            strokeWeight: 2,
          },
          title: 'Tap to close',
          clickable: true,
        })
        firstMarkerRef.current.addListener('click', closePolygon)
      }
    })
    clickListenerRef.current = listener
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function updatePreview() {
    const path = pathRef.current
    previewPolyRef.current?.setPath(path)
    if (path.length >= 2) {
      closingLineRef.current?.setPath([path[path.length - 1], path[0]])
    } else {
      closingLineRef.current?.setPath([])
    }
  }

  function handleUndo() {
    if (phase === 'drawing') {
      // Undo last placed vertex during drawing
      if (pathRef.current.length > 0) {
        pathRef.current.pop()
        setVertexCount(pathRef.current.length)
        updatePreview()
        // Remove close marker if back to < 3 points
        if (pathRef.current.length < 3 && firstMarkerRef.current) {
          firstMarkerRef.current.setMap(null)
          firstMarkerRef.current = null
        }
      }
    } else if (phase === 'done' && polygonRef.current) {
      // Undo last vertex on completed editable polygon
      const polyPath = polygonRef.current.getPath()
      if (polyPath.getLength() > 3) {
        polyPath.removeAt(polyPath.getLength() - 1)
        recompute()
      }
    }
  }

  function closePolygon() {
    const path = pathRef.current
    if (path.length < 3) return

    // Remove drawing listeners + preview overlays
    if (clickListenerRef.current) {
      google.maps.event.removeListener(clickListenerRef.current)
      clickListenerRef.current = null
    }
    previewPolyRef.current?.setMap(null)
    closingLineRef.current?.setMap(null)
    firstMarkerRef.current?.setMap(null)

    const poly = new google.maps.Polygon({
      map: mapRef.current!,
      paths: path,
      fillColor: '#2563eb',
      fillOpacity: 0.25,
      strokeColor: '#2563eb',
      strokeWeight: 2,
      editable: true,
      clickable: true,
    })
    polygonRef.current = poly

    // Live recompute on vertex edits
    const polyPath = poly.getPath()
    polyPath.addListener('set_at', recompute)
    polyPath.addListener('insert_at', recompute)
    polyPath.addListener('remove_at', recompute)

    recompute()
    setPhase('done')
  }

  function recompute() {
    const poly = polygonRef.current
    if (!poly) return
    const polyPath = poly.getPath()
    const areaSqm = google.maps.geometry.spherical.computeArea(polyPath)
    const perimeterM = google.maps.geometry.spherical.computeLength(polyPath)
    setResult({
      areaSqft: Math.round(areaSqm * SQM_TO_SQFT),
      perimeterFt: Math.round(perimeterM * M_TO_FT),
    })
  }

  function handleReset() {
    // Clear polygon + restore drawing mode
    if (clickListenerRef.current) {
      google.maps.event.removeListener(clickListenerRef.current)
      clickListenerRef.current = null
    }
    polygonRef.current?.setMap(null)
    polygonRef.current = null
    firstMarkerRef.current?.setMap(null)
    firstMarkerRef.current = null
    pathRef.current = []
    setVertexCount(0)
    setResult(null)
    setPhase('drawing')

    // Re-attach preview overlays and click listener
    if (mapRef.current) {
      previewPolyRef.current = new google.maps.Polyline({
        map: mapRef.current, path: [],
        strokeColor: '#2563eb', strokeWeight: 2, strokeOpacity: 1,
      })
      closingLineRef.current = new google.maps.Polyline({
        map: mapRef.current, path: [],
        strokeColor: '#2563eb', strokeWeight: 1.5, strokeOpacity: 0.5,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '8px' }],
      })
      clickListenerRef.current = mapRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return
        const path = pathRef.current
        if (path.length >= 3) {
          const dist = google.maps.geometry.spherical.computeDistanceBetween(e.latLng, path[0])
          if (dist <= CLOSE_TOLERANCE_M) { closePolygon(); return }
        }
        path.push(e.latLng)
        setVertexCount(path.length)
        updatePreview()
        if (path.length === 3 && !firstMarkerRef.current) {
          firstMarkerRef.current = new google.maps.Marker({
            map: mapRef.current!, position: path[0],
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#2563eb', strokeWeight: 2 },
            title: 'Tap to close', clickable: true,
          })
          firstMarkerRef.current.addListener('click', closePolygon)
        }
      })
    }
  }

  function handleConfirm() {
    if (!result || !geoRef.current) return
    const isFencing = serviceCategory === 'fencing'
    onMeasure({
      address: geoRef.current.addr,
      areaSqft: isFencing ? 0 : result.areaSqft,
      measurements: serviceCategory === 'driveways'
        ? { type: 'driveway', areaSqft: result.areaSqft, lengthFt: result.perimeterFt }
        : isFencing
        ? { type: 'fencing', perimeterFt: result.perimeterFt }
        : { type: 'area_only', areaSqft: result.areaSqft, perimeterFt: result.perimeterFt },
      isMock: false,
    })
  }

  const showMap = phase === 'drawing' || phase === 'done'

  return (
    <div className="space-y-3" data-satellite-measure={serviceCategory} data-measure-mode="polygon-draw">
      {/* Address input — shown until map is visible */}
      {phase === 'input' && (
        <div className="space-y-1.5">
          <Label htmlFor="poly-address">Project address</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="poly-address"
                data-satellite-input="address"
                className="pl-9"
                placeholder="123 Main St, Miami, FL"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleShowMap() }}
              />
            </div>
            <Button
              data-measure-action="show-map"
              onClick={handleShowMap}
              disabled={loading || !address.trim()}
              className="shrink-0"
            >
              {loading ? 'Loading…' : 'Show Map'}
            </Button>
          </div>
        </div>
      )}

      {/* Satellite map — always in DOM once shown (mapRef needs a stable div) */}
      <div
        ref={mapDivRef}
        className={cn(
          'w-full rounded-xl overflow-hidden border',
          !showMap && 'hidden',
        )}
        style={{ height: 300 }}
        data-polygon-map={serviceCategory}
      />

      {/* Drawing instructions + controls */}
      {phase === 'drawing' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {vertexCount < 3
              ? `Tap to place points (${vertexCount} placed, need ≥3)`
              : 'Tap the first point (white circle) to close the area.'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              disabled={vertexCount === 0}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPhase('input')}>
              Change address
            </Button>
          </div>
        </div>
      )}

      {/* Post-draw: result + confirm */}
      {phase === 'done' && result && (
        <div className="space-y-2">
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 p-3"
            data-measurement-result="live"
            data-measurement-sqft={serviceCategory === 'fencing' ? 0 : result.areaSqft}
            data-measurement-perimeter={result.perimeterFt}
          >
            <p className="text-sm font-medium text-foreground">
              {serviceCategory === 'fencing'
                ? `${result.perimeterFt.toLocaleString()} linear ft`
                : `${result.areaSqft.toLocaleString()} sqft · ${result.perimeterFt.toLocaleString()} ft perimeter`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Drag vertices to adjust.</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              data-measure-action="confirm-polygon"
              onClick={handleConfirm}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              {serviceCategory === 'fencing'
                ? `Use ${result.perimeterFt.toLocaleString()} linear ft`
                : `Use ${result.areaSqft.toLocaleString()} sqft`}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Redraw
            </Button>
            <Button variant="ghost" size="sm" onClick={handleUndo} disabled={polygonRef.current?.getPath().getLength() === 3}>
              <Undo2 className="h-3.5 w-3.5 mr-1" />
              Undo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
