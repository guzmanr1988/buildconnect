import { PITCHED_WASTE_FACTOR, FLAT_WASTE_FACTOR, GUTTER_DROP_FT_BY_FLOORS, computeGutterTotalLinFt } from '@/lib/roof-pricing'
import { computeRoofTotal, evalPitchedOmittedTriggered } from '@/lib/roof-area-math'
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, ShoppingCart, Plus, Home, Wind, Droplets, Car, Tent, Thermometer, UtensilsCrossed, Bath, PanelTop, Hammer, PaintRoller, FileText, Blinds, Ruler, Fence, RefreshCw, Wrench, Layers, Sun, Square, Triangle, Cog, TreePine, Grid3X3, DoorOpen, CircleDot, AlignJustify, Waves, Lightbulb, Flame, Gauge, Sparkles, Palette, Building2, DoorClosed, Briefcase, ArrowUpDown, Move3D, ChevronsUp, MoveDiagonal, Sailboat, Layers3, ScanLine, ZoomIn, ChevronDown, BrickWall } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { useCatalogStore } from '@/stores/catalog-store'
import { useCartStore, type CartItemAddress } from '@/stores/cart-store'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS } from '@/lib/mock-data'
import type { OptionGroup, ServiceCategory } from '@/types'
import { cn } from '@/lib/utils'
import { MeasurementTutorialCTA } from '@/components/shared/measurement-tutorial-cta'
import { RoofMeasurementBreakdownCard } from '@/components/shared/roof-measurement-breakdown-card'
import { PermitStepSection, PoolSurveySection, isProjectPermitValid, isProjectAssociationValid, isPoolSurveyValid, PERMIT_HEADING, PERMIT_SUBTITLE } from '../components/permit-step-section'
import { WindowConfigurator, type WindowSelection } from '../components/window-configurator'
import { DoorConfigurator, type DoorSelection } from '../components/door-configurator'
import { StormFrontConfigurator, type StormFrontSelection } from '../components/storm-front-configurator'
import { GarageDoorConfigurator, type GarageDoorSelection } from '../components/garage-door-configurator'
import { MetalRoofConfigurator, type MetalRoofSelection } from '../components/metal-roof-configurator'
import { ShingleRoofConfigurator, type ShingleRoofSelection } from '../components/shingle-roof-configurator'
import { TileRoofConfigurator, type TileRoofSelection, type TileType } from '../components/tile-roof-configurator'
import { AluminumRoofConfigurator, type AluminumRoofSelection } from '../components/aluminum-roof-configurator'
import { FlatRoofConfigurator, type FlatRoofSelection } from '../components/flat-roof-configurator'
import { AddonLinearFtConfigurator } from '../components/addon-linear-ft-configurator'
import { PoolFloorSqftConfigurator } from '../components/pool-floor-sqft-configurator'
import { RoofMeasurementWizard, type RoofWizardResult, type RoofMaterialKey } from '../components/roof-measurement-wizard'
import { SubGroupChoices } from '../components/sub-group-choices'
import { SatelliteMeasure } from '@/components/satellite-measure/SatelliteMeasure'
import { ColorCircle } from '@/components/ui/color-circle'
import { applyAreaWaste } from '@/lib/area-waste'
import { useHomeownerDocsStore } from '@/stores/homeowner-documents-store'
import { generateRoofMeasurementPdf } from '@/lib/generate-roof-measurement-pdf'
import { RemodelConfigurator } from '../components/remodel-configurator'
import { BathroomConfigurator } from '../components/bathroom-configurator'

// Polygon colors used to bind pergolas structure chips to map polygons.
// POLYGON_COLORS[0] matches polygon-draw.tsx MAIN_COLOR; POLYGON_COLORS[1]
// matches EXTRA_COLORS[0]. Pick-then-draw model: chip pick order = polygon
// draw order; the ColorCircle on the chip is keyed to that order.
const POLYGON_COLORS = ['#2563eb', '#d97706']

// Rod-direct 2026-05-22 13:30Z (Roofing canonical) + 13:51Z (mirror-all):
// card-style tiles applied to every top-level optionGroup across all
// services, EXCEPT (serviceId, groupId) pairs whose option set has an
// intrinsically-different UI shape (size tight-row, swatch picker, etc.).
// Sub-row chips inside material configurators (TileRoof color/size, Stone
// tight-row, pergolas ColorCircle, etc.) keep their existing render path
// via the parent-vs-sub-row separation — this map only feeds top-level
// optionGroups in service-detail's own loop.
const SERVICE_TILE_ICONS: Record<string, Record<string, Record<string, typeof Plus>>> = {
  roofing: {
    service_type: { replace: RefreshCw, repair: Wrench, addons: Plus },
    material: {
      shingle: Layers,
      barrel_tile: Triangle,
      terracotta: Triangle,
      metal: Cog,
      aluminum: PanelTop,
      flat_roof: Square,
    },
    addons: {
      gutters: Droplets,
      insulation: Thermometer,
      solar_prep: Sun,
      soffit_wood: PaintRoller,
      fascia_wood: PaintRoller,
      soffit_metal: Hammer,
      fascia_metal: Hammer,
      extra_plywood: PanelTop,
    },
    repair_materials: {
      repair_shingle: Layers,
      repair_barrel_tile: Triangle,
      repair_metal: Cog,
      repair_aluminum: PanelTop,
      repair_flat_roof: Square,
    },
  },
  windows_doors: {
    products: { windows: PanelTop, doors: DoorOpen, storm_front: Wind, garage_doors: Car },
    installation: { new_construction: Home, retrofit: RefreshCw },
    install_products: { glass: Layers, frames: Square, both: Layers3 },
    payment: { cash: Briefcase, financing: Briefcase },
  },
  pool: {
    // Arc-19 — icon-set realigned to constants.ts option_ids (the prior
    // map referenced legacy ids that never matched the catalog, so no
    // icon was rendered on /home/service/pool tiles).
    project_type: { new_pool: Plus, remodel: RefreshCw },
    pool_size: {
      '10x20': Ruler,
      '12x24': Ruler,
      '15x30': Ruler,
      '20x40': Ruler,
      custom: MoveDiagonal,
    },
    pool_floor: {
      travertine: Grid3X3,
      pavers: Grid3X3,
      stamped_concrete: Square,
      cement_floor: Square,
      square_concrete: Square,
      artificial_turf: TreePine,
    },
    addons: {
      spa: Waves,
      beach: Sun,
      waterfall: Droplets,
      led: Lightbulb,
      bubbler: CircleDot,
      heater: Flame,
      pool_fence: Fence,
    },
    water_feature_units: { laminar_jet: Droplets, waterfall_unit: Waves },
  },
  driveways: {
    scope: { full: RefreshCw, overlay: Layers, repair: Wrench },
    surface: { pavers: Grid3X3, stamped: Square, asphalt: Square, stone: Triangle, square_concrete: Square },
    addons: { border: Square, lighting: Lightbulb, drainage: Droplets },
  },
  fencing: {
    material: { wood: TreePine, vinyl: Square, aluminum: Cog, chain_link: Grid3X3, wrought_iron: Triangle, concrete_panel: BrickWall },
    height: { '4ft': ChevronsUp, '6ft': ChevronsUp, '8ft': ChevronsUp },
    addons: { gates: DoorOpen, post_caps: CircleDot, privacy_slats: AlignJustify },
  },
  pergolas: {
    structure: { aluminum_terrace: Square, aluminum_pergola: Tent },
    size: { measured: ScanLine, custom: MoveDiagonal },
    addons: { fans: Wind, screen: Grid3X3 },
  },
  air_conditioning: {
    system: { central_2: Cog, central_3: Cog, central_4: Cog, mini_single: Wind, mini_multi: Wind },
    addons: { thermostat: Gauge, ducts: Cog, purifier: Sparkles, maintenance: Wrench },
  },
  wall_paneling: {
    style: { shiplap: AlignJustify, board_batten: AlignJustify, '3d': Move3D, wainscoting: PanelTop },
    rooms: { living: Home, bedroom: Bath, dining: UtensilsCrossed, entryway: DoorClosed, office: Briefcase },
  },
  garage: {
    rooms: {
      living_family: Home,
      bedroom: Bath,
      office_den: Briefcase,
      hallway_stairway: ArrowUpDown,
      foyer_entry: DoorClosed,
      dining: UtensilsCrossed,
      whole_home: Building2,
      other: Plus,
    },
    scope: { drywall: Square, ceiling: PanelTop, trim_molding: AlignJustify, interior_doors: DoorClosed, move_walls: Wrench },
    size: { small: Square, medium: Square, large: Square, xlarge: Square, whole_home: Building2 },
    addons: { crown_molding: PanelTop, popcorn_removal: Sparkles },
  },
  house_painting: {
    height: { one_story: Home, two_story: Building2 },
    scope: { exterior_only: Home, interior_only: DoorClosed, both: RefreshCw },
    rooms: { one_room: Square, two_to_three: Layers, four_to_five: Layers, whole_interior: Building2 },
    colors: { single_color: Palette, two_tone: Palette, multi_color: Palette, custom_palette: Sparkles },
  },
  blinds: {
    type: { roller: Blinds, venetian: AlignJustify, roman: Layers, cellular: Grid3X3, vertical: AlignJustify, blackout: Square, motorized: Cog },
    material: { fabric: Layers, vinyl: Square, faux_wood: PanelTop, real_wood: TreePine, aluminum: PanelTop, bamboo: Sailboat },
    control: { cordless: Sparkles, traditional_cord: AlignJustify, wand: AlignJustify, motorized: Cog },
    mount: { inside_mount: Square, outside_mount: PanelTop },
    light_control: { blackout: Square, room_darkening: Layers, light_filtering: Sun, sheer: Sparkles },
  },
}

// (serviceId, groupId) pairs that opt OUT of tile rendering because the
// option-set has an intrinsically-different UI shape banked elsewhere
// (size tight-row, swatch picker). Add to this set rather than re-gating
// inline in the render loop.
const TILE_EXCLUDED_GROUPS = new Set<string>([
  'pool/spa_size',
  'pool/beach_size',
])

function isTileModeGroup(serviceId: string | undefined, groupId: string): boolean {
  if (!serviceId) return false
  return !TILE_EXCLUDED_GROUPS.has(`${serviceId}/${groupId}`)
}

import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { findCatalogOption, getOptionMetadata, sqftToSquares } from '@/lib/option-metadata'
import { applyRoofingMaterialPitchedSingleton } from '@/lib/roofing-rules'
import { geocodeAddressToCoords } from '@/lib/geo-distance'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'

const ADDON_LINEAR_FT_CONFIG = [
  { id: 'gutters', label: 'Gutter linear feet' },
  { id: 'soffit_wood', label: 'Soffit Wood linear feet' },
  { id: 'fascia_wood', label: 'Fascia Wood linear feet' },
  { id: 'soffit_metal', label: 'Soffit Metal linear feet' },
  { id: 'fascia_metal', label: 'Fascia Metal linear feet' },
] as const
const ADDON_LINEAR_FT_IDS: string[] = ADDON_LINEAR_FT_CONFIG.map((c) => c.id)

// Arc-19 — pool_floor options that prompt for square footage when tapped.
// N/A is excluded; tapping it does not open the configurator.
const POOL_FLOOR_SQFT_CONFIG = [
  { id: 'travertine', label: 'Travertine square footage' },
  { id: 'pavers', label: 'Pavers square footage' },
  { id: 'stamped_concrete', label: 'Stamped Concrete square footage' },
  { id: 'cement_floor', label: 'Cement Floor square footage' },
  { id: 'square_concrete', label: 'Square Concrete square footage' },
  { id: 'artificial_turf', label: 'Artificial Turf square footage' },
] as const
const POOL_FLOOR_SQFT_IDS: string[] = POOL_FLOOR_SQFT_CONFIG.map((c) => c.id)

// Services whose options render via dedicated bespoke configurators
// (WindowConfigurator / DoorConfigurator / StormFrontConfigurator /
// GarageDoorConfigurator at L2186-2223) and therefore must NOT also
// double-render their DB-seeded sub_groups through the generic
// SubGroupChoices path. Originally this was a kitchen-only allow-gate
// (PR-289 era — see comment block below at L1849+). Flipping to a
// deny-list lets new verticals (pool, roofing addons, etc.) author
// sub_menus on /admin/products and have them surface realtime on the
// homeowner wizard without per-vertical render branches.
const DEDICATED_CONFIGURATOR_SERVICES: readonly string[] = ['windows_doors']

function isDedicatedConfiguratorService(id: string | undefined): boolean {
  return id != null && DEDICATED_CONFIGURATOR_SERVICES.includes(id)
}

const SERVICE_ICONS: Record<ServiceCategory, React.ElementType> = {
  roofing: Home,
  windows_doors: Wind,
  pool: Droplets,
  driveways: Car,
  fencing: Fence,
  pergolas: Tent,
  air_conditioning: Thermometer,
  kitchen: UtensilsCrossed,
  bathroom: Bath,
  wall_paneling: PanelTop,
  garage: Hammer,
  house_painting: PaintRoller,
  blinds: Blinds,
  remodel: Wrench,
}

const ICON_GRADIENTS: Record<ServiceCategory, string> = {
  roofing: 'from-orange-400 to-red-500',
  windows_doors: 'from-sky-400 to-blue-500',
  pool: 'from-cyan-400 to-blue-500',
  driveways: 'from-stone-400 to-stone-600',
  fencing: 'from-amber-500 to-orange-600',
  pergolas: 'from-emerald-400 to-green-600',
  air_conditioning: 'from-indigo-400 to-violet-500',
  kitchen: 'from-amber-400 to-orange-500',
  bathroom: 'from-teal-400 to-cyan-600',
  wall_paneling: 'from-purple-400 to-violet-500',
  garage: 'from-slate-400 to-slate-600',
  house_painting: 'from-rose-400 to-pink-500',
  blinds: 'from-indigo-400 to-purple-500',
  remodel: 'from-fuchsia-400 to-pink-600',
}

// Legacy metalRoofSelection.roofSize values were sqft strings (e.g. "2916").
// Post-ship values are squares (e.g. "29"). Detect by magnitude: >200 = sqft, ≤200 = squares.
function metalRoofDisplaySquares(roofSize: string): number {
  const n = Number(roofSize)
  return n > 200 ? sqftToSquares(Math.round(n * PITCHED_WASTE_FACTOR)) : n
}

// Rod-direct 2026-05-20: strip "-sub" / "-sub-<id>" suffix from section headers
// in Project Summary surfaces. Mirrors cart.tsx helper.
function stripSubSuffix(label: string): string {
  return label.replace(/-sub(?:-[^\s]+)?$/, '').trim()
}

export function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // Ship #475+1 — Interior Remodel is measurement-driven (L/W/H/numWalls)
  // not chip-driven. Short-circuit to the bespoke configurator instead of
  // shoehorning the optionGroups pattern. Edit-payload handoff still
  // travels via location.state ({ editItem }) below for cart edits.
  if (serviceId === 'remodel') {
    return <RemodelConfigurator />
  }
  // Ship #475+2 — Bathroom Remodel is measurement-driven (L/W/H/tile-coverage
  // + tub-toggle) with a fixtures-as-$0 split. Same short-circuit pattern.
  if (serviceId === 'bathroom') {
    return <BathroomConfigurator />
  }

  // Edit payload travels on the router's location.state — tied to the
  // navigation, not to a component mount instance. This survives React's
  // double-mount pattern (StrictMode dev + some prod reconciler paths that
  // mount the routed element twice) without a localStorage race. The
  // earlier localStorage-based hand-off broke because the first mount's
  // cleanup removed the key before the second mount's initializer could
  // read it, leaving the visible render with empty state.
  const editData = (location.state && typeof location.state === 'object' && 'editItem' in location.state
    ? (location.state as { editItem: Record<string, unknown> }).editItem
    : null) as Record<string, unknown> | null
  const editItemForService = editData && editData.serviceId === serviceId ? editData : null

  const [selections, setSelections] = useState<Record<string, string[]>>(
    (editItemForService?.selections as Record<string, string[]>) || {}
  )
  const [selectionQuantities, setSelectionQuantities] = useState<Record<string, number>>(
    (editItemForService?.selectionQuantities as Record<string, number>) || {}
  )
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [added, setAdded] = useState(false)
  const [customPoolSize, setCustomPoolSize] = useState('')
  const [activeAddonMenu, setActiveAddonMenu] = useState<string | null>(null)
  // Rod-directed roofing wizard redesign 2026-07-14 (Spec B). Names the
  // option-group id that should render an 800ms box-shadow pulse right
  // after a post-measurement scroll settles on it — a visual cue for the
  // next required step. Cleared to null by the same useEffect that sets
  // it, so it never leaks between measurement events.
  const [pulseGroupId, setPulseGroupId] = useState<string | null>(null)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null)
  const editAddons = editItemForService?.addonQuantities as { laminarJets?: number; waterfalls?: number; ledCount?: number; bubblerCount?: number } | undefined
  const [laminarJets, setLaminarJets] = useState(editAddons?.laminarJets || 0)
  const [waterfalls, setWaterfalls] = useState(editAddons?.waterfalls || 0)
  const [ledCount, setLedCount] = useState(editAddons?.ledCount || 0)
  const [bubblerCount, setBubblerCount] = useState(editAddons?.bubblerCount || 0)
  const [windowSelections, setWindowSelections] = useState<WindowSelection[]>(
    (editItemForService?.windowSelections as WindowSelection[]) || []
  )
  const [windowConfigOpen, setWindowConfigOpen] = useState(
    !(editItemForService?.windowSelections as WindowSelection[] | undefined)?.length
  )
  const windowTotal = windowSelections.reduce((sum, s) => sum + s.quantity, 0)
  const [doorSelections, setDoorSelections] = useState<DoorSelection[]>(
    (editItemForService?.doorSelections as DoorSelection[]) || []
  )
  const [doorConfigOpen, setDoorConfigOpen] = useState(
    !(editItemForService?.doorSelections as DoorSelection[] | undefined)?.length
  )
  const doorTotal = doorSelections.reduce((sum, s) => sum + s.quantity, 0)
  const [stormFrontSelections, setStormFrontSelections] = useState<StormFrontSelection[]>(
    (editItemForService?.stormFrontSelections as StormFrontSelection[]) || []
  )
  const [stormFrontConfigOpen, setStormFrontConfigOpen] = useState(
    !(editItemForService?.stormFrontSelections as StormFrontSelection[] | undefined)?.length
  )
  const stormFrontTotal = stormFrontSelections.reduce((sum, s) => sum + s.quantity, 0)
  const [garageDoorSelection, setGarageDoorSelection] = useState<GarageDoorSelection>(
    (editItemForService?.garageDoorSelection as GarageDoorSelection) || { type: '', size: '', color: '', glass: '' }
  )
  const [garageDoorConfigOpen, setGarageDoorConfigOpen] = useState(
    !(editItemForService?.garageDoorSelection as GarageDoorSelection | undefined)?.type
  )
  const [metalRoofSelection, setMetalRoofSelection] = useState<MetalRoofSelection>(
    (editItemForService?.metalRoofSelection as MetalRoofSelection) || { color: '', roofSize: '' }
  )
  const [metalRoofConfigOpen, setMetalRoofConfigOpen] = useState(
    !(editItemForService?.metalRoofSelection as MetalRoofSelection | undefined)?.color
  )
  const [shingleSelection, setShingleSelection] = useState<ShingleRoofSelection>(() => {
    const saved = editItemForService?.shingleSelection as ShingleRoofSelection | undefined
    if (saved) return saved
    const legacyColor = (editItemForService?.shingleColor as string) || ''
    return { color: legacyColor, roofSize: '' }
  })
  const [shingleConfigOpen, setShingleConfigOpen] = useState(
    !(editItemForService?.shingleSelection as ShingleRoofSelection | undefined)?.color
      && !(editItemForService?.shingleColor as string)
  )
  const [tileSelection, setTileSelection] = useState<TileRoofSelection>(() => {
    const saved = editItemForService?.tileSelection as TileRoofSelection | undefined
    if (saved) return saved
    return {
      tileType: (editItemForService?.tileType as TileType) || '',
      tileColor: (editItemForService?.tileColor as string) || '',
      roofSize: '',
    }
  })
  const [tileConfigOpen, setTileConfigOpen] = useState(
    !(editItemForService?.tileSelection as TileRoofSelection | undefined)?.tileType
      && !(editItemForService?.tileType as string)
  )
  const [aluminumSelection, setAluminumSelection] = useState<AluminumRoofSelection>(
    (editItemForService?.aluminumSelection as AluminumRoofSelection) || { color: '', roofSize: '' }
  )
  const [aluminumConfigOpen, setAluminumConfigOpen] = useState(
    !(editItemForService?.aluminumSelection as AluminumRoofSelection | undefined)?.color
  )
  const [flatRoofSelection, setFlatRoofSelection] = useState<FlatRoofSelection>(
    (editItemForService?.flatRoofSelection as FlatRoofSelection) || { membraneType: '', roofSize: '' }
  )
  const [flatRoofConfigOpen, setFlatRoofConfigOpen] = useState(
    !(editItemForService?.flatRoofSelection as FlatRoofSelection | undefined)?.membraneType
  )
  const [editingItemId, setEditingItemId] = useState<string | null>(
    (editItemForService?.id as string) || null
  )
  const [wizardOpen, setWizardOpen] = useState(false)
  const [roofMeasurement, setRoofMeasurement] = useState<{ areaSqft: number; pitch: string; address: string; perimeterFt?: number; pitchedAreaSqft?: number; flatAreaSqft?: number; includeMaterialOrder?: boolean; includePerimeter?: boolean; includeFlatArea?: boolean } | null>(null)
  // Under-quote guard: explicit acknowledgment that order is flat-add-on only
  // when chip-tap excludes pitched but satellite detected significant pitched area.
  // Reset on material-selection change so user re-acknowledges if they re-fall
  // into the gate state.
  const [flatOnlyAck, setFlatOnlyAck] = useState(false)
  const [areaMeasurement, setAreaMeasurement] = useState<{
    areaSqft: number
    perimeterFt?: number
    address: string
    mapUrl?: string
    // Per-polygon breakdown for multi-polygon flows (pergolas multi-structure).
    // polygons[0] is the first-picked structure's polygon, polygons[1] the
    // second. Driveways multi-area + single-polygon flows leave this
    // undefined or single-entry — consumers fall back to areaSqft.
    polygons?: Array<{ sqft: number; mapUrl?: string; color: string }>
  } | null>(null)
  // areaMeasureKey: stable identity for SatelliteMeasure's mount. PR-220
  // moved re-measure inside the component (its own 'confirmed' phase
  // handles drop-back to drawing), so the parent no longer increments
  // the key on Re-measure click. Kept as a `key=0` constant so future
  // service-id flips can still force a remount if needed.
  const areaMeasureKey = 0
  const [roofPermit, setRoofPermit] = useState<'yes' | 'no' | null>(null)
  const [addonLinearFt, setAddonLinearFt] = useState<Record<string, string>>(
    editItemForService?.roofAddonLinearFt
      ? Object.fromEntries(Object.entries(editItemForService.roofAddonLinearFt as Record<string, number>).map(([k, v]) => [k, String(v)]))
      : {}
  )
  const [subGroupExpanded, setSubGroupExpanded] = useState<Record<string, boolean>>({})
  const [subGroupLinearFt, setSubGroupLinearFt] = useState<Record<string, string>>(
    editItemForService?.subGroupLinearFt
      ? Object.fromEntries(Object.entries(editItemForService.subGroupLinearFt as Record<string, number>).map(([k, v]) => [k, String(v)]))
      : {}
  )
  const [gutterFloors, setGutterFloors] = useState<1 | 2 | null>(() => {
    const persisted = (editItemForService?.gutterDropsConfig as { floors?: 1 | 2 } | undefined)?.floors
    return persisted === 1 || persisted === 2 ? persisted : null
  })
  const [gutterDrops, setGutterDrops] = useState<number>(() => {
    const persisted = (editItemForService?.gutterDropsConfig as { drops?: number } | undefined)?.drops
    return persisted && persisted >= 1 && persisted <= 5 ? persisted : 2
  })
  // Per-addon configurator open/closed state for the 5 Class A linear-ft
  // addons (gutters / soffit_wood / fascia_wood / soffit_metal / fascia_metal).
  // Mirrors the xConfigOpen pattern used by ShingleRoofConfigurator and
  // siblings — ephemeral UI state, not persisted. On chip-tap-add the
  // configurator opens; on Save the configurator collapses and the chip
  // shows an inline lin-ft summary badge.
  const [addonConfigOpen, setAddonConfigOpen] = useState<Record<string, boolean>>({})
  // Arc-19 — per-pool-floor-option sqft + open/closed configurator state.
  // Single-select group at runtime, but the Record-key-by-option-id shape
  // mirrors the Roofing addon pattern and preserves the entered sqft if the
  // homeowner switches floors back-and-forth before saving. Seeded from any
  // persisted customSizeSqft entry on the edited cart item.
  const [poolFloorSqft, setPoolFloorSqft] = useState<Record<string, string>>(() => {
    const persisted = (editItemForService?.customSizeSqft ?? {}) as Record<string, number>
    const seed: Record<string, string> = {}
    for (const id of POOL_FLOOR_SQFT_IDS) {
      const n = persisted[id]
      if (typeof n === 'number' && n > 0) seed[id] = String(n)
    }
    return seed
  })
  const [poolFloorConfigOpen, setPoolFloorConfigOpen] = useState<Record<string, boolean>>({})

  const getFlag = useFeatureFlagsStore((s) => s.getFlag)

  const addItem = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)
  const cartItems = useCartStore((s) => s.items)
  const projectPermit = useCartStore((s) => s.projectPermit)
  const projectPermitWaiver = useCartStore((s) => s.projectPermitWaiver)
  const projectAssociation = useCartStore((s) => s.projectAssociation)
  const poolSurvey = useCartStore((s) => s.poolSurvey)
  const cartCount = cartItems.length
  // Single-project-per-service-per-cart gate (kratos msg 1776669325145 Rod
  // pivot from state-reset approach). Before Add-to-Project fires, check if
  // cart already has an item for this service. If yes: disable the button +
  // show 'Already in cart — book or remove first'. Removing the cart item
  // OR completing its booking (which calls removeItem via booking-confirmation
  // useEffect) re-enables the button. Edit flow exempt — editingItemId set
  // means the user is updating their existing cart entry, not adding a second.
  // Restored from ship #74 pre-multi-address deletion (commit 8daaf4a); gate
  // is the only constraint — multi-address selector remains intact.
  const alreadyInCart = cartItems.some(
    (i) => i.serviceId === serviceId && i.id !== editingItemId
  )

  // Phase B2: per-service address selector. Options = primary + additional_addresses.
  // Key format: "primary" or addr.id. Default primary. Edit mode: restore from
  // the item being edited if it carries an address.
  const homeownerProfile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const addressOptions: Array<{ key: string; label: string; full: string }> = [
    { key: 'primary', label: 'Primary', full: homeownerProfile.address || '' },
    ...(homeownerProfile.additional_addresses ?? []).map((a) => ({
      key: a.id,
      label: a.label,
      full: [a.street, a.city, a.state, a.zip].filter(Boolean).join(', '),
    })),
  ]
  // Property selector starts empty — user must actively pick before Add-to-Project.
  // Edit mode restores the previously-saved address so updates don't lose it.
  const [addressKey, setAddressKey] = useState<string>(() => {
    const edit = editItemForService?.address as CartItemAddress | undefined
    if (!edit) return ''
    const match = addressOptions.find((o) => o.label === edit.label)
    return match?.key ?? ''
  })
  const selectedAddress = addressOptions.find((o) => o.key === addressKey)

  const handleWizardComplete = (result: RoofWizardResult) => {
    // Pitched-only formula (canonical): Solar split when present, else
    // (areaSqft - flat) when no split, else areaSqft as last-resort fallback
    // for legacy/mock measurements. Matches PR #184 metal handler.
    const flatSqft = result.flatAreaSqft ?? 0
    const pitchedSqft = result.pitchedAreaSqft ?? Math.max(0, result.areaSqft - flatSqft)
    const pitchedBase = pitchedSqft || result.areaSqft
    // ceil-rounding to match modal breakdown display + Rodolfo's quote-top-of-real
    // rule: measurements/quotes err HIGH not LOW. Math.round at 2,042 sqft yields
    // 20 (under-quote) while Math.ceil yields 21 (matches modal "21 squares").
    const pitchedSquares = pitchedBase > 0
      ? String(Math.max(1, Math.ceil((pitchedBase * PITCHED_WASTE_FACTOR) / 100)))
      : ''
    const flatSquares = flatSqft > 0
      ? String(Math.max(1, Math.ceil((flatSqft * FLAT_WASTE_FACTOR) / 100)))
      : ''
    if (result.material === 'metal') {
      setMetalRoofSelection((prev) => ({ ...prev, roofSize: pitchedSquares }))
      setMetalRoofConfigOpen(true)
    }
    if (result.material === 'shingle') {
      setShingleSelection((prev) => ({ ...prev, roofSize: pitchedSquares }))
      setShingleConfigOpen(true)
    }
    if (result.material === 'barrel_tile') {
      setTileSelection((prev) => ({ ...prev, roofSize: pitchedSquares }))
      setTileConfigOpen(true)
    }
    if (result.material === 'aluminum') {
      setAluminumSelection((prev) => ({ ...prev, roofSize: pitchedSquares }))
      setAluminumConfigOpen(true)
    }
    if (result.material === 'flat_roof') {
      setFlatRoofSelection((prev) => ({ ...prev, roofSize: flatSquares }))
      setFlatRoofConfigOpen(true)
    }
    setRoofMeasurement((prev) => ({ ...prev, areaSqft: result.areaSqft, pitch: result.pitch, address: result.address, perimeterFt: result.perimeterFt, pitchedAreaSqft: result.pitchedAreaSqft, flatAreaSqft: result.flatAreaSqft }))
    setWizardOpen(false)
    toast.success('Roof measured — your config is pre-filled!')
    // Roofing scroll+pulse is handled by the post-measurement useEffect
    // that watches roofMeasurement — one timed path, no double-scroll.
  }

  // PR-242 — Roof measurement PDF auto-save. Fires once the homeowner has a
  // roof measurement on file for this address (satellite path; manual entry
  // path is gated behind chip-tap which is itself gated by !!roofMeasurement
  // per PR-241). Idempotency: skip if a roof-measurement doc for this
  // homeowner+normalized-address already exists within the last hour, so
  // toggle-flips on the breakdown card don't churn out duplicates and a
  // re-measure within an hour reuses the prior PDF. Never-block: failures
  // are swallowed in the store; the UI is never gated on auto-save.
  useEffect(() => {
    if (serviceId !== 'roofing') return
    if (!roofMeasurement) return
    const liveProfile = useAuthStore.getState().profile
    if (!liveProfile?.id) return
    const measurementAddress = roofMeasurement.address || ''
    const normalizedAddress = measurementAddress.trim().toLowerCase()
    if (!normalizedAddress) return

    const ONE_HOUR_MS = 60 * 60 * 1000
    const now = Date.now()
    const store = useHomeownerDocsStore.getState()
    const existing = store.getDocsForHomeowner(liveProfile.id).find((d) => {
      if (d.category !== 'roof-measurement') return false
      const docAddress = (d.address ?? '').trim().toLowerCase()
      if (docAddress !== normalizedAddress) return false
      const docTime = new Date(d.createdAt).getTime()
      return Number.isFinite(docTime) && now - docTime < ONE_HOUR_MS
    })
    if (existing) return

    let cancelled = false
    ;(async () => {
      try {
        const pdfBytes = await generateRoofMeasurementPdf({
          address: measurementAddress,
          pitch: roofMeasurement.pitch,
          perimeterFt: roofMeasurement.perimeterFt,
          pitchedAreaSqft: roofMeasurement.pitchedAreaSqft,
          flatAreaSqft: roofMeasurement.flatAreaSqft,
          includeMaterialOrder: roofMeasurement.includeMaterialOrder,
          includePerimeter: roofMeasurement.includePerimeter,
          includeFlatArea: roofMeasurement.includeFlatArea,
        })
        if (cancelled) return
        // pdf-lib's save() returns Uint8Array<ArrayBufferLike> which TS strict
        // mode won't widen to BlobPart automatically — copy the bytes through
        // a fresh ArrayBuffer slice to land a concrete ArrayBuffer Blob input.
        const buf = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength,
        ) as ArrayBuffer
        const blob = new Blob([buf], { type: 'application/pdf' })
        const dateSlug = new Date().toISOString().slice(0, 10)
        const addressSlug = measurementAddress
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
          .slice(0, 40)
        await store.addDoc({
          homeownerId: liveProfile.id,
          category: 'roof-measurement',
          filename: `roof-measurement-${addressSlug}-${dateSlug}.pdf`,
          blob,
          uploadedBy: 'system',
          project_id: null,
          address: measurementAddress,
        })
      } catch {
        /* silent — never block flow */
      }
    })()
    return () => { cancelled = true }
  }, [serviceId, roofMeasurement])

  // SPEC B — Rod-directed roofing wizard redesign 2026-07-14. On a
  // roofMeasurement transition to truthy (satellite path or manual
  // fill-in), settle 600ms so the wizard dialog finishes closing, then
  // smooth-scroll the first required step (Service Type) into view at
  // block:'center' and pulse it for 800ms so the client sees where to go
  // next. Supersedes the wizard-complete scrollToFirstConfigSection() for
  // roofing (removed inline) so there's a single, timed scroll path.
  // Mount-guard (iris fidelity review, kratos msg 1783992387685): the
  // effect dep [serviceId, roofMeasurement] also fires on MOUNT, so a
  // returning homeowner who already has a measurement would get an
  // unwanted auto-scroll to service_type on page load. Skip the first
  // fire when roofMeasurement is truthy at mount; new measurements
  // (null → truthy) still land the scroll.
  const isMountedMeasurementRef = useRef(!!roofMeasurement)
  useEffect(() => {
    if (serviceId !== 'roofing') return
    if (!roofMeasurement) return
    if (isMountedMeasurementRef.current) {
      isMountedMeasurementRef.current = false
      return
    }
    let pulseClearId: number | undefined
    const settleId = window.setTimeout(() => {
      document
        .querySelector('[data-service-section="service_type"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPulseGroupId('service_type')
      pulseClearId = window.setTimeout(() => setPulseGroupId(null), 800)
    }, 600)
    return () => {
      window.clearTimeout(settleId)
      if (pulseClearId != null) window.clearTimeout(pulseClearId)
    }
  }, [serviceId, roofMeasurement])

  // Legacy localStorage-based trigger: some older callers may still set
  // 'buildconnect-edit-item' instead of using the location.state channel.
  // Mirror that into editing state on mount if location.state did not
  // provide one. Pattern mirrors the location.state hydration above; the
  // key is removed once consumed.
  useEffect(() => {
    if (editItemForService) return // already hydrated from location.state
    const str = localStorage.getItem('buildconnect-edit-item')
    if (!str) return
    let legacy: Record<string, unknown>
    try {
      legacy = JSON.parse(str)
    } catch {
      return
    }
    if (legacy.serviceId !== serviceId) return
    if (legacy.selections && typeof legacy.selections === 'object') {
      setSelections(legacy.selections as Record<string, string[]>)
    }
    const la = legacy.addonQuantities as { laminarJets?: number; waterfalls?: number; ledCount?: number; bubblerCount?: number } | undefined
    if (la) {
      setLaminarJets(la.laminarJets || 0)
      setWaterfalls(la.waterfalls || 0)
      setLedCount(la.ledCount || 0)
      setBubblerCount(la.bubblerCount || 0)
    }
    const ws = legacy.windowSelections as WindowSelection[] | undefined
    if (ws?.length) { setWindowSelections(ws); setWindowConfigOpen(false) }
    const ds = legacy.doorSelections as DoorSelection[] | undefined
    if (ds?.length) { setDoorSelections(ds); setDoorConfigOpen(false) }
    const sfs = legacy.stormFrontSelections as StormFrontSelection[] | undefined
    if (sfs?.length) { setStormFrontSelections(sfs); setStormFrontConfigOpen(false) }
    const gs = legacy.garageDoorSelection as GarageDoorSelection | undefined
    if (gs?.type) { setGarageDoorSelection(gs); setGarageDoorConfigOpen(false) }
    const ms = legacy.metalRoofSelection as MetalRoofSelection | undefined
    if (ms?.color) { setMetalRoofSelection(ms); setMetalRoofConfigOpen(false) }
    const ss = legacy.shingleSelection as ShingleRoofSelection | undefined
    if (ss?.color) {
      setShingleSelection(ss); setShingleConfigOpen(false)
    } else if (typeof legacy.shingleColor === 'string') {
      setShingleSelection((prev) => ({ ...prev, color: legacy.shingleColor as string }))
    }
    const ts = legacy.tileSelection as TileRoofSelection | undefined
    if (ts?.tileType) {
      setTileSelection(ts); setTileConfigOpen(false)
    } else if (typeof legacy.tileType === 'string' || typeof legacy.tileColor === 'string') {
      setTileSelection({
        tileType: (legacy.tileType as TileType) || '',
        tileColor: (legacy.tileColor as string) || '',
        roofSize: '',
      })
    }
    const al = legacy.aluminumSelection as AluminumRoofSelection | undefined
    if (al?.color) { setAluminumSelection(al); setAluminumConfigOpen(false) }
    const fr = legacy.flatRoofSelection as FlatRoofSelection | undefined
    if (fr?.membraneType) { setFlatRoofSelection(fr); setFlatRoofConfigOpen(false) }
    if (typeof legacy.id === 'string') setEditingItemId(legacy.id)
    localStorage.removeItem('buildconnect-edit-item')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the under-quote acknowledgment whenever material selections change
  // so re-falling into the gate state forces re-acknowledgment.
  useEffect(() => {
    setFlatOnlyAck(false)
  }, [(selections['material'] ?? []).join(',')])

  // Anchor 4: linear-feet auto-fill on measurement. If the user picked a
  // perimeter-driven addon BEFORE measuring (the chip handler at line ~707
  // seeds '' when perimeterFt is undefined), back-fill the seeded blank as
  // soon as a perimeter lands. Existing non-empty values are preserved so
  // the user's manual overrides don't get clobbered.
  useEffect(() => {
    const peri = roofMeasurement?.perimeterFt
    if (!peri) return
    const selectedAddons = selections['addons'] ?? []
    setAddonLinearFt((prev) => {
      const updates: Record<string, string> = {}
      for (const id of ADDON_LINEAR_FT_IDS) {
        if (selectedAddons.includes(id) && !prev[id]) {
          updates[id] = String(peri)
        }
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev
    })
  }, [roofMeasurement?.perimeterFt, (selections['addons'] ?? []).join(',')])

  // Sibling of anchor 4: auto-prefill Roof Size in each material configurator
  // from the measurement. Pitched materials (shingle/barrel_tile/metal/aluminum/
  // terracotta) source from pitchedAreaSqft (with PR #184 defensive fallback:
  // Solar split, else areaSqft - flat, else areaSqft). flat_roof sources from
  // flatAreaSqft. Only seeds when configurator's roofSize is blank — manual
  // overrides preserved.
  useEffect(() => {
    if (!roofMeasurement) return
    const flatSqft = roofMeasurement.flatAreaSqft ?? 0
    const pitchedSqft = roofMeasurement.pitchedAreaSqft
      ?? Math.max(0, (roofMeasurement.areaSqft ?? 0) - flatSqft)
    const pitchedBase = pitchedSqft || (roofMeasurement.areaSqft ?? 0)
    // ceil-rounding (quote-top-of-real): matches modal breakdown display.
    const pitchedSquares = pitchedBase > 0
      ? String(Math.max(1, Math.ceil((pitchedBase * PITCHED_WASTE_FACTOR) / 100)))
      : ''
    const flatSquares = flatSqft > 0
      ? String(Math.max(1, Math.ceil((flatSqft * FLAT_WASTE_FACTOR) / 100)))
      : ''
    const mats = selections['material'] ?? []
    if (pitchedSquares) {
      if (mats.includes('metal')) setMetalRoofSelection((p) => p.roofSize ? p : { ...p, roofSize: pitchedSquares })
      if (mats.includes('shingle')) setShingleSelection((p) => p.roofSize ? p : { ...p, roofSize: pitchedSquares })
      if (mats.includes('barrel_tile') || mats.includes('terracotta')) {
        setTileSelection((p) => p.roofSize ? p : { ...p, roofSize: pitchedSquares })
      }
      if (mats.includes('aluminum')) setAluminumSelection((p) => p.roofSize ? p : { ...p, roofSize: pitchedSquares })
    }
    if (flatSquares && mats.includes('flat_roof')) {
      setFlatRoofSelection((p) => p.roofSize ? p : { ...p, roofSize: flatSquares })
    }
  }, [roofMeasurement?.pitchedAreaSqft, roofMeasurement?.flatAreaSqft, roofMeasurement?.areaSqft, (selections['material'] ?? []).join(',')])

  // PR-216 follow-up — corrective layer pairing with the click-time defensive
  // close (handleSelect early-return). When roofMeasurement flips into
  // perimeter-only mode (includeMaterialOrder=false AND includePerimeter=true),
  // any previously-open material configurator must close. Otherwise the
  // configurator stays sticky across the mode transition (selected.includes('X')
  // && XConfigOpen both true), defeating the info-only contract for the
  // perimeter-only chip-tap. Defensive + corrective pairing per
  // feedback_defensive_plus_corrective_pairing.
  useEffect(() => {
    const inPerimeterOnly =
      serviceId === 'roofing' &&
      roofMeasurement?.includeMaterialOrder === false &&
      roofMeasurement?.includePerimeter === true
    if (inPerimeterOnly) {
      setMetalRoofConfigOpen(false)
      setShingleConfigOpen(false)
      setTileConfigOpen(false)
      setAluminumConfigOpen(false)
      setFlatRoofConfigOpen(false)
    }
  }, [serviceId, roofMeasurement?.includeMaterialOrder, roofMeasurement?.includePerimeter])

  // PR-220 — pergolas size auto-select. When the user confirms a polygon
  // measurement on a pergolas service, default the required Size group to
  // the synthetic 'measured' chip (label reads the measured sqft live in
  // the renderer). Custom Size remains a manual override fallback if the
  // user explicitly picks it. Transitioning out (re-measure) is a no-op
  // so the user can keep their override or re-pick via the chip; matches
  // the PR-219 service_type useEffect contract.
  useEffect(() => {
    if (serviceId !== 'pergolas' || !areaMeasurement) return
    setSelections((prev) => {
      // Don't clobber an explicit Custom Size pick — single-select group
      // already keeps one id; only auto-fill when nothing is selected yet
      // or the prior value was a now-removed legacy id.
      const current = prev['size']?.[0]
      if (current === 'measured' || current === 'custom') return prev
      return { ...prev, size: ['measured'] }
    })
  }, [serviceId, areaMeasurement])

  const [detailsOpen, setDetailsOpen] = useState(false)

  const services = useCatalogStore((s) => s.services)
  const service = services.find((s) => s.id === serviceId)

  const scrollToFirstConfigSection = () => {
    const firstGroupId = service?.optionGroups?.[0]?.id
    if (!firstGroupId) return
    window.setTimeout(() => {
      document
        .querySelector(`[data-service-section="${firstGroupId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  useDocumentTitle(service?.name)

  useEffect(() => {
    if (service && service.status !== 'live') {
      navigate('/home', { replace: true })
    }
  }, [service, navigate])

  if (!service) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Service not found</p>
        <Button variant="outline" onClick={() => navigate('/home')}>
          Go back
        </Button>
      </div>
    )
  }

  const Icon = SERVICE_ICONS[service.id as ServiceCategory] || Home
  const iconGradient = ICON_GRADIENTS[service.id as ServiceCategory] || 'from-blue-400 to-blue-600'

  // A revealsOn group stays hidden (and does not count toward required progress)
  // until the referenced gate-group has a matching selection. With `equals`, the
  // gate must contain that specific option id; with `notEquals`, the gate must
  // have a selection that does NOT match the named id (used by house_painting
  // rooms group: hidden when scope=exterior_only); without either, any selection
  // in the gate-group triggers reveal.
  const isRevealed = (g: OptionGroup) => {
    if (!g.revealsOn) return true
    const selected = selections[g.revealsOn.group] ?? []
    if (selected.length === 0) return false
    if (g.revealsOn.equals) return selected.includes(g.revealsOn.equals)
    if (g.revealsOn.notEquals) return !selected.includes(g.revealsOn.notEquals)
    return true
  }

  const requiredGroups = service.optionGroups.filter((g) => g.required && isRevealed(g))
  const completedRequired = requiredGroups.filter(
    (g) => (selections[g.id]?.length ?? 0) > 0
  ).length

  // Under-quote guard — chip-tap = no pitched material AND satellite measured
  // significant pitched area. Shared evaluator with wizard Step 2 framing
  // (single source of truth so display + commit gate cannot diverge).
  const pitchedOmittedTriggered = serviceId === 'roofing' && evalPitchedOmittedTriggered({
    pitchedAreaSqft: roofMeasurement?.pitchedAreaSqft ?? 0,
    flatAreaSqft: roofMeasurement?.flatAreaSqft ?? 0,
    hasPitchedMaterialSelected: (selections['material'] ?? []).some((m) => m !== 'flat_roof'),
  })
  // PR-#402 follow-up — Rod-directed addon-only suppression. When the user
  // selects at least one addon AND zero pitched materials, they are in
  // intentional addon-only mode (perimeter-driven order; no main-roof
  // material). The pitched-omitted warning at L2390-ish stops bugging them,
  // the checkbox-opt-out is dropped, and the Add-to-Project gate treats it
  // as implicit ack so cart-write strips pitched + sets pitchedExcludedAck.
  // Same predicate-shape as evalPitchedOmittedTriggered's hasPitchedMaterial
  // check ('flat_roof' is not pitched).
  const isAddonOnlyMode =
    serviceId === 'roofing' &&
    (selections['addons']?.length ?? 0) >= 1 &&
    !(selections['material'] ?? []).some((m) => m !== 'flat_roof')
  const allRequiredDone = completedRequired === requiredGroups.length

  // SPEC C L1 (Rod-directed roofing wizard redesign 2026-07-14). Derived
  // for an inline "Required — pick one to continue" hint on the FIRST
  // incomplete required group card. Pure re-derivation of existing state;
  // no change to requiredGroups math or gate logic. `undefined` when
  // every required group has at least one selection (nothing to nudge).
  const firstMissingRequiredId = requiredGroups.find(
    (g) => (selections[g.id]?.length ?? 0) === 0,
  )?.id

  // Per-step plain-English gating message — names the topmost missing item.
  // Order matches the on-screen group order, then the secondary structural
  // gates (permit / association / pool survey / addon-ack / pergolas assign).
  function gatingReason(): string {
    const missingGroup = requiredGroups.find(
      (g) => (selections[g.id]?.length ?? 0) === 0,
    )
    if (missingGroup) return `Pick a ${missingGroup.label.toLowerCase()} to continue.`
    if (!addressKey) {
      return 'Select a property to continue.'
    }
    if (!isProjectAssociationValid(projectAssociation ?? null)) {
      return 'Answer the association question to continue.'
    }
    if (!isProjectPermitValid(projectPermit, projectPermitWaiver)) {
      return 'Choose a permit option to continue.'
    }
    if (serviceId === 'pool' && !isPoolSurveyValid(poolSurvey ?? null)) {
      return 'Complete the pool survey to continue.'
    }
    if (pitchedOmittedTriggered && !flatOnlyAck && !isAddonOnlyMode) {
      return 'Acknowledge the flat-only order to continue.'
    }
    if (!pergolasStructuresAllAssigned) {
      return 'Assign a structure to each measured area to continue.'
    }
    return 'Complete all required selections to continue.'
  }

  // PR-223 Option B — pergolas force-pick gate. Every drawn measurement
  // square must have a structure assigned via the in-card picker before
  // Add-to-Project unlocks. Custom-size flow (no polygons) is not affected;
  // the top Structure Type chip group remains visible and satisfies the
  // requiredGroups check on its own.
  const pergolasStructuresAllAssigned = (() => {
    if (serviceId !== 'pergolas') return true
    const polys = areaMeasurement?.polygons
    if (!polys || polys.length === 0) return true
    const arr = selections['structure'] ?? []
    return polys.every((_, idx) => Boolean(arr[idx]))
  })()

  // Perimeter-only chip-tap mode: user keeps the satellite-measured perimeter
  // but skips the material-order portion. Material question becomes info-only
  // ("What is your existing roof?") and add-ons collapse to the linear-foot
  // perimeter-attaching subset (gutters, soffit×2, fascia×2). Derived state;
  // no new persisted field.
  const isRoofingPerimeterOnly =
    serviceId === 'roofing' &&
    roofMeasurement?.includeMaterialOrder === false &&
    roofMeasurement?.includePerimeter === true

  const addonsThatNeedConfig = ['spa', 'beach', 'waterfall', 'led', 'bubbler']

  // Radio-across resolver: choiceId may be either a sub_group id (Cabinet
  // multi-section mode where each sub_group acts as both label and chip) or
  // an option id under sub_groups[0].options (Stone flat-chip mode where
  // sub_groups[0].options are the choices). Walks all sub_groups looking for
  // either match — sub_group ids and child option ids share a global UUID
  // space, so the first-match-wins walk is unambiguous.
  function resolveSubChoiceLabel(
    option: { subGroups?: OptionGroup[] | null },
    choiceId: string,
  ): string | null {
    for (const sg of option.subGroups ?? []) {
      if (sg.id === choiceId) return sg.label
      const found = sg.options.find((o) => o.id === choiceId)
      if (found) return found.label
    }
    return null
  }

  function handleSubChoiceSelect(parentOptionId: string, choiceId: string) {
    // Capture toggle-off intent BEFORE setSelections mutates, so the seed
    // branch below sees consistent state within this event handler.
    const currentPick = selections[`${parentOptionId}-sub`]?.[0]
    const isToggleOff = currentPick === choiceId

    setSelections((prev) => {
      const key = `${parentOptionId}-sub`
      const current = prev[key]?.[0]
      if (current === choiceId) {
        // Toggle off when the same chip is tapped — radio-across allows
        // clearing a pick by re-tapping the active chip.
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: [choiceId] }
    })

    // PR-#402 follow-up — inherit parent's computed linear-feet on first
    // sub-pick. Parent addon (e.g. Soffit) seeds addonLinearFt[parentId]
    // from roofMeasurement.perimeterFt at chip-tap (L1571-1575). When user
    // picks a sub-option under that addon, mirror the parent value into
    // subGroupLinearFt[parentId] so the dedicated AddonLinearFtConfigurator
    // card opens pre-filled (Fascia-style mirror per Rod screenshot). Only
    // seed when subGroupLinearFt is currently empty so user edits aren't
    // clobbered on re-pick. Kitchen Stone path is unaffected: addonLinearFt
    // is roofing-only state, so addonLinearFt[parentId] is undefined →
    // setSubGroupLinearFt is a no-op for kitchen.
    if (!isToggleOff) {
      setSubGroupLinearFt((prev) => {
        if (prev[parentOptionId]) return prev
        const inherited = addonLinearFt[parentOptionId]
        if (!inherited) return prev
        return { ...prev, [parentOptionId]: inherited }
      })
    }
  }

  function handleSubLinearFeetChange(parentOptionId: string, value: string) {
    setSubGroupLinearFt((prev) => ({ ...prev, [parentOptionId]: value }))
  }

  function handleSelect(group: OptionGroup, optionId: string) {
    // Arc-31 — Service Type chip-tap drives roof-measurement state.
    // Replaces the prior PR-219 toggle→service_type reverse-coupling
    // useEffects. Mapping (Rod-locked 2026-05-23):
    //   replace → M=true  / P=true  / F=true
    //   addons  → M=false / P=true  / F=false  (matches isRoofingPerimeterOnly)
    //   repair  → M=true  / P=true  / F=true  (default; future-config follow-up)
    if (serviceId === 'roofing' && group.id === 'service_type') {
      // Path A — toggle-off when chip already selected. Without this branch
      // service_type is a one-way trap once the Add-ons mutex (L1336-1339)
      // locks Full Replacement + Repair: user has no path to deselect
      // Add-ons and pick a different Service Type. Rod 2026-05-25 re-raise
      // off PR-#397. Reset roof-measurement flags to the neutral
      // replace/repair defaults (M=P=F=true) so the next pick lands on a
      // clean slate rather than the addons-leftover M=F=false state.
      const current = selections[group.id] ?? []
      if (current.includes(optionId)) {
        setSelections((prev) => ({ ...prev, [group.id]: [] }))
        setRoofMeasurement((prev) =>
          prev
            ? { ...prev, includeMaterialOrder: true, includePerimeter: true, includeFlatArea: true }
            : prev,
        )
        return
      }
      const mapping: Record<string, { includeMaterialOrder: boolean; includePerimeter: boolean; includeFlatArea: boolean }> = {
        replace: { includeMaterialOrder: true,  includePerimeter: true, includeFlatArea: true  },
        addons:  { includeMaterialOrder: false, includePerimeter: true, includeFlatArea: false },
        repair:  { includeMaterialOrder: true,  includePerimeter: true, includeFlatArea: true  },
      }
      const next = mapping[optionId]
      if (next) {
        setRoofMeasurement((prev) => (prev ? { ...prev, ...next } : prev))
      }
      // Fall through to default single-select behavior below.
    }

    // For pool add-ons: enforce one-at-a-time for items with configurators
    if (serviceId === 'pool' && group.id === 'addons') {
      const current = selections[group.id] ?? []
      const isDeselecting = current.includes(optionId)

      if (isDeselecting) {
        // Deselecting - clear sub-selections
        setSelections((prev) => {
          const updated = { ...prev, [group.id]: current.filter((id) => id !== optionId) }
          if (optionId === 'spa') delete updated['spa_size']
          if (optionId === 'beach') delete updated['beach_size']
          return updated
        })
        if (optionId === 'waterfall') { setLaminarJets(0); setWaterfalls(0) }
        if (optionId === 'led') setLedCount(0)
        if (optionId === 'bubbler') setBubblerCount(0)
        setActiveAddonMenu(null)
        return
      }

      // Selecting a new add-on with config — block if another config is open
      if (addonsThatNeedConfig.includes(optionId) && activeAddonMenu !== null) {
        return // Block — finish current first
      }

      // Select the add-on and open its config
      setSelections((prev) => ({
        ...prev,
        [group.id]: [...(prev[group.id] ?? []), optionId],
      }))
      if (addonsThatNeedConfig.includes(optionId)) {
        setActiveAddonMenu(optionId)
      }
      return
    }

    // Default behavior for non-pool-addon groups
    setSelections((prev) => {
      const current = prev[group.id] ?? []
      if (group.type === 'single') {
        return { ...prev, [group.id]: [optionId] }
      }
      if (serviceId === 'roofing' && group.id === 'material') {
        return { ...prev, [group.id]: applyRoofingMaterialPitchedSingleton(current, optionId) }
      }
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) }
      }
      // Cap multi-select groups at maxSelect when set (pergolas.structure = 2).
      if (group.maxSelect !== undefined && current.length >= group.maxSelect) {
        return prev
      }
      return { ...prev, [group.id]: [...current, optionId] }
    })
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/home')}
          className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to services
        </Button>
      </motion.div>

      {/* Service header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-start gap-5"
      >
        <div className={cn(
          'flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md shrink-0',
          iconGradient
        )}>
          <Icon className="h-8 w-8 text-white" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
            {service.name}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground leading-relaxed">
            {service.description}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3">
            {service.features.map((feature) => (
              <span
                key={feature}
                className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Ship #253 — per-service measurement tutorial CTA. Placed above
          the Configure-your-project card so the homeowner sees the help-
          link BEFORE getting into option selection. Toast-placeholder
          onClick; real video URLs land when content is produced. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
      >
        <MeasurementTutorialCTA serviceId={service.id} />
      </motion.div>

      {/* Roof measurement wizard CTA — roofing only, additive (CHAIN IS GOD) */}
      {serviceId === 'roofing' && (() => {
        const matSelections = selections['material'] ?? []
        const dominantMaterial = (matSelections.find((m) => m !== 'flat_roof') ?? null) as Exclude<RoofMaterialKey, 'flat_roof'> | null
        const hasFlatSection = matSelections.includes('flat_roof')
        // Pre-chip-tap default-included override (parity with PR #187 wizard
        // preview): when the user has measured but not yet chip-tapped a
        // material, default the on-page breakdown card to pitched-included
        // with a shingle placeholder so post-Save returns to a sensible
        // display instead of the misleading "0 sqft + Pitched NOT INCLUDED"
        // shape. The placeholder only affects breakdown DISPLAY props on
        // this card; pitchedOmittedTriggered remains the real value at the
        // page level so the Add to Project gate (line ~1491) and warning
        // banner (line ~1441) still fire correctly until chip-tap is done.
        const noChipTapYet = dominantMaterial === null && !hasFlatSection
        const previewPitchedOmittedTriggered = noChipTapYet ? false : pitchedOmittedTriggered
        return (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.12 }}
            className="space-y-3"
          >
            <div className="rounded-2xl border bg-primary/5 border-primary/20 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                  <Home className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {roofMeasurement ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">Roof measured</p>
                      <p className="text-base font-medium text-foreground mt-0.5 truncate">{roofMeasurement.address}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <button
                          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                          onClick={() => setWizardOpen(true)}
                        >
                          Re-measure
                        </button>
                        <span className="text-muted-foreground/40">·</span>
                        <button
                          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                          onClick={() => setWizardOpen(true)}
                        >
                          Adjust manually
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground">Get an instant roof measurement</p>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        We'll measure your roof from satellite data and pre-fill your configuration.
                      </p>
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={() => setWizardOpen(true)}
                      >
                        Measure My Roof
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {roofMeasurement && (
              <RoofMeasurementBreakdownCard
                pitchedAreaSqft={roofMeasurement.pitchedAreaSqft ?? 0}
                flatAreaSqft={roofMeasurement.flatAreaSqft ?? 0}
                pitch={roofMeasurement.pitch}
                perimeterFt={roofMeasurement.perimeterFt ?? 0}
                includeMaterialOrder={roofMeasurement.includeMaterialOrder ?? true}
                includePerimeter={roofMeasurement.includePerimeter ?? true}
                includeFlatArea={roofMeasurement.includeFlatArea ?? true}
                pitchedOmittedTriggered={previewPitchedOmittedTriggered}
                source="service-detail"
              />
            )}

            <RoofMeasurementWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
              defaultAddress={selectedAddress?.full ?? ''}
              onComplete={handleWizardComplete}
              material={dominantMaterial}
              hasFlatSection={hasFlatSection}
            />
          </motion.div>
        )
      })()}

      {/* Area measurement CTA — driveways + pergolas + fencing, additive (CHAIN IS GOD).
          PR-220: SatelliteMeasure stays mounted across both pre- and post-confirm
          phases. The component's own 'confirmed' phase keeps the satellite map
          visible read-only with the polygon overlay locked. No swap to a separate
          summary card — the map IS the summary. */}
      {(serviceId === 'driveways' || serviceId === 'pergolas' || serviceId === 'fencing') && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          <div className="rounded-2xl border bg-primary/5 border-primary/20 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <Ruler className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground mb-2">
                  {serviceId === 'driveways'
                    ? 'Measure your driveway area'
                    : serviceId === 'fencing'
                    ? 'Measure your fence line'
                    : 'Measure your outdoor space'}
                </p>
                <SatelliteMeasure
                  key={areaMeasureKey}
                  serviceCategory={serviceId as ServiceCategory}
                  gmpEnabled={getFlag('googleMapsPlatform')}
                  initialAddress={selectedAddress?.full ?? ''}
                  // PR-223 Option B — pergolas allows up to 2 measurements,
                  // decoupled from structure selection (structure is picked
                  // per-square inside the Size group, not via a chip group
                  // here). 2 is the hard cap regardless of prior picks.
                  // Other services leave maxPolygons undefined.
                  maxPolygons={serviceId === 'pergolas' ? 2 : undefined}
                  onMeasure={(result) => {
                    setAreaMeasurement({
                      areaSqft: result.areaSqft,
                      perimeterFt: result.measurements.type === 'fencing' ? result.measurements.perimeterFt : undefined,
                      address: result.address,
                      mapUrl: result.mapUrl,
                      polygons: result.polygons,
                    })
                    scrollToFirstConfigSection()
                  }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Configuration section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-2xl border bg-card p-6 shadow-md transition-all duration-200 ease-out pointer-fine:hover:shadow-lg pointer-fine:hover:-translate-y-0.5"
      >
        <h2 className="text-lg font-semibold font-heading text-foreground mb-1">
          Configure your project
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Select your preferences below to get matched with the right contractors.
        </p>

        {/* Progress — SPEC A (Rod-directed roofing wizard redesign
            2026-07-14). Horizontal step track: one dot+label per REQUIRED
            optionGroup (optional groups like Add-Ons get no dot).
            States: completed (filled + check) / active (ring + number) /
            pending (muted outline). Data-bound to existing requiredGroups
            + completedRequired — no new gate state, no math change. The
            numeric counter stays alongside for legibility on wider sets. */}
        {requiredGroups.length > 0 && (
          <div
            className="mb-6 flex items-center gap-3"
            data-progress-track="step-dots"
            data-completed-required={completedRequired}
            data-required-total={requiredGroups.length}
          >
            <div className="flex flex-1 items-center gap-2 min-w-0">
              {requiredGroups.map((g, idx) => {
                const isCompleted = (selections[g.id]?.length ?? 0) > 0
                const isActive = !isCompleted && idx === completedRequired
                const state = isCompleted ? 'completed' : isActive ? 'active' : 'pending'
                const isLast = idx === requiredGroups.length - 1
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-2 min-w-0"
                    data-step-dot={g.id}
                    data-step-state={state}
                  >
                    <motion.div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shrink-0 border-2 transition-colors',
                        isCompleted && 'bg-primary text-primary-foreground border-primary',
                        isActive && 'bg-primary/10 text-primary border-primary ring-2 ring-primary/30',
                        !isCompleted && !isActive && 'bg-background text-muted-foreground border-muted-foreground/30',
                      )}
                      initial={false}
                      animate={{ scale: isActive ? 1.05 : 1 }}
                      transition={{ duration: 0.3 }}
                      aria-current={isActive ? 'step' : undefined}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                    </motion.div>
                    <span
                      className={cn(
                        'text-xs font-medium whitespace-nowrap truncate',
                        isActive ? 'text-foreground' : 'text-muted-foreground',
                      )}
                      data-step-label={g.id}
                    >
                      {g.label}
                    </span>
                    {!isLast && (
                      <div className="flex-1 h-0.5 min-w-4 bg-muted overflow-hidden rounded-full">
                        <motion.div
                          className="h-full bg-primary origin-left"
                          initial={false}
                          animate={{ scaleX: isCompleted ? 1 : 0 }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <span
              className="text-sm text-muted-foreground whitespace-nowrap font-medium"
              data-progress-counter
            >
              {completedRequired} / {requiredGroups.length}
            </span>
          </div>
        )}

        {/* Option groups */}
        <div className={serviceId === 'wall_paneling' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-6'}>
          {service.optionGroups.filter((group) => {
            // Generic conditional reveal — e.g., windows_doors install_preference
            // waits on `scope` (Permit/No Permit) being answered first.
            if (!isRevealed(group)) return false
            // Hide spa_size unless Attached Spa is selected and it's the active menu
            if (group.id === 'spa_size') {
              if (!(selections['addons'] ?? []).includes('spa')) return false
              if (activeAddonMenu !== 'spa') return false
            }
            // Hide beach_size unless Beach is selected and it's the active menu
            if (group.id === 'beach_size') {
              if (!(selections['addons'] ?? []).includes('beach')) return false
              if (activeAddonMenu !== 'beach') return false
            }
            // Hide old garage door option groups - now handled by GarageDoorConfigurator
            if (group.id === 'garage_door_type' || group.id === 'garage_door_size' || group.id === 'garage_door_color' || group.id === 'garage_door_glass') {
              return false
            }
            // PR-241 — Repair Materials only renders when service_type=repair.
            // Rod 2026-05-14 15:11Z: "only show repair materials if on service
            // type repair is selected". Render-gate not lock-gate.
            if (group.id === 'repair_materials' && !(selections.service_type ?? []).includes('repair')) {
              return false
            }
            // Arc-31 — Material section hidden when service_type=addons. Add-ons
            // mode skips the material-order step (M=false, P=true, F=false) so
            // the material chooser is moot. Render-gate per sibling-pattern above.
            if (
              serviceId === 'roofing' &&
              group.id === 'material' &&
              (selections.service_type ?? []).includes('addons')
            ) {
              return false
            }
            // Hide water_feature_units chip group on homeowner side; the
            // canonical UI is the count-stepper waterfall configurator
            // (Laminar Jets + Waterfalls counts) further down. The
            // optionGroup stays in SERVICE_CATALOG because vendor catalog
            // page consumes it for per-unit pricing (laminar_jet /
            // waterfall_unit). Sibling of garage_door_* exclusion above.
            if (group.id === 'water_feature_units') {
              return false
            }
            // PR-223 Option B — pergolas structure is picked PER measurement
            // square (draw-then-assign), not via this top chip group. The
            // group's options still feed the per-square chip-row inside the
            // Size group breakdown, but the top-level group is hidden.
            if (serviceId === 'pergolas' && group.id === 'structure') {
              return false
            }
            return true
          }).map((group) => {
            const selected = selections[group.id] ?? []
            const groupLabel =
              isRoofingPerimeterOnly && group.id === 'material'
                ? 'What is your existing roof?'
                : group.label
            const renderOptions =
              isRoofingPerimeterOnly && group.id === 'addons'
                ? group.options.filter((o) => ADDON_LINEAR_FT_IDS.includes(o.id))
                : group.options
            const isExpanded = expandedGroups[group.id] === true
            const hasSelection = selected.length > 0
            const useAccordion = serviceId === 'wall_paneling'
            const bodyVisible = !useAccordion || isExpanded
            const isPulsing = pulseGroupId === group.id
            const isFirstMissingRequired =
              !useAccordion &&
              group.required &&
              group.id === firstMissingRequiredId
            return (
              <motion.div
                key={group.id}
                data-chip-group-id={group.id}
                data-mode={isRoofingPerimeterOnly ? 'perimeter-only' : 'standard'}
                data-service-type-selected={
                  group.id === 'service_type' ? (selections.service_type?.[0] ?? '') : undefined
                }
                data-service-section={group.id}
                data-step-pulse={isPulsing ? 'active' : undefined}
                {...(useAccordion
                  ? {
                      'data-group-expanded': isExpanded ? 'true' : 'false',
                      'data-group-has-selection': hasSelection ? 'true' : 'false',
                    }
                  : {})}
                style={useAccordion && isExpanded ? { gridColumn: '1 / -1' } : undefined}
                initial={false}
                animate={
                  isPulsing
                    ? { boxShadow: ['0 0 0 0 rgba(37,99,235,0.55)', '0 0 0 10px rgba(37,99,235,0)'] }
                    : { boxShadow: '0 0 0 0 rgba(37,99,235,0)' }
                }
                transition={{ duration: 0.8, ease: 'easeOut' }}
              >
                {useAccordion ? (
                <button
                  type="button"
                  onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: !isExpanded }))}
                  className={cn(
                    'rounded-lg border bg-card hover:bg-accent/30 transition-colors',
                    isExpanded
                      ? 'w-full flex items-center gap-2 px-3 py-2.5 text-left'
                      : 'w-full flex flex-col items-center justify-center gap-1.5 px-4 py-5 h-[136px] text-center'
                  )}
                  data-group-header={group.id}
                  data-group-card={isExpanded ? 'expanded' : 'collapsed'}
                  aria-expanded={isExpanded}
                >
                  <span className="text-sm font-semibold text-foreground shrink-0" data-group-label={groupLabel}>
                    {groupLabel}
                  </span>
                  {group.required ? (
                    <span className="text-destructive text-xs shrink-0">*</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-medium bg-muted rounded-full px-2 py-0.5 shrink-0">
                      Optional
                    </span>
                  )}
                  {!isExpanded && hasSelection && (
                    <span className="flex flex-nowrap items-center gap-1.5 ml-1 min-w-0 flex-1 overflow-hidden" data-group-summary={group.id}>
                      {selected.map((optId) => {
                        const opt = renderOptions.find((o) => o.id === optId)
                        if (!opt) return null
                        const qty = selectionQuantities[optId]
                        return (
                          <span
                            key={optId}
                            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground max-w-full"
                            data-group-summary-chip={optId}
                            data-group-summary-qty={qty ?? ''}
                          >
                            {opt.image_url ? (
                              <img src={opt.image_url} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                            ) : null}
                            <span className="truncate max-w-[10rem]">{opt.label}</span>
                            {qty != null && qty > 0 ? (
                              <span className="text-muted-foreground shrink-0">· {qty} LF</span>
                            ) : null}
                          </span>
                        )
                      })}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/95 text-foreground shadow-md ring-1 ring-foreground/20 backdrop-blur-sm transition-colors shrink-0"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </span>
                </button>
                ) : (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground" data-group-label={groupLabel}>
                    {groupLabel}
                  </span>
                  {group.required ? (
                    <span className="text-destructive text-xs">*</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-medium bg-muted rounded-full px-2 py-0.5">
                      Optional
                    </span>
                  )}
                </div>
                )}
                {/* SPEC C L1 — Rod-directed roofing wizard redesign
                    2026-07-14. On the FIRST incomplete required group
                    card, show a subtle inline hint below the header so
                    the gating reason is visible next to the missing
                    item, not only at the bottom Add-to-Project button.
                    Purely additive; no change to gatingReason() or gate
                    logic. Skipped for the accordion path (wall_paneling)
                    since its collapsed-tile UI has no comparable slot. */}
                {isFirstMissingRequired && (
                  <div
                    className="mb-3 text-xs font-medium text-primary/80"
                    data-step-required-hint={group.id}
                  >
                    Required — pick one to continue
                  </div>
                )}
                {bodyVisible && (
                <div className={useAccordion ? 'mt-3' : ''}>
                <div className={cn(
                  isTileModeGroup(serviceId, group.id)
                    ? 'grid grid-cols-2 sm:grid-cols-3 gap-3'
                    : 'flex flex-wrap gap-2'
                )}>
                  {renderOptions.map((option) => {
                    const isSelected = selected.includes(option.id)
                    const isCardTile = isTileModeGroup(serviceId, group.id)
                    const isImageTile = isCardTile && !!option.image_url
                    const TileIcon = isCardTile && !isImageTile
                      ? SERVICE_TILE_ICONS[serviceId ?? '']?.[group.id]?.[option.id]
                      : undefined
                    // PR — roofing material primary lock. Once a non-flat material is
                    // picked, every OTHER non-flat chip becomes unclickable. Flat Roof
                    // is additive (coexists with non-flat sections per Granada walk
                    // anchor), so it stays clickable both ways and picking flat first
                    // does NOT lock the other chips. The currently-selected chip stays
                    // clickable so users can deselect/replace.
                    const hasNonFlatMaterialPicked =
                      serviceId === 'roofing' &&
                      group.id === 'material' &&
                      selected.some((s) => s !== 'flat_roof')
                    const isLocked =
                      (serviceId === 'roofing' &&
                        group.id === 'material' &&
                        option.id !== 'flat_roof' &&
                        !isSelected &&
                        hasNonFlatMaterialPicked) ||
                      // PR-220 — pergolas auto-measured chip is gated on a
                      // polygon being drawn. Without a measurement the chip
                      // is unclickable + reads "Measure your space first".
                      (serviceId === 'pergolas' &&
                        group.id === 'size' &&
                        option.id === 'measured' &&
                        !areaMeasurement) ||
                      // Perimeter excluded: lock the Add-ons chip — without perimeter
                      // there is no gutter/fascia/soffit work to add on, so Add-ons
                      // is no longer a valid Service Type. Full Replacement and Repair
                      // stay selectable.
                      (group.id === 'service_type' &&
                        option.id === 'addons' &&
                        serviceId === 'roofing' &&
                        roofMeasurement?.includePerimeter === false) ||
                      // Arc-31 — Service Type mutex: when Add-ons is the picked
                      // Service Type, Full Replacement + Repair render disabled
                      // (greyed out + unclickable). User deselects Add-ons first
                      // to re-enable them. Add-ons chip itself stays clickable
                      // (no option.id === 'addons' here) so the deselect path
                      // works — mirrors the !isSelected escape on material-mutex
                      // L1310. Per Rod 2026-05-25 re-raise of task_..._334:
                      // "if i select ADD-ONS full replacement and repair becomes
                      // unavailable to select".
                      (group.id === 'service_type' &&
                        serviceId === 'roofing' &&
                        option.id !== 'addons' &&
                        (selections.service_type ?? []).includes('addons')) ||
                      // PR-240 — Perimeter excluded also locks every chip in the
                      // Add-Ons SECTION (gutters, soffit/fascia wood+metal, attic
                      // insulation, solar prep, extra plywood). Rod 14:51Z directive:
                      // "grey out non selective on service type now do it on addons
                      // too". Value-shape-agnostic !== true (undefined/null/false
                      // all lock — matches codebase idiom includePerimeter ?? true).
                      (group.id === 'addons' &&
                        serviceId === 'roofing' &&
                        roofMeasurement?.includePerimeter !== true) ||
                      // PR-241 — pre-measure gate. Until a roof measurement
                      // exists, every chip across every group on the roofing
                      // service-detail is locked. Rod 2026-05-14 15:11Z:
                      // "don't allow to click on nothing like addons if measure
                      // my roof is not done first". Either satellite-measure or
                      // manual-skip flow satisfies — both set roofMeasurement
                      // truthy.
                      (serviceId === 'roofing' && !roofMeasurement)
                    // PR-220 — dynamic label for pergolas measured chip:
                    // reads the live measured sqft once a polygon is drawn,
                    // falls back to a "measure first" prompt otherwise.
                    // PR-222 — multi-structure: when 2 polygons are drawn,
                    // the label shows the total only; per-structure breakdown
                    // renders under the size group with ColorCircles below.
                    // PR-#404 — roofing+addons parent chip mirrors the picked
                    // sub-variant label dynamically (e.g. "Soffit" → "Soffit
                    // Wood"). Scoped to roofing+addons so kitchen Stone +
                    // Cabinet flows keep their static parent-label + separate
                    // sub-pick badge (L1710-1722) contract unchanged.
                    const roofingAddonSubPickId =
                      serviceId === 'roofing' && group.id === 'addons'
                        ? selections[`${option.id}-sub`]?.[0]
                        : undefined
                    const roofingAddonSubPickLabel = roofingAddonSubPickId
                      ? resolveSubChoiceLabel(option, roofingAddonSubPickId)
                      : null
                    const optionLabel =
                      serviceId === 'pergolas' && group.id === 'size' && option.id === 'measured'
                        ? (areaMeasurement
                            ? `${areaMeasurement.areaSqft.toLocaleString()} sq ft (measured)`
                            : 'Measure your space first')
                        : roofingAddonSubPickLabel ?? option.label
                    // PR-#462 — per-option number-input rendering. Vendor/admin
                    // flips an option's inputType to 'number-input' (catalog
                    // column, mapped through service-catalog.ts) and the
                    // configurator surfaces an empty number Input bound to
                    // selectionQuantities[option.id]; the option is auto-toggled
                    // into `selected` when qty > 0 so the existing
                    // prunedQuantities loop (L2576) and pricing.ts
                    // requiresQuantity branch pick it up. Mirrors install_windows
                    // mechanism (requiresQuantity flag) — no per-option pricing
                    // path, reuses qty × basePrice.
                    //
                    // Combo path (image_url + inputType=number-input): AUGMENT
                    // — render the image tile chip THEN the Input below, so the
                    // homeowner sees the visual sample AND enters a quantity
                    // (e.g. wall-paneling linear-ft). Plain number-input (no
                    // image_url) still REPLACES the chip with the Input row.
                    const isNumberInput = option.inputType === 'number-input'
                    const isImageNumberInput = isNumberInput && !!option.image_url
                    const renderNumberInputRow = () => {
                      const qty = selectionQuantities[option.id]
                      const unitSuffix =
                        option.priceUnit === 'linear_ft'
                          ? 'Linear ft'
                          : option.priceUnit === 'sqft'
                            ? 'Sq ft'
                            : option.priceUnit === 'square'
                              ? 'Sq'
                              : null
                      return (
                        <div
                          data-option-input-row={option.id}
                          className="flex items-center gap-2 mt-2"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <label
                            htmlFor={`option-number-input-${option.id}`}
                            className="text-xs font-medium text-muted-foreground"
                          >
                            {unitSuffix ?? 'Quantity'}
                          </label>
                          <Input
                            id={`option-number-input-${option.id}`}
                            data-testid="option-number-input"
                            data-option-id={option.id}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder="0"
                            disabled={isLocked}
                            value={qty ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value
                              const n = raw === '' ? undefined : Number(raw)
                              setSelectionQuantities((prev) => {
                                const next = { ...prev }
                                if (n === undefined || isNaN(n) || n <= 0) {
                                  delete next[option.id]
                                } else {
                                  next[option.id] = n
                                }
                                return next
                              })
                              const shouldBeSelected = n !== undefined && !isNaN(n) && n > 0
                              const isCurrentlySelected = selected.includes(option.id)
                              if (shouldBeSelected !== isCurrentlySelected) {
                                handleSelect(group, option.id)
                              }
                            }}
                            onBlur={() => {
                              const committed = selectionQuantities[option.id]
                              if (committed != null && committed > 0) {
                                setExpandedGroups((prev) => ({ ...prev, [group.id]: false }))
                              }
                            }}
                            className="h-9 w-24"
                          />
                        </div>
                      )
                    }
                    if (isNumberInput && !isImageNumberInput) {
                      return (
                        <div
                          key={option.id}
                          data-option-id={option.id}
                          data-option-group={group.id}
                          data-option-input-type="number-input"
                          className="flex items-center gap-2"
                        >
                          <label
                            htmlFor={`option-number-input-${option.id}`}
                            className="text-sm font-medium text-foreground"
                          >
                            {optionLabel}
                          </label>
                          {renderNumberInputRow()}
                        </div>
                      )
                    }
                    const chipButton = (
                      <button
                        type="button"
                        data-chip-id={option.id}
                        data-chip-group={group.id}
                        data-chip-state={isSelected ? 'active' : 'inactive'}
                        data-chip-locked={isLocked ? 'true' : 'false'}
                        data-service-type-option={group.id === 'service_type' ? option.id : undefined}
                        data-sub-expanded={(option.subGroups?.some((sg) => sg.options.length > 0) ?? false) ? String(subGroupExpanded[option.id] ?? true) : undefined}
                        aria-expanded={(option.subGroups?.some((sg) => sg.options.length > 0) ?? false) ? (subGroupExpanded[option.id] ?? true) : undefined}
                        disabled={isLocked}
                        onClick={() => {
                          // SubGroupChoices accordion expand/collapse applies
                          // for every vertical EXCEPT DEDICATED_CONFIGURATOR_SERVICES
                          // (windows_doors), which surface options through
                          // their own bespoke configurators and must keep the
                          // pre-PR-289 deselect-by-clicking-chip behavior on
                          // Windows / Doors / Storm Front / Garage Doors. Also
                          // requires at least one non-empty sub_group so that
                          // empty WIP sub_groups (e.g. admin authored "12x30"
                          // under Pool Size with no sub_options yet) don't
                          // hijack the chip into accordion mode.
                          const hasSubGroups =
                            !isDedicatedConfiguratorService(serviceId) &&
                            (option.subGroups?.some((sg) => sg.options.length > 0) ?? false)
                          // PR-#406 — roofing addons must allow toggle-off on
                          // re-tap (Rod live-feedback "i cant unselect soffit
                          // ones i did the addons"). The hasSubGroups accordion
                          // intercept blocks the catchall handleSelect deselect
                          // for any sub_groups-bearing chip, which traps roofing
                          // addons (Soffit/Fascia after substrate consolidation
                          // reused legacy 'soffit_wood'/'fascia_wood' ids as the
                          // new parent option ids carrying sub_groups). Kitchen
                          // Cabinet/Stone still uses accordion-collapse on
                          // re-tap because the sub-pick is the primary
                          // interaction and the parent chip stays "on" by design.
                          const isRoofingAddonChip = serviceId === 'roofing' && group.id === 'addons'
                          if (hasSubGroups && isSelected && !isRoofingAddonChip) {
                            setSubGroupExpanded((prev) => ({
                              ...prev,
                              [option.id]: !(prev[option.id] ?? true),
                            }))
                            return
                          }
                          if (hasSubGroups) {
                            setSubGroupExpanded((prev) => ({ ...prev, [option.id]: true }))
                          }
                          // Re-tap of saved roofing-addon chip → reopen
                          // configurator for edit; preserve selection +
                          // values. PREEMPT handleSelect (which would
                          // otherwise toggle off the selection) so the
                          // chip stays selected and the configurator
                          // renders pre-filled. Must run BEFORE handleSelect
                          // because handleSelect mutates `selected` async and
                          // the AnimatePresence render-gate downstream is
                          // `selected.includes(c.id) && addonConfigOpen[c.id]`.
                          if (
                            serviceId === 'roofing' &&
                            group.id === 'addons' &&
                            ADDON_LINEAR_FT_IDS.includes(option.id)
                          ) {
                            const wasSelected = selected.includes(option.id)
                            const wasOpen = addonConfigOpen[option.id] ?? false
                            if (wasSelected && !wasOpen) {
                              setAddonConfigOpen((prev) => ({ ...prev, [option.id]: true }))
                              return
                            }
                          }
                          // Arc-19 — pool_floor re-tap preempt. Re-tapping the
                          // already-selected floor with the configurator
                          // collapsed re-opens it for edit instead of letting
                          // handleSelect deselect the option. Mirrors the
                          // Roofing addon preempt path above.
                          if (
                            serviceId === 'pool' &&
                            group.id === 'pool_floor' &&
                            POOL_FLOOR_SQFT_IDS.includes(option.id)
                          ) {
                            const wasSelected = selected.includes(option.id)
                            const wasOpen = poolFloorConfigOpen[option.id] ?? false
                            if (wasSelected && !wasOpen) {
                              setPoolFloorConfigOpen((prev) => ({ ...prev, [option.id]: true }))
                              return
                            }
                          }
                          handleSelect(group, option.id)
                          // Auto-close addon menu after size selection
                          if (group.id === 'spa_size') setActiveAddonMenu(null)
                          if (group.id === 'beach_size') setActiveAddonMenu(null)
                          if (serviceId === 'windows_doors' && option.id === 'windows') {
                            setWindowConfigOpen((prev) => selected.includes('windows') ? !prev : true)
                          }
                          if (serviceId === 'windows_doors' && option.id === 'doors') {
                            setDoorConfigOpen((prev) => selected.includes('doors') ? !prev : true)
                          }
                          if (serviceId === 'windows_doors' && option.id === 'storm_front') {
                            setStormFrontConfigOpen((prev) => selected.includes('storm_front') ? !prev : true)
                          }
                          // Perimeter-only chip-tap mode: material chips answer the
                          // "What is your existing roof?" question — info-only. Skip
                          // the material configurators (color/size = pricing inputs)
                          // to honor the no-pricing-table contract for this mode.
                          // PR-216 follow-up: explicit setX(false) before return —
                          // the early-return alone left sticky-open state when the
                          // useState initializer had defaulted to true (color empty).
                          // Pair with the [isRoofingPerimeterOnly] transition useEffect
                          // above; defensive+corrective per memory.
                          if (isRoofingPerimeterOnly && group.id === 'material') {
                            setMetalRoofConfigOpen(false)
                            setShingleConfigOpen(false)
                            setTileConfigOpen(false)
                            setAluminumConfigOpen(false)
                            setFlatRoofConfigOpen(false)
                            return
                          }
                          // Ship #255 — multi-select material. `selected` is the
                          // pre-click state, so includes('metal') tells us whether
                          // THIS click de-selects metal (was in, now out) or adds
                          // metal (was out, now in). Matches the windows_doors
                          // pattern above (line 430-434). Previously the logic
                          // assumed single-select and cleared metal state on any
                          // non-metal click; that breaks multi-mode (user picking
                          // shingle alongside metal would wipe the metal config).
                          if (serviceId === 'roofing' && group.id === 'material' && option.id === 'metal') {
                            const wasSelected = selected.includes('metal')
                            if (wasSelected) {
                              setMetalRoofConfigOpen(false)
                              setMetalRoofSelection({ color: '', roofSize: '' })
                            } else {
                              setMetalRoofConfigOpen(true)
                            }
                          }
                          if (serviceId === 'roofing' && group.id === 'material' && option.id === 'shingle') {
                            const wasSelected = selected.includes('shingle')
                            if (wasSelected) {
                              setShingleConfigOpen(false)
                              setShingleSelection({ color: '', roofSize: '' })
                            } else {
                              setShingleConfigOpen(true)
                            }
                          }
                          if (serviceId === 'roofing' && group.id === 'material' && (option.id === 'barrel_tile' || option.id === 'terracotta')) {
                            const wasSelected = selected.includes(option.id)
                            if (wasSelected) {
                              setTileConfigOpen(false)
                              setTileSelection({ tileType: '', tileColor: '', roofSize: '' })
                            } else {
                              setTileConfigOpen(true)
                            }
                          }
                          if (serviceId === 'roofing' && group.id === 'material' && option.id === 'aluminum') {
                            const wasSelected = selected.includes('aluminum')
                            if (wasSelected) {
                              setAluminumConfigOpen(false)
                              setAluminumSelection({ color: '', roofSize: '' })
                            } else {
                              setAluminumConfigOpen(true)
                            }
                          }
                          if (serviceId === 'roofing' && group.id === 'material' && option.id === 'flat_roof') {
                            const wasSelected = selected.includes('flat_roof')
                            if (wasSelected) {
                              setFlatRoofConfigOpen(false)
                              setFlatRoofSelection({ membraneType: '', roofSize: '' })
                            } else {
                              setFlatRoofConfigOpen(true)
                            }
                          }
                          if (serviceId === 'windows_doors' && option.id === 'garage_doors') {
                            setGarageDoorConfigOpen((prev) => selected.includes('garage_doors') ? !prev : true)
                          }
                          if (serviceId === 'roofing' && group.id === 'addons' && ADDON_LINEAR_FT_IDS.includes(option.id)) {
                            const wasSelected = selected.includes(option.id)
                            const wasOpen = addonConfigOpen[option.id] ?? false
                            // Note: re-tap of saved-chip (wasSelected && !wasOpen)
                            // is handled above the handleSelect call (preempt path);
                            // this block only sees the two remaining cases.
                            if (wasSelected && wasOpen) {
                              // Tap during active edit (config still open, no
                              // save yet) → deselect + clean state.
                              // Fallthrough lets handleSelect remove from selected.
                              setAddonLinearFt((prev) => { const next = { ...prev }; delete next[option.id]; return next })
                              setAddonConfigOpen((prev) => { const next = { ...prev }; delete next[option.id]; return next })
                              // PR-#406 — for sub_groups-bearing addons (Soffit/
                              // Fascia after substrate consolidation), also clear
                              // the sub-pick + sub linear-ft so the chip resets
                              // to a fully neutral state. Idempotent for legacy
                              // bare addons (no sub-state present → delete is a
                              // no-op). Mirrors the peripheral-flag-reset pattern
                              // from PR-#399 service_type toggle-off.
                              setSubGroupLinearFt((prev) => { const next = { ...prev }; delete next[option.id]; return next })
                              setSelections((prev) => { const next = { ...prev }; delete next[`${option.id}-sub`]; return next })
                            } else {
                              // First tap → add + seed perimeter + open config.
                              setAddonLinearFt((prev) => ({ ...prev, [option.id]: String(roofMeasurement?.perimeterFt ?? '') }))
                              setAddonConfigOpen((prev) => ({ ...prev, [option.id]: true }))
                            }
                          }
                          // Arc-19 — pool_floor tap-handler. POOL_FLOOR_SQFT_IDS
                          // excludes 'na' so tapping N/A short-circuits to a
                          // plain selection with no configurator. First tap on
                          // a sqft-eligible floor opens the configurator; tap-
                          // during-active-edit deselects + clears state.
                          if (
                            serviceId === 'pool' &&
                            group.id === 'pool_floor' &&
                            POOL_FLOOR_SQFT_IDS.includes(option.id)
                          ) {
                            const wasSelected = selected.includes(option.id)
                            const wasOpen = poolFloorConfigOpen[option.id] ?? false
                            if (wasSelected && wasOpen) {
                              setPoolFloorSqft((prev) => { const next = { ...prev }; delete next[option.id]; return next })
                              setPoolFloorConfigOpen((prev) => { const next = { ...prev }; delete next[option.id]; return next })
                            } else if (!wasSelected) {
                              setPoolFloorConfigOpen((prev) => ({ ...prev, [option.id]: true }))
                            }
                          }
                        }}
                        className={cn(
                          isCardTile
                            ? 'flex flex-col items-start gap-2 rounded-2xl border p-4 min-h-[112px] text-left transition-all duration-150 hover:scale-[1.02] hover:shadow-md disabled:hover:scale-100 disabled:hover:shadow-none'
                            : 'inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 py-2 text-base font-medium transition-all duration-150',
                          isCardTile
                            ? isSelected
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/30 shadow-sm'
                              : 'border-border bg-background hover:border-primary/40'
                            : isSelected
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
                          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-background'
                        )}
                      >
                        {isCardTile && (
                          <div className="flex w-full items-center gap-2">
                            {TileIcon ? (
                              <div className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                isSelected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                              )}>
                                <TileIcon className="h-5 w-5" strokeWidth={1.8} />
                              </div>
                            ) : null}
                            {group.type === 'multi' && isSelected && (
                              <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        )}
                        {isImageTile && (
                          <div className="relative w-full">
                            <img
                              src={option.image_url}
                              alt={option.label || 'Design'}
                              loading="lazy"
                              className="w-full aspect-video rounded-lg object-cover bg-muted"
                            />
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Zoom ${option.label || 'design'} image`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (option.image_url) {
                                  setLightboxImage({ src: option.image_url, alt: option.label || 'Design' })
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  if (option.image_url) {
                                    setLightboxImage({ src: option.image_url, alt: option.label || 'Design' })
                                  }
                                }
                              }}
                              data-zoom-trigger={option.id}
                              className="absolute top-2 right-2 inline-flex h-11 w-11 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full bg-background/95 text-foreground shadow-md ring-1 ring-foreground/20 backdrop-blur-sm transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <ZoomIn className="h-5 w-5" strokeWidth={2.25} />
                            </span>
                          </div>
                        )}
                        {!isCardTile && group.type === 'multi' && isSelected && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {/* Pergolas multi-structure: ColorCircle binds chip to
                            its polygon on the satellite map. Pick-order index
                            into POLYGON_COLORS so 1st-picked structure = blue,
                            2nd-picked = orange (matches polygon-draw MAIN +
                            EXTRA_COLORS[0]). */}
                        {serviceId === 'pergolas' && group.id === 'structure' && isSelected && (() => {
                          const idx = selected.indexOf(option.id)
                          const color = POLYGON_COLORS[idx] ?? POLYGON_COLORS[0]
                          return <ColorCircle color={color} size={8} />
                        })()}
                        {isCardTile ? (
                          <div className="flex flex-col gap-0.5">
                            {optionLabel && optionLabel.trim() !== '' && (
                              <span className="text-[15px] font-semibold leading-tight text-foreground">{optionLabel}</span>
                            )}
                            {option.description ? (
                              <span className="text-[12px] leading-tight text-muted-foreground">{option.description}</span>
                            ) : null}
                            {/* Arc-20 — inside-box live-mirror lin-ft per Rod
                                photo 325. Mirrors the typing in the outside-card
                                linear-ft input so the user sees the value
                                without scrolling to the input row. Distinct
                                from the chip-summary span L1612+ (chip surfaces
                                post-save outside the card; this span is live
                                during input AND post-save, inside the card). */}
                            {serviceId === 'roofing' && group.id === 'addons' && ADDON_LINEAR_FT_IDS.includes(option.id) && Number(addonLinearFt[option.id] ?? 0) > 0 && (
                              <span
                                className="text-[12px] leading-tight font-medium text-foreground/80"
                                data-option-card-linear-ft-value={option.id}
                              >
                                {(Number(addonLinearFt[option.id]) || 0).toLocaleString()} lin ft
                              </span>
                            )}
                            {serviceId === 'kitchen' && group.label.toLowerCase().includes('stone') && (option.subGroups?.length ?? 0) === 0 && Number(subGroupLinearFt[option.id] ?? 0) > 0 && (
                              <span
                                className="text-[12px] leading-tight font-medium text-foreground/80"
                                data-option-card-linear-ft-value={option.id}
                              >
                                {(Number(subGroupLinearFt[option.id]) || 0).toLocaleString()} lin ft
                              </span>
                            )}
                          </div>
                        ) : optionLabel}
                        {serviceId === 'kitchen' && (option.subGroups?.length ?? 0) > 0 && (() => {
                          const subPickId = selections[`${option.id}-sub`]?.[0]
                          const subPickLabel = subPickId ? resolveSubChoiceLabel(option, subPickId) : null
                          return subPickLabel ? (
                            <span
                              data-testid="config-parent-sub-pick-badge"
                              data-parent-option-id={option.id}
                              className="ml-1 inline-flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold"
                            >
                              {subPickLabel}
                            </span>
                          ) : null
                        })()}
                        {serviceId === 'windows_doors' && option.id === 'windows' && windowTotal > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {windowTotal}
                          </span>
                        )}
                        {serviceId === 'windows_doors' && option.id === 'doors' && doorTotal > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {doorTotal}
                          </span>
                        )}
                        {serviceId === 'windows_doors' && option.id === 'storm_front' && stormFrontTotal > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {stormFrontTotal}
                          </span>
                        )}
                        {/* Install pills derive their count from the Products selection — no separate stepper. */}
                        {serviceId === 'windows_doors' && option.id === 'install_windows' && windowTotal > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {windowTotal}
                          </span>
                        )}
                        {serviceId === 'windows_doors' && option.id === 'install_doors' && doorTotal > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {doorTotal}
                          </span>
                        )}
                        {serviceId === 'windows_doors' && option.id === 'install_storm_front' && stormFrontTotal > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {stormFrontTotal}
                          </span>
                        )}
                        {serviceId === 'windows_doors' && option.id === 'garage_doors' && garageDoorSelection.type && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {garageDoorSelection.type === 'single_garage' ? 'S' : 'D'}
                          </span>
                        )}
                        {serviceId === 'roofing' && option.id === 'metal' && metalRoofSelection.color && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {metalRoofSelection.roofSize ? `${metalRoofDisplaySquares(metalRoofSelection.roofSize)} sq` : 'Configured'}
                          </span>
                        )}
                        {serviceId === 'roofing' && option.id === 'shingle' && shingleSelection.color && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {shingleSelection.roofSize ? `${Number(shingleSelection.roofSize).toLocaleString()} sq` : 'Configured'}
                          </span>
                        )}
                        {serviceId === 'roofing' && (option.id === 'barrel_tile' || option.id === 'terracotta') && tileSelection.tileType && tileSelection.tileColor && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {tileSelection.roofSize ? `${Number(tileSelection.roofSize).toLocaleString()} sq` : 'Configured'}
                          </span>
                        )}
                        {serviceId === 'roofing' && option.id === 'aluminum' && aluminumSelection.color && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {aluminumSelection.roofSize ? `${Number(aluminumSelection.roofSize).toLocaleString()} sq` : 'Configured'}
                          </span>
                        )}
                        {serviceId === 'roofing' && option.id === 'flat_roof' && flatRoofSelection.membraneType && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {flatRoofSelection.roofSize ? `${Number(flatRoofSelection.roofSize).toLocaleString()} sq` : 'Configured'}
                          </span>
                        )}
                        {/* Class A addon chip-summary badges — surface once
                            configurator saved + collapsed. Mirrors the
                            roofing-material "21 sq" precedent (same span
                            shape + bg + text-size). Gutter shows the
                            computed total (perimeter + floor-aware drops);
                            others show the raw input lin-ft. */}
                        {serviceId === 'roofing' && group.id === 'addons' && option.id === 'gutters' && !addonConfigOpen['gutters'] && gutterFloors && Number(addonLinearFt['gutters'] ?? 0) > 0 && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {computeGutterTotalLinFt(Number(addonLinearFt['gutters']) || 0, { floors: gutterFloors, drops: gutterDrops }).toLocaleString()} lin ft
                          </span>
                        )}
                        {serviceId === 'roofing' && group.id === 'addons' && option.id === 'soffit_wood' && !addonConfigOpen['soffit_wood'] && Number(addonLinearFt['soffit_wood'] ?? 0) > 0 && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {(Number(addonLinearFt['soffit_wood']) || 0).toLocaleString()} lin ft
                          </span>
                        )}
                        {serviceId === 'roofing' && group.id === 'addons' && option.id === 'fascia_wood' && !addonConfigOpen['fascia_wood'] && Number(addonLinearFt['fascia_wood'] ?? 0) > 0 && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {(Number(addonLinearFt['fascia_wood']) || 0).toLocaleString()} lin ft
                          </span>
                        )}
                        {serviceId === 'roofing' && group.id === 'addons' && option.id === 'soffit_metal' && !addonConfigOpen['soffit_metal'] && Number(addonLinearFt['soffit_metal'] ?? 0) > 0 && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {(Number(addonLinearFt['soffit_metal']) || 0).toLocaleString()} lin ft
                          </span>
                        )}
                        {serviceId === 'roofing' && group.id === 'addons' && option.id === 'fascia_metal' && !addonConfigOpen['fascia_metal'] && Number(addonLinearFt['fascia_metal'] ?? 0) > 0 && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {(Number(addonLinearFt['fascia_metal']) || 0).toLocaleString()} lin ft
                          </span>
                        )}
                        {/* Arc-19 — Pool Floor sqft chip badge surfaces the
                            saved sqft once the configurator collapses. Mirrors
                            the Roofing Class A "lin ft" badge pattern. */}
                        {serviceId === 'pool' &&
                          group.id === 'pool_floor' &&
                          POOL_FLOOR_SQFT_IDS.includes(option.id) &&
                          !poolFloorConfigOpen[option.id] &&
                          Number(poolFloorSqft[option.id] ?? 0) > 0 && (
                          <span
                            className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold"
                            data-pool-floor-chip-sqft={option.id}
                          >
                            {(Number(poolFloorSqft[option.id]) || 0).toLocaleString()} sqft
                          </span>
                        )}
                        {serviceId === 'pool' && option.id === 'led' && ledCount > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {ledCount}
                          </span>
                        )}
                        {serviceId === 'pool' && option.id === 'bubbler' && bubblerCount > 0 && (
                          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px] font-bold">
                            {bubblerCount}
                          </span>
                        )}
                        {serviceId === 'pool' && option.id === 'spa' && (selections['spa_size'] ?? []).length > 0 && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold">
                            {service.optionGroups.find(g => g.id === 'spa_size')?.options.find(o => o.id === selections['spa_size'][0])?.label || ''}
                          </span>
                        )}
                        {serviceId === 'pool' && option.id === 'waterfall' && (laminarJets > 0 || waterfalls > 0) && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold gap-1">
                            {laminarJets > 0 && <span>{laminarJets} Jets</span>}
                            {laminarJets > 0 && waterfalls > 0 && <span>·</span>}
                            {waterfalls > 0 && <span>{waterfalls} Falls</span>}
                          </span>
                        )}
                        {serviceId === 'pool' && option.id === 'beach' && (selections['beach_size'] ?? []).length > 0 && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold">
                            {service.optionGroups.find(g => g.id === 'beach_size')?.options.find(o => o.id === selections['beach_size'][0])?.label || ''}
                          </span>
                        )}
                      </button>
                    )
                    if (isImageNumberInput) {
                      // Rod 2026-06-03 declutter: linear-ft input reveals only
                      // when the tile is selected (isSelected = data-chip-state
                      // 'active'). Cart-state selectionQuantities[option.id]
                      // persists across deselect+reselect (handleSelect L933-
                      // 1024 never touches it), so the value survives the
                      // visibility toggle and reappears prefilled on reselect.
                      return (
                        <div
                          key={option.id}
                          data-option-wrapper={option.id}
                          data-option-input-type="image-number-input"
                          data-option-input-revealed={isSelected ? 'true' : 'false'}
                          className="flex flex-col"
                        >
                          {chipButton}
                          {isSelected && renderNumberInputRow()}
                        </div>
                      )
                    }
                    return <div key={option.id} className="contents">{chipButton}</div>
                  })}
                </div>
                {/* Stone-scoped Linear feet input (Kitchen vertical only).
                    Vertical-gated to serviceId==='kitchen' at consumer call-site
                    per feedback_rod_vertical_scoped_changes_never_bleed so a
                    future non-kitchen vertical with a label-match 'stone' group
                    cannot inherit the Linear feet input. Group identified by
                    label match within the kitchen vertical since group_id is
                    DB-seeded and not stable enough to hardcode. */}
                {serviceId === 'kitchen' &&
                  group.label.toLowerCase().includes('stone') &&
                  renderOptions
                    .filter(
                      (option) =>
                        selected.includes(option.id) &&
                        (option.subGroups?.length ?? 0) === 0,
                    )
                    .map((option) => (
                      <div
                        key={`${group.id}-${option.id}-linearft`}
                        className="ml-2 sm:ml-4 mt-2 flex items-center gap-2"
                        data-testid="config-option-linear-feet-row"
                        data-option-id={option.id}
                      >
                        <label
                          htmlFor={`option-linear-feet-${option.id}`}
                          className="text-sm font-medium text-foreground"
                        >
                          Linear feet
                        </label>
                        <Input
                          id={`option-linear-feet-${option.id}`}
                          data-testid="config-option-linear-feet-input"
                          data-option-id={option.id}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder="0"
                          value={subGroupLinearFt[option.id] ?? ''}
                          onChange={(e) =>
                            setSubGroupLinearFt((prev) => ({ ...prev, [option.id]: e.target.value }))
                          }
                          className="h-9 w-24"
                        />
                      </div>
                    ))}
                {/* Generic SubGroupChoices render path. PR-289 originally
                    introduced this for the kitchen Cabinet flat-chip +
                    linear-feet UX and the call-site was vertical-gated to
                    serviceId==='kitchen' to prevent double-render alongside
                    the dedicated WindowConfigurator / DoorConfigurator /
                    StormFrontConfigurator / GarageDoorConfigurator components
                    at L2186-2223 (whose Windows/Doors/Storm/Garage options
                    also carry DB-seeded sub_groups). Flipping to a deny-list
                    (DEDICATED_CONFIGURATOR_SERVICES) lets every other vertical
                    surface admin-authored sub_menus realtime — the original
                    Rod spec of "realtime for vendor AND homeowner" was being
                    violated by the kitchen-only allow-gate. Empty sub_groups
                    (sub_options.length === 0) are skipped so admin WIP state
                    (e.g. Rod's "12x30" under Pool Size 12x24 with no
                    sub_options yet) renders nothing instead of an orphan
                    label chip. */}
                {!isDedicatedConfiguratorService(serviceId) &&
                  renderOptions
                    .filter(
                      (option) =>
                        selected.includes(option.id) &&
                        (option.subGroups?.some((sg) => sg.options.length > 0) ?? false) &&
                        (subGroupExpanded[option.id] ?? true),
                    )
                    .map((option) => {
                      // PR-#404 — roofing addons fully delegate sub-variant
                      // chips + Linear feet input + Save to AddonLinearFtConfigurator
                      // (one consolidated box per Rod live-feedback on PR-#403:
                      // duplicate Linear feet pill from SubGroupChoices was
                      // surfacing above the dedicated card, and Rod wanted the
                      // variant pills moved INSIDE the card). Skip SubGroupChoices
                      // entirely for this mode. Card label uses option.label
                      // (parent — e.g. "Soffit linear feet") not sub-pick label
                      // because the dynamic parent-chip label (L1431-1450)
                      // already mirrors the sub-pick; doubling it on the card
                      // heading reads as redundant. Kitchen + every other
                      // sub_group-bearing vertical keeps the existing
                      // SubGroupChoices inline-input contract unchanged.
                      const useExternalConfigurator = serviceId === 'roofing' && group.id === 'addons'
                      const subPickId = selections[`${option.id}-sub`]?.[0]

                      if (useExternalConfigurator) {
                        const subGroups = option.subGroups ?? []
                        const isMultiSectionMode = subGroups.every((sg) => sg.options.length === 0)
                        const variants = isMultiSectionMode
                          ? subGroups.map((sg) => ({ id: sg.id, label: sg.label }))
                          : (subGroups[0]?.options ?? []).map((o) => ({ id: o.id, label: o.label }))
                        return (
                          <div key={`${group.id}-${option.id}-subgroups-wrap`}>
                            <AddonLinearFtConfigurator
                              id={`${option.id}-sub`}
                              label={`${option.label} linear feet`}
                              value={subGroupLinearFt[option.id] ?? ''}
                              onChange={(next) =>
                                setSubGroupLinearFt((prev) => ({ ...prev, [option.id]: next }))
                              }
                              onSave={() =>
                                setSubGroupExpanded((prev) => ({ ...prev, [option.id]: false }))
                              }
                              inlineVariantSelector={{
                                variants,
                                selectedId: subPickId,
                                onSelect: (id) => handleSubChoiceSelect(option.id, id),
                              }}
                            />
                          </div>
                        )
                      }

                      return (
                        <div key={`${group.id}-${option.id}-subgroups-wrap`}>
                          <SubGroupChoices
                            parentOption={option}
                            selections={selections}
                            onSelect={handleSubChoiceSelect}
                            linearFeet={subGroupLinearFt[option.id] ?? ''}
                            onLinearFeetChange={handleSubLinearFeetChange}
                          />
                        </div>
                      )
                    })}
                {/* PR-223 Option B — pergolas per-square structure assignment.
                    For every measurement drawn, render a card with the sqft,
                    a ColorCircle that matches the polygon on the satellite map,
                    and a chip-row picker for the structure that occupies that
                    area. Force-pick (no default) and prevent-same (the
                    structure already assigned to another card is disabled).
                    Renders for any polygons.length >= 1 — single-polygon also
                    uses the in-card picker so the top Structure Type chip
                    group stays hidden whenever measurements exist. */}
                {serviceId === 'pergolas' && group.id === 'size' && areaMeasurement?.polygons && areaMeasurement.polygons.length >= 1 && (() => {
                  const structureOptions = service.optionGroups.find((g) => g.id === 'structure')?.options ?? []
                  const assigned = selections['structure'] ?? []
                  return (
                    <div className="mt-3 space-y-2" data-pergolas-structure-breakdown="true">
                      {areaMeasurement.polygons!.map((poly, idx) => {
                        const structureId = assigned[idx]
                        return (
                          <div
                            key={idx}
                            className="rounded-xl border bg-muted/30 p-3 space-y-2"
                            data-pergolas-structure-row={structureId ?? String(idx)}
                          >
                            <div className="flex items-center gap-2 text-sm">
                              <ColorCircle color={poly.color} size={10} />
                              <span className="text-foreground font-medium">
                                Area {idx + 1}
                              </span>
                              <span className="text-muted-foreground ml-auto">{poly.sqft.toLocaleString()} sqft</span>
                            </div>
                            <div className="flex flex-wrap gap-2" data-pergolas-square-picker={String(idx)}>
                              {structureOptions.map((opt) => {
                                const isPicked = structureId === opt.id
                                const pickedElsewhere = !isPicked && assigned.some((sid, i) => i !== idx && sid === opt.id)
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    data-pergolas-square-chip={opt.id}
                                    data-pergolas-square-index={String(idx)}
                                    data-chip-state={isPicked ? 'active' : 'inactive'}
                                    disabled={pickedElsewhere}
                                    title={pickedElsewhere ? 'Already assigned to another area — pick a different structure or remove that area.' : undefined}
                                    onClick={() => {
                                      setSelections((prev) => {
                                        const arr = [...(prev['structure'] ?? [])]
                                        while (arr.length <= idx) arr.push('')
                                        arr[idx] = isPicked ? '' : opt.id
                                        return { ...prev, structure: arr }
                                      })
                                    }}
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                      isPicked
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted',
                                      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-background',
                                    )}
                                  >
                                    {opt.label}
                                  </button>
                                )
                              })}
                            </div>
                            {!structureId && (
                              <p className="text-xs text-muted-foreground" data-pergolas-square-prompt={String(idx)}>
                                Pick a structure type for this area.
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
                {/* Per-addon configurator dispatch — one AnimatePresence per
                    Class A linear-ft addon (5 total). Save-on-click collapses
                    just that addon's configurator and surfaces an inline
                    lin-ft summary badge on the chip (mirrors the roofing-
                    material chip-tap → ShingleRoofConfigurator → "21 sq"
                    badge pattern). Gutter slot embeds floors + drops chips
                    and total breakdown inside its own configurator body.
                    PR-#406 — skip the legacy bare card when the corresponding
                    option carries sub_groups: after the substrate consolidation
                    of Soffit/Fascia (Wood + Metal split from separate addons
                    into one parent w/ sub_groups), the new consolidated
                    AddonLinearFtConfigurator (with inlineVariantSelector, see
                    L1949+) is the canonical render path. Without this guard
                    both fire → duplicate "Soffit linear feet" + "Soffit Wood
                    linear feet" cards stack under the same chip (Rod
                    20260525_165835 live-feedback). Gutters has no sub_groups
                    so legacy render still fires; intentional. */}
                {serviceId === 'roofing' && group.id === 'addons' && ADDON_LINEAR_FT_CONFIG.map((c) => {
                  const matchingOption = renderOptions.find((o) => o.id === c.id)
                  const hasSubGroups = matchingOption?.subGroups?.some((sg) => sg.options.length > 0) ?? false
                  if (hasSubGroups) return null
                  return (
                  <AnimatePresence key={c.id}>
                    {selected.includes(c.id) && addonConfigOpen[c.id] && (
                      <AddonLinearFtConfigurator
                        id={c.id}
                        label={c.label}
                        value={addonLinearFt[c.id] ?? ''}
                        onChange={(next) => setAddonLinearFt((prev) => ({ ...prev, [c.id]: next }))}
                        onSave={() => setAddonConfigOpen((prev) => ({ ...prev, [c.id]: false }))}
                        gutterExtras={c.id === 'gutters' ? {
                          floors: gutterFloors,
                          drops: gutterDrops,
                          onFloorsChange: setGutterFloors,
                          onDropsChange: setGutterDrops,
                        } : undefined}
                      />
                    )}
                  </AnimatePresence>
                  )
                })}
                {/* Arc-19 — Pool Floor sqft configurator dispatch. One
                    AnimatePresence per sqft-eligible floor; only the
                    selected option's configurator renders since pool_floor
                    is a single-select group. Save collapses the configurator
                    and the chip badge below surfaces the entered sqft. */}
                {serviceId === 'pool' && group.id === 'pool_floor' && POOL_FLOOR_SQFT_CONFIG.map((c) => (
                  <AnimatePresence key={c.id}>
                    {selected.includes(c.id) && poolFloorConfigOpen[c.id] && (
                      <PoolFloorSqftConfigurator
                        id={c.id}
                        label={c.label}
                        value={poolFloorSqft[c.id] ?? ''}
                        onChange={(next) => setPoolFloorSqft((prev) => ({ ...prev, [c.id]: next }))}
                        onSave={() => setPoolFloorConfigOpen((prev) => ({ ...prev, [c.id]: false }))}
                      />
                    )}
                  </AnimatePresence>
                ))}
                {/* Metal Roof Configurator - shows when Standing Seam Metal is selected */}
                {serviceId === 'roofing' && group.id === 'material' && (
                  <AnimatePresence>
                    {selected.includes('metal') && metalRoofConfigOpen && (
                      <MetalRoofConfigurator
                        selection={metalRoofSelection}
                        onChange={(updated) => {
                          setMetalRoofSelection(updated)
                          // Squares are the source of truth; reverse-derive sqft for pricing engine.
                          if (updated.roofSize) {
                            const sq = Number(updated.roofSize)
                            if (!isNaN(sq) && sq > 0) {
                              setRoofMeasurement((prev) => prev
                                ? { ...prev, areaSqft: sq * 100 }
                                : { areaSqft: sq * 100, pitch: '', address: '' })
                            }
                          }
                        }}
                        onSave={() => setMetalRoofConfigOpen(false)}
                      />
                    )}
                  </AnimatePresence>
                )}
                {serviceId === 'roofing' && group.id === 'material' && (
                  <AnimatePresence>
                    {selected.includes('shingle') && shingleConfigOpen && (
                      <ShingleRoofConfigurator
                        selection={shingleSelection}
                        onChange={setShingleSelection}
                        onSave={() => setShingleConfigOpen(false)}
                      />
                    )}
                  </AnimatePresence>
                )}
                {serviceId === 'roofing' && group.id === 'material' && (
                  <AnimatePresence>
                    {(selected.includes('barrel_tile') || selected.includes('terracotta')) && tileConfigOpen && (
                      <TileRoofConfigurator
                        selection={tileSelection}
                        onChange={setTileSelection}
                        onSave={() => setTileConfigOpen(false)}
                      />
                    )}
                  </AnimatePresence>
                )}
                {serviceId === 'roofing' && group.id === 'material' && (
                  <AnimatePresence>
                    {selected.includes('aluminum') && aluminumConfigOpen && (
                      <AluminumRoofConfigurator
                        selection={aluminumSelection}
                        onChange={setAluminumSelection}
                        onSave={() => setAluminumConfigOpen(false)}
                      />
                    )}
                  </AnimatePresence>
                )}
                {serviceId === 'roofing' && group.id === 'material' && (
                  <AnimatePresence>
                    {selected.includes('flat_roof') && flatRoofConfigOpen && (
                      <FlatRoofConfigurator
                        selection={flatRoofSelection}
                        onChange={setFlatRoofSelection}
                        onSave={() => setFlatRoofConfigOpen(false)}
                      />
                    )}
                  </AnimatePresence>
                )}
                {/* Payment method note */}
                {group.id === 'payment' && (
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    Payment method selected will let the selected contractor know how to move forward about your project.
                  </p>
                )}
                {/* Waterfall configurator */}
                {serviceId === 'pool' && group.id === 'addons' && selected.includes('waterfall') && activeAddonMenu === 'waterfall' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 rounded-xl border bg-background p-4 space-y-3 overflow-hidden"
                  >
                    <h4 className="text-sm font-semibold text-foreground">Water Features</h4>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-foreground">Laminar Jets</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setLaminarJets((v) => Math.max(0, v - 1))}>
                          <span className="text-xs">−</span>
                        </Button>
                        <span className="text-sm font-semibold w-6 text-center text-primary">{laminarJets}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setLaminarJets((v) => v + 1)}>
                          <span className="text-xs">+</span>
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t">
                      <span className="text-sm text-foreground">Waterfalls</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWaterfalls((v) => Math.max(0, v - 1))}>
                          <span className="text-xs">−</span>
                        </Button>
                        <span className="text-sm font-semibold w-6 text-center text-primary">{waterfalls}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWaterfalls((v) => v + 1)}>
                          <span className="text-xs">+</span>
                        </Button>
                      </div>
                    </div>
                    {(laminarJets > 0 || waterfalls > 0) && (
                      <Button
                        className="w-full h-9 rounded-xl text-sm font-semibold"
                        onClick={() => setActiveAddonMenu(null)}
                      >
                        Save Selection
                      </Button>
                    )}
                  </motion.div>
                )}
                {/* LED Lighting quantity */}
                {serviceId === 'pool' && group.id === 'addons' && selected.includes('led') && activeAddonMenu === 'led' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 rounded-xl border bg-background p-4 space-y-3 overflow-hidden"
                  >
                    <h4 className="text-sm font-semibold text-foreground">LED Lighting</h4>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-foreground">Quantity</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setLedCount((v) => Math.max(0, v - 1))}>
                          <span className="text-xs">−</span>
                        </Button>
                        <span className="text-sm font-semibold w-6 text-center text-primary">{ledCount}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setLedCount((v) => v + 1)}>
                          <span className="text-xs">+</span>
                        </Button>
                      </div>
                    </div>
                    {ledCount > 0 && (
                      <Button
                        className="w-full h-9 rounded-xl text-sm font-semibold"
                        onClick={() => setActiveAddonMenu(null)}
                      >
                        Save Selection
                      </Button>
                    )}
                  </motion.div>
                )}
                {/* Bubbler quantity */}
                {serviceId === 'pool' && group.id === 'addons' && selected.includes('bubbler') && activeAddonMenu === 'bubbler' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 rounded-xl border bg-background p-4 space-y-3 overflow-hidden"
                  >
                    <h4 className="text-sm font-semibold text-foreground">Bubbler</h4>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-foreground">Quantity</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setBubblerCount((v) => Math.max(0, v - 1))}>
                          <span className="text-xs">−</span>
                        </Button>
                        <span className="text-sm font-semibold w-6 text-center text-primary">{bubblerCount}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setBubblerCount((v) => v + 1)}>
                          <span className="text-xs">+</span>
                        </Button>
                      </div>
                    </div>
                    {bubblerCount > 0 && (
                      <Button className="w-full h-9 rounded-xl text-sm font-semibold" onClick={() => setActiveAddonMenu(null)}>
                        Save Selection
                      </Button>
                    )}
                  </motion.div>
                )}
                {/* Custom pool size input */}
                {serviceId === 'pool' && group.id === 'pool_size' && selected.includes('custom') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 overflow-hidden"
                  >
                    <Input
                      placeholder="Enter desired size (e.g. 18×35)"
                      value={customPoolSize}
                      onChange={(e) => setCustomPoolSize(e.target.value)}
                      className="h-10"
                    />
                  </motion.div>
                )}
                {/* Window configurator - shows when Windows is selected in windows_doors service */}
                {serviceId === 'windows_doors' && group.id === 'products' && (
                  <>
                    <AnimatePresence>
                      {selected.includes('windows') && windowConfigOpen && (
                        <WindowConfigurator
                          selections={windowSelections}
                          onChange={setWindowSelections}
                          onSave={() => setWindowConfigOpen(false)}
                        />
                      )}
                    </AnimatePresence>
                    <AnimatePresence>
                      {selected.includes('doors') && doorConfigOpen && (
                        <DoorConfigurator
                          selections={doorSelections}
                          onChange={setDoorSelections}
                          onSave={() => setDoorConfigOpen(false)}
                        />
                      )}
                    </AnimatePresence>
                    <AnimatePresence>
                      {selected.includes('storm_front') && stormFrontConfigOpen && (
                        <StormFrontConfigurator
                          selections={stormFrontSelections}
                          onChange={setStormFrontSelections}
                          onSave={() => setStormFrontConfigOpen(false)}
                        />
                      )}
                    </AnimatePresence>
                    <AnimatePresence>
                      {selected.includes('garage_doors') && garageDoorConfigOpen && (
                        <GarageDoorConfigurator
                          selection={garageDoorSelection}
                          onChange={setGarageDoorSelection}
                          onSave={() => setGarageDoorConfigOpen(false)}
                        />
                      )}
                    </AnimatePresence>
                    {selected.includes('garage_doors') && !garageDoorConfigOpen && garageDoorSelection.type && (
                      <div className="mt-3 rounded-lg bg-muted/50 p-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[11px] bg-background rounded px-2 py-0.5 border font-medium">
                            {garageDoorSelection.type === 'single_garage' ? 'Single Garage Door' : 'Double Garage Door'}
                          </span>
                          {garageDoorSelection.type === 'double_garage' && garageDoorSelection.size && (
                            <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                              Size: {garageDoorSelection.size === 'gd_4_panels' ? '4 Panels' : '5 Panels'}
                            </span>
                          )}
                          {garageDoorSelection.color && (
                            <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                              Color: {garageDoorSelection.color.charAt(0).toUpperCase() + garageDoorSelection.color.slice(1)}
                            </span>
                          )}
                          {garageDoorSelection.glass && (
                            <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                              Glass: {garageDoorSelection.glass.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                </div>
                )}
              </motion.div>
            )
          })}
        </div>

        {/* Anchor 5 — Per-addon summary card. Roofing only.
            Shows each selected addon with its auto-filled (or manually
            entered) linear-ft. Visual shape matches the roof breakdown card
            so homeowners see one consistent summary surface across measure
            -> material -> addons. */}
        {serviceId === 'roofing' && (selections['addons'] ?? []).length > 0 && (() => {
          const selectedAddons = selections['addons'] ?? []
          const addonOpts = service.optionGroups.find(g => g.id === 'addons')?.options ?? []
          const rows = selectedAddons.map((id) => {
            const label = addonOpts.find(o => o.id === id)?.label ?? id
            if (id === 'gutters') {
              const peri = Number(addonLinearFt['gutters'] ?? 0) || 0
              const total = computeGutterTotalLinFt(
                peri,
                gutterFloors ? { floors: gutterFloors, drops: gutterDrops } : undefined,
              )
              const sublabel = gutterFloors
                ? `${peri.toLocaleString()} perimeter + ${gutterDrops} drop${gutterDrops === 1 ? '' : 's'} × ${GUTTER_DROP_FT_BY_FLOORS[gutterFloors]} ft (${gutterFloors === 1 ? '1-story' : '2-story'})`
                : `${peri.toLocaleString()} perimeter`
              return { id, label, qty: total, unit: 'lin ft', sublabel }
            }
            if (ADDON_LINEAR_FT_IDS.includes(id)) {
              const qty = Number(addonLinearFt[id] ?? 0) || 0
              return { id, label, qty, unit: 'lin ft', sublabel: roofMeasurement?.perimeterFt ? `Auto-filled from roof perimeter` : 'Enter linear feet above' }
            }
            return null
          }).filter((r): r is NonNullable<typeof r> => r !== null)
          if (rows.length === 0) return null
          return (
            <div className="mt-6" data-addon-summary-card="true">
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Add-on Summary
                </span>
                <div className="space-y-2">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-baseline justify-between gap-3" data-addon-row={r.id}>
                      <p className="text-sm font-medium text-foreground">{r.label}</p>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {r.qty.toLocaleString()}{' '}
                          <span className="text-xs font-normal text-muted-foreground">{r.unit}</span>
                        </p>
                        {r.sublabel && (
                          <p className="text-[11px] text-muted-foreground">{r.sublabel}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Address selector — which property this project targets. Primary +
            any additional addresses from the homeowner profile. Shared across
            all 11 services, lives right above the Add-to-Project CTA. */}
        <div className="mt-8 pt-6 border-t border-border/50">
          <label htmlFor="address-select" className="block text-sm font-medium text-foreground mb-2">
            Which property is this for?
          </label>
          <Select value={addressKey} onValueChange={(value) => setAddressKey(value ?? '')}>
            <SelectTrigger id="address-select" className="h-auto min-h-[3.25rem] py-2 text-sm">
              {selectedAddress ? (
                <span className="flex flex-1 flex-col items-start gap-1 min-w-0 text-left">
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 whitespace-nowrap">
                    {selectedAddress.label || 'Property'}
                  </span>
                  <span
                    className={cn(
                      'text-sm whitespace-normal break-words leading-tight',
                      !selectedAddress.full && 'text-muted-foreground'
                    )}
                  >
                    {selectedAddress.full || 'Select a property'}
                  </span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Select a property</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {addressOptions.map((opt) => (
                <SelectItem key={opt.key} value={opt.key} className="py-2 pr-10">
                  <span className="flex flex-1 flex-col items-start gap-1 min-w-0">
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 whitespace-nowrap">
                      {opt.label}
                    </span>
                    {opt.full && (
                      <span className="text-xs text-muted-foreground whitespace-normal break-words leading-tight">
                        {opt.full}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {addressOptions.length === 1 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Add more properties from your profile to target a different address.
            </p>
          )}
        </div>

        {/* Project-permit step — same shape + copy as roofing wizard step 8.
            Inline configurator path (windows_doors / kitchen / bathroom);
            wizards render PermitStepSection inside their step list.
            Pool-only: render PoolSurveySection above (spec order:
            pool_survey → association → permit). */}
        <div className="mt-6 pt-6 border-t border-border/50">
          <h3 className="text-base font-semibold text-foreground mb-1">{PERMIT_HEADING}</h3>
          <p className="text-sm text-muted-foreground mb-3">{PERMIT_SUBTITLE}</p>
          {serviceId === 'pool' && (
            <div className="mb-6">
              <PoolSurveySection />
            </div>
          )}
          <PermitStepSection />
        </div>

        {/* Under-quote guard: chip-tap excludes pitched but satellite measured
            >200 sqft pitched + >20% of total. Block Add-to-Project until user
            either taps a pitched material chip (gate clears via state change)
            or explicitly acknowledges flat-add-on-only via the toggle below.
            Display-truth peer lives in the wizard Step 2 Pitched row (RED).
            Per banked project_buildconnect_quote_top_of_real (under-detection
            is launch-blocker — quotes err HIGH not LOW). */}
        {pitchedOmittedTriggered && !alreadyInCart && !isAddonOnlyMode && (
          <div
            data-pitched-not-included="true"
            role="alert"
            className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-4"
          >
            <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200 mb-2">
              Your roof has ~{(roofMeasurement?.pitchedAreaSqft ?? 0).toLocaleString()} sqft of pitched area (the main roof) not in this order.
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
              To include it, tap a pitched material above (Shingle, Tile, Metal, Aluminum, or Terracotta).
            </p>
            <button
              type="button"
              onClick={() => {
                const el = document.querySelector('[data-chip-group="material"]') as HTMLElement | null
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              className="text-sm font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2"
            >
              Tap a pitched material to include it
            </button>
            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                data-pitched-acknowledge="true"
                checked={flatOnlyAck}
                onChange={(e) => setFlatOnlyAck(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <div className="flex-1">
                <span className="block text-sm text-amber-900 dark:text-amber-200 font-medium">
                  Order flat add-on only — main roof handled separately
                </span>
                <span className="block text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Add will not include the pitched {(roofMeasurement?.pitchedAreaSqft ?? 0).toLocaleString()} sqft.
                </span>
              </div>
            </label>
          </div>
        )}

        {/* CTA */}
        <div className="mt-4 flex flex-col gap-3">
          <Button
            size="lg"
            className={cn(
              'w-full h-12 text-sm font-semibold gap-2 rounded-xl',
              added && 'bg-green-600 hover:bg-green-700'
            )}
            disabled={!allRequiredDone || !addressKey || !isProjectPermitValid(projectPermit, projectPermitWaiver) || !isProjectAssociationValid(projectAssociation ?? null) || (serviceId === 'pool' && !isPoolSurveyValid(poolSurvey ?? null)) || added || alreadyInCart || (pitchedOmittedTriggered && !flatOnlyAck && !isAddonOnlyMode) || !pergolasStructuresAllAssigned}
            onClick={async () => {
              const addonQuantities = (ledCount || bubblerCount || laminarJets || waterfalls)
                ? { ledCount, bubblerCount, laminarJets, waterfalls }
                : undefined
              // Derive requiresQuantity counts. install_windows / install_doors
              // are pure-derived from the Products windowTotal / doorTotal
              // (no user stepper). Any other requiresQuantity option falls back
              // to selectionQuantities state as before.
              const prunedQuantities: Record<string, number> = {}
              for (const [gid, optIds] of Object.entries(selections)) {
                for (const oid of optIds) {
                  const catOpt = serviceId ? findCatalogOption(services, serviceId, oid) : undefined
                  if (!getOptionMetadata(oid, serviceId, catOpt).requiresQuantity) continue
                  if (serviceId === 'windows_doors' && oid === 'install_windows') {
                    prunedQuantities[oid] = windowTotal
                  } else if (serviceId === 'windows_doors' && oid === 'install_doors') {
                    prunedQuantities[oid] = doorTotal
                  } else if (serviceId === 'windows_doors' && oid === 'install_storm_front') {
                    prunedQuantities[oid] = stormFrontTotal
                  } else if (selectionQuantities[oid] !== undefined) {
                    prunedQuantities[oid] = selectionQuantities[oid]
                  }
                }
                void gid
              }
              const hasQuantities = Object.keys(prunedQuantities).length > 0
              const itemAddress: CartItemAddress | undefined = selectedAddress?.full
                ? { label: selectedAddress.label, full: selectedAddress.full }
                : undefined

              // Geocode project address for distance-based vendor matching.
              // Falls through silently on failure — widen-reads-narrow-writes.
              let projectLat: number | undefined
              let projectLng: number | undefined
              if (getFlag('googleMapsPlatform') && getFlag('realGeocoding') && selectedAddress?.full) {
                const coords = await geocodeAddressToCoords(
                  selectedAddress.full,
                  import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
                )
                if (coords) { projectLat = coords.lat; projectLng = coords.lng }
              }

              const roofAddonLinearFt: Record<string, number> = {}
              const includePerimeterForCart = roofMeasurement?.includePerimeter ?? true
              if (serviceId === 'roofing' && includePerimeterForCart) {
                for (const { id } of ADDON_LINEAR_FT_CONFIG) {
                  const val = addonLinearFt[id]
                  if (val && (selections['addons'] ?? []).includes(id)) {
                    const n = Number(val)
                    if (!isNaN(n) && n > 0) roofAddonLinearFt[id] = n
                  }
                }
              }
              // Defense-in-depth cart-side gate: trust roofMeasurement.includeMaterialOrder
              // (top-section toggle) as the predicate for whether pitched + flat material
              // reach the cart. When OFF the material slice zeroes out — cart still carries
              // perimeter add-ons gated separately by includePerimeter via roofAddonLinearFt
              // below. Default-true on legacy payloads.
              const cartRoofMeasurement = (() => {
                if (serviceId !== 'roofing' || !roofMeasurement) return null
                // Chip=flat-only with explicit ack: strip pitched (user opted-out via ack toggle).
                // SoT-of-strip moved here from wizard handleComplete so the under-quote gate
                // evaluator can read raw pitched on its read path.
                if (pitchedOmittedTriggered && (flatOnlyAck || isAddonOnlyMode)) {
                  const flatOnly = roofMeasurement.flatAreaSqft ?? 0
                  return { ...roofMeasurement, areaSqft: flatOnly, pitchedAreaSqft: 0 }
                }
                // Material Order toggle is the single area gate (PR-209).
                // PR-212 adds a Flat Area sub-gate inside Material Order:
                // when FA=OFF, flat slice is zeroed even though MO is ON.
                const includeMaterialOrder = roofMeasurement.includeMaterialOrder ?? true
                const includePerimeter = roofMeasurement.includePerimeter ?? true
                const includeFlatArea = roofMeasurement.includeFlatArea ?? true
                const pitchedRaw = roofMeasurement.pitchedAreaSqft ?? Math.max(0, roofMeasurement.areaSqft - (roofMeasurement.flatAreaSqft ?? 0))
                const flatRaw = roofMeasurement.flatAreaSqft ?? 0
                const pitchedOut = includeMaterialOrder ? pitchedRaw : 0
                const flatOut = includeMaterialOrder && includeFlatArea ? flatRaw : 0
                return {
                  ...roofMeasurement,
                  areaSqft: pitchedOut + flatOut,
                  pitchedAreaSqft: pitchedOut,
                  flatAreaSqft: flatOut,
                  includeMaterialOrder,
                  includePerimeter,
                  includeFlatArea,
                }
              })()
              const itemData = {
                serviceId: service.id,
                serviceName: service.name,
                selections,
                ...(hasQuantities && { selectionQuantities: prunedQuantities }),
                ...(serviceId === 'windows_doors' && windowSelections.length > 0 && { windowSelections }),
                ...(serviceId === 'windows_doors' && doorSelections.length > 0 && { doorSelections }),
                ...(serviceId === 'windows_doors' && stormFrontSelections.length > 0 && { stormFrontSelections }),
                ...(serviceId === 'windows_doors' &&
                  garageDoorSelection.type &&
                  garageDoorSelection.color &&
                  garageDoorSelection.glass &&
                  (garageDoorSelection.type === 'single_garage' || garageDoorSelection.size) && {
                    garageDoorSelection,
                  }),
                ...(serviceId === 'roofing' && metalRoofSelection.color && { metalRoofSelection }),
                ...(serviceId === 'roofing' && shingleSelection.color && { shingleSelection }),
                // Widen-reads-narrow-writes: persist shingleColor too so older
                // consumer surfaces (cart, vendor inbox, project-detail dialog)
                // that read the legacy field keep rendering until they're ported.
                ...(serviceId === 'roofing' && shingleSelection.color && { shingleColor: shingleSelection.color }),
                ...(serviceId === 'roofing' && tileSelection.tileType && tileSelection.tileColor && {
                  tileSelection: {
                    tileType: tileSelection.tileType as 'flat' | 'spanish' | 'mission',
                    tileColor: tileSelection.tileColor,
                    roofSize: tileSelection.roofSize,
                  },
                }),
                ...(serviceId === 'roofing' && tileSelection.tileType && { tileType: tileSelection.tileType }),
                ...(serviceId === 'roofing' && tileSelection.tileColor && { tileColor: tileSelection.tileColor }),
                ...(serviceId === 'roofing' && aluminumSelection.color && { aluminumSelection }),
                ...(serviceId === 'roofing' && flatRoofSelection.membraneType && {
                  flatRoofSelection: {
                    membraneType: flatRoofSelection.membraneType as 'tpo' | 'epdm' | 'modified_bitumen',
                    roofSize: flatRoofSelection.roofSize,
                  },
                }),
                ...(serviceId === 'roofing' && cartRoofMeasurement && { roofMeasurement: cartRoofMeasurement }),
                ...(serviceId === 'roofing' && pitchedOmittedTriggered && (flatOnlyAck || isAddonOnlyMode) && { pitchedExcludedAck: true }),
                ...((['driveways', 'pergolas'] as string[]).includes(serviceId ?? '') && areaMeasurement && { areaSqft: areaMeasurement.areaSqft }),
                ...(serviceId === 'fencing' && areaMeasurement?.perimeterFt != null && { perimeterFt: areaMeasurement.perimeterFt }),
                ...(areaMeasurement?.mapUrl && { measurementMapUrl: areaMeasurement.mapUrl }),
                // PR-222 — pergolas multi-structure persistence. When 2+
                // polygons are drawn (1 per picked structure), write per-
                // polygon mapUrls + per-structure sqft breakdown so cart +
                // vendor inbox can render one map per structure and pricing
                // can sum sqft across structures at the same rate.
                ...(serviceId === 'pergolas' && areaMeasurement?.polygons && areaMeasurement.polygons.length > 1 && {
                  measurementMapUrls: areaMeasurement.polygons
                    .filter((p): p is { sqft: number; mapUrl: string; color: string } => Boolean(p.mapUrl))
                    .map((p) => ({ mapUrl: p.mapUrl, color: p.color, sqft: p.sqft })),
                  structureMeasurements: Object.fromEntries(
                    (selections['structure'] ?? []).map((sid, idx) => {
                      const poly = areaMeasurement.polygons![idx]
                      return poly ? [sid, { sqft: poly.sqft, color: poly.color }] : [sid, { sqft: 0, color: POLYGON_COLORS[idx] ?? POLYGON_COLORS[0] }]
                    }),
                  ),
                }),
                ...(serviceId === 'roofing' && roofPermit && { roofPermit }),
                ...(serviceId === 'roofing' && Object.keys(roofAddonLinearFt).length > 0 && { roofAddonLinearFt }),
                ...((): { subGroupLinearFt?: Record<string, number> } => {
                  // Vertical-gated to kitchen so stale subGroupLinearFt
                  // state from a prior kitchen visit can't bleed into a
                  // non-kitchen cart-add if the same component instance
                  // persists across SPA navigations.
                  if (serviceId !== 'kitchen') return {}
                  const entries = Object.entries(subGroupLinearFt)
                    .map(([k, v]) => [k, Number(v) || 0] as const)
                    .filter(([, n]) => n > 0)
                  return entries.length > 0
                    ? { subGroupLinearFt: Object.fromEntries(entries) }
                    : {}
                })(),
                ...(serviceId === 'roofing' && (selections['addons'] ?? []).includes('gutters') && gutterFloors && {
                  gutterDropsConfig: { floors: gutterFloors, drops: gutterDrops },
                }),
                // Arc-19 — snapshot the entered Pool Floor sqft into the
                // canonical customSizeSqft map (keyed by option_id) at add-
                // to-project time, matching the pool-wizard.tsx persistence
                // path. Only the currently-selected pool_floor option is
                // written so a switched-away-then-back entry isn't carried.
                ...(serviceId === 'pool' && (() => {
                  const floorId = (selections['pool_floor'] ?? [])[0]
                  if (!floorId || !POOL_FLOOR_SQFT_IDS.includes(floorId)) return {}
                  const n = Number(poolFloorSqft[floorId] ?? 0)
                  if (!(n > 0)) return {}
                  return { customSizeSqft: { [floorId]: n } }
                })()),
                ...(addonQuantities && { addonQuantities }),
                ...(itemAddress && { address: itemAddress }),
                ...(projectLat !== undefined && projectLng !== undefined && { projectLat, projectLng }),
              }
              if (editingItemId) {
                // Update existing item
                removeItem(editingItemId)
                addItem(itemData)
                setEditingItemId(null)
                toast.success(`${service.name} updated`)
              } else {
                addItem(itemData)
                toast.success(`${service.name} added to your project`, {
                  action: {
                    label: 'View projects',
                    onClick: () => navigate('/home/cart'),
                  },
                })
              }
              // Single-project-at-a-time constraint: after Add-to-Project /
              // Save-Changes, reset the configurator to a clean slate so the
              // user can't keep editing what they just added. If they want to
              // build another of the same service, they start from scratch.
              // Toast + cart-count button provide confirmation that the add
              // landed; 'added' flag briefly shows Added-checkmark then resets.
              setSelections({})
              setSelectionQuantities({})
              setCustomPoolSize('')
              setActiveAddonMenu(null)
              setLaminarJets(0)
              setWaterfalls(0)
              setLedCount(0)
              setBubblerCount(0)
              setWindowSelections([])
              setWindowConfigOpen(true)
              setDoorSelections([])
              setDoorConfigOpen(true)
              setStormFrontSelections([])
              setStormFrontConfigOpen(true)
              setGarageDoorSelection({ type: '', size: '', color: '', glass: '' })
              setGarageDoorConfigOpen(true)
              setMetalRoofSelection({ color: '', roofSize: '' })
              setMetalRoofConfigOpen(true)
              setShingleSelection({ color: '', roofSize: '' })
              setShingleConfigOpen(true)
              setTileSelection({ tileType: '', tileColor: '', roofSize: '' })
              setTileConfigOpen(true)
              setAluminumSelection({ color: '', roofSize: '' })
              setAluminumConfigOpen(true)
              setFlatRoofSelection({ membraneType: '', roofSize: '' })
              setFlatRoofConfigOpen(true)
              setRoofMeasurement(null)
              setRoofPermit(null)
              setAddonLinearFt({})
              setFlatOnlyAck(false)
              setAdded(true)
              setTimeout(() => setAdded(false), 1200)
            }}
          >
            {added ? (
              <>
                <Check className="h-4 w-4" />
                {editingItemId ? 'Updated' : 'Added to Projects'}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {editingItemId ? 'Save Changes' : 'Add to Project'}
              </>
            )}
          </Button>

          {cartCount > 0 && (
            <Button
              variant="outline"
              size="lg"
              className="w-full h-10 text-sm gap-2 rounded-xl"
              onClick={() => navigate('/home/cart')}
            >
              <ShoppingCart className="h-4 w-4" />
              View Projects ({cartCount} {cartCount === 1 ? 'item' : 'items'})
            </Button>
          )}
          {allRequiredDone && Object.keys(selections).length > 0 && (
            <Button
              variant="outline"
              size="lg"
              className="w-full h-10 text-sm gap-2 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => setDetailsOpen(true)}
            >
              <FileText className="h-4 w-4" />
              Project Details
            </Button>
          )}
          {!alreadyInCart && !added && (
            !allRequiredDone ||
            !isProjectPermitValid(projectPermit, projectPermitWaiver) ||
            !isProjectAssociationValid(projectAssociation ?? null) ||
            (serviceId === 'pool' && !isPoolSurveyValid(poolSurvey ?? null)) ||
            (pitchedOmittedTriggered && !flatOnlyAck && !isAddonOnlyMode) ||
            !pergolasStructuresAllAssigned
          ) && (
            <p className="text-xs text-muted-foreground text-center">
              {/* SPEC C L2 (Rod-directed roofing wizard redesign
                  2026-07-14, iris reconciliation via kratos msg
                  1783992252440). When the current blocker is an
                  incomplete required optionGroup, the SPEC C L1 inline
                  cue on the group card already names it — show a
                  generic message here to avoid duplicate naming. For
                  the downstream structural gates (property / permit /
                  association / pool survey / pitched-omitted ack /
                  pergolas structure assign) — which have no inline
                  card — keep gatingReason()'s specific copy. This is a
                  render-site conditional; gatingReason() itself is
                  unchanged. */}
              {allRequiredDone ? gatingReason() : 'Complete selections above to continue.'}
            </p>
          )}
          {alreadyInCart && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center font-medium">
              Already in cart — book or remove first
            </p>
          )}
        </div>
      </motion.div>

      {/* Project Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Project Details
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 mt-2">
            {/* Service */}
            <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-4">
              <h3 className="text-base font-bold text-foreground">{service.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{service.description}</p>
            </div>

            {/* ── Driveways / Pergolas / Fencing: Area / Fence-line measurement card ── */}
            {(['driveways', 'pergolas', 'fencing'] as string[]).includes(serviceId ?? '') && areaMeasurement && (
              <div className="border-b border-border/50 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {serviceId === 'fencing' ? 'Fence Line Measurement' : 'Area Measurement'}
                </h4>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] bg-background rounded px-2 py-0.5 border w-full truncate">
                      {areaMeasurement.address}
                    </span>
                    <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                      {serviceId === 'fencing' && areaMeasurement.perimeterFt != null
                        ? `${areaMeasurement.perimeterFt.toLocaleString()} lin ft`
                        : `${applyAreaWaste(serviceId ?? '', areaMeasurement.areaSqft).toLocaleString()} sq ft`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Roofing: Measurement card ── */}
            {serviceId === 'roofing' && roofMeasurement && (
              <div className="border-b border-border/50 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Roof Measurement
                </h4>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] bg-background rounded px-2 py-0.5 border w-full truncate">
                      {roofMeasurement.address}
                    </span>
                    {(roofMeasurement.includeMaterialOrder ?? true) && (
                      <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                        {roofMeasurement.areaSqft.toLocaleString()} sqft · {(() => {
                          const { pitchedAreaSqft, flatAreaSqft, includeMaterialOrder } = roofMeasurement
                          if (pitchedAreaSqft !== undefined && flatAreaSqft !== undefined) {
                            return computeRoofTotal({
                              pitchedAreaSqft,
                              flatAreaSqft,
                              includeMaterialOrder: includeMaterialOrder ?? true,
                            }).totalSquares
                          }
                          return sqftToSquares(Math.round(roofMeasurement.areaSqft * PITCHED_WASTE_FACTOR))
                        })()} squares w/waste
                      </span>
                    )}
                    {(roofMeasurement.includeMaterialOrder ?? true) && (
                      <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                        Pitch {roofMeasurement.pitch}
                      </span>
                    )}
                    {roofMeasurement.perimeterFt && (roofMeasurement.includePerimeter ?? true) && (
                      <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                        ~{roofMeasurement.perimeterFt.toLocaleString()} lin ft perimeter
                      </span>
                    )}
                    {roofPermit && (
                      <span className={`text-[11px] rounded px-2 py-0.5 border font-medium ${roofPermit === 'yes' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400'}`}>
                        {roofPermit === 'yes' ? 'Permit: Yes' : 'Permit: No — cash only'}
                      </span>
                    )}
                  </div>
                  {roofPermit === 'no' && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 italic">
                      Financing is not available for this project. Payment will be cash, check, or wire transfer.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Roofing: Materials card ── */}
            {serviceId === 'roofing' && (selections['material'] ?? []).length > 0 && (() => {
              const matOpts = service.optionGroups.find(g => g.id === 'material')?.options ?? []
              const matIds = selections['material'] ?? []
              const hasFlatInSelection = matIds.includes('flat_roof')
              const hasPitchedInSelection = matIds.some(id => id !== 'flat_roof')
              // Perimeter-only mode: material is info-only — never overlay area
              // sqft badges on the existing-roof choice (would imply pricing).
              const showSplit = !isRoofingPerimeterOnly
                && hasFlatInSelection && hasPitchedInSelection
                && roofMeasurement?.pitchedAreaSqft !== undefined
                && roofMeasurement?.flatAreaSqft !== undefined
              return (
                <div className="border-b border-border/50 pb-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Materials
                  </h4>
                  <div className="flex flex-col gap-2">
                    {matIds.map((matId) => {
                      const label = matOpts.find(o => o.id === matId)?.label ?? matId
                      const areaLabel = showSplit
                        ? matId === 'flat_roof'
                          ? `${roofMeasurement!.flatAreaSqft!.toLocaleString()} sqft flat (${Math.ceil((roofMeasurement!.flatAreaSqft! * FLAT_WASTE_FACTOR) / 100)} sq)`
                          : `${roofMeasurement!.pitchedAreaSqft!.toLocaleString()} sqft pitched (${Math.ceil((roofMeasurement!.pitchedAreaSqft! * PITCHED_WASTE_FACTOR) / 100)} sq)`
                        : undefined
                      return (
                        <div key={matId} className="rounded-lg bg-muted/50 p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="text-sm font-semibold text-foreground">{label}</p>
                            {areaLabel && (
                              <span className="text-[11px] bg-primary/10 text-primary rounded px-2 py-0.5">
                                {areaLabel}
                              </span>
                            )}
                          </div>
                          {matId === 'metal' && (
                            <div className="flex flex-wrap gap-1.5">
                              {metalRoofSelection.color ? (
                                <>
                                  <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                                    Color: {metalRoofSelection.color.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                  </span>
                                  {metalRoofSelection.roofSize && (
                                    <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                                      {metalRoofDisplaySquares(metalRoofSelection.roofSize)} squares
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">Not yet configured</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* ── Roofing: Addons card ── */}
            {serviceId === 'roofing' && (selections['addons'] ?? []).length > 0 && (() => {
              const addonOpts = service.optionGroups.find(g => g.id === 'addons')?.options ?? []
              return (
                <div className="border-b border-border/50 pb-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Add-Ons
                  </h4>
                  <div className="flex flex-col gap-2">
                    {(selections['addons'] ?? []).map((optId) => {
                      const label = addonOpts.find(o => o.id === optId)?.label ?? optId
                      const isLinearFt = ADDON_LINEAR_FT_IDS.includes(optId)
                      const rawLinFt = isLinearFt ? Number(addonLinearFt[optId] ?? 0) || 0 : 0
                      const isGutter = optId === 'gutters' && isLinearFt && rawLinFt > 0 && gutterFloors !== null
                      const totalLinFt = isGutter
                        ? computeGutterTotalLinFt(rawLinFt, { floors: gutterFloors!, drops: gutterDrops })
                        : rawLinFt
                      const perFloor = isGutter ? GUTTER_DROP_FT_BY_FLOORS[gutterFloors!] : 0
                      return (
                        <div key={optId} className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-lg bg-primary/10 text-primary px-3 py-1.5 text-sm font-medium">
                              {label}
                            </span>
                            {isLinearFt && rawLinFt > 0 && (
                              <span className="text-xs text-muted-foreground">
                                · {totalLinFt.toLocaleString()} lin ft
                              </span>
                            )}
                          </div>
                          {isGutter && (
                            <p className="text-[11px] text-muted-foreground pl-1">
                              {rawLinFt.toLocaleString()} perimeter + {gutterDrops} drop{gutterDrops === 1 ? '' : 's'} × {perFloor} ft ({gutterFloors === 1 ? '1-story' : '2-story'})
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Selected options — skip material+addons for roofing (rendered above);
                also skip water_feature_units (vendor-side priceable group; canonical
                homeowner UI is the count-stepper waterfall configurator).
                Pairs with the rendering-loop exclusion at line 600+ so any stale
                selections['water_feature_units'] from prior sessions don't leak
                into the summary display. */}
            {service.optionGroups
              .filter(g => (selections[g.id]?.length ?? 0) > 0)
              .filter(g => !(serviceId === 'roofing' && (g.id === 'material' || g.id === 'addons')))
              .filter(g => g.id !== 'water_feature_units')
              .map((group) => {
              const selected = selections[group.id] ?? []
              return (
                <div key={group.id} className="border-b border-border/50 pb-4 last:border-0">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2" data-section-label-source="group">
                    {stripSubSuffix(group.label)}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map((optId) => {
                      const opt = group.options.find(o => o.id === optId)
                      return (
                        <span key={optId} className="inline-flex items-center rounded-lg bg-primary/10 text-primary px-3 py-1.5 text-sm font-medium">
                          {opt?.label || optId}
                          {/* W&D inline counts — match cart Project Summary + configurator
                              pill pattern (windowTotal / doorTotal derived, one source of truth). */}
                          {serviceId === 'windows_doors' && optId === 'windows' && windowTotal > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">{windowTotal}</span>
                          )}
                          {serviceId === 'windows_doors' && optId === 'doors' && doorTotal > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">{doorTotal}</span>
                          )}
                          {serviceId === 'windows_doors' && optId === 'install_windows' && windowTotal > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">{windowTotal}</span>
                          )}
                          {serviceId === 'windows_doors' && optId === 'install_doors' && doorTotal > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">{doorTotal}</span>
                          )}
                          {serviceId === 'windows_doors' && optId === 'install_storm_front' && stormFrontTotal > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">{stormFrontTotal}</span>
                          )}
                          {/* Inline addon details */}
                          {serviceId === 'pool' && optId === 'led' && ledCount > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">× {ledCount}</span>
                          )}
                          {serviceId === 'pool' && optId === 'bubbler' && bubblerCount > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">× {bubblerCount}</span>
                          )}
                          {serviceId === 'pool' && optId === 'spa' && (selections['spa_size'] ?? []).length > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">
                              ({service.optionGroups.find(g => g.id === 'spa_size')?.options.find(o => o.id === selections['spa_size'][0])?.label})
                            </span>
                          )}
                          {serviceId === 'pool' && optId === 'beach' && (selections['beach_size'] ?? []).length > 0 && (
                            <span className="ml-1.5 text-xs opacity-75">
                              ({service.optionGroups.find(g => g.id === 'beach_size')?.options.find(o => o.id === selections['beach_size'][0])?.label})
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                  {/* Waterfall details */}
                  {serviceId === 'pool' && group.id === 'addons' && selected.includes('waterfall') && (laminarJets > 0 || waterfalls > 0) && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      {laminarJets > 0 && <span>Laminar Jets: {laminarJets}</span>}
                      {laminarJets > 0 && waterfalls > 0 && <span className="mx-2">·</span>}
                      {waterfalls > 0 && <span>Waterfalls: {waterfalls}</span>}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Window selections */}
            {serviceId === 'windows_doors' && windowSelections.length > 0 && (
              <div className="border-b border-border/50 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Windows ({windowSelections.reduce((s, w) => s + w.quantity, 0)} total)
                </h4>
                <div className="flex flex-col gap-2">
                  {windowSelections.map((w) => (
                    <div key={w.id} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{w.size.replace('x', '" × ')}"</span>
                        <span className="text-xs font-medium text-primary">Qty: {w.quantity}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">{w.type}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">Frame: {w.frameColor}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">Glass: {w.glassColor}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">{w.glassType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Door selections */}
            {serviceId === 'windows_doors' && doorSelections.length > 0 && (
              <div className="border-b border-border/50 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Doors ({doorSelections.reduce((s, d) => s + d.quantity, 0)} total)
                </h4>
                <div className="flex flex-col gap-2">
                  {doorSelections.map((d) => (
                    <div key={d.id} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{d.size.replace('x', '" × ')}"</span>
                        <span className="text-xs font-medium text-primary">Qty: {d.quantity}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">{d.type}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">Frame: {d.frameColor}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">Glass: {d.glassColor}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">{d.glassType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Storm Front selections */}
            {serviceId === 'windows_doors' && stormFrontSelections.length > 0 && (
              <div className="border-b border-border/50 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Storm Fronts ({stormFrontSelections.reduce((s, sf) => s + sf.quantity, 0)} total)
                </h4>
                <div className="flex flex-col gap-2">
                  {stormFrontSelections.map((sf) => (
                    <div key={sf.id} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{sf.size.replace('x', '" × ')}"</span>
                        <span className="text-xs font-medium text-primary">Qty: {sf.quantity}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">{sf.type}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">Frame: {sf.frameColor}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">Glass: {sf.glassColor}</span>
                        <span className="text-[11px] bg-background rounded px-2 py-0.5 border">{sf.glassType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Garage Door selection */}
            {serviceId === 'windows_doors' && garageDoorSelection.type && (
              <div className="border-b border-border/50 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Garage Door
                </h4>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] bg-background rounded px-2 py-0.5 border font-medium">
                      {garageDoorSelection.type === 'single_garage' ? 'Single Garage Door' : 'Double Garage Door'}
                    </span>
                    {garageDoorSelection.type === 'double_garage' && garageDoorSelection.size && (
                      <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                        Size: {garageDoorSelection.size === 'gd_4_panels' ? '4 Panels' : '5 Panels'}
                      </span>
                    )}
                    {garageDoorSelection.color && (
                      <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                        Color: {garageDoorSelection.color.charAt(0).toUpperCase() + garageDoorSelection.color.slice(1)}
                      </span>
                    )}
                    {garageDoorSelection.glass && (
                      <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                        Glass: {garageDoorSelection.glass.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Custom pool size */}
            {serviceId === 'pool' && customPoolSize && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Custom Size:</span> {customPoolSize}
              </div>
            )}
          </div>

          {/* Close button */}
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              className="w-full h-10 rounded-xl text-sm font-semibold"
              onClick={() => setDetailsOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={lightboxImage !== null} onOpenChange={(open) => { if (!open) setLightboxImage(null) }}>
        <DialogContent
          showCloseButton
          className="max-w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] lg:max-w-[95vw] max-h-[90vh] p-2 bg-popover"
        >
          <DialogTitle className="sr-only">{lightboxImage?.alt || 'Design preview'}</DialogTitle>
          {lightboxImage && (
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              className="w-full max-h-[86vh] rounded-lg object-contain bg-muted"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
