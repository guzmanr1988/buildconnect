import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, Plus, Pencil, Check, X, ChevronsUpDown, Package } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { SERVICE_CATALOG } from '@/lib/constants'
import { MOCK_CATALOG } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { CatalogItem, CatalogUnit, ServiceCategory } from '@/types'

const VENDOR_ID = 'v-1'

const UNIT_LABELS: Record<CatalogUnit, string> = {
  per_sq_ft: '/ sq ft',
  per_unit: '/ unit',
  per_linear_ft: '/ lin ft',
  flat_rate: 'flat rate',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

export default function VendorCatalog() {
  const [items, setItems] = useState<CatalogItem[]>(() => MOCK_CATALOG.filter((c) => c.vendor_id === VENDOR_ID))
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [openSections, setOpenSections] = useState<string[]>([])
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addCategory, setAddCategory] = useState<ServiceCategory | ''>('')

  // New item form state
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newUnit, setNewUnit] = useState<CatalogUnit>('per_sq_ft')
  const [newPrice, setNewPrice] = useState('')

  const categories = SERVICE_CATALOG.map((s) => ({ id: s.id, name: s.name }))

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    )
  }, [items, search])

  const itemsByCategory = useMemo(() => {
    const map: Record<string, CatalogItem[]> = {}
    for (const cat of categories) {
      map[cat.id] = filteredItems.filter((i) => i.category === cat.id)
    }
    return map
  }, [filteredItems, categories])

  const toggleAll = (expand: boolean) => {
    setOpenSections(expand ? categories.map((c) => c.id) : [])
  }

  const startEdit = (item: CatalogItem) => {
    setEditingId(item.id)
    setEditPrice(item.price.toString())
  }

  const saveEdit = (id: string) => {
    const price = parseFloat(editPrice)
    if (!isNaN(price) && price >= 0) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, price } : i)))
    }
    setEditingId(null)
  }

  const toggleActive = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, active: !i.active } : i)))
  }

  const openAddDialog = (categoryId: ServiceCategory) => {
    setAddCategory(categoryId)
    setNewName('')
    setNewDescription('')
    setNewUnit('per_sq_ft')
    setNewPrice('')
    setAddDialogOpen(true)
  }

  const addItem = () => {
    if (!addCategory || !newName.trim() || !newPrice.trim()) return
    const price = parseFloat(newPrice)
    if (isNaN(price)) return

    const newItem: CatalogItem = {
      id: `ci-new-${Date.now()}`,
      vendor_id: VENDOR_ID,
      category: addCategory as ServiceCategory,
      name: newName.trim(),
      description: newDescription.trim(),
      unit: newUnit,
      price,
      active: true,
      multiplier: 1.0,
    }
    setItems((prev) => [...prev, newItem])
    setAddDialogOpen(false)
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  }
  const item_ = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Products & Pricing" description="Manage your catalog items and pricing">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
            <ChevronsUpDown className="h-3.5 w-3.5 mr-1" /> Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
            Collapse All
          </Button>
        </div>
      </PageHeader>

      {/* Search */}
      <motion.div variants={item_}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items by name, description, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </motion.div>

      {/* Category Accordions */}
      <motion.div variants={item_}>
        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
          {categories.map((cat) => {
            const catItems = itemsByCategory[cat.id] || []
            return (
              <AccordionItem key={cat.id} value={cat.id} className="border rounded-xl mb-3 px-1 overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="font-heading font-semibold">{cat.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-4">
                  {catItems.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground mb-3">No items in this category</p>
                      <Button size="sm" variant="outline" onClick={() => openAddDialog(cat.id as ServiceCategory)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="font-semibold">Name</TableHead>
                              <TableHead className="font-semibold hidden sm:table-cell">Description</TableHead>
                              <TableHead className="font-semibold">Unit</TableHead>
                              <TableHead className="font-semibold text-right">Price</TableHead>
                              <TableHead className="font-semibold text-center">Active</TableHead>
                              <TableHead className="font-semibold text-center w-20">Edit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {catItems.map((ci) => (
                              <TableRow key={ci.id} className={cn(!ci.active && 'opacity-50')}>
                                <TableCell className="font-medium">{ci.name}</TableCell>
                                <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">{ci.description}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs whitespace-nowrap">
                                    {UNIT_LABELS[ci.unit]}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {editingId === ci.id ? (
                                    <div className="flex items-center gap-1 justify-end">
                                      <span className="text-sm text-muted-foreground">$</span>
                                      <Input
                                        type="number"
                                        value={editPrice}
                                        onChange={(e) => setEditPrice(e.target.value)}
                                        className="w-24 h-8 text-right text-sm"
                                        step="0.01"
                                        min="0"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveEdit(ci.id)
                                          if (e.key === 'Escape') setEditingId(null)
                                        }}
                                      />
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(ci.id)}>
                                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                        <X className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="font-semibold">{fmt(ci.price)}</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Switch
                                    checked={ci.active}
                                    onCheckedChange={() => toggleActive(ci.id)}
                                    className="mx-auto"
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  {editingId !== ci.id && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(ci)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openAddDialog(cat.id as ServiceCategory)} className="ml-1">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                      </Button>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </motion.div>

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Catalog Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={categories.find((c) => c.id === addCategory)?.name || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Architectural Shingle" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="e.g. GAF Timberline HDZ" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={newUnit} onValueChange={(v) => setNewUnit(v as CatalogUnit)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_sq_ft">Per sq ft</SelectItem>
                    <SelectItem value="per_unit">Per unit</SelectItem>
                    <SelectItem value="per_linear_ft">Per linear ft</SelectItem>
                    <SelectItem value="flat_rate">Flat rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={addItem} disabled={!newName.trim() || !newPrice.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
