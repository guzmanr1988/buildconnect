import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Trash2, ShoppingCart, Send, Clock, Eye, Calendar, Star, User, Home, Wind, Droplets, Car, Tent, Thermometer, UtensilsCrossed, Bath, PanelTop, Hammer, PaintRoller, XCircle, Pencil, Plus, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useCartStore } from '@/stores/cart-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useAuthStore } from '@/stores/auth-store'
import { useCatalogStore } from '@/stores/catalog-store'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CartItem } from '@/stores/cart-store'

const SERVICE_ICONS: Record<string, React.ElementType> = {
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

const ICON_GRADIENTS: Record<string, string> = {
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

export function CartPage() {
  const navigate = useNavigate()
  const { items, idDocument, removeItem, updateItem, setIdDocument } = useCartStore()
  const { sentProjects } = useProjectsStore()
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)
  const requestCancellation = useProjectsStore((s) => s.requestCancellation)

  // leadId used as the unified key for cancellationRequestsByLead across
  // sentProject + MOCK_LEAD paths (L-XXXX shape, first 4 of UUID uppercased
  // for sentProjects). Vendor dashboard reads this same key.
  const leadIdFor = (projectId: string) => `L-${projectId.slice(0, 4).toUpperCase()}`
  const profile = useAuthStore((s) => s.profile)
  const SERVICE_CATALOG = useCatalogStore((s) => s.services)
  const [viewItem, setViewItem] = useState<CartItem | null>(null)
  const [idPreviewOpen, setIdPreviewOpen] = useState(false)
  // Cancellation-request dialog (ship #88 extended + ship #90 simplified per
  // kratos msg 1776671567585). Simplification: single Reason textarea instead
  // of dropdown + explanation combo. Bulletproof 5-layer open-and-close
  // pattern applied (analogue of ship #87 vendor Confirm bulletproof-close;
  // apollo surfaced T1 click-to-open no-op on #88 because early-return branch
  // at the empty-cart-with-sentProjects case didn't mount the Dialog in the
  // React tree — now the Dialog renders in all return branches).
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelDialogLeadId, setCancelDialogLeadId] = useState<string>('')
  const [cancelReason, setCancelReason] = useState<string>('')

  // Ship #242 — collapse the "Sent to Contractor" section when the list
  // gets long. Under the threshold, render inline as-before; at/above
  // threshold, render a clickable header that toggles expand/collapse.
  // Plain conditional render (no framer-motion height:auto) per the
  // measurement-chain-fragility lesson banked at #228 — the collapse
  // animation is skipped in favor of reliable re-expand.
  const SENT_COLLAPSE_THRESHOLD = 4
  const shouldCollapseSent = sentProjects.length >= SENT_COLLAPSE_THRESHOLD
  const [sentExpanded, setSentExpanded] = useState(false)

  const openCancelDialog = (leadId: string) => {
    console.log('[homeowner-cancel] OPEN_FIRED layer=sync leadId=', leadId)
    try {
      setCancelDialogLeadId(leadId)
      setCancelReason('')
      setCancelDialogOpen(true)
    } catch (err) {
      console.error('[homeowner-cancel] open-body error, proceeding anyway:', err)
    }
    // Layer 2 — microtask-queue fallback
    setTimeout(() => {
      console.log('[homeowner-cancel] OPEN_FIRED layer=setTimeout')
      setCancelDialogLeadId(leadId)
      setCancelDialogOpen(true)
    }, 0)
    // Layer 3 — next-frame fallback
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        console.log('[homeowner-cancel] OPEN_FIRED layer=raf')
        setCancelDialogOpen(true)
      })
    }
  }

  const cancelSubmitEnabled = cancelReason.trim().length > 0

  const submitCancellation = () => {
    if (!cancelSubmitEnabled) return
    console.log('[homeowner-cancel] SUBMIT_FIRED layer=sync')
    try {
      requestCancellation(cancelDialogLeadId, cancelReason.trim())
    } catch (err) {
      console.error('[homeowner-cancel] submit-body error, closing anyway:', err)
    } finally {
      // Layer 2 — guaranteed close
      setCancelDialogOpen(false)
    }
    // Layer 3 — microtask-queue fallback
    setTimeout(() => {
      console.log('[homeowner-cancel] SUBMIT_FIRED layer=setTimeout')
      setCancelDialogOpen(false)
    }, 0)
    // Layer 4 — next-frame fallback
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        console.log('[homeowner-cancel] SUBMIT_FIRED layer=raf')
        setCancelDialogOpen(false)
      })
    }
  }

  // Auto-generate project name: "Customer Name - Service Abbreviations"
  const serviceAbbrev: Record<string, string> = {
    windows_doors: 'W&D', roofing: 'Roofing', pool: 'Pool', driveways: 'Driveways',
    pergolas: 'Pergolas', air_conditioning: 'A/C', kitchen: 'Kitchen', bathroom: 'Bathroom',
    wall_paneling: 'Wall Paneling', garage: 'Interior Remodel', house_painting: 'Painting',
  }
  const autoProjectName = profile
    ? `${profile.name} - ${items.map(i => serviceAbbrev[i.serviceId] || i.serviceName).join(', ')}`
    : items.map(i => i.serviceName).join(', ')

  function getBusinessDaysSince(sentAt: string): number {
    const sent = new Date(sentAt)
    const now = new Date()
    let count = 0
    const current = new Date(sent)
    while (current < now) {
      current.setDate(current.getDate() + 1)
      const day = current.getDay()
      if (day !== 0 && day !== 6) count++
    }
    return count
  }

  function canCancel(sentAt: string): boolean {
    return getBusinessDaysSince(sentAt) <= 3
  }

  const handleSendToContractor = (item: typeof items[0]) => {
    // Store the item and homeowner info so the booking flow can reference it
    localStorage.setItem('buildconnect-pending-item', JSON.stringify(item))
    localStorage.setItem('buildconnect-homeowner-info', JSON.stringify({
      name: profile?.name || 'Homeowner',
      phone: profile?.phone || '—',
      email: profile?.email || '—',
      address: profile?.address || 'Address pending',
    }))
    if (idDocument) {
      localStorage.setItem('buildconnect-id-document', idDocument)
    }
    navigate('/home/vendor-compare')
  }

  // Dialog JSX extracted so it renders in every return branch — apollo T1
  // bug on #88 was that the empty-cart-with-sentProjects early return didn't
  // mount the Dialog, so the trigger button in THAT branch fired state-only
  // with no Dialog element to render. Hoisted variable referenced at end of
  // each return branch guarantees mount regardless of which branch runs.
  const cancelDialogJsx = (
    <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Request Project Cancellation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Tell us why — this goes to your contractor so they can review the request.
          </p>
          <div className="space-y-2">
            <label htmlFor="cancel-reason" className="text-xs font-semibold text-foreground">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter your reason for cancellation…"
              rows={4}
              className="text-sm resize-none"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCancelDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={!cancelSubmitEnabled}
            onClick={submitCancellation}
          >
            Submit Cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (items.length === 0 && sentProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <ShoppingCart className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold font-heading text-foreground">No projects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse services and add items to your project
          </p>
        </div>
        <Button onClick={() => navigate('/home')} className="gap-2">
          Browse Services
        </Button>
      </div>
    )
  }

  if (items.length === 0 && sentProjects.length > 0) {
    return (
      <div className="flex flex-col gap-8 max-w-3xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/home')}
          className="gap-2 text-muted-foreground hover:text-foreground -ml-2 self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to services
        </Button>
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold font-heading text-foreground">No projects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">All projects have been sent to contractors</p>
          <Button onClick={() => navigate('/home')} className="gap-2 mt-4">
            Add More Services
          </Button>
        </div>
        <div className="pt-4 border-t">
          {shouldCollapseSent ? (
            <button
              type="button"
              onClick={() => setSentExpanded((v) => !v)}
              className="w-full flex items-center justify-between gap-3 mb-4 text-left hover:bg-muted/40 rounded-lg -mx-2 px-2 py-1.5 transition"
              aria-expanded={sentExpanded}
            >
              <h2 className="text-lg font-semibold font-heading text-foreground flex items-center gap-2">
                Sent to Contractor
                <Badge variant="secondary" className="text-xs">{sentProjects.length}</Badge>
              </h2>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', sentExpanded && 'rotate-180')} />
            </button>
          ) : (
            <h2 className="text-lg font-semibold font-heading text-foreground mb-4">
              Sent to Contractor
            </h2>
          )}
          {/* Ship #243 — CSS grid-template-rows collapse animation (idiom
              0fr → 1fr with inner overflow-hidden). Library-free, bypasses
              the framer-motion measurement-chain-fragility class entirely
              per #228 lesson. Fully expanded when under-threshold via
              isSentOpen computed on the collapsed bool. */}
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              (!shouldCollapseSent || sentExpanded) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
          <div className="flex flex-col gap-3">
            {sentProjects.map((project) => {
              const Icon = SERVICE_ICONS[project.item.serviceId] || ShoppingCart
              const gradient = ICON_GRADIENTS[project.item.serviceId] || 'from-blue-400 to-blue-600'
              return (
                <div key={project.id} className="rounded-xl border bg-card p-4 shadow-md transition-all duration-200 ease-out pointer-fine:hover:shadow-lg pointer-fine:hover:-translate-y-0.5">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm shrink-0',
                      gradient
                    )}>
                      <Icon className="h-4 w-4 text-white" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground">{project.item.serviceName}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {project.status === 'sold' ? (
                          <>
                            <Send className="h-3 w-3 text-primary" />
                            <span className="text-xs text-primary font-medium">Project in Action</span>
                          </>
                        ) : project.status === 'approved' ? (
                          <>
                            <Send className="h-3 w-3 text-emerald-500" />
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Approved — Project is booked</span>
                          </>
                        ) : project.status === 'declined' ? (
                          <>
                            <XCircle className="h-3 w-3 text-red-500" />
                            <span className="text-xs text-red-600 dark:text-red-400 font-medium">Declined by contractor</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3 text-amber-500" />
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Pending approval by contractor</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {project.contractor && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground font-medium">{project.contractor.name}</span>
                        <span className="text-xs text-muted-foreground">— {project.contractor.company}</span>
                        <div className="flex items-center gap-0.5 ml-auto">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          <span className="text-xs text-muted-foreground">{project.contractor.rating}</span>
                        </div>
                      </div>
                      {project.booking && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{project.booking.date} at {project.booking.time}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(() => {
                    const leadId = leadIdFor(project.id)
                    const cReq = cancellationRequestsByLead[leadId]
                    const withinCancel = canCancel(project.sentAt)
                    // State machine:
                    //   no request + within-window → "Request Project Cancellation" (enabled, red)
                    //   no request + expired → "Cancellation period expired" (disabled, muted)
                    //   pending → "Cancellation requested — awaiting vendor" (disabled, muted)
                    //   approved → "Project cancelled" (disabled, muted)
                    //   denied + within-window → "Cancellation denied — request again" (enabled, red)
                    //   denied + expired → "Cancellation denied — period expired" (disabled, muted)
                    const isActionable =
                      (!cReq && withinCancel) || (cReq?.status === 'denied' && withinCancel)
                    let label: string
                    if (cReq?.status === 'pending') label = 'Cancellation requested — awaiting vendor'
                    else if (cReq?.status === 'approved') label = 'Project cancelled'
                    else if (cReq?.status === 'denied' && withinCancel) label = 'Cancellation denied — request again'
                    else if (cReq?.status === 'denied') label = 'Cancellation denied — period expired'
                    else if (!withinCancel) label = 'Cancellation period expired'
                    else label = 'Request Project Cancellation'
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'mt-3 w-full h-9 gap-2 rounded-xl text-xs font-semibold',
                          isActionable
                            ? 'text-destructive border-destructive/30 hover:bg-destructive/10'
                            : 'text-muted-foreground border-muted cursor-not-allowed opacity-50'
                        )}
                        disabled={!isActionable}
                        onClick={() => { if (isActionable) openCancelDialog(leadId) }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {label}
                      </Button>
                    )
                  })()}
                </div>
              )
            })}
          </div>
            </div>
          </div>
        </div>
        {cancelDialogJsx}
      </div>
    )
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

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
          Your Project
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? 'service' : 'services'} selected
        </p>
      </motion.div>

      {/* Auto-generated project name */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Project</p>
          <p className="text-sm font-semibold text-foreground">{autoProjectName}</p>
        </div>
      </motion.div>

      {/* Cart items */}
      <div className="flex flex-col gap-4">
        {items.map((item, i) => {
          const service = SERVICE_CATALOG.find((s) => s.id === item.serviceId)
          const Icon = SERVICE_ICONS[item.serviceId] || ShoppingCart
          const gradient = ICON_GRADIENTS[item.serviceId] || 'from-blue-400 to-blue-600'

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
              className="rounded-xl border bg-card p-5 shadow-md transition-all duration-200 ease-out pointer-fine:hover:shadow-lg pointer-fine:hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm shrink-0',
                    gradient
                  )}>
                    <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">
                      {item.serviceName}
                    </h3>
                    {item.address && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        <span className="font-medium">{item.address.label}:</span> {item.address.full}
                      </p>
                    )}
                    {/* Show selections */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(item.selections).map(([groupId, optionIds]) => {
                        const group = service?.optionGroups.find((g) => g.id === groupId)
                        return optionIds.map((optId) => {
                          const option = group?.options.find((o) => o.id === optId)
                          return (
                            <span
                              key={`${groupId}-${optId}`}
                              className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                            >
                              {option?.label || optId}
                            </span>
                          )
                        })
                      })}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {/* Per-item photo upload */}
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">Project Photos</p>
                {(item.itemPhotos || []).length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {(item.itemPhotos || []).map((photo, idx) => (
                      <div key={idx} className="relative group w-10 h-10 rounded overflow-hidden border">
                        <img src={photo} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, { itemPhotos: (item.itemPhotos || []).filter((_, i) => i !== idx) })}
                          className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {(item.itemPhotos || []).length < 20 && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-primary cursor-pointer hover:underline">
                    <Plus className="h-3 w-3" />
                    {(item.itemPhotos || []).length === 0 ? 'Add Photos' : `Add More (${(item.itemPhotos || []).length}/20)`}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = e.target.files
                        if (!files) return
                        const current = item.itemPhotos || []
                        Array.from(files).forEach((file) => {
                          if (current.length >= 20) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              const updated = [...(useCartStore.getState().items.find(i => i.id === item.id)?.itemPhotos || []), reader.result]
                              updateItem(item.id, { itemPhotos: updated.slice(0, 20) })
                            }
                          }
                          reader.readAsDataURL(file)
                        })
                        e.target.value = ''
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Per-item notes */}
              <div className="mt-2">
                <Textarea
                  placeholder="Notes for this project..."
                  value={item.itemNotes || ''}
                  onChange={(e) => updateItem(item.id, { itemNotes: e.target.value })}
                  rows={2}
                  className="text-xs"
                />
              </div>

              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="default"
                  className="flex-1 h-10 gap-2 rounded-xl text-sm font-semibold"
                  onClick={() => setViewItem(item)}
                >
                  <Eye className="h-4 w-4" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  className="flex-1 h-10 gap-2 rounded-xl text-sm font-semibold"
                  onClick={() => {
                    navigate(`/home/service/${item.serviceId}`, { state: { editItem: item } })
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="default"
                  className="flex-1 h-10 gap-2 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700"
                  disabled={!idDocument}
                  onClick={() => handleSendToContractor(item)}
                >
                  <Send className="h-4 w-4" />
                  {idDocument ? 'Send to Contractor' : 'Upload ID First'}
                </Button>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Upload ID */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <label className="text-sm font-medium text-foreground mb-2 block">
          Upload Your ID <span className="text-destructive">*</span>
        </label>
        <div className="rounded-xl border bg-card p-4">
          {idDocument ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setIdPreviewOpen(true)} className="w-16 h-16 rounded-lg overflow-hidden border shrink-0 hover:ring-2 hover:ring-primary transition cursor-pointer">
                <img src={idDocument} alt="ID Document" className="w-full h-full object-cover" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">ID Uploaded</p>
                <p className="text-xs text-muted-foreground">Click image to preview</p>
              </div>
              <label className="cursor-pointer inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition">
                Replace
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      if (typeof reader.result === 'string') setIdDocument(reader.result)
                    }
                    reader.readAsDataURL(file)
                    e.target.value = ''
                  }}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 py-4 rounded-lg border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition">
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">Upload ID Document</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    if (typeof reader.result === 'string') setIdDocument(reader.result)
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
                className="hidden"
              />
            </label>
          )}
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-3">
            A valid photo identification is required for the contractor to verify your identity and for any necessary paperwork related to your project. Your information is kept secure and confidential.
          </p>
        </div>
      </motion.div>

      {/* Sent Projects */}
      {sentProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="pt-6 border-t"
        >
          {shouldCollapseSent ? (
            <button
              type="button"
              onClick={() => setSentExpanded((v) => !v)}
              className="w-full flex items-center justify-between gap-3 mb-4 text-left hover:bg-muted/40 rounded-lg -mx-2 px-2 py-1.5 transition"
              aria-expanded={sentExpanded}
            >
              <h2 className="text-lg font-semibold font-heading text-foreground flex items-center gap-2">
                Sent to Contractor
                <Badge variant="secondary" className="text-xs">{sentProjects.length}</Badge>
              </h2>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', sentExpanded && 'rotate-180')} />
            </button>
          ) : (
            <h2 className="text-lg font-semibold font-heading text-foreground mb-4">
              Sent to Contractor
            </h2>
          )}
          {/* Ship #243 — CSS grid-template-rows collapse animation. See
              first branch for full rationale. */}
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              (!shouldCollapseSent || sentExpanded) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
          <div className="flex flex-col gap-3">
            {sentProjects.map((project) => {
              const Icon = SERVICE_ICONS[project.item.serviceId] || ShoppingCart
              const gradient = ICON_GRADIENTS[project.item.serviceId] || 'from-blue-400 to-blue-600'
              return (
                <div
                  key={project.id}
                  className="rounded-xl border bg-card p-4 shadow-md transition-all duration-200 ease-out pointer-fine:hover:shadow-lg pointer-fine:hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm shrink-0',
                      gradient
                    )}>
                      <Icon className="h-4 w-4 text-white" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground">
                        {project.item.serviceName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-amber-500" />
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          Pending approval by contractor
                        </span>
                      </div>
                    </div>
                  </div>
                  {project.contractor && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground font-medium">{project.contractor.name}</span>
                        <span className="text-xs text-muted-foreground">— {project.contractor.company}</span>
                        <div className="flex items-center gap-0.5 ml-auto">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          <span className="text-xs text-muted-foreground">{project.contractor.rating}</span>
                        </div>
                      </div>
                      {project.booking && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{project.booking.date} at {project.booking.time}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(() => {
                    const leadId = leadIdFor(project.id)
                    const cReq = cancellationRequestsByLead[leadId]
                    const withinCancel = canCancel(project.sentAt)
                    // State machine:
                    //   no request + within-window → "Request Project Cancellation" (enabled, red)
                    //   no request + expired → "Cancellation period expired" (disabled, muted)
                    //   pending → "Cancellation requested — awaiting vendor" (disabled, muted)
                    //   approved → "Project cancelled" (disabled, muted)
                    //   denied + within-window → "Cancellation denied — request again" (enabled, red)
                    //   denied + expired → "Cancellation denied — period expired" (disabled, muted)
                    const isActionable =
                      (!cReq && withinCancel) || (cReq?.status === 'denied' && withinCancel)
                    let label: string
                    if (cReq?.status === 'pending') label = 'Cancellation requested — awaiting vendor'
                    else if (cReq?.status === 'approved') label = 'Project cancelled'
                    else if (cReq?.status === 'denied' && withinCancel) label = 'Cancellation denied — request again'
                    else if (cReq?.status === 'denied') label = 'Cancellation denied — period expired'
                    else if (!withinCancel) label = 'Cancellation period expired'
                    else label = 'Request Project Cancellation'
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'mt-3 w-full h-9 gap-2 rounded-xl text-xs font-semibold',
                          isActionable
                            ? 'text-destructive border-destructive/30 hover:bg-destructive/10'
                            : 'text-muted-foreground border-muted cursor-not-allowed opacity-50'
                        )}
                        disabled={!isActionable}
                        onClick={() => { if (isActionable) openCancelDialog(leadId) }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {label}
                      </Button>
                    )
                  })()}
                </div>
              )
            })}
          </div>
            </div>
          </div>
        </motion.div>
      )}
      {/* View Summary Sheet */}
      <Sheet open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {viewItem && (() => {
            const service = SERVICE_CATALOG.find((s) => s.id === viewItem.serviceId)
            const Icon = SERVICE_ICONS[viewItem.serviceId] || ShoppingCart
            const gradient = ICON_GRADIENTS[viewItem.serviceId] || 'from-blue-400 to-blue-600'
            return (
              <div className="space-y-5">
                <SheetHeader>
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm', gradient)}>
                      <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
                    </div>
                    <SheetTitle className="font-heading">{viewItem.serviceName}</SheetTitle>
                  </div>
                </SheetHeader>

                <div className="space-y-4">
                  {viewItem.address && (
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                        Property
                      </p>
                      <p className="text-sm font-semibold text-foreground">{viewItem.address.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{viewItem.address.full}</p>
                    </div>
                  )}
                  <h3 className="text-sm font-semibold text-foreground">Project Summary</h3>
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                    {Object.entries(viewItem.selections)
                      .filter(([groupId]) => groupId !== 'spa_size' && groupId !== 'beach_size')
                      .map(([groupId, optionIds]) => {
                      const group = service?.optionGroups.find((g) => g.id === groupId)
                      const aq = viewItem.addonQuantities
                      // Derived Windows/Doors totals — shown inline on Products (windows/doors)
                      // AND Install-for (install_windows/install_doors) pills so the drawer
                      // matches the configurator pill pattern and keeps one source of truth.
                      const windowsTotal = viewItem.windowSelections?.reduce((s, w) => s + w.quantity, 0) ?? 0
                      const doorsTotal = viewItem.doorSelections?.reduce((s, d) => s + d.quantity, 0) ?? 0
                      return (
                        <div key={groupId}>
                          <p className="text-sm font-semibold text-foreground mb-1.5">
                            {group?.label || groupId.replace(/_/g, ' ')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {optionIds.map((optId) => {
                              const option = group?.options.find((o) => o.id === optId)
                              const label = option?.label || optId.replace(/_/g, ' ')
                              // Add quantity for add-ons that have them
                              let qty = ''
                              if (optId === 'led' && aq?.ledCount) qty = ` ×${aq.ledCount}`
                              if (optId === 'bubbler' && aq?.bubblerCount) qty = ` ×${aq.bubblerCount}`
                              if (optId === 'windows' && windowsTotal > 0) qty = ` ${windowsTotal}`
                              if (optId === 'doors' && doorsTotal > 0) qty = ` ${doorsTotal}`
                              if (optId === 'install_windows' && windowsTotal > 0) qty = ` ${windowsTotal}`
                              if (optId === 'install_doors' && doorsTotal > 0) qty = ` ${doorsTotal}`
                              if (optId === 'waterfall' && (aq?.laminarJets || aq?.waterfalls)) {
                                const parts = []
                                if (aq?.laminarJets) parts.push(`${aq.laminarJets} Jets`)
                                if (aq?.waterfalls) parts.push(`${aq.waterfalls} Falls`)
                                qty = ` (${parts.join(', ')})`
                              }
                              // Add spa/beach size
                              if (optId === 'spa') {
                                const spaSize = viewItem.selections['spa_size']?.[0]
                                if (spaSize) {
                                  const sizeOpt = service?.optionGroups.find(g => g.id === 'spa_size')?.options.find(o => o.id === spaSize)
                                  qty = ` — ${sizeOpt?.label || spaSize}`
                                }
                              }
                              if (optId === 'beach') {
                                const beachSize = viewItem.selections['beach_size']?.[0]
                                if (beachSize) {
                                  const sizeOpt = service?.optionGroups.find(g => g.id === 'beach_size')?.options.find(o => o.id === beachSize)
                                  qty = ` — ${sizeOpt?.label || beachSize}`
                                }
                              }
                              return (
                                <Badge key={optId} variant="secondary" className="text-sm px-3 py-1">
                                  {label}{qty}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Window selections */}
                  {viewItem.windowSelections && viewItem.windowSelections.length > 0 && (
                    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Windows</p>
                        <span className="text-sm font-bold text-primary">
                          Total: {viewItem.windowSelections.reduce((s, w) => s + w.quantity, 0)}
                        </span>
                      </div>
                      {viewItem.windowSelections.map((w) => (
                        <div key={w.id} className="rounded-lg bg-background border p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-base font-bold">{w.size.replace('x', '" × ')}"</span>
                            <span className="text-base font-bold text-primary">×{w.quantity}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="text-xs">{w.type}</Badge>
                            <Badge variant="outline" className="text-xs">Frame: {w.frameColor}</Badge>
                            <Badge variant="outline" className="text-xs">Glass: {w.glassColor}</Badge>
                            <Badge variant="outline" className="text-xs">{w.glassType}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Door selections */}
                  {viewItem.doorSelections && viewItem.doorSelections.length > 0 && (
                    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Doors</p>
                        <span className="text-sm font-bold text-primary">
                          Total: {viewItem.doorSelections.reduce((s, d) => s + d.quantity, 0)}
                        </span>
                      </div>
                      {viewItem.doorSelections.map((d) => (
                        <div key={d.id} className="rounded-lg bg-background border p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-base font-bold">{d.size.replace('x', '" × ')}"</span>
                            <span className="text-base font-bold text-primary">×{d.quantity}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="text-xs">{d.type}</Badge>
                            <Badge variant="outline" className="text-xs">Frame: {d.frameColor}</Badge>
                            <Badge variant="outline" className="text-xs">Glass: {d.glassColor}</Badge>
                            <Badge variant="outline" className="text-xs">{d.glassType}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </SheetContent>
      </Sheet>

      {/* ID Preview Dialog */}
      <Dialog open={idPreviewOpen} onOpenChange={setIdPreviewOpen}>
        <DialogContent className="sm:max-w-md p-2">
          {idDocument && (
            <img src={idDocument} alt="ID Document Preview" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {cancelDialogJsx}
    </div>
  )
}
