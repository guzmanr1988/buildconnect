import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Minus, Plus, PlusCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useCatalogStore } from '@/stores/catalog-store'
import { useMobile } from '@/hooks/use-mobile'

// PR-#428 — bundled fallbacks. The component derives its dropdown lists from
// the catalog-store substrate (admin /admin/products edits propagate here),
// but the fallbacks stay byte-identical to the pre-rewire literals so the
// rendered list does NOT churn when the substrate hasn't hydrated yet
// (cold open, RLS deny, unauth, network blip).
const FALLBACK_DOOR_CATEGORIES = [
  {
    label: 'Single Doors',
    sizes: ['27x80', '27x96', '34x80', '34x96', '39x80', '39x96'],
  },
  {
    label: 'Double Doors',
    sizes: ['60x80', '60x96', '72x80', '72x96', '96x80', '96x96'],
  },
  {
    label: 'Triple Door / Sliding',
    sizes: ['110x80', '110x96', '120x80', '120x96', '144x80', '144x96'],
  },
]

const FALLBACK_DOOR_TYPES = [
  'Entry Door',
  'French Door',
  'Sliding Glass',
  'Impact Door',
  'Patio Door',
  'Pivot Door',
]

const FALLBACK_FRAME_COLORS = [
  { label: 'White', color: '#ffffff' },
  { label: 'Bronze', color: '#5B3A29' },
  { label: 'Black', color: '#1a1a1a' },
]
const FALLBACK_GLASS_COLORS = [
  { id: 'grey-white', label: 'Grey-White', note: 'Private Glass - front doors or bathroom' },
  { id: 'clear-white', label: 'Clear-White', note: 'Private but lighter look' },
  { id: 'clear', label: 'Clear', note: '' },
  { id: 'gray', label: 'Gray', note: '' },
  { id: 'green', label: 'Green', note: 'Low-E Color' },
]
const FALLBACK_GLASS_TYPES = ['Impact Glass', 'Low-E Glass']

// Substrate has only id+label; the visual hex + glass note copy stays in code
// because the substrate doesn't carry those fields. Looked up by label/id and
// falls back to neutral when the substrate adds a value we don't know yet.
const FRAME_COLOR_HEX: Record<string, string> = {
  White: '#ffffff',
  Bronze: '#5B3A29',
  Black: '#1a1a1a',
}
const GLASS_COLOR_NOTE: Record<string, string> = {
  grey_white: 'Private Glass - front doors or bathroom',
  clear_white: 'Private but lighter look',
  green: 'Low-E Color',
}

// Bucketize a flat substrate door_sizes list into the Single / Double / Triple
// categories using the WxH width. Substrate door_sizes are a flat collection;
// the categorization is consumer-side UX organization, not substrate data.
function categorizeSizes(sizes: string[]): typeof FALLBACK_DOOR_CATEGORIES {
  const single: string[] = []
  const double: string[] = []
  const triple: string[] = []
  for (const s of sizes) {
    const width = parseInt(s.split('x')[0] ?? '', 10)
    if (!Number.isFinite(width)) continue
    if (width <= 50) single.push(s)
    else if (width <= 99) double.push(s)
    else triple.push(s)
  }
  return [
    { label: 'Single Doors', sizes: single },
    { label: 'Double Doors', sizes: double },
    { label: 'Triple Door / Sliding', sizes: triple },
  ]
}

export interface DoorSelection {
  id: string
  size: string
  type: string
  frameColor: string
  glassColor: string
  glassType: string
  quantity: number
}

interface DoorConfiguratorProps {
  selections: DoorSelection[]
  onChange: (selections: DoorSelection[]) => void
  onSave?: () => void
}

export function DoorConfigurator({ selections, onChange, onSave }: DoorConfiguratorProps) {
  const services = useCatalogStore((s) => s.services)
  // Rod voice 2026-08-08 (task_1786199078887_917): mobile-only per-size
  // accordion, same shape as WindowConfigurator sibling.
  const isMobile = useMobile()
  const [openSize, setOpenSize] = useState<string | null>(null)

  const { doorCategories, doorTypes, frameColors, glassColors, glassTypes } = useMemo(() => {
    const svc = services.find((s) => s.id === 'windows_doors')
    const products = svc?.optionGroups?.find((g) => g.id === 'products')
    const doors = products?.options?.find((o) => o.id === 'doors')
    const findSub = (id: string) => doors?.subGroups?.find((sg) => sg.id === id)

    const sizesSub = findSub('door_sizes')?.options
    const typesSub = findSub('door_types')?.options
    const frameSub = findSub('door_frame_colors')?.options
    const glassColorsSub = findSub('door_glass_colors')?.options
    const glassTypesSub = findSub('door_glass_types')?.options

    return {
      doorCategories:
        sizesSub && sizesSub.length > 0
          ? categorizeSizes(sizesSub.map((o) => o.id))
          : FALLBACK_DOOR_CATEGORIES,
      doorTypes:
        typesSub && typesSub.length > 0
          ? typesSub.map((o) => o.label)
          : FALLBACK_DOOR_TYPES,
      frameColors:
        frameSub && frameSub.length > 0
          ? frameSub.map((o) => ({ label: o.label, color: FRAME_COLOR_HEX[o.label] ?? '#cccccc' }))
          : FALLBACK_FRAME_COLORS,
      glassColors:
        glassColorsSub && glassColorsSub.length > 0
          ? glassColorsSub.map((o) => ({ id: o.id, label: o.label, note: GLASS_COLOR_NOTE[o.id] ?? '' }))
          : FALLBACK_GLASS_COLORS,
      glassTypes:
        glassTypesSub && glassTypesSub.length > 0
          ? glassTypesSub.map((o) => o.label)
          : FALLBACK_GLASS_TYPES,
    }
  }, [services])

  function addEntry(size: string, type: string = doorTypes[0] ?? 'Entry Door') {
    onChange([
      ...selections,
      {
        id: crypto.randomUUID(),
        size,
        type,
        frameColor: frameColors[0]?.label ?? 'White',
        glassColor: glassColors.find((g) => g.label === 'Clear-White')?.label ?? glassColors[0]?.label ?? 'Clear-White',
        glassType: glassTypes[0] ?? 'Impact Glass',
        quantity: 1,
      },
    ])
  }

  function removeEntry(id: string) {
    onChange(selections.filter((s) => s.id !== id))
  }

  function updateEntry(id: string, field: 'type' | 'quantity' | 'frameColor' | 'glassColor' | 'glassType', value: string | number) {
    onChange(
      selections.map((s) =>
        s.id === id ? { ...s, [field]: value } : s
      )
    )
  }

  function adjustQuantity(id: string, delta: number) {
    const entry = selections.find((s) => s.id === id)
    if (!entry) return
    const newQty = Math.max(1, entry.quantity + delta)
    updateEntry(id, 'quantity', newQty)
  }

  const totalDoors = selections.reduce((sum, s) => sum + s.quantity, 0)

  function getEntries(size: string) {
    return selections.filter((s) => s.size === size)
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 rounded-xl border bg-background p-4 overflow-hidden"
    >
      <h4 className="text-base font-semibold text-foreground mb-4">Select Door Sizes</h4>

      <div className="flex flex-col gap-1">
        {doorCategories.map((category) => (
          <div key={category.label} className="flex flex-col">
            <div className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 pt-3 pb-1">
              {category.label}
            </div>
            {category.sizes.map((size) => {
              const entries = getEntries(size)
              const hasEntries = entries.length > 0
              const isOpen = openSize === size
              const handleMobileToggle = () => {
                if (isOpen) {
                  setOpenSize(null)
                } else {
                  if (!hasEntries) addEntry(size)
                  setOpenSize(size)
                }
              }
              return (
                <div key={size} data-door-size-row={size} className="flex flex-col">
                  {isMobile ? (
                    <button
                      type="button"
                      onClick={handleMobileToggle}
                      aria-expanded={isOpen}
                      aria-controls={`door-panel-${size}`}
                      data-door-size-header={size}
                      data-door-size-open={isOpen ? 'true' : 'false'}
                      className={cn(
                        'flex items-center justify-between px-3 py-3 min-h-[52px] rounded-lg border text-left transition-colors',
                        hasEntries ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
                        isOpen && 'border-primary shadow-sm'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          'text-lg font-semibold',
                          hasEntries ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {size.replace('x', '" × ')}"
                        </span>
                        {hasEntries && (
                          <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                            {entries.reduce((s, e) => s + e.quantity, 0)}
                          </span>
                        )}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                          isOpen && 'rotate-180 text-primary'
                        )}
                      />
                    </button>
                  ) : (
                    <div className="flex items-center justify-between px-2 py-2 min-h-[44px]">
                      <span className={cn(
                        'text-xl font-semibold px-2 py-1 rounded-md',
                        hasEntries ? 'text-foreground bg-primary/5' : 'text-muted-foreground'
                      )}>
                        {size.replace('x', '" × ')}"
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 text-primary"
                        onClick={() => addEntry(size)}
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  )}

                  {(!isMobile || isOpen) && (
                    <AnimatePresence initial={false}>
                      <motion.div
                        key={`entries-${size}`}
                        id={`door-panel-${size}`}
                        initial={isMobile ? { opacity: 0, height: 0 } : false}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn(isMobile && 'overflow-hidden')}
                      >
                        <div className={cn(
                          'flex flex-col',
                          isMobile && 'mt-2 pl-3 pr-1 pb-3 border-l-2 border-primary/20'
                        )}>
                          {entries.map((entry) => (
                            <div
                              key={entry.id}
                              data-door-entry={entry.id}
                              className={cn(
                                isMobile
                                  ? 'flex flex-col gap-3 py-3 border-b border-border/50 last:border-b-0'
                                  : 'flex flex-col gap-2 px-2 py-2.5 ml-4 border-l-2 border-primary/20'
                              )}
                            >
                              {isMobile ? (
                                <>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Type</label>
                                    <Select
                                      value={entry.type}
                                      onValueChange={(v) => updateEntry(entry.id, 'type', v ?? '')}
                                    >
                                      <SelectTrigger className="h-10 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {doorTypes.map((type) => (
                                          <SelectItem key={type} value={type} className="text-sm py-2.5 pl-3 pr-4">
                                            {type}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Quantity</label>
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => adjustQuantity(entry.id, -1)}>
                                        <Minus className="h-4 w-4" />
                                      </Button>
                                      <span className="text-base font-semibold w-8 text-center text-primary">{entry.quantity}</span>
                                      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => adjustQuantity(entry.id, 1)}>
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Frame Color</label>
                                    <Select
                                      value={entry.frameColor}
                                      onValueChange={(v) => updateEntry(entry.id, 'frameColor', v ?? '')}
                                    >
                                      <SelectTrigger className="h-10 text-sm">
                                        <SelectValue placeholder="Frame" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {frameColors.map((c) => (
                                          <SelectItem key={c.label} value={c.label} className="text-sm py-2.5 pl-3 pr-4">
                                            <div className="flex items-center gap-2">
                                              <div className="w-4 h-4 rounded-full shrink-0 border border-gray-300 shadow-inner" style={{ backgroundColor: c.color }} />
                                              <span>{c.label}</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Glass Color</label>
                                    <Select
                                      value={entry.glassColor}
                                      onValueChange={(v) => updateEntry(entry.id, 'glassColor', v ?? '')}
                                    >
                                      <SelectTrigger className="h-10 text-sm">
                                        <SelectValue placeholder="Glass" />
                                      </SelectTrigger>
                                      <SelectContent className="min-w-[280px]">
                                        {glassColors.map((c) => (
                                          <SelectItem key={c.id} value={c.label} className="text-sm py-2.5 pl-3 pr-4">
                                            <div className="flex flex-col">
                                              <span>{c.label}</span>
                                              {c.note && <span className="text-[10px] text-muted-foreground">{c.note}</span>}
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Glass Type</label>
                                    <Select
                                      value={entry.glassType}
                                      onValueChange={(v) => updateEntry(entry.id, 'glassType', v ?? '')}
                                    >
                                      <SelectTrigger className="h-10 text-sm">
                                        <SelectValue placeholder="Type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {glassTypes.map((t) => (
                                          <SelectItem key={t} value={t} className="text-sm py-2.5 pl-3 pr-4">{t}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 self-start text-xs text-muted-foreground hover:text-destructive gap-1.5"
                                    onClick={() => removeEntry(entry.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Remove this door
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {/* Desktop layout — unchanged from pre-task-917. */}
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={entry.type}
                                      onValueChange={(v) => updateEntry(entry.id, 'type', v ?? '')}
                                    >
                                      <SelectTrigger className="h-8 text-xs flex-1 text-center [&>span]:text-center [&>span]:w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {doorTypes.map((type) => (
                                          <SelectItem key={type} value={type} className="text-xs py-2.5 justify-center pl-4 pr-4 text-center">
                                            {type}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-1.5">
                                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustQuantity(entry.id, -1)}>
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <span className="text-sm font-semibold w-6 text-center text-primary">{entry.quantity}</span>
                                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustQuantity(entry.id, 1)}>
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEntry(entry.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={entry.frameColor}
                                      onValueChange={(v) => updateEntry(entry.id, 'frameColor', v ?? '')}
                                    >
                                      <SelectTrigger className="h-7 text-[11px] flex-1 [&>span]:text-center [&>span]:w-full">
                                        <SelectValue placeholder="Frame" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {frameColors.map((c) => (
                                          <SelectItem key={c.label} value={c.label} className="text-xs py-2 pl-3 pr-4">
                                            <div className="flex items-center gap-2">
                                              <div className="w-4 h-4 rounded-full shrink-0 border border-gray-300 shadow-inner" style={{ backgroundColor: c.color }} />
                                              <span>{c.label}</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={entry.glassColor}
                                      onValueChange={(v) => updateEntry(entry.id, 'glassColor', v ?? '')}
                                    >
                                      <SelectTrigger className="h-7 text-[11px] flex-1 [&>span]:text-center [&>span]:w-full">
                                        <SelectValue placeholder="Glass" />
                                      </SelectTrigger>
                                      <SelectContent className="min-w-[280px]">
                                        {glassColors.map((c) => (
                                          <SelectItem key={c.id} value={c.label} className="text-xs py-2.5 pl-4 pr-4">
                                            <div className="flex flex-col">
                                              <span>{c.label}</span>
                                              {c.note && <span className="text-[10px] text-muted-foreground">{c.note}</span>}
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={entry.glassType}
                                      onValueChange={(v) => updateEntry(entry.id, 'glassType', v ?? '')}
                                    >
                                      <SelectTrigger className="h-7 text-[11px] flex-1 [&>span]:text-center [&>span]:w-full">
                                        <SelectValue placeholder="Type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {glassTypes.map((t) => (
                                          <SelectItem key={t} value={t} className="text-xs py-2 text-center justify-center pl-4 pr-4">{t}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                          {isMobile && (
                            <div className="flex flex-col gap-2 pt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 w-full gap-1.5"
                                onClick={() => addEntry(size)}
                                data-door-add-another={size}
                              >
                                <PlusCircle className="h-4 w-4" />
                                Add another door this size
                              </Button>
                              <Button
                                className="h-11 w-full rounded-xl text-sm font-semibold"
                                onClick={() => setOpenSize(null)}
                                data-door-save-size={size}
                              >
                                Save
                              </Button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Total + Save */}
      <div className="mt-4 pt-4 border-t flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Total Doors</span>
        <span className={cn(
          'text-lg font-bold',
          totalDoors > 0 ? 'text-primary' : 'text-muted-foreground'
        )}>
          {totalDoors}
        </span>
      </div>
      {totalDoors > 0 && onSave && (
        <Button
          className="w-full mt-4 h-10 rounded-xl text-sm font-semibold"
          onClick={onSave}
          data-door-done-all="true"
        >
          {isMobile ? 'Done' : 'Save Selection'}
        </Button>
      )}
    </motion.div>
  )
}
