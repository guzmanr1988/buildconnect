import { useEffect, useMemo, useState } from 'react'
import { DollarSign, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// PR-330 — Apply Financing dialog. Lets the homeowner allocate part (or
// all) of their approved envelope onto one sent_project. Server-side
// envelope-cap re-check lives in supabase/functions/financing-demo-action
// (action='apply_allocation'); the dialog runs the same math client-side
// for instant feedback. Cents-as-int discipline (banked $-sign-no-float).
//
// Gate is slot-availability (applied_financing_application_id IS NULL),
// NOT status. Per kratos 2026-05-22: homeowner allocates to pending +
// approved + sold projects after envelope-approval. Status-check is
// excluded from this dialog by design.

export type ApplyFinancingPreset = 'downpayment' | 'full' | 'custom'

export interface ApplyFinancingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sentProjectId: string
  sentProjectName: string
  // Project value the homeowner is allocating against. Drives the Full +
  // Downpayment presets and the upper validation bound (can't allocate
  // more than the project costs).
  projectValueCents: number
  // Total approved envelope (from cfp.last_known_amount_cents or fa.estimated_amount_cents).
  envelopeCents: number
  // Already-allocated cents on OTHER sent_projects under the same
  // application — excluded so update-allocation flows are idempotent.
  otherAllocatedCents: number
  // The approved financing application this allocation will be pinned to.
  applicationId: string
  // Already-allocated cents on THIS sent_project (for "Update allocation"
  // flow). Pre-fills the input + sets the "Currently allocated: $X" label.
  currentAllocationCents?: number | null
  onSuccess: (newAmountCents: number) => void
}

type Mode = 'dollar' | 'percent'

const DEMO_FN_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/financing-demo-action`

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

function dollarsToCents(dollars: string): number {
  const trimmed = dollars.replace(/[$,\s]/g, '').trim()
  if (!trimmed) return 0
  const asNum = Number(trimmed)
  if (!Number.isFinite(asNum)) return 0
  return clampInt(asNum * 100)
}

function centsToDollarsInput(cents: number): string {
  if (cents <= 0) return ''
  const dollars = cents / 100
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
}

export function ApplyFinancingDialog({
  open,
  onOpenChange,
  sentProjectId,
  sentProjectName,
  projectValueCents,
  envelopeCents,
  otherAllocatedCents,
  applicationId,
  currentAllocationCents,
  onSuccess,
}: ApplyFinancingDialogProps) {
  const isUpdate = (currentAllocationCents ?? 0) > 0
  // Remaining excludes the current allocation on this project so the
  // update path can grow up to (remaining + current) without false-positive
  // envelope-cap rejection.
  const remainingCents = useMemo(
    () => Math.max(0, envelopeCents - otherAllocatedCents),
    [envelopeCents, otherAllocatedCents],
  )
  const maxAllocatableCents = useMemo(
    () => Math.min(projectValueCents, remainingCents),
    [projectValueCents, remainingCents],
  )

  const [preset, setPreset] = useState<ApplyFinancingPreset>(isUpdate ? 'custom' : 'full')
  const [mode, setMode] = useState<Mode>('dollar')
  const [inputValue, setInputValue] = useState<string>(
    isUpdate ? centsToDollarsInput(currentAllocationCents ?? 0) : '',
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (isUpdate) {
      setPreset('custom')
      setMode('dollar')
      setInputValue(centsToDollarsInput(currentAllocationCents ?? 0))
    } else {
      setPreset('full')
      setMode('dollar')
      setInputValue('')
    }
  }, [open, isUpdate, currentAllocationCents])

  // Derive cents from preset OR input depending on selection.
  const computedCents = useMemo(() => {
    if (preset === 'full') {
      return Math.min(projectValueCents, remainingCents)
    }
    if (preset === 'downpayment') {
      // 10% of project value, capped at remaining envelope.
      return Math.min(clampInt(projectValueCents * 0.1), remainingCents)
    }
    // Custom — interpret input based on mode toggle.
    if (mode === 'dollar') {
      return dollarsToCents(inputValue)
    }
    const pctNum = Number(inputValue.replace(/%/g, '').trim())
    if (!Number.isFinite(pctNum) || pctNum <= 0) return 0
    return clampInt((projectValueCents * pctNum) / 100)
  }, [preset, mode, inputValue, projectValueCents, remainingCents])

  // Pre-submit validation. All checks mirror the server-side Edge Fn so
  // the client can render the same error before round-tripping.
  const validationError = useMemo<string | null>(() => {
    if (computedCents <= 0) return 'Enter an amount greater than $0.'
    if (computedCents > projectValueCents) {
      return `Allocation can't exceed the project price (${formatCents(projectValueCents)}).`
    }
    if (computedCents > remainingCents) {
      return `Only ${formatCents(remainingCents)} of your envelope remains after other allocations.`
    }
    return null
  }, [computedCents, projectValueCents, remainingCents])

  const handleSubmit = async () => {
    if (validationError) {
      toast.error(validationError)
      return
    }
    setSubmitting(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) {
        toast.error('Sign in expired. Please refresh and try again.')
        setSubmitting(false)
        return
      }
      const res = await fetch(DEMO_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'apply_allocation',
          applicationId,
          sentProjectId,
          amountCents: computedCents,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        const errMsg = json?.error ?? `request_failed_${res.status}`
        if (errMsg === 'exceeds_envelope_remaining') {
          toast.error(`Only ${formatCents(json.remaining_cents ?? 0)} of your envelope remains.`)
        } else {
          toast.error('Could not apply financing. Please try again.')
          console.error('[apply-financing] Edge Fn error:', errMsg, json)
        }
        setSubmitting(false)
        return
      }
      toast.success(
        isUpdate
          ? `Updated to ${formatCents(computedCents)} on ${sentProjectName}.`
          : `${formatCents(computedCents)} applied to ${sentProjectName}.`,
      )
      onSuccess(computedCents)
      onOpenChange(false)
    } catch (err) {
      console.error('[apply-financing] submit threw:', err)
      toast.error('Could not apply financing. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="apply-financing-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isUpdate ? 'Update Allocation' : 'Apply Financing'}
          </DialogTitle>
          <DialogDescription>
            Choose how much of your approved envelope to put toward {sentProjectName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Project price</span>
              <span className="font-semibold tabular-nums">{formatCents(projectValueCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Approved envelope</span>
              <span className="font-semibold tabular-nums">{formatCents(envelopeCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Available to allocate</span>
              <span className="font-semibold tabular-nums">{formatCents(maxAllocatableCents)}</span>
            </div>
            {isUpdate && (currentAllocationCents ?? 0) > 0 && (
              <div className="flex justify-between pt-1 border-t border-border/40">
                <span className="text-muted-foreground">Currently allocated</span>
                <span className="font-semibold tabular-nums text-primary">
                  {formatCents(currentAllocationCents ?? 0)}
                </span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Preset
            </p>
            <div className="grid grid-cols-3 gap-2">
              <PresetButton
                active={preset === 'downpayment'}
                onClick={() => setPreset('downpayment')}
                label="Downpayment"
                sublabel="10% of project"
                dataAttr="apply-financing-preset-downpayment"
              />
              <PresetButton
                active={preset === 'full'}
                onClick={() => setPreset('full')}
                label="Full project"
                sublabel={formatCents(Math.min(projectValueCents, remainingCents))}
                dataAttr="apply-financing-preset-full"
              />
              <PresetButton
                active={preset === 'custom'}
                onClick={() => setPreset('custom')}
                label="Custom"
                sublabel="You decide"
                dataAttr="apply-financing-preset-custom"
              />
            </div>
          </div>

          {preset === 'custom' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Custom amount
                </p>
                <div className="inline-flex rounded-md border border-input bg-background p-0.5">
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded',
                      mode === 'dollar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setMode('dollar')}
                    data-testid="apply-financing-mode-dollar"
                  >
                    <DollarSign className="h-3 w-3" />
                    Dollar
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded',
                      mode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setMode('percent')}
                    data-testid="apply-financing-mode-percent"
                  >
                    <Percent className="h-3 w-3" />
                    Percent
                  </button>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {mode === 'dollar' ? '$' : ''}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={mode === 'dollar' ? 1 : 0.1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={mode === 'dollar' ? '0' : '0'}
                  className={cn('h-10', mode === 'dollar' ? 'pl-7' : 'pr-7')}
                  data-testid="apply-financing-custom-input"
                />
                {mode === 'percent' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    %
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-primary/5 p-3 flex justify-between items-baseline">
            <span className="text-sm font-medium text-foreground">
              {isUpdate ? 'New allocation' : 'You will allocate'}
            </span>
            <span
              className="text-2xl font-bold font-heading text-primary tabular-nums"
              data-testid="apply-financing-computed-amount"
              data-amount-cents={computedCents}
            >
              {formatCents(computedCents)}
            </span>
          </div>

          {validationError && (
            <p className="text-xs text-destructive" data-testid="apply-financing-validation-error">
              {validationError}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={handleSubmit}
            disabled={submitting || !!validationError}
            data-testid="apply-financing-submit"
          >
            {submitting ? 'Applying...' : isUpdate ? 'Update allocation' : 'Apply financing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PresetButton({
  active,
  onClick,
  label,
  sublabel,
  dataAttr,
}: {
  active: boolean
  onClick: () => void
  label: string
  sublabel: string
  dataAttr: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-lg border px-3 py-2.5 text-left transition-all',
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-input bg-background hover:bg-muted/40',
      )}
      onClick={onClick}
      data-testid={dataAttr}
      data-active={active ? 'true' : 'false'}
    >
      <p className="text-xs font-semibold text-foreground leading-tight">{label}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sublabel}</p>
    </button>
  )
}
