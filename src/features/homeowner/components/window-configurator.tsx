import { motion } from 'framer-motion'
import { Minus, Plus, PlusCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const WINDOW_SIZES = [
  '18x38',
  '26x25', '26x38', '26x50', '26x62', '26x73',
  '36x25', '36x38', '36x50', '36x62', '36x72',
  '52x25', '52x38', '52x50', '52x62', '52x72',
  '73x25', '73x38', '73x50', '73x62', '73x73',
  '110x25', '110x38', '110x50', '110x62', '110x72',
]

const WINDOW_TYPES = [
  'Single Hung',
  'Casement',
  'Awning',
  'Rolling',
  'Picture',
]

function WindowIcon({ type, size = 20 }: { type: string; size?: number }) {
  const s = size
  const stroke = 'currentColor'
  const sw = 1.5
  switch (type) {
    case 'Single Hung':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw}>
          <rect x="3" y="2" width="18" height="20" rx="1" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <path d="M12 16 L12 9 M9 11 L12 8 L15 11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'Casement':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw}>
          <rect x="3" y="2" width="18" height="20" rx="1" />
          <line x1="12" y1="2" x2="12" y2="22" />
          <path d="M7 12 L4 12 M16 9 L19 12 L16 15" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'Awning':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw}>
          <rect x="3" y="2" width="18" height="20" rx="1" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M12 5 L12 13 M9 11 L12 14 L15 11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'Rolling':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw}>
          <rect x="3" y="2" width="18" height="20" rx="1" />
          <line x1="12" y1="2" x2="12" y2="22" />
          <path d="M7 9 L4 12 L7 15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 9 L20 12 L17 15" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'Picture':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw}>
          <rect x="3" y="2" width="18" height="20" rx="1" />
          <rect x="6" y="5" width="12" height="14" rx="0.5" strokeDasharray="2 2" />
        </svg>
      )
    default:
      return null
  }
}

const FRAME_COLORS = [
  { label: 'White', color: '#ffffff' },
  { label: 'Bronze', color: '#8B6914' },
  { label: 'Black', color: '#1a1a1a' },
]

const GLASS_COLORS = [
  { id: 'grey-white', label: 'Grey-White', note: 'Dark Grey Tinted Glass - Mostly selected for Bathroom windows or any windows for maximum privacy', color: '#6b7280', requiresLowE: false },
  { id: 'clear-white', label: 'Clear-White', note: 'Light grey tinted - mostly added for bathroom windows or any windows for maximum privacy', color: '#d1d5db', requiresLowE: false },
  { id: 'clear', label: 'Clear', note: '', color: '#e0f2fe', requiresLowE: false },
  { id: 'gray', label: 'Gray', note: 'Tint color grey added to the Impact glass', color: '#9ca3af', requiresLowE: false },
  { id: 'green', label: 'Green', note: 'Only available with Low-Emissivity Glass coating', color: '#6ee7b7', requiresLowE: true },
]

const GLASS_TYPES = ['Impact Glass', 'Low-E Glass']

export interface WindowSelection {
  id: string
  size: string
  type: string
  frameColor: string
  glassColor: string
  glassType: string
  quantity: number
}

interface WindowConfiguratorProps {
  selections: WindowSelection[]
  onChange: (selections: WindowSelection[]) => void
  onSave?: () => void
}

export function WindowConfigurator({ selections, onChange, onSave }: WindowConfiguratorProps) {
  function addEntry(size: string, type: string = 'Single Hung') {
    onChange([
      ...selections,
      { id: crypto.randomUUID(), size, type, frameColor: 'White', glassColor: 'Clear-White', glassType: 'Impact Glass', quantity: 1 },
    ])
  }

  function removeEntry(id: string) {
    onChange(selections.filter((s) => s.id !== id))
  }

  function updateEntry(id: string, field: 'type' | 'quantity' | 'frameColor' | 'glassColor' | 'glassType', value: string | number) {
    onChange(
      selections.map((s) => {
        if (s.id !== id) return s
        const updated = { ...s, [field]: value }
        // Auto-switch to Green when Low-E Glass is selected
        if (field === 'glassType' && value === 'Low-E Glass') {
          updated.glassColor = 'Green'
        }
        // If switching away from Low-E Glass and color is Green, reset to Clear-White
        if (field === 'glassType' && value !== 'Low-E Glass' && s.glassColor === 'Green') {
          updated.glassColor = 'Clear-White'
        }
        return updated
      })
    )
  }

  function adjustQuantity(id: string, delta: number) {
    const entry = selections.find((s) => s.id === id)
    if (!entry) return
    const newQty = Math.max(1, entry.quantity + delta)
    updateEntry(id, 'quantity', newQty)
  }

  const totalWindows = selections.reduce((sum, s) => sum + s.quantity, 0)

  // Group sizes by width
  const sizeGroups: Record<string, string[]> = {}
  WINDOW_SIZES.forEach((size) => {
    const width = size.split('x')[0]
    if (!sizeGroups[width]) sizeGroups[width] = []
    sizeGroups[width].push(size)
  })

  // Get entries for a size
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
      <h4 className="text-sm font-semibold text-foreground mb-4">Select Window Sizes</h4>

      <div className="flex flex-col gap-1">
        {Object.entries(sizeGroups).map(([width, sizes]) => (
          <div key={width} className="flex flex-col">
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 pt-3 pb-1">
              {width}" Width
            </div>
            {sizes.map((size) => {
              const entries = getEntries(size)
              const hasEntries = entries.length > 0
              return (
                <div key={size} className="flex flex-col">
                  {/* Size row - add button */}
                  <div className={cn(
                    'flex items-center justify-between px-2 py-2 rounded-lg',
                    hasEntries && 'bg-primary/5'
                  )}>
                    <span className={cn(
                      'text-base font-semibold',
                      hasEntries ? 'text-foreground' : 'text-muted-foreground'
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

                  {/* Entry rows for this size */}
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-2 px-2 py-2.5 ml-4 border-l-2 border-primary/20"
                    >
                      {/* Row 1: Type + Quantity + Remove */}
                      <div className="flex items-center gap-2">
                        <Select
                          value={entry.type}
                          onValueChange={(v) => updateEntry(entry.id, 'type', v)}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1 text-center [&>span]:text-center [&>span]:w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="min-w-[180px]">
                            {WINDOW_TYPES.filter((type) => {
                              const width = parseInt(entry.size.split('x')[0])
                              if (width >= 73) return type === 'Rolling'
                              if (width >= 52 && type === 'Casement') return false
                              return true
                            }).map((type) => (
                              <SelectItem key={type} value={type} className="text-xs py-2.5 pl-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <WindowIcon type={type} size={28} />
                                  <span>{type}</span>
                                </div>
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
                      {/* Row 2: Frame Color + Glass Color + Glass Type */}
                      <div className="flex items-center gap-2">
                        <Select
                          value={entry.frameColor}
                          onValueChange={(v) => updateEntry(entry.id, 'frameColor', v)}
                        >
                          <SelectTrigger className="h-7 text-[11px] flex-1 [&>span]:text-center [&>span]:w-full">
                            <SelectValue placeholder="Frame" />
                          </SelectTrigger>
                          <SelectContent>
                            {FRAME_COLORS.map((c) => (
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
                          onValueChange={(v) => updateEntry(entry.id, 'glassColor', v)}
                        >
                          <SelectTrigger className="h-7 text-[11px] flex-1 [&>span]:text-center [&>span]:w-full">
                            <SelectValue placeholder="Glass" />
                          </SelectTrigger>
                          <SelectContent className="w-[320px] max-w-[90vw]">
                            {GLASS_COLORS.filter((c) => {
                              if (c.requiresLowE && entry.glassType !== 'Low-E Glass') return false
                              return true
                            }).map((c) => (
                              <SelectItem key={c.id} value={c.label} className="text-xs py-3 pl-3 pr-4 [&>span]:whitespace-normal">
                                <div className="flex items-start gap-2.5">
                                  <div
                                    className="w-6 h-6 rounded-full shrink-0 mt-0.5 border border-gray-300 shadow-inner"
                                    style={{ backgroundColor: c.color }}
                                  />
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="font-semibold text-xs">{c.label}</span>
                                    {c.note && <span className="text-[10px] text-muted-foreground leading-tight whitespace-normal">{c.note}</span>}
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={entry.glassType}
                          onValueChange={(v) => updateEntry(entry.id, 'glassType', v)}
                        >
                          <SelectTrigger className="h-7 text-[11px] flex-1 [&>span]:text-center [&>span]:w-full">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            {GLASS_TYPES.map((t) => (
                              <SelectItem key={t} value={t} className="text-xs py-2 text-center justify-center pl-4 pr-4">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Total + Save */}
      <div className="mt-4 pt-4 border-t flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Total Windows</span>
        <span className={cn(
          'text-lg font-bold',
          totalWindows > 0 ? 'text-primary' : 'text-muted-foreground'
        )}>
          {totalWindows}
        </span>
      </div>
      {totalWindows > 0 && onSave && (
        <Button
          className="w-full mt-4 h-10 rounded-xl text-sm font-semibold"
          onClick={onSave}
        >
          Save Selection
        </Button>
      )}
    </motion.div>
  )
}
