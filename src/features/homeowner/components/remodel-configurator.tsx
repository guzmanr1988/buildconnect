import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ShoppingCart, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCartStore, type CartItemAddress } from '@/stores/cart-store'
import { useAuthStore } from '@/stores/auth-store'
import { CardSlideWizard } from './card-slide-wizard'
import { PermitStepSection, isProjectPermitValid, isProjectAssociationValid } from './permit-step-section'
import {
  REMODEL_RATES,
  computeRemodelLineItems,
  sumRemodelLineItems,
  formatRemodelUnit,
  isMeasurementsValid,
  type RemodelMeasurements,
  type RemodelLine,
} from '@/lib/remodel-pricing'

// Ship #475+1 — Interior Remodel configurator.
// Measurement-driven (L × W × H × numWalls). REVIEW step renders one line
// per REMODEL_RATES entry with label + qty + unit + rate + line total so
// Rod can eyeball each PLACEHOLDER rate fast. Add-to-Project gated on
// (measurements valid) AND (permit valid) AND (address picked).
//
// English-only by hard rule per kratos msg 1780640472892. No Spanish
// strings anywhere in this surface.

const DEFAULT_MEASUREMENTS: RemodelMeasurements = {
  length: 0,
  width: 0,
  ceilingHeight: 9,
  numWalls: 4,
}

type StepKey = 'measurements' | 'permit' | 'address' | 'review'

const STEP_ORDER: StepKey[] = ['measurements', 'permit', 'address', 'review']

const STEP_META: Record<StepKey, { title: string; subtitle?: string }> = {
  measurements: {
    title: 'Room measurements',
    subtitle: 'Enter the room dimensions — every line auto-calculates.',
  },
  permit: {
    title: 'Permit',
  },
  address: {
    title: 'Project address',
    subtitle: 'Where will this remodel happen?',
  },
  review: {
    title: 'Review your quote',
    subtitle: 'Itemized breakdown. Estimate — your contractor confirms final pricing.',
  },
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtRate(rate: number, unit: 'sqft' | 'linear_ft' | 'flat'): string {
  const dollars = `$${rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (unit === 'flat') return `${dollars} flat`
  if (unit === 'sqft') return `${dollars}/sqft`
  return `${dollars}/lf`
}

function MeasurementsStep({
  value,
  onChange,
}: {
  value: RemodelMeasurements
  onChange: (next: RemodelMeasurements) => void
}) {
  const fields: Array<{
    key: keyof RemodelMeasurements
    label: string
    hint?: string
    min?: number
    step?: number
  }> = [
    { key: 'length', label: 'Length (ft)', hint: 'Longest wall', step: 0.5 },
    { key: 'width', label: 'Width (ft)', hint: 'Shorter side', step: 0.5 },
    { key: 'ceilingHeight', label: 'Ceiling Height (ft)', hint: 'Typical 8-10', step: 0.5 },
    { key: 'numWalls', label: 'Number of Walls', hint: '4 = standard room; 1 = accent wall', min: 1, step: 1 },
  ]
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => (
        <div key={String(f.key)} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{f.label}</label>
          <Input
            type="number"
            inputMode="decimal"
            min={f.min ?? 0}
            step={f.step ?? 0.5}
            value={value[f.key] === 0 ? '' : value[f.key]}
            onChange={(e) => {
              const raw = e.target.value
              const num = raw === '' ? 0 : Number(raw)
              if (Number.isNaN(num)) return
              onChange({ ...value, [f.key]: num })
            }}
            placeholder="0"
            className="h-12 rounded-xl"
          />
          {f.hint && <span className="text-xs text-muted-foreground">{f.hint}</span>}
        </div>
      ))}
    </div>
  )
}

interface AddressOption {
  key: string
  label: string
  full: string
}

function AddressStep({
  selectedKey,
  onPick,
}: {
  selectedKey: string
  onPick: (key: string, address: CartItemAddress) => void
}) {
  const profile = useAuthStore((s) => s.profile)
  const options = useMemo<AddressOption[]>(() => {
    if (!profile) return []
    const out: AddressOption[] = []
    if (profile.address && profile.address.length > 0) {
      out.push({ key: 'primary', label: 'Primary', full: profile.address })
    }
    for (const a of profile.additional_addresses ?? []) {
      const full = [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ')
      if (full.length > 0) out.push({ key: a.id, label: a.label, full })
    }
    return out
  }, [profile])

  return (
    <div className="flex flex-col gap-3">
      <Select
        value={selectedKey}
        onValueChange={(key) => {
          if (typeof key !== 'string') return
          const opt = options.find((o) => o.key === key)
          if (!opt) return
          const addr: CartItemAddress = { label: opt.label, full: opt.full }
          onPick(key, addr)
        }}
      >
        <SelectTrigger className="h-auto min-h-[3.25rem] py-2 rounded-xl">
          <SelectValue placeholder="Select address" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key} className="py-2 pr-10">
              <span className="flex flex-1 flex-col items-start gap-1 min-w-0">
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 whitespace-nowrap">
                  {o.label}
                </span>
                <span className="text-xs text-muted-foreground whitespace-normal break-words leading-tight">
                  {o.full}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No address on file. Add one from your profile, then come back.
        </p>
      )}
    </div>
  )
}

function ReviewLineRow({ line }: { line: RemodelLine }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{line.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatRemodelUnit(line.unit, line.qty)}
          {' × '}
          {fmtRate(line.rate, line.unit)}
          {' '}
          <span className="italic text-muted-foreground">(estimate)</span>
        </div>
      </div>
      <div className="text-sm font-semibold tabular-nums text-foreground shrink-0">
        {fmtMoney(line.amount)}
      </div>
    </div>
  )
}

function ReviewStep({
  measurements,
  lines,
  total,
}: {
  measurements: RemodelMeasurements
  lines: RemodelLine[]
  total: number
}) {
  const grouped = useMemo(() => {
    const buckets: Record<RemodelLine['group'], RemodelLine[]> = {
      DEMO: [],
      STRUCTURE: [],
      SURFACES: [],
      FINISH: [],
      EXTRAS: [],
    }
    for (const l of lines) buckets[l.group].push(l)
    return buckets
  }, [lines])

  const groupLabels: Record<RemodelLine['group'], string> = {
    DEMO: 'Demolition',
    STRUCTURE: 'Structure',
    SURFACES: 'Surfaces',
    FINISH: 'Finish',
    EXTRAS: 'Extras',
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl">
        <CardContent className="p-4 text-sm space-y-1">
          <div className="font-semibold text-foreground mb-1">Room measurements</div>
          <div className="text-muted-foreground">
            {measurements.length} ft × {measurements.width} ft, {measurements.ceilingHeight} ft ceiling, {measurements.numWalls} walls
          </div>
        </CardContent>
      </Card>

      <div className="rounded-2xl border bg-card">
        {(Object.keys(groupLabels) as Array<RemodelLine['group']>).map((g) => {
          const items = grouped[g]
          if (items.length === 0) return null
          return (
            <div key={g} className="border-b last:border-b-0">
              <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {groupLabels[g]}
              </div>
              <div className="px-4 pb-2 divide-y">
                {items.map((line) => (
                  <ReviewLineRow key={line.id} line={line} />
                ))}
              </div>
            </div>
          )
        })}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-b-2xl">
          <span className="text-sm font-semibold text-foreground">Estimated total</span>
          <span className="text-lg font-bold tabular-nums text-foreground">{fmtMoney(total)}</span>
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
        <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
          <span className="font-semibold">Estimate</span> — your contractor confirms final pricing. Rates shown are starting points so you can compare quotes.
        </p>
      </div>
    </div>
  )
}

export function RemodelConfigurator() {
  const navigate = useNavigate()
  const location = useLocation()
  const addItem = useCartStore((s) => s.addItem)
  const updateItem = useCartStore((s) => s.updateItem)
  const projectPermit = useCartStore((s) => s.projectPermit)
  const projectPermitWaiver = useCartStore((s) => s.projectPermitWaiver)
  const projectAssociation = useCartStore((s) => s.projectAssociation)

  const editData = (location.state && typeof location.state === 'object' && 'editItem' in location.state
    ? (location.state as { editItem: Record<string, unknown> }).editItem
    : null) as Record<string, unknown> | null
  const editItem = editData && editData.serviceId === 'remodel' ? editData : null
  const editItemId = editItem?.id as string | undefined

  const [stepIdx, setStepIdx] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [measurements, setMeasurements] = useState<RemodelMeasurements>(
    (editItem?.remodelMeasurements as RemodelMeasurements) ?? DEFAULT_MEASUREMENTS,
  )
  // Property selector starts empty — user must actively pick on the address step
  // before the next-gate clears. Edit mode restores the previously-saved value.
  const [addressKey, setAddressKey] = useState<string>(() => {
    const edit = editItem?.address as CartItemAddress | undefined
    if (!edit) return ''
    return edit.label === 'Primary' ? 'primary' : ''
  })
  const [address, setAddress] = useState<CartItemAddress | null>(
    (editItem?.address as CartItemAddress | undefined) ?? null,
  )
  const [added, setAdded] = useState(false)

  const lines = useMemo(() => {
    if (!isMeasurementsValid(measurements)) return []
    return computeRemodelLineItems(measurements)
  }, [measurements])
  const total = useMemo(() => sumRemodelLineItems(lines), [lines])

  const step = STEP_ORDER[stepIdx]
  const meta = STEP_META[step]

  const measurementsValid = isMeasurementsValid(measurements)
  const permitValid =
    isProjectPermitValid(projectPermit ?? null, projectPermitWaiver ?? null) &&
    isProjectAssociationValid(projectAssociation ?? null)
  const addressValid = !!address

  let nextDisabled = false
  let nextDisabledReason: string | undefined
  if (step === 'measurements') {
    nextDisabled = !measurementsValid
    if (nextDisabled) nextDisabledReason = 'Enter your room measurements to continue.'
  }
  if (step === 'permit') {
    nextDisabled = !permitValid
    if (nextDisabled) {
      if (!isProjectAssociationValid(projectAssociation ?? null)) {
        nextDisabledReason = 'Answer the association question to continue.'
      } else if (!projectPermit) {
        nextDisabledReason = 'Choose a permit option to continue.'
      } else if (projectPermit === 'no' && !isProjectPermitValid(projectPermit, projectPermitWaiver)) {
        nextDisabledReason = 'Print your full name on the waiver to continue.'
      }
    }
  }
  if (step === 'address') {
    nextDisabled = !addressValid
    if (nextDisabled) nextDisabledReason = 'Add a project address to continue.'
  }

  function goBack() {
    if (stepIdx === 0) {
      navigate(-1)
      return
    }
    setDirection(-1)
    setStepIdx((i) => Math.max(0, i - 1))
  }

  function goNext() {
    if (step === 'review') {
      handleAddToProject()
      return
    }
    setDirection(1)
    setStepIdx((i) => Math.min(STEP_ORDER.length - 1, i + 1))
  }

  function handleAddToProject() {
    if (!measurementsValid || !addressValid) return
    if (editItemId) {
      updateItem(editItemId, {
        remodelMeasurements: measurements,
        address: address!,
      })
      toast.success('Updated in your project')
    } else {
      addItem({
        serviceId: 'remodel',
        serviceName: 'Interior Remodel',
        selections: {},
        remodelMeasurements: measurements,
        address: address!,
      })
      toast.success('Added to your project')
    }
    setAdded(true)
    setTimeout(() => navigate('/home/cart'), 600)
  }

  const nextLabel = step === 'review'
    ? (editItemId ? 'Save changes' : 'Add to project')
    : 'Continue'

  return (
    <div className="px-4 py-6 pb-24">
      <CardSlideWizard
        step={stepIdx + 1}
        totalSteps={STEP_ORDER.length}
        title={meta.title}
        subtitle={meta.subtitle}
        direction={direction}
        onBack={goBack}
        onNext={goNext}
        nextLabel={nextLabel}
        nextDisabled={nextDisabled || added}
        nextDisabledReason={nextDisabledReason}
      >
        {step === 'measurements' && (
          <MeasurementsStep value={measurements} onChange={setMeasurements} />
        )}
        {step === 'permit' && <PermitStepSection />}
        {step === 'address' && (
          <AddressStep
            selectedKey={addressKey}
            onPick={(key, addr) => {
              setAddressKey(key)
              setAddress(addr)
            }}
          />
        )}
        {step === 'review' && (
          <ReviewStep measurements={measurements} lines={lines} total={total} />
        )}
      </CardSlideWizard>

      {/* Persistent rate-summary preview on measurements step so Rod can
          eyeball totals live while editing inputs. */}
      {step === 'measurements' && measurementsValid && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto mt-6 rounded-2xl border bg-card p-4 text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-foreground">Live estimate</span>
            <span className="text-base font-bold tabular-nums text-foreground">{fmtMoney(total)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {REMODEL_RATES.length} line items will be itemized on the review step.
          </div>
        </motion.div>
      )}

      {added && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full px-5 py-3 flex items-center gap-2 shadow-lg"
        >
          <Check className="h-4 w-4" />
          <ShoppingCart className="h-4 w-4" />
          <span className="text-sm font-medium">Added</span>
          <Plus className="h-4 w-4 opacity-0" />
        </motion.div>
      )}
    </div>
  )
}
