import { motion } from 'framer-motion'
import { Minus, Plus, PlusCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const DOOR_CATEGORIES = [
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

const DOOR_TYPES = [
  'Entry Door',
  'French Door',
  'Sliding Glass',
  'Impact Door',
  'Patio Door',
  'Pivot Door',
]

const FRAME_COLORS = [
  { label: 'White', color: '#ffffff' },
  { label: 'Bronze', color: '#8B6914' },
  { label: 'Black', color: '#1a1a1a' },
]
const GLASS_COLORS = [
  { id: 'grey-white', label: 'Grey-White', note: 'Private Glass - front doors or bathroom' },
  { id: 'clear-white', label: 'Clear-White', note: 'Private but lighter look' },
  { id: 'clear', label: 'Clear', note: '' },
  { id: 'gray', label: 'Gray', note: '' },
  { id: 'green', label: 'Green', note: 'Low-E Color' },
]
const GLASS_TYPES = ['Impact Glass', 'Low-E Glass']

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
  function addEntry(size: string, type: string = 'Entry Door') {
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
        {DOOR_CATEGORIES.map((category) => (
          <div key={category.label} className="flex flex-col">
            <div className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 pt-3 pb-1">
              {category.label}
            </div>
            {category.sizes.map((size) => {
              const entries = getEntries(size)
              const hasEntries = entries.length > 0
              return (
                <div key={size} className="flex flex-col">
                  {/* Size row - add button */}
                  <div className={cn(
                    'flex items-center justify-between px-2 py-2 rounded-lg min-h-[44px]',
                    hasEntries && 'bg-primary/5'
                  )}>
                    <span className={cn(
                      'text-xl font-semibold',
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
                          onValueChange={(v) => updateEntry(entry.id, 'type', v ?? '')}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1 text-center [&>span]:text-center [&>span]:w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DOOR_TYPES.map((type) => (
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
                      {/* Row 2: Frame Color + Glass Color + Glass Type */}
                      <div className="flex items-center gap-2">
                        <Select
                          value={entry.frameColor}
                          onValueChange={(v) => updateEntry(entry.id, 'frameColor', v ?? '')}
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
                          onValueChange={(v) => updateEntry(entry.id, 'glassColor', v ?? '')}
                        >
                          <SelectTrigger className="h-7 text-[11px] flex-1 [&>span]:text-center [&>span]:w-full">
                            <SelectValue placeholder="Glass" />
                          </SelectTrigger>
                          <SelectContent className="min-w-[280px]">
                            {GLASS_COLORS.map((c) => (
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
        >
          Save Selection
        </Button>
      )}
    </motion.div>
  )
}
