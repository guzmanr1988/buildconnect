import { useState, useRef, useEffect } from 'react'
import { MapPin, Undo2, RotateCcw, Check, PlusCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { geocodeAddress } from '@/lib/satellite-measure/geocode'
import { getParcelByLatLng, geometryToGoogleMapsPaths } from '@/lib/parcel'
import { applyAreaWaste } from '@/lib/area-waste'
import type { MeasurementResult, FallbackReason, SatelliteMeasureProps } from '@/lib/satellite-measure/types'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
const SQM_TO_SQFT = 10.7639
const M_TO_FT = 3.28084
// Zoom 20 — highest reliably crisp satellite tier in South Florida
const MAP_ZOOM = 20
// Don't let users zoom out past property scale — keeps the address as the focus.
// 17 = neighborhood-block view; below this the address is a dot in a sea of streets.
const MIN_ZOOM = 17
// Color for the primary polygon (matches ColorCircle on the first-picked
// structure chip in service-detail.tsx via POLYGON_COLORS[0]).
const MAIN_COLOR = '#2563eb'
// Colors for extra polygons (cycled as user adds more areas). EXTRA_COLORS[0]
// matches ColorCircle for the second-picked structure on pergolas.
const EXTRA_COLORS = ['#d97706', '#16a34a', '#9333ea', '#dc2626', '#0891b2']

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

interface PolygonResult {
  areaSqft: number
  perimeterFt: number
  // Length × width for 4-vertex polygons (typical rectangular pergola/driveway).
  // null for triangles or 5+-vertex polygons where a single L×W would mislead.
  dims: { lengthFt: number; widthFt: number } | null
}
interface ExtraPolygon { id: number; areaSqft: number }

interface Props {
  serviceCategory: SatelliteMeasureProps['serviceCategory']
  initialAddress: string
  onMeasure: (r: MeasurementResult) => void
  onFallback?: (reason: FallbackReason, address: string) => void
  onFail: () => void
  // Hard cap on total polygons (main + extras). Undefined = single polygon
  // (current default for fencing/pool/etc.). Driveways legacy = unbounded.
  // Pergolas passes selections.structure.length so the cap mirrors the
  // number of structures the homeowner picked (1 = no extras shown,
  // 2 = one "Add another area" prompt).
  maxPolygons?: number
}

export function PolygonDraw({ serviceCategory, initialAddress, onMeasure, onFallback, onFail, maxPolygons }: Props) {
  const [address, setAddress] = useState(initialAddress)
  const [loading, setLoading] = useState(false)
  // 'confirmed' = post-Use button. Polygon stays on map, non-editable, no
  // tool controls. User taps Re-measure to drop back into 'drawing'.
  // Per Rod 2026-05-12 17:43Z directive — map persists as a visual
  // anchor through the rest of the configurator flow.
  const [phase, setPhase] = useState<'input' | 'drawing' | 'done' | 'confirmed'>('input')
  const [result, setResult] = useState<PolygonResult | null>(null)
  const [vertexCount, setVertexCount] = useState(0)
  const [editedSqft, setEditedSqft] = useState('')

  // Multi-polygon extra areas (driveways only)
  const [extraPolygons, setExtraPolygons] = useState<ExtraPolygon[]>([])
  const [addingExtra, setAddingExtra] = useState(false)
  const [extraVertexCount, setExtraVertexCount] = useState(0)

  // Cancel in-flight parcel fetch + drop overlay on unmount.
  useEffect(() => {
    return () => {
      parcelAbortRef.current?.abort()
      parcelPolygonRef.current?.setMap(null)
    }
  }, [])

  // Sync editedSqft with polygon recomputes (vertex drag)
  useEffect(() => {
    if (result) setEditedSqft(String(result.areaSqft))
  }, [result?.areaSqft]) // eslint-disable-line react-hooks/exhaustive-deps

  // Main polygon refs
  const geoRef = useRef<{ lat: number; lng: number; addr: string } | null>(null)
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const pathRef = useRef<google.maps.LatLng[]>([])
  const previewPolyRef = useRef<google.maps.Polyline | null>(null)
  const firstMarkerRef = useRef<google.maps.Marker | null>(null)
  const polygonRef = useRef<google.maps.Polygon | null>(null)
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null)
  // Cursor visual
  const cursorMarkerRef = useRef<google.maps.Marker | null>(null)
  const mouseMoveListenerRef = useRef<google.maps.MapsEventListener | null>(null)
  // Extra polygon drawing refs (reused for each extra)
  const extraIdCounterRef = useRef(0)
  const extraPolygonRefsRef = useRef<Map<number, google.maps.Polygon>>(new Map())
  const extraPathRef = useRef<google.maps.LatLng[]>([])
  const extraPreviewPolyRef = useRef<google.maps.Polyline | null>(null)
  const extraFirstMarkerRef = useRef<google.maps.Marker | null>(null)
  const extraClickListenerRef = useRef<google.maps.MapsEventListener | null>(null)
  // Parcel outline overlay (red ring around the property's lot boundary).
  // Silent fallback: any failure leaves parcelPolygonRef null and no ring renders.
  const parcelPolygonRef = useRef<google.maps.Polygon | null>(null)
  const parcelAbortRef = useRef<AbortController | null>(null)

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
    // Re-entering 'drawing' with an existing map (user changed address): recenter
    // and re-zoom to property scale instead of leaving the map wherever they panned.
    if (mapRef.current) {
      mapRef.current.panTo({ lat: geo.lat, lng: geo.lng })
      mapRef.current.setZoom(MAP_ZOOM)
      fetchAndDrawParcel(geo.lat, geo.lng)
    }
    setPhase('drawing')
  }

  // Init map after phase flips to 'drawing'
  useEffect(() => {
    if (phase !== 'drawing' || !mapDivRef.current || mapRef.current || !geoRef.current) return
    const { lat, lng } = geoRef.current

    const map = new google.maps.Map(mapDivRef.current, {
      center: { lat, lng },
      zoom: MAP_ZOOM,
      minZoom: MIN_ZOOM,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDefaultUI: true,
      zoomControl: true,
      rotateControl: true,
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: ['satellite', 'roadmap'],
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_LEFT,
      },
      gestureHandling: 'greedy',
      draggableCursor: 'pointer',
    })
    mapRef.current = map

    attachCursorMarker(map, '#2563eb')
    attachMainClickListener(map)
    attachMainPreviewLines(map)
    fetchAndDrawParcel(lat, lng)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the parcel polygon for the address and render a red overlay.
  // Non-blocking: map renders first; ring fades in if/when fetch resolves.
  // Silent fallback on any failure (no toast, no error UI).
  async function fetchAndDrawParcel(lat: number, lng: number) {
    parcelAbortRef.current?.abort()
    parcelPolygonRef.current?.setMap(null)
    parcelPolygonRef.current = null

    const controller = new AbortController()
    parcelAbortRef.current = controller

    const geom = await getParcelByLatLng(lat, lng, controller.signal)
    if (controller.signal.aborted || !geom || !mapRef.current) return

    const paths = geometryToGoogleMapsPaths(geom)
    if (!paths.length) return

    // Last-ditch guard: any malformed paths or mid-mount maps internals
    // must never propagate to the user. Silent fallback covers all failure modes.
    try {
      parcelPolygonRef.current = new google.maps.Polygon({
        map: mapRef.current,
        paths,
        strokeColor: '#dc2626',
        strokeWeight: 2,
        strokeOpacity: 0.95,
        fillColor: '#dc2626',
        fillOpacity: 0.03,
        clickable: false,
        draggable: false,
        editable: false,
        zIndex: 0,
      })
    } catch {
      parcelPolygonRef.current = null
    }
  }

  function attachCursorMarker(map: google.maps.Map, color: string) {
    if (mouseMoveListenerRef.current) {
      google.maps.event.removeListener(mouseMoveListenerRef.current)
      mouseMoveListenerRef.current = null
    }
    cursorMarkerRef.current?.setMap(null)
    cursorMarkerRef.current = null

    mouseMoveListenerRef.current = map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      if (!cursorMarkerRef.current) {
        cursorMarkerRef.current = new google.maps.Marker({
          map,
          position: e.latLng,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: color, fillOpacity: 0.65, strokeColor: '#ffffff', strokeWeight: 1.5 },
          clickable: false,
          zIndex: 1,
        })
      } else {
        cursorMarkerRef.current.setPosition(e.latLng)
      }
    })
  }

  function hideCursorMarker() {
    if (mouseMoveListenerRef.current) {
      google.maps.event.removeListener(mouseMoveListenerRef.current)
      mouseMoveListenerRef.current = null
    }
    cursorMarkerRef.current?.setMap(null)
    cursorMarkerRef.current = null
  }

  function attachMainPreviewLines(map: google.maps.Map) {
    previewPolyRef.current = new google.maps.Polyline({
      map, path: [], strokeColor: '#2563eb', strokeWeight: 2, strokeOpacity: 1,
    })
  }

  function attachMainClickListener(map: google.maps.Map) {
    clickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      const path = pathRef.current
      path.push(e.latLng)
      setVertexCount(path.length)
      updatePreview()
      // Show the close-target marker on the first point immediately
      if (path.length === 1 && !firstMarkerRef.current) {
        firstMarkerRef.current = new google.maps.Marker({
          map, position: path[0],
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
          title: 'Tap to close', clickable: true, zIndex: 10,
        })
        firstMarkerRef.current.addListener('click', closePolygon)
      }
    })
  }

  function updatePreview() {
    previewPolyRef.current?.setPath(pathRef.current)
  }

  function handleUndo() {
    if (phase === 'drawing') {
      if (pathRef.current.length > 0) {
        pathRef.current.pop()
        setVertexCount(pathRef.current.length)
        updatePreview()
        if (pathRef.current.length === 0 && firstMarkerRef.current) {
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

  function closePolygon() {
    const path = pathRef.current
    if (path.length < 3) return
    if (clickListenerRef.current) { google.maps.event.removeListener(clickListenerRef.current); clickListenerRef.current = null }
    previewPolyRef.current?.setMap(null)
    previewPolyRef.current = null
    firstMarkerRef.current?.setMap(null)
    firstMarkerRef.current = null
    hideCursorMarker()

    const poly = new google.maps.Polygon({
      map: mapRef.current!, paths: path,
      fillColor: '#2563eb', fillOpacity: 0.25, strokeColor: '#2563eb', strokeWeight: 2,
      editable: true, clickable: true,
    })
    polygonRef.current = poly
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
    const path = poly.getPath()
    const areaSqm = google.maps.geometry.spherical.computeArea(path)
    const perimeterM = google.maps.geometry.spherical.computeLength(path)
    setResult({
      areaSqft: Math.round(areaSqm * SQM_TO_SQFT),
      perimeterFt: Math.round(perimeterM * M_TO_FT),
      dims: computeRectDims(path),
    })
  }

  // For a 4-vertex polygon, return paired-edge length × width in feet.
  // Pairs opposite edges (0+2, 1+3) and averages — matches a rectangle drawn
  // with slightly imperfect corners. Returns null for non-quadrilaterals so we
  // don't show a misleading single L×W from a bounding box of an irregular polygon.
  function computeRectDims(
    path: google.maps.MVCArray<google.maps.LatLng>,
  ): { lengthFt: number; widthFt: number } | null {
    if (path.getLength() !== 4) return null
    const v = [path.getAt(0), path.getAt(1), path.getAt(2), path.getAt(3)]
    const e = [
      google.maps.geometry.spherical.computeDistanceBetween(v[0], v[1]),
      google.maps.geometry.spherical.computeDistanceBetween(v[1], v[2]),
      google.maps.geometry.spherical.computeDistanceBetween(v[2], v[3]),
      google.maps.geometry.spherical.computeDistanceBetween(v[3], v[0]),
    ]
    const pairA = (e[0] + e[2]) / 2
    const pairB = (e[1] + e[3]) / 2
    return {
      lengthFt: Math.round(Math.max(pairA, pairB) * M_TO_FT),
      widthFt: Math.round(Math.min(pairA, pairB) * M_TO_FT),
    }
  }

  // ---- Extra polygon (multi-area) support ----

  function startAddingExtra() {
    if (!mapRef.current) return
    setAddingExtra(true)
    setExtraVertexCount(0)
    extraPathRef.current = []
    // PR-#431 — defensive null: closeExtra/cancelAddingExtra setMap(null) but
    // do not clear this ref, so the L379 `!extraFirstMarkerRef.current` guard
    // would skip creating the close-marker for the 3rd+ polygon.
    extraFirstMarkerRef.current = null

    const color = EXTRA_COLORS[extraPolygons.length % EXTRA_COLORS.length]
    attachCursorMarker(mapRef.current, color)

    extraPreviewPolyRef.current = new google.maps.Polyline({
      map: mapRef.current, path: [], strokeColor: color, strokeWeight: 2, strokeOpacity: 1,
    })

    extraClickListenerRef.current = mapRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      const path = extraPathRef.current
      path.push(e.latLng)
      setExtraVertexCount(path.length)
      updateExtraPreview()
      if (path.length === 1 && !extraFirstMarkerRef.current) {
        extraFirstMarkerRef.current = new google.maps.Marker({
          map: mapRef.current!, position: path[0],
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
          title: 'Tap to close', clickable: true, zIndex: 10,
        })
        extraFirstMarkerRef.current.addListener('click', () => closeExtra(color))
      }
    })
  }

  function updateExtraPreview() {
    extraPreviewPolyRef.current?.setPath(extraPathRef.current)
  }

  function closeExtra(color: string) {
    const path = extraPathRef.current
    if (path.length < 3) return
    if (extraClickListenerRef.current) { google.maps.event.removeListener(extraClickListenerRef.current); extraClickListenerRef.current = null }
    extraPreviewPolyRef.current?.setMap(null)
    extraFirstMarkerRef.current?.setMap(null)
    hideCursorMarker()

    const id = extraIdCounterRef.current++
    const poly = new google.maps.Polygon({
      map: mapRef.current!, paths: path,
      fillColor: color, fillOpacity: 0.25, strokeColor: color, strokeWeight: 2,
      editable: true, clickable: true,
    })
    extraPolygonRefsRef.current.set(id, poly)

    const recomputeThis = () => {
      const p = extraPolygonRefsRef.current.get(id)
      if (!p) return
      const sqft = Math.round(google.maps.geometry.spherical.computeArea(p.getPath()) * SQM_TO_SQFT)
      setExtraPolygons((prev) => prev.map((ep) => ep.id === id ? { ...ep, areaSqft: sqft } : ep))
    }
    const pp = poly.getPath()
    pp.addListener('set_at', recomputeThis)
    pp.addListener('insert_at', recomputeThis)
    pp.addListener('remove_at', recomputeThis)

    const areaSqft = Math.round(google.maps.geometry.spherical.computeArea(poly.getPath()) * SQM_TO_SQFT)
    setExtraPolygons((prev) => [...prev, { id, areaSqft }])
    setAddingExtra(false)
    extraPathRef.current = []
  }

  function removeExtra(id: number) {
    extraPolygonRefsRef.current.get(id)?.setMap(null)
    extraPolygonRefsRef.current.delete(id)
    setExtraPolygons((prev) => prev.filter((ep) => ep.id !== id))
  }

  function cancelAddingExtra() {
    if (extraClickListenerRef.current) { google.maps.event.removeListener(extraClickListenerRef.current); extraClickListenerRef.current = null }
    extraPreviewPolyRef.current?.setMap(null)
    extraFirstMarkerRef.current?.setMap(null)
    hideCursorMarker()
    extraPathRef.current = []
    setAddingExtra(false)
    setExtraVertexCount(0)
  }

  function handleReset() {
    cancelAddingExtra()
    // Remove all extra polygons
    extraPolygonRefsRef.current.forEach((p) => p.setMap(null))
    extraPolygonRefsRef.current.clear()
    setExtraPolygons([])

    if (clickListenerRef.current) { google.maps.event.removeListener(clickListenerRef.current); clickListenerRef.current = null }
    polygonRef.current?.setMap(null)
    polygonRef.current = null
    firstMarkerRef.current?.setMap(null)
    firstMarkerRef.current = null
    pathRef.current = []
    setVertexCount(0)
    setResult(null)
    setEditedSqft('')
    setPhase('drawing')

    if (mapRef.current) {
      attachMainPreviewLines(mapRef.current)
      attachCursorMarker(mapRef.current, '#2563eb')
      attachMainClickListener(mapRef.current)
    }
  }

  function handleConfirm() {
    if (!result || !geoRef.current) return
    const isFencing = serviceCategory === 'fencing'
    const mainSqft = Math.max(1, Number(editedSqft) || result.areaSqft)
    const extraTotal = extraPolygons.reduce((s, ep) => s + ep.areaSqft, 0)
    const totalSqft = mainSqft + extraTotal

    const mapUrl = buildStaticMapUrl()
    // Per-polygon static-map URLs for multi-polygon consumers (pergolas
    // multi-structure cart/vendor render — one map per structure).
    const polygons: Array<{ sqft: number; mapUrl?: string; color: string }> = [
      { sqft: mainSqft, mapUrl: buildSinglePolygonStaticMapUrl(polygonRef.current, MAIN_COLOR), color: MAIN_COLOR },
      ...Array.from(extraPolygonRefsRef.current.entries()).map(([id, poly], idx) => {
        const color = EXTRA_COLORS[idx % EXTRA_COLORS.length]
        const ep = extraPolygons.find((e) => e.id === id)
        return { sqft: ep?.areaSqft ?? 0, mapUrl: buildSinglePolygonStaticMapUrl(poly, color), color }
      }),
    ]

    onMeasure({
      address: geoRef.current.addr,
      areaSqft: isFencing ? 0 : totalSqft,
      measurements: serviceCategory === 'driveways'
        ? { type: 'driveway', areaSqft: totalSqft, lengthFt: result.perimeterFt, ...(extraTotal > 0 && { entranceSqft: extraTotal }) }
        : isFencing
        ? { type: 'fencing', perimeterFt: result.perimeterFt }
        : { type: 'area_only', areaSqft: totalSqft, perimeterFt: result.perimeterFt },
      isMock: false,
      mapUrl,
      polygons,
    })

    // Lock down for read-only confirmed-phase view. Polygon stays drawn
    // and visible; user can drop back to 'drawing' via Re-measure.
    lockMapForConfirmedPhase()
    setPhase('confirmed')
  }

  // Build a Google Static Maps URL pinned to the drawn polygon. Uses the
  // same key as the JS SDK (referrer-restricted, safe to bake in the URL).
  // Falls back to undefined if Maps JS hasn't loaded — caller treats that
  // as "no map image to attach", which is fine because the visible map
  // already proved the measurement to the user; the URL is only for
  // downstream vendor render.
  function buildStaticMapUrl(): string | undefined {
    const geo = geoRef.current
    const main = polygonRef.current
    if (!geo || !main || !MAPS_KEY) return undefined

    const sizeParam = '600x400'
    const mainPath = encodePolygonPath(main, '0x2563ebff', '0x2563eb40')
    const extraPaths: string[] = []
    let extraIdx = 0
    extraPolygonRefsRef.current.forEach((poly) => {
      const color = EXTRA_COLORS[extraIdx % EXTRA_COLORS.length]
      // Static Maps wants 0xRRGGBBAA — strip leading '#' and append alpha.
      const stroke = `0x${color.slice(1)}ff`
      const fill = `0x${color.slice(1)}40`
      extraPaths.push(encodePolygonPath(poly, stroke, fill))
      extraIdx++
    })

    const params = new URLSearchParams()
    params.set('size', sizeParam)
    params.set('maptype', 'satellite')
    params.set('center', `${geo.lat},${geo.lng}`)
    params.set('zoom', String(MAP_ZOOM))
    params.set('scale', '2')
    params.set('key', MAPS_KEY)

    const all = [mainPath, ...extraPaths].filter(Boolean)
    let url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
    for (const p of all) url += `&path=${p}`
    return url
  }

  // Build a static-map URL with ONLY the supplied polygon drawn. Used for
  // per-structure map render (one map per polygon) on cart + vendor inbox.
  function buildSinglePolygonStaticMapUrl(
    poly: google.maps.Polygon | null,
    color: string,
  ): string | undefined {
    const geo = geoRef.current
    if (!geo || !poly || !MAPS_KEY) return undefined
    const stroke = `0x${color.slice(1)}ff`
    const fill = `0x${color.slice(1)}40`
    const path = encodePolygonPath(poly, stroke, fill)
    if (!path) return undefined
    const params = new URLSearchParams()
    params.set('size', '600x400')
    params.set('maptype', 'satellite')
    params.set('center', `${geo.lat},${geo.lng}`)
    params.set('zoom', String(MAP_ZOOM))
    params.set('scale', '2')
    params.set('key', MAPS_KEY)
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}&path=${path}`
  }

  function encodePolygonPath(
    poly: google.maps.Polygon,
    strokeArgb: string,
    fillArgb: string,
  ): string {
    const path = poly.getPath()
    const parts: string[] = []
    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i)
      parts.push(`${p.lat().toFixed(6)},${p.lng().toFixed(6)}`)
    }
    // Close the loop by repeating the first point so the fill renders.
    if (parts.length >= 3) parts.push(parts[0])
    return `color:${strokeArgb}|weight:2|fillcolor:${fillArgb}|${parts.join('|')}`
  }

  function lockMapForConfirmedPhase() {
    polygonRef.current?.setOptions({ editable: false, draggable: false, clickable: false })
    extraPolygonRefsRef.current.forEach((p) => p.setOptions({ editable: false, draggable: false, clickable: false }))
    hideCursorMarker()
    if (mapRef.current) {
      mapRef.current.setOptions({ gestureHandling: 'cooperative', zoomControl: false, mapTypeControl: false, rotateControl: false })
    }
  }

  function handleRemeasure() {
    if (!mapRef.current) return
    mapRef.current.setOptions({ gestureHandling: 'greedy', zoomControl: true, mapTypeControl: true, rotateControl: true })
    handleReset()
  }

  // PR-223 Option B: drop back from 'confirmed' into 'done' and arm an extra
  // polygon draw. Keeps already-drawn polygon(s) on the map; user can confirm
  // again via "Use X sqft" after the new area is closed. Re-measure remains
  // the nuclear reset (clears everything); this button only adds.
  function continueAddingExtra() {
    if (!mapRef.current) return
    mapRef.current.setOptions({ gestureHandling: 'greedy', zoomControl: true, mapTypeControl: true, rotateControl: true })
    polygonRef.current?.setOptions({ editable: true, clickable: true })
    extraPolygonRefsRef.current.forEach((p) => p.setOptions({ editable: true, clickable: true }))
    setPhase('done')
    startAddingExtra()
  }

  const showMap = phase === 'drawing' || phase === 'done' || phase === 'confirmed'
  const isDriveways = serviceCategory === 'driveways'
  const isPergolas = serviceCategory === 'pergolas'
  const totalPolygonCount = 1 + extraPolygons.length
  // Driveways: unbounded extras (legacy). Pergolas: capped by maxPolygons
  // (passed from service-detail = number of structures picked). Others: no
  // extras (single-polygon flow unchanged).
  const canAddAnotherArea =
    (isDriveways && (maxPolygons === undefined || totalPolygonCount < maxPolygons)) ||
    (isPergolas && maxPolygons !== undefined && maxPolygons > 1 && totalPolygonCount < maxPolygons)
  const mainSqft = Math.max(1, Number(editedSqft) || result?.areaSqft || 0)
  const extraTotal = extraPolygons.reduce((s, ep) => s + ep.areaSqft, 0)
  const grandTotal = mainSqft + extraTotal
  // Display layer applies the per-service waste factor (1.03 for
  // driveways; pass-through everywhere else). Cost layer mirrors via
  // pricing.ts:189. Single source of truth in lib/area-waste.ts.
  const displayTotal = applyAreaWaste(serviceCategory, grandTotal)

  return (
    <div className="space-y-3" data-satellite-measure={serviceCategory} data-measure-mode="polygon-draw">
      {/* Address input */}
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

      {/* Satellite map — mobile: 62vh + 580px cap so the map dominates the viewport for drawing;
          sm: aspect-square capped at 580px; md+: fills card width, height constrained to 600px. Always in DOM once shown so mapRef stays stable. */}
      <div
        ref={mapDivRef}
        className={cn(
          'w-full rounded-xl overflow-hidden border h-[62vh] max-h-[580px] sm:h-auto sm:aspect-square sm:max-w-[580px] sm:mx-auto md:aspect-auto md:max-w-none md:mx-0 md:max-h-none md:h-[600px]',
          !showMap && 'hidden',
        )}
        data-polygon-map={serviceCategory}
      />

      {/* Main drawing instructions */}
      {phase === 'drawing' && !addingExtra && (
        <div className="space-y-2 sm:max-w-[580px] sm:mx-auto md:max-w-none">
          <p className="text-xs text-muted-foreground text-center">
            {vertexCount === 0
              ? 'Tap the map to place your first point'
              : vertexCount < 3
              ? `Tap to add points (${vertexCount} placed, need ≥3) · tap the green dot to close`
              : 'Tap to add more points · tap the green dot to close the area'}
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={vertexCount === 0}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPhase('input')}>
              Change address
            </Button>
          </div>
        </div>
      )}

      {/* Extra area drawing instructions */}
      {addingExtra && (
        <div className="space-y-2 sm:max-w-[580px] sm:mx-auto md:max-w-none">
          <p className="text-xs font-medium" style={{ color: EXTRA_COLORS[extraPolygons.length % EXTRA_COLORS.length] }}>
            Drawing area {extraPolygons.length + 2} — {extraVertexCount === 0
              ? 'tap the map to place your first point'
              : extraVertexCount < 3
              ? `tap to add points (${extraVertexCount} placed, need ≥3) · tap the colored dot to close`
              : 'tap the colored dot to close the area'}
          </p>
          <Button variant="outline" size="sm" onClick={cancelAddingExtra}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
        </div>
      )}

      {/* Post-draw result + controls */}
      {phase === 'done' && result && !addingExtra && (
        <div className="space-y-2 sm:max-w-[580px] sm:mx-auto md:max-w-none">
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 p-3 space-y-2"
            data-measurement-result="live"
            data-measurement-sqft={serviceCategory === 'fencing' ? 0 : result.areaSqft}
            data-measurement-perimeter={result.perimeterFt}
          >
            {serviceCategory === 'fencing' ? (
              <p className="text-sm font-medium text-foreground">{result.perimeterFt.toLocaleString()} linear ft</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="edited-sqft" className="text-xs text-muted-foreground whitespace-nowrap">
                    Area 1 (sqft)
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
                  {result.dims && (
                    <span
                      className="text-xs text-muted-foreground whitespace-nowrap"
                      data-measurement-dims={`${result.dims.lengthFt}x${result.dims.widthFt}`}
                    >
                      ({result.dims.lengthFt} × {result.dims.widthFt} ft)
                    </span>
                  )}
                </div>
                {extraPolygons.map((ep, idx) => (
                  <div key={ep.id} className="flex items-center gap-2">
                    <span className="text-xs whitespace-nowrap" style={{ color: EXTRA_COLORS[idx % EXTRA_COLORS.length] }}>
                      Area {idx + 2}: {ep.areaSqft.toLocaleString()} sqft
                    </span>
                    <button
                      onClick={() => removeExtra(ep.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove area"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {extraPolygons.length > 0 && (
                  <p className="text-xs font-medium text-foreground">
                    Total: {grandTotal.toLocaleString()} sqft
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {result.perimeterFt.toLocaleString()} ft perimeter · Drag vertices to refine — edges are easier than corners.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" data-measure-action="confirm-polygon" onClick={handleConfirm}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              {serviceCategory === 'fencing'
                ? `Use ${result.perimeterFt.toLocaleString()} linear ft`
                : `Use ${displayTotal.toLocaleString()} sqft`}
            </Button>

            {canAddAnotherArea && (
              <Button variant="outline" size="sm" onClick={startAddingExtra} data-measure-action="add-area">
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Add another area
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

      {/* Confirmed (read-only) — map stays visible above with polygon
          locked. Single "Re-measure" link drops back to drawing phase. */}
      {phase === 'confirmed' && result && (
        <div
          className="space-y-2 sm:max-w-[580px] sm:mx-auto md:max-w-none"
          data-measurement-phase="confirmed"
          data-measurement-sqft={serviceCategory === 'fencing' ? 0 : displayTotal}
          data-measurement-perimeter={result.perimeterFt}
        >
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 p-3">
            <p className="text-sm font-medium text-foreground">
              {serviceCategory === 'fencing'
                ? `${result.perimeterFt.toLocaleString()} linear ft measured`
                : `${displayTotal.toLocaleString()} sqft measured`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {geoRef.current?.addr}
            </p>
          </div>
          {canAddAnotherArea && (
            <Button
              variant="default"
              size="sm"
              onClick={continueAddingExtra}
              data-measure-action="add-another-measurement"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
              Add another measurement
            </Button>
          )}
          <button
            data-measure-action="re-measure"
            className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
            onClick={handleRemeasure}
          >
            Re-measure
          </button>
        </div>
      )}
    </div>
  )
}
