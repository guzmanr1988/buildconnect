import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Package, ChevronDown, ChevronUp, ChevronRight, User, MapPin, Calendar,
  Download, ZoomIn, Phone, CheckCircle2, RotateCcw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { StatusBadge } from '@/components/shared/status-badge'
import { resolveLeadStatusLabel } from '@/lib/lead-status-label'
import { PRICE_LINE_ITEM_PRESETS } from '@/lib/price-line-item-presets'
import { windowCatalogUnitPrice, doorCatalogUnitPrice, garageDoorCatalogUnitPrice, computeWindowsDoorsCatalogTotal } from '@/lib/configurator-catalog-price'
import { useVendorCatalogStore } from '@/stores/vendor-catalog-store'
import { EmptyState } from '@/components/shared/empty-state'
import { ReschedulePickerDialog } from '@/components/shared/reschedule-picker-dialog'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useProjectsStore } from '@/stores/projects-store'
import { useCatalogStore } from '@/stores/catalog-store'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
import { useAuthStore } from '@/stores/auth-store'
import { mapsUrl, telHref } from '@/lib/contact-links'
import { deriveInitials } from '@/lib/initials'
import { cn } from '@/lib/utils'
import { useAssigneeMap } from '@/lib/hooks/use-assignee-map'
import type { Lead } from '@/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function LeadInbox() {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const accountRepIdByLead = useProjectsStore((s) => s.accountRepIdByLead)
  const repAcceptanceByLead = useProjectsStore((s) => s.repAcceptanceByLead)
  const acceptRepLead = useProjectsStore((s) => s.acceptRepLead)
  const markRepRescheduleRequested = useProjectsStore((s) => s.markRepRescheduleRequested)
  const requestReschedule = useProjectsStore((s) => s.requestReschedule)
  const getVendorPrice = useVendorCatalogStore((s) => s.getPrice)
  const { vendorId: VENDOR_ID, isMock } = useVendorScope()
  const profile = useAuthStore((s) => s.profile)

  // Ship #214 — strict scope by contractor.vendor_id (with company
  // fallback for pre-#165 entries that pre-date the FK). Vendor
  // resolution lives in useResolvedVendor (ship #263 extraction);
  // the predicate stays here because it intentionally diverges from
  // dashboard.tsx (which is permissive per #223).
  const vendor = useResolvedVendor()

  // Ship #212 (Rodolfo-direct P0 diagnostic) — leads-empty arc.
  // Log vendor-side read snapshot on every sentProjects mutation so we
  // can observe whether the write from /home/booking/confirmed lands
  // in the store as the vendor sees it. VITE_DEMO_MODE-gated. Fires
  // on length change (write or hydrate), not every render.
  useEffect(() => {
    if ((import.meta.env.VITE_DEMO_MODE ?? 'true') === 'false') return
    // eslint-disable-next-line no-console
    console.log('[#212 leads-diag] lead-inbox READ snapshot:', {
      current_VENDOR_ID: VENDOR_ID,
      resolved_vendor_id: vendor?.id,
      resolved_vendor_company: vendor?.company,
      isMock,
      sentProjects_length: sentProjects.length,
      entries: sentProjects.slice(0, 10).map((p) => ({
        id: p.id,
        itemId: p.item?.id,
        serviceName: p.item?.serviceName,
        contractor_vendor_id: p.contractor?.vendor_id,
        contractor_company: p.contractor?.company,
        status: p.status,
        sentAt: p.sentAt,
      })),
    })
  }, [sentProjects, VENDOR_ID, isMock, vendor?.id, vendor?.company])
  // Ship #250 — effective-fixture hook honors the demoDataHidden flag.
  const effectiveMockLeads = useEffectiveMockLeads()
  const mockLeads = useMemo(() => {
    if (!isMock) return []
    const vendorScoped = effectiveMockLeads.filter((l) => l.vendor_id === VENDOR_ID)
    if (profile?.role === 'account_rep') {
      return vendorScoped.filter(
        (l) => l.account_rep_id === profile.id || accountRepIdByLead[l.id] === profile.id
      )
    }
    return vendorScoped
  }, [VENDOR_ID, isMock, effectiveMockLeads, profile?.role, profile?.id, accountRepIdByLead])

  const statusMap: Record<string, Lead['status']> = { pending: 'pending', approved: 'confirmed', declined: 'rejected', sold: 'completed' }
  const homeownerLeads: Lead[] = useMemo(() => sentProjects
    .filter((p) => {
      if (!vendor) return false
      if (p.contractor?.vendor_id) { if (p.contractor.vendor_id !== vendor.id) return false }
      else if (p.contractor?.company !== vendor.company) return false
      // Rep-scope: account_rep sees only sentProjects assigned to them
      if (profile?.role === 'account_rep' && profile.id) {
        const leadId = `L-${p.id.slice(0, 4).toUpperCase()}`
        return accountRepIdByLead[leadId] === profile.id
      }
      return true
    })
    .map((p) => ({
      id: `L-${p.id.slice(0, 4).toUpperCase()}`,
      homeowner_id: 'ho-current',
      vendor_id: VENDOR_ID,
      homeowner_name: p.homeowner?.name || 'New Customer',
      project: p.item.serviceName + ' — ' + Object.values(p.item.selections).flat().map((s) => s.replace(/_/g, ' ')).join(', '),
      status: (statusMap[p.status] || 'pending') as Lead['status'],
      // Ship #338 — bridge sp.saleAmount → lead.value.
      // Ship #349 — pre-sale projects compute headline from catalog-first
      // item totals (sum of all card prices). Sold projects keep saleAmount
      // (locked at sale time, includes Upsale line).
      value: p.saleAmount ?? (() => {
        const lineItems = (p.priceLineItems && p.priceLineItems.length > 0)
          ? p.priceLineItems
          : (PRICE_LINE_ITEM_PRESETS[p.item.serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS] ?? [])
        if (p.item.serviceId === 'windows_doors') {
          return computeWindowsDoorsCatalogTotal(p.item as any, lineItems, getVendorPrice)
        }
        return lineItems.reduce((s, l) => s + l.amount, 0)
      })(),
      address: p.homeowner?.address || 'Pending site visit',
      phone: p.homeowner?.phone || '—',
      email: p.homeowner?.email || '—',
      sq_ft: 0,
      service_category: p.item.serviceId as any,
      permit_choice: Object.values(p.item.selections).flat().includes('permit'),
      financing: Object.values(p.item.selections).flat().includes('financed'),
      pack_items: p.item.selections,
      slot: p.sentAt,
      received_at: p.sentAt,
    })), [sentProjects, VENDOR_ID, vendor?.id, vendor?.company, getVendorPrice])

  const leads = useMemo(() => [...homeownerLeads, ...mockLeads], [mockLeads, homeownerLeads])
  const assigneeMap = useAssigneeMap(VENDOR_ID)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [idPreview, setIdPreview] = useState<{ dataUrl: string; name: string } | null>(null)
  const [repRescheduleLeadId, setRepRescheduleLeadId] = useState<string | null>(null)

  // Ship #187 (Rodolfo-direct 2026-04-21) — group /vendor/leads by
  // service_category. Empty categories hidden (vendors who don't
  // service pool work shouldn't see an empty Pool section adding
  // noise); multi-category vendors see all relevant category sections.
  // All sections open by default so the vendor sees everything at
  // once on arrival; click header to collapse. Within-category order
  // preserves the existing leads-array sequence (homeownerLeads-first,
  // then mockLeads, which matches the prior flat-list ordering).
  const services = useCatalogStore((s) => s.services)
  const categoryLabelFor = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of services) map[s.id] = s.name
    return (id: string) => map[id] ?? id.replace(/_/g, ' ')
  }, [services])

  const groupedLeads = useMemo(() => {
    const groups: Record<string, Lead[]> = {}
    for (const l of leads) {
      const cat = (l.service_category as unknown as string) ?? 'uncategorized'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(l)
    }
    return groups
  }, [leads])

  // Ordered list of category IDs with leads. Sort follows SERVICE_CATALOG
  // ordering so vendor sees categories in the same order as /home +
  // /admin/products. Unknown categories (not in catalog) tail the list.
  const orderedCategoryIds = useMemo(() => {
    const present = Object.keys(groupedLeads)
    const catalogOrder: string[] = services.map((s) => s.id)
    const known = catalogOrder.filter((id) => present.includes(id))
    const unknown = present.filter((id) => !catalogOrder.includes(id))
    return [...known, ...unknown]
  }, [groupedLeads, services])

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const toggleCategory = (id: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  function downloadIdDocument(dataUrl: string, customerName: string) {
    const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${customerName.replace(/\s+/g, '_')}_ID.${ext}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  } satisfies Variants
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  } satisfies Variants


  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 overflow-x-hidden max-w-full">
      <PageHeader title="Projects" description={`${leads.length} customer projects`}>
        <Badge variant="secondary" className="text-xs">{leads.filter((l) => l.status === 'confirmed').length} active</Badge>
      </PageHeader>

      {leads.length === 0 ? (
        <EmptyState icon={Package} title="No projects yet" description="Customer projects will appear here once leads are confirmed." />
      ) : (
        <div className="grid gap-6">
          {orderedCategoryIds.map((categoryId) => {
            const categoryLeads = groupedLeads[categoryId]
            const collapsed = collapsedCategories.has(categoryId)
            return (
              <section key={categoryId} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleCategory(categoryId)}
                  aria-expanded={!collapsed}
                  aria-controls={`lead-category-panel-${categoryId}`}
                  className="flex items-center gap-2 w-full text-left group"
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                      !collapsed && 'rotate-90',
                    )}
                    aria-hidden="true"
                  />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
                    {categoryLabelFor(categoryId)}
                  </h2>
                  <Badge variant="secondary" className="text-[11px]">
                    {categoryLeads.length}
                  </Badge>
                  <div className="flex-1 border-t border-border/60 ml-2" aria-hidden="true" />
                </button>
                {/* Ship #228 — replaced AnimatePresence + motion.div
                    height-auto animation with plain conditional render.
                    Framer-motion's height:auto re-measurement on
                    re-entry (exit → entry cycle) was failing when the
                    panel contained nested motion.divs (per-lead cards),
                    leaving the panel stuck at exit state (height:0,
                    opacity:0) on re-expand — visible as 'roofing
                    disappears and doesn't come back without refresh'
                    per Rodolfo report. Plain conditional render is
                    instant (no collapse animation) but state-correct.
                    Trade-off: losing the smooth height-animate on
                    collapse in exchange for reliable re-expand. Per-
                    lead inner expand animation preserved (that one
                    works). */}
                {!collapsed && (
                  <div
                    id={`lead-category-panel-${categoryId}`}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-4">
                      {categoryLeads.map((lead) => {
            const isExpanded = expandedId === lead.id
            const packEntries = Object.entries(lead.pack_items)

            return (
              <motion.div key={lead.id} variants={item}>
                {/* Ship #292 — drop inline shadow-sm/hover:shadow-md/transition
                    overrides that masked the platform-wide floating-card
                    default applied at the Card primitive level (#245).
                    Card primitive provides shadow-md + transition-all +
                    pointer-fine:hover:shadow-lg + pointer-fine:hover:
                    -translate-y-0.5; per Rodolfo "same floating effect
                    same rules" directive, no override needed. Inner
                    nested Card (line 306) is intentionally flat per
                    banked nested-inner-card flat-stance — left as-is. */}
                <Card className="rounded-xl">
                  {/* Header - always visible */}
                  <button
                    type="button"
                    className="w-full text-left"
                    aria-expanded={isExpanded}
                    aria-controls={`lead-inbox-panel-${lead.id}`}
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <AvatarInitials
                            initials={deriveInitials(lead.homeowner_name)}
                            color="#64748b"
                            size="md"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{lead.homeowner_name}</p>
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 break-words">{lead.project}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <StatusBadge status={lead.status} label={resolveLeadStatusLabel(lead)} />
                              {profile?.role === 'account_rep' && repAcceptanceByLead[lead.id] === 'pending' && (
                                <Badge className="text-[10px] bg-primary text-primary-foreground animate-pulse">New</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">{fmtDate(lead.received_at)}</span>
                              {profile?.role !== 'account_rep' && (() => {
                                const a = assigneeMap[lead.id]
                                return a ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    {a.name}
                                    {a.isSelf && <span className="text-primary font-medium">you</span>}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50">Unassigned</span>
                                )
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold">{fmt(lead.value)}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </button>

                  {/* Expanded detail — AnimatePresence + motion.div wraps the
                      inline expansion so open/close animates smoothly (ship
                      #99 pattern). Reduced-motion respected via global
                      MotionConfig at App root. */}
                  <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="lead-inbox-expanded"
                      id={`lead-inbox-panel-${lead.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                    <div className="px-4 sm:px-5 pb-5 space-y-4 border-t overflow-hidden">
                      {/* Customer details */}
                      <div className="flex flex-wrap gap-4 pt-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          <a href={mapsUrl(lead.address)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline transition-colors">{lead.address}</a>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          <span>{lead.phone}</span>
                          <a href={telHref(lead.phone)} className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label={`Call ${lead.homeowner_name}`}>
                            <Phone className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{lead.sq_ft.toLocaleString()} sq ft</span>
                        </div>
                      </div>

                      {/* Project items with selections */}
                      <Card className="rounded-lg border bg-muted/30">
                        <CardContent className="p-3 space-y-3">
                          <h4 className="text-sm font-semibold text-foreground">Project Details</h4>
                          {packEntries.map(([category, selections]) => (
                            <div key={category} className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-muted-foreground capitalize min-w-[70px]">
                                {category.replace(/_/g, ' ')}:
                              </span>
                              {selections.map((selection) => (
                                <Badge key={selection} variant="secondary" className="text-xs capitalize">
                                  {selection.replace(/_/g, ' ')}
                                </Badge>
                              ))}
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      {/* Window & Door Configurator with Pricing */}
                      {(() => {
                        const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id)
                        if (!sp) return null
                        const resolvedLineItems = sp.priceLineItems && sp.priceLineItems.length > 0
                          ? sp.priceLineItems
                          : PRICE_LINE_ITEM_PRESETS[sp.item.serviceId as keyof typeof PRICE_LINE_ITEM_PRESETS]
                        return (
                          <>
                            {sp.item.windowSelections && sp.item.windowSelections.length > 0 && (() => {
                              const wdProductLine = resolvedLineItems?.find((l: any) => l.id === 'wd-product')
                              const totalWQty = sp.item.windowSelections!.reduce((s, w) => s + w.quantity, 0)
                              const totalDQty = sp.item.doorSelections?.reduce((s, d) => s + d.quantity, 0) ?? 0
                              const totalUnits = totalWQty + totalDQty
                              return (
                                <div className="rounded-xl border bg-background p-4 space-y-3">
                                  <h4 className="text-sm font-semibold text-foreground">Windows Selected</h4>
                                  <div className="flex flex-col gap-1">
                                    {sp.item.windowSelections!.map((w) => {
                                      const unitPrice = windowCatalogUnitPrice(w, getVendorPrice, sp.item.serviceId)
                                      const hasCatalogPrice = unitPrice > 0
                                      const lineTotal = hasCatalogPrice
                                        ? unitPrice * w.quantity
                                        : (wdProductLine && totalUnits > 0 ? Math.round(wdProductLine.amount / totalUnits * w.quantity) : null)
                                      return (
                                        <div key={w.id} className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-primary/5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-base font-semibold text-foreground">
                                              {w.size.replace('x', '" × ')}"
                                            </span>
                                            {hasCatalogPrice ? (
                                              <div className="flex items-center gap-1 text-sm">
                                                <span className="text-muted-foreground">{w.quantity}</span>
                                                <span className="text-muted-foreground">×</span>
                                                <span className="font-medium">{fmt(unitPrice)}</span>
                                                <span className="text-muted-foreground">=</span>
                                                <span className="font-bold text-primary">{fmt(unitPrice * w.quantity)}</span>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">×{w.quantity}</span>
                                                {lineTotal !== null && <span className="text-sm font-bold text-primary">{fmt(lineTotal)}</span>}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            <Badge variant="secondary" className="text-[10px]">{w.type}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{w.frameColor}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{w.glassColor}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{w.glassType}</Badge>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                  <div className="pt-2 border-t flex items-center justify-between">
                                    <span className="text-sm font-medium text-muted-foreground">Total Windows</span>
                                    <span className="text-lg font-bold text-primary">{totalWQty}</span>
                                  </div>
                                </div>
                              )
                            })()}
                            {sp.item.doorSelections && sp.item.doorSelections.length > 0 && (() => {
                              const wdProductLine = resolvedLineItems?.find((l: any) => l.id === 'wd-product')
                              const totalWQty2 = sp.item.windowSelections?.reduce((s, w) => s + w.quantity, 0) ?? 0
                              const totalDQty = sp.item.doorSelections!.reduce((s, d) => s + d.quantity, 0)
                              const totalUnits2 = totalWQty2 + totalDQty
                              return (
                                <div className="rounded-xl border bg-background p-4 space-y-3">
                                  <h4 className="text-sm font-semibold text-foreground">Doors Selected</h4>
                                  <div className="flex flex-col gap-1">
                                    {sp.item.doorSelections!.map((d) => {
                                      const unitPrice = doorCatalogUnitPrice(d, getVendorPrice, sp.item.serviceId)
                                      const hasCatalogPrice = unitPrice > 0
                                      const lineTotal = hasCatalogPrice
                                        ? unitPrice * d.quantity
                                        : (wdProductLine && totalUnits2 > 0 ? Math.round(wdProductLine.amount / totalUnits2 * d.quantity) : null)
                                      return (
                                        <div key={d.id} className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-primary/5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-base font-semibold text-foreground">
                                              {d.size.replace('x', '" × ')}"
                                            </span>
                                            {hasCatalogPrice ? (
                                              <div className="flex items-center gap-1 text-sm">
                                                <span className="text-muted-foreground">{d.quantity}</span>
                                                <span className="text-muted-foreground">×</span>
                                                <span className="font-medium">{fmt(unitPrice)}</span>
                                                <span className="text-muted-foreground">=</span>
                                                <span className="font-bold text-primary">{fmt(unitPrice * d.quantity)}</span>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">×{d.quantity}</span>
                                                {lineTotal !== null && <span className="text-sm font-bold text-primary">{fmt(lineTotal)}</span>}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            <Badge variant="secondary" className="text-[10px]">{d.type}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{d.frameColor}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{d.glassColor}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{d.glassType}</Badge>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                  <div className="pt-2 border-t flex items-center justify-between">
                                    <span className="text-sm font-medium text-muted-foreground">Total Doors</span>
                                    <span className="text-lg font-bold text-primary">{totalDQty}</span>
                                  </div>
                                </div>
                              )
                            })()}
                            {/* Garage Door */}
                            {sp.item.garageDoorSelection && sp.item.garageDoorSelection.type && (
                              <div className="rounded-xl border bg-background p-4 space-y-3">
                                <h4 className="text-sm font-semibold text-foreground">Garage Door</h4>
                                <div className="rounded-lg bg-primary/5 px-3 py-2.5">
                                  <div className="flex flex-wrap gap-1.5">
                                    <Badge variant="secondary" className="text-[10px]">
                                      {sp.item.garageDoorSelection.type === 'single_garage' ? 'Single Garage Door' : 'Double Garage Door'}
                                    </Badge>
                                    {sp.item.garageDoorSelection.type === 'double_garage' && sp.item.garageDoorSelection.size && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {sp.item.garageDoorSelection.size === 'gd_4_panels' ? '4 Panels' : '5 Panels'}
                                      </Badge>
                                    )}
                                    {sp.item.garageDoorSelection.color && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {sp.item.garageDoorSelection.color.charAt(0).toUpperCase() + sp.item.garageDoorSelection.color.slice(1)}
                                      </Badge>
                                    )}
                                    {sp.item.garageDoorSelection.glass && (
                                      <Badge variant="outline" className="text-[10px]">
                                        Glass: {sp.item.garageDoorSelection.glass.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Garage Doors — price card */}
                            {sp.item.garageDoorSelection && sp.item.garageDoorSelection.type && (() => {
                              const gd = sp.item.garageDoorSelection
                              const garageLine = resolvedLineItems?.find((l: any) => l.id === 'wd-garage-door')
                              const catalogUnit = garageDoorCatalogUnitPrice(gd as any, getVendorPrice, sp.item.serviceId)
                              const hasCatalog = catalogUnit > 0
                              const displayPrice = hasCatalog ? catalogUnit : (garageLine?.amount ?? null)
                              if (displayPrice === null) return null
                              return (
                                <div className="rounded-xl border bg-background p-4 space-y-3">
                                  <h4 className="text-sm font-semibold text-foreground">Garage Doors</h4>
                                  <div className="flex flex-col gap-1">
                                    <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-primary/5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-base font-semibold text-foreground">
                                          {gd.type === 'single_garage' ? 'Single Garage Door' : 'Double Garage Door'}
                                        </span>
                                        {hasCatalog ? (
                                          <div className="flex items-center gap-1 text-sm">
                                            <span className="text-muted-foreground">1 ×</span>
                                            <span className="font-medium">{fmt(catalogUnit)}</span>
                                            <span className="text-muted-foreground">=</span>
                                            <span className="font-bold text-primary">{fmt(catalogUnit)}</span>
                                          </div>
                                        ) : (
                                          <span className="text-sm font-bold text-primary">{fmt(displayPrice)}</span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {gd.type === 'double_garage' && gd.size && (
                                          <Badge variant="outline" className="text-[10px]">
                                            {gd.size === 'gd_4_panels' ? '4 Panels' : '5 Panels'}
                                          </Badge>
                                        )}
                                        {gd.color && (
                                          <Badge variant="outline" className="text-[10px]">
                                            {gd.color.charAt(0).toUpperCase() + gd.color.slice(1)}
                                          </Badge>
                                        )}
                                        {gd.glass && (
                                          <Badge variant="outline" className="text-[10px]">
                                            Glass: {gd.glass.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('-')}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                            {/* Install Windows — price card */}
                            {sp.item.windowSelections && sp.item.windowSelections.length > 0 && (() => {
                              const installLine = resolvedLineItems?.find((l: any) => l.id === 'wd-install-windows')
                              const totalQty = sp.item.windowSelections!.reduce((sum, w) => sum + w.quantity, 0)
                              const catalogUnit = getVendorPrice(sp.item.serviceId, 'install_windows')
                              const hasCatalog = catalogUnit > 0
                              const fallbackTotal = installLine?.amount ?? null
                              if (!hasCatalog && fallbackTotal === null) return null
                              const displayTotal = hasCatalog ? catalogUnit * totalQty : fallbackTotal!
                              return (
                                <div className="rounded-xl border bg-background p-4 space-y-3">
                                  <h4 className="text-sm font-semibold text-foreground">Install Windows</h4>
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-primary/5">
                                      <span className="text-sm text-foreground">Installation labor</span>
                                      {hasCatalog ? (
                                        <div className="flex items-center gap-1 text-sm">
                                          <span className="text-muted-foreground">{totalQty} ×</span>
                                          <span className="font-medium">{fmt(catalogUnit)}</span>
                                          <span className="text-muted-foreground">=</span>
                                          <span className="font-bold text-primary">{fmt(displayTotal)}</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3">
                                          <span className="text-sm text-muted-foreground">×{totalQty}</span>
                                          <span className="text-sm font-bold text-primary">{fmt(displayTotal)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                            {/* Install Doors — price card */}
                            {sp.item.doorSelections && sp.item.doorSelections.length > 0 && (() => {
                              const installLine = resolvedLineItems?.find((l: any) => l.id === 'wd-install-doors')
                              const totalQty = sp.item.doorSelections!.reduce((sum, d) => sum + d.quantity, 0)
                              const catalogUnit = getVendorPrice(sp.item.serviceId, 'install_doors')
                              const hasCatalog = catalogUnit > 0
                              const fallbackTotal = installLine?.amount ?? null
                              if (!hasCatalog && fallbackTotal === null) return null
                              const displayTotal = hasCatalog ? catalogUnit * totalQty : fallbackTotal!
                              return (
                                <div className="rounded-xl border bg-background p-4 space-y-3">
                                  <h4 className="text-sm font-semibold text-foreground">Install Doors</h4>
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-primary/5">
                                      <span className="text-sm text-foreground">Installation labor</span>
                                      {hasCatalog ? (
                                        <div className="flex items-center gap-1 text-sm">
                                          <span className="text-muted-foreground">{totalQty} ×</span>
                                          <span className="font-medium">{fmt(catalogUnit)}</span>
                                          <span className="text-muted-foreground">=</span>
                                          <span className="font-bold text-primary">{fmt(displayTotal)}</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3">
                                          <span className="text-sm text-muted-foreground">×{totalQty}</span>
                                          <span className="text-sm font-bold text-primary">{fmt(displayTotal)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                            {/* Permit — single line price card */}
                            {(() => {
                              const permitLine = resolvedLineItems?.find((l: any) => l.label?.toLowerCase().includes('permit'))
                              const catalogPrice = getVendorPrice(sp.item.serviceId, 'permit')
                              const hasCatalog = catalogPrice > 0
                              const displayPrice = hasCatalog ? catalogPrice : (permitLine?.amount ?? null)
                              if (displayPrice === null) return null
                              return (
                                <div className="rounded-xl border bg-background p-4 space-y-3">
                                  <h4 className="text-sm font-semibold text-foreground">Permit</h4>
                                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-primary/5">
                                    <span className="text-sm text-foreground">Permit Fee</span>
                                    <span className="text-sm font-bold text-primary">{fmt(displayPrice)}</span>
                                  </div>
                                </div>
                              )
                            })()}
                            {/* Metal Roof Selection */}
                            {sp.item.metalRoofSelection && sp.item.metalRoofSelection.color && (
                              <div className="rounded-xl border bg-background p-4 space-y-3">
                                <h4 className="text-sm font-semibold text-foreground">Standing Seam Metal</h4>
                                <div className="rounded-lg bg-primary/5 px-3 py-2.5">
                                  <div className="flex flex-wrap gap-1.5">
                                    <Badge variant="secondary" className="text-[10px]">
                                      Color: {sp.item.metalRoofSelection.color.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                    </Badge>
                                    {sp.item.metalRoofSelection.roofSize && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {Number(sp.item.metalRoofSelection.roofSize).toLocaleString()} Sq Ft
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Pool Add-on Quantities */}
                            {sp.item.addonQuantities && (
                              <div className="rounded-xl border bg-background p-4 space-y-3">
                                <h4 className="text-sm font-semibold text-foreground">Add-on Details</h4>
                                <div className="flex flex-col gap-2">
                                  {(sp.item.addonQuantities.ledCount ?? 0) > 0 && (
                                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5">
                                      <span className="text-sm text-foreground">LED Lighting</span>
                                      <span className="text-sm font-bold text-primary">× {sp.item.addonQuantities.ledCount ?? 0}</span>
                                    </div>
                                  )}
                                  {(sp.item.addonQuantities.bubblerCount ?? 0) > 0 && (
                                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5">
                                      <span className="text-sm text-foreground">Bubbler</span>
                                      <span className="text-sm font-bold text-primary">× {sp.item.addonQuantities.bubblerCount ?? 0}</span>
                                    </div>
                                  )}
                                  {(sp.item.addonQuantities.laminarJets ?? 0) > 0 && (
                                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5">
                                      <span className="text-sm text-foreground">Laminar Jets</span>
                                      <span className="text-sm font-bold text-primary">× {sp.item.addonQuantities.laminarJets ?? 0}</span>
                                    </div>
                                  )}
                                  {(sp.item.addonQuantities.waterfalls ?? 0) > 0 && (
                                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5">
                                      <span className="text-sm text-foreground">Waterfalls</span>
                                      <span className="text-sm font-bold text-primary">× {sp.item.addonQuantities.waterfalls ?? 0}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}

                      {/* Permit & Financing info */}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={lead.permit_choice ? 'default' : 'secondary'} className="text-xs">
                          Permit: {lead.permit_choice ? 'Yes' : 'No'}
                        </Badge>
                        <Badge variant={lead.financing ? 'default' : 'secondary'} className="text-xs">
                          Financing: {lead.financing ? 'Requested' : 'Not needed'}
                        </Badge>
                      </div>

                      {/* Customer photos, notes, ID */}
                      {(() => {
                        const sp = sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id)
                        if (!sp) return null
                        return (
                          <>
                            {sp.idDocument && lead.status === 'confirmed' && (
                              <div className="rounded-lg border bg-muted/30 p-3">
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Customer ID</p>
                                <div className="flex items-end gap-3">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setIdPreview({ dataUrl: sp.idDocument!, name: lead.homeowner_name }) }}
                                    className="relative group w-20 h-14 rounded-lg overflow-hidden border cursor-pointer"
                                  >
                                    <img src={sp.idDocument} alt="Customer ID" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                      <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1.5"
                                    onClick={(e) => { e.stopPropagation(); downloadIdDocument(sp.idDocument!, lead.homeowner_name) }}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                            )}
                            {sp.item.itemNotes && (
                              <div className="rounded-lg border bg-muted/30 p-3">
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Customer Notes</p>
                                <p className="text-xs text-foreground">{sp.item.itemNotes}</p>
                              </div>
                            )}
                            {sp.item.itemPhotos && sp.item.itemPhotos.length > 0 && (
                              <div>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Project Photos</p>
                                <div className="flex gap-2 flex-wrap">
                                  {sp.item.itemPhotos.map((photo: string, idx: number) => (
                                    <div key={idx} className="w-14 h-14 rounded-lg overflow-hidden border">
                                      <img src={photo} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                      {/* Rep accept / reschedule actions — only for account_rep on pending-acceptance leads */}
                      {profile?.role === 'account_rep' && repAcceptanceByLead[lead.id] === 'pending' && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation()
                              acceptRepLead(lead.id)
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Accept schedule
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation()
                              setRepRescheduleLeadId(lead.id)
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reschedule
                          </Button>
                        </div>
                      )}
                    </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )
          })}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
      {/* Rep reschedule dialog */}
      {repRescheduleLeadId && (() => {
        const lead = leads.find((l) => l.id === repRescheduleLeadId)
        if (!lead) return null
        const currentDate = lead.slot.split('T')[0]
        const currentTime = lead.slot.split('T')[1]?.slice(0, 5) ?? ''
        return (
          <ReschedulePickerDialog
            open={!!repRescheduleLeadId}
            onOpenChange={(o) => { if (!o) setRepRescheduleLeadId(null) }}
            mode="request"
            currentDate={currentDate}
            currentTime={currentTime}
            otherPartyLabel="Homeowner"
            onSubmit={(proposedDate, proposedTime, reason) => {
              requestReschedule(lead.id, 'rep', proposedDate, proposedTime, currentDate, currentTime, reason)
              markRepRescheduleRequested(lead.id)
              setRepRescheduleLeadId(null)
            }}
          />
        )
      })()}

      {/* ID Document Preview Dialog */}
      <Dialog open={!!idPreview} onOpenChange={(open) => !open && setIdPreview(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-sm font-semibold text-foreground">Customer ID — {idPreview?.name}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => idPreview && downloadIdDocument(idPreview.dataUrl, idPreview.name)}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
          {idPreview && (
            <div className="px-4 pb-4">
              <img
                src={idPreview.dataUrl}
                alt="Customer ID Full Size"
                className="w-full rounded-lg border object-contain max-h-[70vh]"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
