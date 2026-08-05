import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { PencilLine } from 'lucide-react'
import { useProjectsStore, type SentProject } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { getVendorPriceMap, getVendorPermitMap, type VendorPriceMap, type VendorPermitMap } from '@/lib/api/pricing'
import { buildRoofingBaseLines, sumRoofingBaseLines } from '@/lib/roofing-base-lines'
import type { CartItem } from '@/stores/cart-store'

// Deep clone a CartItem (plain JSON data) so edits never mutate the original
// homeowner config held on the sent_project. The original must stay immutable
// until the homeowner accepts.
function cloneItem(item: CartItem): CartItem {
  return JSON.parse(JSON.stringify(item)) as CartItem
}

const fmt = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString()}`

const titleCase = (id: string) =>
  id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// Parse an "X/12" pitch string to the integer rise. Returns null when the
// stored pitch is empty/absent/malformed so callers can gate the rescale off
// (empty-pitch legacy items: pitch becomes editable but non-driving).
function parsePitchRise(pitch: string | undefined): number | null {
  if (!pitch) return null
  const m = /^\s*(\d+)\s*\/\s*12\s*$/.exec(pitch)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Standard roofing pitch multiplier — actual sloped surface area for a given
// horizontal footprint at rise/12. sqrt(12^2 + rise^2)/12. rise=0 (flat) → 1.
function pitchMultiplier(rise: number): number {
  return Math.sqrt(144 + rise * rise) / 12
}

/**
 * Contractor-facing editor: correct a COPY of the homeowner's config and send
 * it back for the homeowner to accept or decline. v1 focused editor — edits
 * roof measurement square footage + add-on linear feet (the primary price
 * drivers) + a required reason. Price + platform commission recompute live off
 * the edited clone via the shared pricing helpers before send (never
 * hand-entered). Material-option swaps are out of scope for v1.
 */
export function ConfigRevisionDialog({
  open,
  onOpenChange,
  sentProject,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sentProject: SentProject
}) {
  const proposeRevision = useProjectsStore((s) => s.proposeRevision)
  const getVendorCommission = useAdminModerationStore((s) => s.getVendorCommission)

  const vendorUuid = sentProject.vendor_id ?? sentProject.contractor?.vendor_id
  const isRoofing = sentProject.item.serviceId === 'roofing'

  const [draft, setDraft] = useState<CartItem>(() => cloneItem(sentProject.item))
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [priceMap, setPriceMap] = useState<VendorPriceMap | null>(null)
  const [permitMap, setPermitMap] = useState<VendorPermitMap | undefined>(undefined)
  const [mapsLoading, setMapsLoading] = useState(false)
  // Snapshot the pitch + pitched/total area AS OF dialog-open so the pitch-edit
  // rescale derives horizontal footprint off the original values, not a value
  // already rescaled by a prior edit in this session.
  const [pitchSnap, setPitchSnap] = useState<{
    origRise: number
    origPitched?: number
    origArea: number
  } | null>(null)

  // Reset the draft + reason each time the dialog opens on a (possibly new)
  // project, and fetch the vendor's price/permit maps for the live recompute.
  useEffect(() => {
    if (!open) return
    setDraft(cloneItem(sentProject.item))
    setReason('')
    const rmOpen = sentProject.item.roofMeasurement
    const origRiseOpen = parsePitchRise(rmOpen?.pitch)
    setPitchSnap(
      origRiseOpen != null && rmOpen
        ? {
            origRise: origRiseOpen,
            origPitched: rmOpen.pitchedAreaSqft,
            origArea: rmOpen.areaSqft ?? 0,
          }
        : null,
    )
    if (!vendorUuid || !isRoofing) return
    let cancelled = false
    setMapsLoading(true)
    void Promise.all([getVendorPriceMap(vendorUuid), getVendorPermitMap(vendorUuid)])
      .then(([pm, perm]) => {
        if (cancelled) return
        setPriceMap(pm)
        setPermitMap(perm)
      })
      .catch((err) => console.warn('[config-revision] vendor maps fetch failed:', err))
      .finally(() => {
        if (!cancelled) setMapsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, sentProject.id, sentProject.item, vendorUuid, isRoofing])

  const commissionPct = useMemo(() => {
    const defaultPct = MOCK_VENDORS.find((v) => v.id === vendorUuid)?.commission_pct ?? 12
    return getVendorCommission(vendorUuid ?? '', defaultPct)
  }, [vendorUuid, getVendorCommission])

  // Original (frozen) totals for the before/after.
  const originalPriceCents = useMemo(() => {
    if (sentProject.quotedPriceCents && sentProject.quotedPriceCents > 0) return sentProject.quotedPriceCents
    const lines = sentProject.priceLineItems ?? []
    return Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100)
  }, [sentProject.quotedPriceCents, sentProject.priceLineItems])

  // Live revised total off the current draft.
  const revisedPriceCents = useMemo(() => {
    if (isRoofing && priceMap) {
      const lines = buildRoofingBaseLines(draft, sentProject.projectPermit, priceMap, permitMap)
      if (lines) return Math.round(sumRoofingBaseLines(lines) * 100)
    }
    return originalPriceCents
  }, [draft, isRoofing, priceMap, permitMap, sentProject.projectPermit, originalPriceCents])

  const originalCommissionCents = Math.round((originalPriceCents * commissionPct) / 100)
  const revisedCommissionCents = Math.round((revisedPriceCents * commissionPct) / 100)
  const priceDeltaCents = revisedPriceCents - originalPriceCents

  // Measurement fields present on the item (roofing). areaSqft is always
  // editable; pitched/flat split fields are exposed only when present since
  // they are what actually drive split material pricing.
  const rm = draft.roofMeasurement
  const setMeasure = (field: 'areaSqft' | 'pitchedAreaSqft' | 'flatAreaSqft', value: number) => {
    setDraft((d) => ({
      ...d,
      roofMeasurement: { ...(d.roofMeasurement ?? { areaSqft: 0, pitch: '', address: '' }), [field]: value },
    }))
  }
  // Editing the pitch rescales pitched-section area (or total area when there
  // is no split) off the snapshot captured at dialog open — never off the last
  // edited value, so repeated edits stay idempotent and rounding does not
  // compound. Flat section is pitch-independent and never rescaled. Legacy
  // items with no baseline pitch: pitch becomes editable but does NOT drive
  // area (contractor keeps adjusting area manually as today).
  const setPitchRise = (newRise: number) => {
    const clamped = Math.max(0, Math.min(24, Math.round(newRise || 0)))
    setDraft((d) => {
      const cur = d.roofMeasurement ?? { areaSqft: 0, pitch: '', address: '' }
      const nextPitchStr = `${clamped}/12`
      if (!pitchSnap) {
        return { ...d, roofMeasurement: { ...cur, pitch: nextPitchStr } }
      }
      const ratio = pitchMultiplier(clamped) / pitchMultiplier(pitchSnap.origRise)
      if (pitchSnap.origPitched !== undefined) {
        const newPitched = Math.round(pitchSnap.origPitched * ratio)
        const flat = cur.flatAreaSqft ?? 0
        return {
          ...d,
          roofMeasurement: {
            ...cur,
            pitch: nextPitchStr,
            pitchedAreaSqft: newPitched,
            areaSqft: newPitched + flat,
          },
        }
      }
      const newArea = Math.round(pitchSnap.origArea * ratio)
      return { ...d, roofMeasurement: { ...cur, pitch: nextPitchStr, areaSqft: newArea } }
    })
  }
  const currentRise = parsePitchRise(rm?.pitch)

  const addonKeys = Object.keys(draft.roofAddonLinearFt ?? {})
  const setAddonLinearFt = (key: string, value: number) => {
    setDraft((d) => ({
      ...d,
      roofAddonLinearFt: { ...(d.roofAddonLinearFt ?? {}), [key]: value },
    }))
  }

  const materialLabels = useMemo(
    () =>
      Object.entries(draft.selections ?? {})
        .filter(([g]) => g !== 'service_type')
        .flatMap(([, ids]) => ids)
        .map(titleCase),
    [draft.selections],
  )

  const reasonValid = reason.trim().length > 0

  const handleSubmit = async () => {
    if (!reasonValid) return
    setSubmitting(true)
    try {
      await proposeRevision(sentProject.id, draft, reason.trim())
      toast.success('Revision sent — awaiting homeowner approval.')
      onOpenChange(false)
    } catch (err) {
      console.error('[config-revision] proposeRevision failed:', err)
      toast.error('Could not send the revision. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <PencilLine className="h-4 w-4 text-primary" />
            Suggest changes to this project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            Correct a copy of the homeowner's configuration. They must accept before it
            takes effect — the original stays as-is until then. Price updates automatically.
          </p>

          {/* Current materials (read-only in v1) */}
          {materialLabels.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                Materials on this project
              </p>
              <p className="text-sm text-foreground">{materialLabels.join(', ')}</p>
            </div>
          )}

          {isRoofing ? (
            <>
              {/* Roof measurement */}
              <div className="space-y-2.5">
                <Label className="text-xs font-semibold">Roof measurement</Label>
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Total area (sq ft)</span>
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-20 flex-col items-center justify-center rounded-md border bg-muted/40 px-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">Squares</span>
                        <span className="text-sm font-medium tabular-nums leading-tight">
                          {Math.round((rm?.areaSqft ?? 0) / 100)}
                        </span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-32 text-right"
                        value={rm?.areaSqft ?? 0}
                        onChange={(e) => setMeasure('areaSqft', Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Pitch</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        step={1}
                        className="h-9 w-16 text-right tabular-nums"
                        value={currentRise ?? ''}
                        placeholder="—"
                        onChange={(e) => setPitchRise(Number(e.target.value))}
                      />
                      <span className="text-sm text-muted-foreground tabular-nums">/12</span>
                    </div>
                  </div>
                  {rm?.pitchedAreaSqft !== undefined && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Pitched section (sq ft)</span>
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-32 text-right"
                        value={rm.pitchedAreaSqft}
                        onChange={(e) => setMeasure('pitchedAreaSqft', Number(e.target.value) || 0)}
                      />
                    </div>
                  )}
                  {rm?.flatAreaSqft !== undefined && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Flat section (sq ft)</span>
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-32 text-right"
                        value={rm.flatAreaSqft}
                        onChange={(e) => setMeasure('flatAreaSqft', Number(e.target.value) || 0)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Add-ons (linear ft) */}
              {addonKeys.length > 0 && (
                <div className="space-y-2.5">
                  <Label className="text-xs font-semibold">Add-ons (linear ft)</Label>
                  <div className="grid grid-cols-1 gap-2.5">
                    {addonKeys.map((key) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">{titleCase(key)}</span>
                        <Input
                          type="number"
                          min={0}
                          className="h-9 w-32 text-right"
                          value={draft.roofAddonLinearFt?.[key] ?? 0}
                          onChange={(e) => setAddonLinearFt(key, Number(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Live price recalculation is available for roofing projects. You can still
                send a note-only revision for this service.
              </p>
            </div>
          )}

          <Separator />

          {/* Live price + commission preview */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              New quote {mapsLoading ? '(calculating…)' : ''}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current price</span>
              <span className="font-medium">{fmt(originalPriceCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Revised price</span>
              <span className="font-bold text-lg">{fmt(revisedPriceCents)}</span>
            </div>
            {priceDeltaCents !== 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Change</span>
                <span className={priceDeltaCents > 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                  {priceDeltaCents > 0 ? '+' : '−'}{fmt(Math.abs(priceDeltaCents))}
                </span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
              <span>Platform commission ({commissionPct}%)</span>
              <span className="font-medium">
                {fmt(originalCommissionCents)} → {fmt(revisedCommissionCents)}
              </span>
            </div>
          </div>

          {/* Reason (required) */}
          <div className="space-y-1.5">
            <Label htmlFor="revision-reason" className="text-xs font-semibold">
              Why the change? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="revision-reason"
              placeholder="e.g. Satellite measured the roof low — actual area is larger after on-site check."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            {!reasonValid && (
              <p className="text-[11px] text-muted-foreground">
                Add a short note so the homeowner understands the correction.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!reasonValid || submitting || mapsLoading}>
            {submitting ? 'Sending…' : 'Send revision to homeowner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
