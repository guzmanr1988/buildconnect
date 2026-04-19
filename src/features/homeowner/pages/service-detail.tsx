import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, ShoppingCart, Plus, Save, Send, Home, Wind, Droplets, Car, Tent, Thermometer, UtensilsCrossed, Bath, PanelTop, Hammer, PaintRoller, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCatalogStore } from '@/stores/catalog-store'
import { useCartStore } from '@/stores/cart-store'
import type { OptionGroup, ServiceCategory } from '@/types'
import { cn } from '@/lib/utils'
import { WindowConfigurator, type WindowSelection } from '../components/window-configurator'
import { DoorConfigurator, type DoorSelection } from '../components/door-configurator'
import { GarageDoorConfigurator, type GarageDoorSelection } from '../components/garage-door-configurator'
import { MetalRoofConfigurator, type MetalRoofSelection } from '../components/metal-roof-configurator'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { getOptionMetadata } from '@/lib/option-metadata'

const SERVICE_ICONS: Record<ServiceCategory, React.ElementType> = {
  roofing: Home,
  windows_doors: Wind,
  pool: Droplets,
  driveways: Car,
  pergolas: Tent,
  air_conditioning: Thermometer,
  kitchen: UtensilsCrossed,
  bathroom: Bath,
  wall_paneling: PanelTop,
  garage: Hammer,
  house_painting: PaintRoller,
}

const ICON_GRADIENTS: Record<ServiceCategory, string> = {
  roofing: 'from-orange-400 to-red-500',
  windows_doors: 'from-sky-400 to-blue-500',
  pool: 'from-cyan-400 to-blue-500',
  driveways: 'from-stone-400 to-stone-600',
  pergolas: 'from-emerald-400 to-green-600',
  air_conditioning: 'from-indigo-400 to-violet-500',
  kitchen: 'from-amber-400 to-orange-500',
  bathroom: 'from-teal-400 to-cyan-600',
  wall_paneling: 'from-purple-400 to-violet-500',
  garage: 'from-slate-400 to-slate-600',
  house_painting: 'from-rose-400 to-pink-500',
}

export function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

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
  const [added, setAdded] = useState(false)
  const [customPoolSize, setCustomPoolSize] = useState('')
  const [activeAddonMenu, setActiveAddonMenu] = useState<string | null>(null)
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
  const [editingItemId, setEditingItemId] = useState<string | null>(
    (editItemForService?.id as string) || null
  )

  const addItem = useCartStore((s) => s.addItem)
  const updateItem = useCartStore((s) => s.updateItem)
  const removeItem = useCartStore((s) => s.removeItem)
  const cartItems = useCartStore((s) => s.items)
  const cartCount = cartItems.length
  // N distinct projects of the same service are allowed — different properties,
  // different contractors, different configurations. Cart-store already stores
  // each as a unique item via crypto.randomUUID(). No dedup gate on the button.

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
    const gs = legacy.garageDoorSelection as GarageDoorSelection | undefined
    if (gs?.type) { setGarageDoorSelection(gs); setGarageDoorConfigOpen(false) }
    const ms = legacy.metalRoofSelection as MetalRoofSelection | undefined
    if (ms?.color) { setMetalRoofSelection(ms); setMetalRoofConfigOpen(false) }
    if (typeof legacy.id === 'string') setEditingItemId(legacy.id)
    localStorage.removeItem('buildconnect-edit-item')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [detailsOpen, setDetailsOpen] = useState(false)

  const services = useCatalogStore((s) => s.services)
  const service = services.find((s) => s.id === serviceId)

  useDocumentTitle(service?.name)

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
  // gate must contain that specific option id; without, any selection triggers.
  const isRevealed = (g: OptionGroup) => {
    if (!g.revealsOn) return true
    const selected = selections[g.revealsOn.group] ?? []
    if (selected.length === 0) return false
    if (g.revealsOn.equals) return selected.includes(g.revealsOn.equals)
    return true
  }

  const requiredGroups = service.optionGroups.filter((g) => g.required && isRevealed(g))
  const completedRequired = requiredGroups.filter(
    (g) => (selections[g.id]?.length ?? 0) > 0
  ).length
  const allRequiredDone = completedRequired === requiredGroups.length

  const addonsThatNeedConfig = ['spa', 'beach', 'waterfall', 'led', 'bubbler']

  function handleSelect(group: OptionGroup, optionId: string) {
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
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) }
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

      {/* Configuration section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-2xl border bg-card p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold font-heading text-foreground mb-1">
          Configure your project
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Select your preferences below to get matched with the right contractors.
        </p>

        {/* Progress */}
        {requiredGroups.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{
                  width: `${requiredGroups.length > 0 ? (completedRequired / requiredGroups.length) * 100 : 0}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap font-medium">
              {completedRequired} / {requiredGroups.length}
            </span>
          </div>
        )}

        {/* Option groups */}
        <div className="flex flex-col gap-6">
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
            return true
          }).map((group) => {
            const selected = selections[group.id] ?? []
            return (
              <div key={group.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {group.label}
                  </span>
                  {group.required ? (
                    <span className="text-destructive text-xs">*</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-medium bg-muted rounded-full px-2 py-0.5">
                      Optional
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const isSelected = selected.includes(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
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
                          if (serviceId === 'roofing' && group.id === 'material' && option.id === 'metal') {
                            setMetalRoofConfigOpen(true)
                          }
                          if (serviceId === 'roofing' && group.id === 'material' && option.id !== 'metal') {
                            setMetalRoofConfigOpen(false)
                            setMetalRoofSelection({ color: '', roofSize: '' })
                          }
                          if (serviceId === 'windows_doors' && option.id === 'garage_doors') {
                            setGarageDoorConfigOpen((prev) => selected.includes('garage_doors') ? !prev : true)
                          }
                        }}
                        className={cn(
                          'inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-150',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
                        )}
                      >
                        {group.type === 'multi' && isSelected && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {option.label}
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
                        {serviceId === 'windows_doors' && option.id === 'garage_doors' && garageDoorSelection.type && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {garageDoorSelection.type === 'single_garage' ? 'S' : 'D'}
                          </span>
                        )}
                        {serviceId === 'roofing' && option.id === 'metal' && metalRoofSelection.color && (
                          <span className="ml-1 flex h-5 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                            {metalRoofSelection.roofSize ? `${Number(metalRoofSelection.roofSize).toLocaleString()} ft` : 'Configured'}
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
                  })}
                </div>
                {/* Metal Roof Configurator - shows when Standing Seam Metal is selected */}
                {serviceId === 'roofing' && group.id === 'material' && (
                  <AnimatePresence>
                    {selected.includes('metal') && metalRoofConfigOpen && (
                      <MetalRoofConfigurator
                        selection={metalRoofSelection}
                        onChange={setMetalRoofSelection}
                        onSave={() => setMetalRoofConfigOpen(false)}
                      />
                    )}
                  </AnimatePresence>
                )}
                {/* Products disclaimer */}
                {group.id === 'products' && serviceId === 'windows_doors' && (
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    Installation & Permits not included.
                  </p>
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
                      {selected.includes('garage_doors') && garageDoorConfigOpen && (
                        <GarageDoorConfigurator
                          selection={garageDoorSelection}
                          onChange={setGarageDoorSelection}
                          onSave={() => setGarageDoorConfigOpen(false)}
                        />
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <div className="mt-8 pt-6 border-t border-border/50 flex flex-col gap-3">
          <Button
            size="lg"
            className={cn(
              'w-full h-12 text-sm font-semibold gap-2 rounded-xl',
              added && 'bg-green-600 hover:bg-green-700'
            )}
            disabled={!allRequiredDone || added}
            onClick={() => {
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
                  if (!getOptionMetadata(oid).requiresQuantity) continue
                  if (serviceId === 'windows_doors' && oid === 'install_windows') {
                    prunedQuantities[oid] = windowTotal
                  } else if (serviceId === 'windows_doors' && oid === 'install_doors') {
                    prunedQuantities[oid] = doorTotal
                  } else if (selectionQuantities[oid] !== undefined) {
                    prunedQuantities[oid] = selectionQuantities[oid]
                  }
                }
                void gid
              }
              const hasQuantities = Object.keys(prunedQuantities).length > 0
              const itemData = {
                serviceId: service.id,
                serviceName: service.name,
                selections,
                ...(hasQuantities && { selectionQuantities: prunedQuantities }),
                ...(serviceId === 'windows_doors' && windowSelections.length > 0 && { windowSelections }),
                ...(serviceId === 'windows_doors' && doorSelections.length > 0 && { doorSelections }),
                ...(serviceId === 'windows_doors' && garageDoorSelection.type && { garageDoorSelection }),
                ...(serviceId === 'roofing' && metalRoofSelection.color && { metalRoofSelection }),
                ...(addonQuantities && { addonQuantities }),
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
                    label: 'View cart',
                    onClick: () => navigate('/home/cart'),
                  },
                })
              }
              setAdded(true)
            }}
          >
            {added ? (
              <>
                <Check className="h-4 w-4" />
                {editingItemId ? 'Updated' : 'Added to Cart'}
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
              View Cart ({cartCount} {cartCount === 1 ? 'item' : 'items'})
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
          {!allRequiredDone && (
            <p className="text-xs text-muted-foreground text-center">
              Complete all required selections to continue
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

            {/* Selected options */}
            {service.optionGroups.filter(g => (selections[g.id]?.length ?? 0) > 0).map((group) => {
              const selected = selections[group.id] ?? []
              return (
                <div key={group.id} className="border-b border-border/50 pb-4 last:border-0">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.label}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map((optId) => {
                      const opt = group.options.find(o => o.id === optId)
                      return (
                        <span key={optId} className="inline-flex items-center rounded-lg bg-primary/10 text-primary px-3 py-1.5 text-sm font-medium">
                          {opt?.label || optId}
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

            {/* Metal Roof selection */}
            {serviceId === 'roofing' && metalRoofSelection.color && (
              <div className="border-b border-border/50 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Standing Seam Metal
                </h4>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] bg-background rounded px-2 py-0.5 border font-medium">
                      Color: {metalRoofSelection.color.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    {metalRoofSelection.roofSize && (
                      <span className="text-[11px] bg-background rounded px-2 py-0.5 border">
                        Roof Size: {Number(metalRoofSelection.roofSize).toLocaleString()} Sq Ft
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
    </div>
  )
}
