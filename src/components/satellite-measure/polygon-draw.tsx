import { useState, useRef, useEffect } from 'react'
import { MapPin, Undo2, RotateCcw, Check, PlusCircle, X } from 'lucide-react'
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
// Zoom 20 — highest reliably crisp satellite tier in South Florida.
// Zoom 21 tiles are inconsistent (suburban properties upscale from 20 → blurry).
const MAP_ZOOM = 20

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
  // Editable sqft — user can adjust the measured total before confirming
  const [editedSqft, setEditedSqft] = useState('')

  // Entrance drawing state (driveways only, optional)
  const [entrancePhase, setEntrancePhase] = useState<'idle' | 'drawing' | 'done'>('idle')
  const [entranceResult, setEntranceResult] = useState<{ areaSqft: number } | null>(null)
  const [entranceVertexCount, setEntranceVertexCount] = useState(0)

  // Sync editedSqft when polygon recomputes (vertex drag)
  useEffect(() => {
    if (result) setEditedSqft(String(result.areaSqft))
  }, [result?.areaSqft]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // Cursor visual — circle that follows mouse while drawing
  const cursorMarkerRef = useRef<google.maps.Marker | null>(null)
  const mouseMoveListenerRef = useRef<google.maps.MapsEventListener | null>(null)
  // Entrance polygon refs
  const entrancePathRef = useRef<google.maps.LatLng[]>([])
  const entrancePreviewPolyRef = useRef<google.maps.Polyline | null>(null)
  const entranceClosingLineRef = useRef<google.maps.Polyline | null>(null)
  const entranceFirstMarkerRef = useRef<google.maps.Marker | null>(null)
  const entrancePolygonRef = useRef<google.maps.Polygon | null>(null)
  const entranceClickListenerRef = useRef<google.maps.MapsEventListener | null>(null)

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
      zoom: MAP_ZOOM,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    })
    mapRef.current = map

    // Cursor-position circle — shows where the next vertex will land
    mouseMoveListenerRef.current = map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      if (!cursorMarkerRef.current) {
        cursorMarkerRef.current = new google.maps.Marker({
          map,
          position: e.latLng,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: '#2563eb',
            fillOpacity: 0.65,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
          },
          clickable: false,
          zIndex: 1,
        })
      } else {
        cursorMarkerRef.current.setPosition(e.latLng)
      }
    })

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
      if (pathRef.current.length > 0) {
        pathRef.current.pop()
        setVertexCount(pathRef.current.length)
        updatePreview()
        if (pathRef.current.length < 3 && firstMarkerRef.current) {
          firstMarkerRef.current.setMap(null)
          firstMarkerRef.current = null
        }
      }
    } else if (phase === 'done' && polygonRef.current) {
      const polyPath = polygonRef.current.getPath()
      if (polyPath.getLength() > 3) {
        polyPath.removeAt(polyPath.getLength() - 1)
        recompute()
      }
    }
  }

  function hideCursorMarker() {
    if (mouseMoveListenerRef.current) {
      google.maps.event.removeListener(mouseMoveListenerRef.current)
      mouseMoveListenerRef.current = null
    }
    cursorMarkerRef.current?.setMap(null)
    cursorMarkerRef.current = null
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
    hideCursorMarker()

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

  // ---- Entrance drawing (driveways only) ----

  function startEntranceDrawing() {
    setEntrancePhase('drawing')
    setEntranceVertexCount(0)
    entrancePathRef.current = []

    if (!mapRef.current) return

    // Restore cursor marker for entrance drawing
    mouseMoveListenerRef.current = mapRef.current.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      if (!cursorMarkerRef.current) {
        cursorMarkerRef.current = new google.maps.Marker({
          map: mapRef.current!,
          position: e.latLng,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: '#d97706',
            fillOpacity: 0.65,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
          },
          clickable: false,
          zIndex: 1,
        })
      } else {
        cursorMarkerRef.current.setPosition(e.latLng)
      }
    })

    entrancePreviewPolyRef.current = new google.maps.Polyline({
      map: mapRef.current, path: [],
      strokeColor: '#d97706', strokeWeight: 2, strokeOpacity: 1,
    })
    entranceClosingLineRef.current = new google.maps.Polyline({
      map: mapRef.current, path: [],
      strokeColor: '#d97706', strokeWeight: 1.5, strokeOpacity: 0.5,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '8px' }],
    })

    entranceClickListenerRef.current = mapRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      const path = entrancePathRef.current
      if (path.length >= 3) {
        const dist = google.maps.geometry.spherical.computeDistanceBetween(e.latLng, path[0])
        if (dist <= CLOSE_TOLERANCE_M) { closeEntrance(); return }
      }
      path.push(e.latLng)
      setEntranceVertexCount(path.length)
      updateEntrancePreview()
      if (path.length === 3 && !entranceFirstMarkerRef.current) {
        entranceFirstMarkerRef.current = new google.maps.Marker({
          map: mapRef.current!, position: path[0],
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#d97706', strokeWeight: 2 },
          title: 'Tap to close', clickable: true,
        })
        entranceFirstMarkerRef.current.addListener('click', closeEntrance)
      }
    })
  }

  function updateEntrancePreview() {
    const path = entrancePathRef.current
    entrancePreviewPolyRef.current?.setPath(path)
    if (path.length >= 2) {
      entranceClosingLineRef.current?.setPath([path[path.length - 1], path[0]])
    } else {
      entranceClosingLineRef.current?.setPath([])
    }
  }

  function closeEntrance() {
    const path = entrancePathRef.current
    if (path.length < 3) return

    if (entranceClickListenerRef.current) {
      google.maps.event.removeListener(entranceClickListenerRef.current)
      entranceClickListenerRef.current = null
    }
    entrancePreviewPolyRef.current?.setMap(null)
    entranceClosingLineRef.current?.setMap(null)
    entranceFirstMarkerRef.current?.setMap(null)
    hideCursorMarker()

    const poly = new google.maps.Polygon({
      map: mapRef.current!,
      paths: path,
      fillColor: '#d97706',
      fillOpacity: 0.25,
      strokeColor: '#d97706',
      strokeWeight: 2,
      editable: true,
      clickable: true,
    })
    entrancePolygonRef.current = poly

    const polyPath = poly.getPath()
    polyPath.addListener('set_at', recomputeEntrance)
    polyPath.addListener('insert_at', recomputeEntrance)
    polyPath.addListener('remove_at', recomputeEntrance)

    recomputeEntrance()
    setEntrancePhase('done')
  }

  function recomputeEntrance() {
    const poly = entrancePolygonRef.current
    if (!poly) return
    const areaSqm = google.maps.geometry.spherical.computeArea(poly.getPath())
    setEntranceResult({ areaSqft: Math.round(areaSqm * SQM_TO_SQFT) })
  }

  function removeEntrance() {
    if (entranceClickListenerRef.current) {
      google.maps.event.removeListener(entranceClickListenerRef.current)
      entranceClickListenerRef.current = null
    }
    entrancePreviewPolyRef.current?.setMap(null)
    entranceClosingLineRef.current?.setMap(null)
    entranceFirstMarkerRef.current?.setMap(null)
    entrancePolygonRef.current?.setMap(null)
    hideCursorMarker()
    entrancePolygonRef.current = null
    entrancePathRef.current = []
    setEntranceResult(null)
    setEntrancePhase('idle')
  }

  // ---- Reset ----

  function handleReset() {
    // Clear entrance first
    removeEntrance()

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
    setEditedSqft('')
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
      // Restore cursor marker
      mouseMoveListenerRef.current = mapRef.current.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return
        if (!cursorMarkerRef.current) {
          cursorMarkerRef.current = new google.maps.Marker({
            map: mapRef.current!,
            position: e.latLng,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: '#2563eb', fillOpacity: 0.65, strokeColor: '#ffffff', strokeWeight: 1.5 },
            clickable: false,
            zIndex: 1,
          })
        } else {
          cursorMarkerRef.current.setPosition(e.latLng)
        }
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
    const mainSqft = Math.max(1, Number(editedSqft) || result.areaSqft)
    const entrSqft = entranceResult?.areaSqft ?? 0
    const totalSqft = mainSqft + entrSqft

    onMeasure({
      address: geoRef.current.addr,
      areaSqft: isFencing ? 0 : totalSqft,
      measurements: serviceCategory === 'driveways'
        ? { type: 'driveway', areaSqft: totalSqft, lengthFt: result.perimeterFt, ...(entrSqft > 0 && { entranceSqft: entrSqft }) }
        : isFencing
        ? { type: 'fencing', perimeterFt: result.perimeterFt }
        : { type: 'area_only', areaSqft: totalSqft, perimeterFt: result.perimeterFt },
      isMock: false,
    })
  }

  const showMap = phase === 'drawing' || phase === 'done'
  const isDriveways = serviceCategory === 'driveways'

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

      {/* Satellite map — always in DOM once shown (mapRef needs a stable div).
          Height: 300px mobile, 420px desktop (more square for better visibility). */}
      <div
        ref={mapDivRef}
        className={cn(
          'w-full rounded-xl overflow-hidden border h-[300px] md:h-[420px]',
          !showMap && 'hidden',
        )}
        data-polygon-map={serviceCategory}
      />

      {/* Drawing instructions + controls */}
      {phase === 'drawing' && entrancePhase === 'idle' && (
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

      {/* Entrance drawing instructions */}
      {entrancePhase === 'drawing' && (
        <div className="space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            Drawing entrance — {entranceVertexCount < 3
              ? `tap to place points (${entranceVertexCount} placed, need ≥3)`
              : 'tap the amber circle to close.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={removeEntrance}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cancel Entrance
            </Button>
          </div>
        </div>
      )}

      {/* Post-draw: result + confirm */}
      {phase === 'done' && result && entrancePhase !== 'drawing' && (
        <div className="space-y-2">
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 p-3 space-y-2"
            data-measurement-result="live"
            data-measurement-sqft={serviceCategory === 'fencing' ? 0 : result.areaSqft}
            data-measurement-perimeter={result.perimeterFt}
          >
            {serviceCategory === 'fencing' ? (
              <p className="text-sm font-medium text-foreground">
                {result.perimeterFt.toLocaleString()} linear ft
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="edited-sqft" className="text-xs text-muted-foreground whitespace-nowrap">
                    Driveway area (sqft)
                  </Label>
                  <Input
                    id="edited-sqft"
                    data-measure-input="edited-sqft"
                    type="number"
                    min={1}
                    value={editedSqft}
                    onChange={(e) => setEditedSqft(e.target.value)}
                    className="h-7 w-28 text-sm font-medium"
                  />
                </div>
                {entranceResult && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    + {entranceResult.areaSqft.toLocaleString()} sqft entrance
                    = {(Math.max(1, Number(editedSqft) || result.areaSqft) + entranceResult.areaSqft).toLocaleString()} sqft total
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{result.perimeterFt.toLocaleString()} ft perimeter · Drag vertices to adjust.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              data-measure-action="confirm-polygon"
              onClick={handleConfirm}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              {serviceCategory === 'fencing'
                ? `Use ${result.perimeterFt.toLocaleString()} linear ft`
                : `Use ${(Math.max(1, Number(editedSqft) || result.areaSqft) + (entranceResult?.areaSqft ?? 0)).toLocaleString()} sqft`}
            </Button>

            {isDriveways && entrancePhase === 'idle' && (
              <Button variant="outline" size="sm" onClick={startEntranceDrawing} data-measure-action="add-entrance">
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Add Entrance
              </Button>
            )}

            {isDriveways && entrancePhase === 'done' && (
              <Button variant="outline" size="sm" onClick={removeEntrance}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Remove Entrance
              </Button>
            )}

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
