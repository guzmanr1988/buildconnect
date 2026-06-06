import { useEffect, useMemo, useState } from 'react'
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
  BATHROOM_RATES,
  computeBathroomLineItems,
  sumBathroomContractorLineItems,
  formatBathroomUnit,
  isBathroomMeasurementsValid,
  type BathroomMeasurements,
  type BathroomLine,
  type BathroomGroup,
} from '@/lib/bathroom-pricing'

// Ship #475+2 — Bathroom Remodel configurator.
// Measurement-driven (L × W × H × tile-coverage-height + tub-yes/no).
// REVIEW step splits CONTRACTOR SCOPE (paid) vs FIXTURES (client-provided $0).
// Add-to-Project gated on (measurements valid) AND (permit valid) AND (address picked).
//
// English-only by hard rule (feedback_app_ui_english_only_chat_spanglish).
// Mirror remodel-configurator.tsx structure 1:1 so future fixes apply both.

const DEFAULT_MEASUREMENTS: BathroomMeasurements = {
  length: 0,
  width: 0,
  ceilingHeight: 9,
  tileCoverageHeight: 6,
  includesTub: true,
}

type StepKey = 'measurements' | 'permit' | 'address' | 'review'

const STEP_ORDER: StepKey[] = ['measurements', 'permit', 'address', 'review']

const STEP_META: Record<StepKey, { title: string; subtitle?: string }> = {
  measurements: {
    title: 'Bathroom measurements',
    subtitle: 'Enter the room dimensions — every line auto-calculates.',
  },
  permit: {
    title: 'Permit',
  },
  address: {
    title: 'Project address',
    subtitle: 'Where will this bathroom remodel happen?',
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

// Tile-coverage-height preset buttons (kratos Q1 lean: 3 buttons, not free-form).
const TILE_HEIGHT_PRESETS: Array<{ value: number; label: string; hint: string; matchesCeiling?: boolean }> = [
  { value: 4, label: 'Wainscot', hint: '4 ft' },
  { value: 6, label: 'Mid-wall', hint: '6 ft' },
  { value: -1, label: 'Full to ceiling', hint: 'matches ceiling', matchesCeiling: true },
]

function MeasurementsStep({
  value,
  onChange,
}: {
  value: BathroomMeasurements
  onChange: (next: BathroomMeasurements) => void
}) {
  const tilePresetActive = (preset: { value: number; matchesCeiling?: boolean }): boolean => {
    if (preset.matchesCeiling) return value.tileCoverageHeight === value.ceilingHeight
    return value.tileCoverageHeight === preset.value
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Numeric inputs */}
      <div className="flex flex-col gap-4">
        {([
          { key: 'length', label: 'Length (ft)', hint: 'Longest wall' },
          { key: 'width', label: 'Width (ft)', hint: 'Shorter side' },
          { key: 'ceilingHeight', label: 'Ceiling Height (ft)', hint: 'Typical 8-9' },
        ] as const).map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">{f.label}</label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={value[f.key] === 0 ? '' : value[f.key]}
              onChange={(e) => {
                const raw = e.target.value
                const num = raw === '' ? 0 : Number(raw)
                if (Number.isNaN(num)) return
                const next = { ...value, [f.key]: num }
                // Keep tile coverage <= ceiling on ceiling edit
                if (f.key === 'ceilingHeight' && next.tileCoverageHeight > num) {
                  next.tileCoverageHeight = num
                }
                onChange(next)
              }}
              placeholder="0"
              className="h-12 rounded-xl"
            />
            <span className="text-xs text-muted-foreground">{f.hint}</span>
          </div>
        ))}
      </div>

      {/* Tile coverage height — 3-button preset */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">Wall tile coverage</label>
        <div className="grid grid-cols-3 gap-2">
          {TILE_HEIGHT_PRESETS.map((p) => {
            const active = tilePresetActive(p)
            return (
              <button
                key={p.label}
                type="button"
                data-tile-height={p.matchesCeiling ? 'ceiling' : p.value}
                onClick={() => {
                  const target = p.matchesCeiling ? value.ceilingHeight : p.value
                  onChange({ ...value, tileCoverageHeight: target })
                }}
                className={`h-16 rounded-xl border text-sm font-medium transition-colors flex flex-col items-center justify-center gap-0.5 ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input bg-background text-foreground hover:bg-muted'
                }`}
              >
                <span>{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.hint}</span>
              </button>
            )
          })}
        </div>
        <span className="text-xs text-muted-foreground">
          How high the tile goes on the wall. Paint covers above.
        </span>
      </div>

      {/* Tub / walk-in toggle */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">Bathtub</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-includes-tub="yes"
            onClick={() => onChange({ ...value, includesTub: true })}
            className={`h-14 rounded-xl border text-sm font-medium transition-colors ${
              value.includesTub
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-background text-foreground hover:bg-muted'
            }`}
          >
            Includes tub
          </button>
          <button
            type="button"
            data-includes-tub="no"
            onClick={() => onChange({ ...value, includesTub: false })}
            className={`h-14 rounded-xl border text-sm font-medium transition-colors ${
              !value.includesTub
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-background text-foreground hover:bg-muted'
            }`}
          >
            Walk-in shower
          </button>
        </div>
      </div>
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

function ContractorLineRow({ line }: { line: BathroomLine }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{line.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatBathroomUnit(line.unit, line.qty)}
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

function FixtureLineRow({ line }: { line: BathroomLine }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground">{line.label}</div>
        {line.unit !== 'flat' && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatBathroomUnit(line.unit, line.qty)}
          </div>
        )}
      </div>
      <div className="text-sm font-medium tabular-nums text-muted-foreground shrink-0">
        $0.00
      </div>
    </div>
  )
}

const CONTRACTOR_GROUPS: BathroomGroup[] = [
  'DEMO',
  'ROUGH-IN',
  'SUBSTRATE',
  'TILE',
  'INSTALL',
  'FINISH',
  'EXTRAS',
]

const GROUP_LABELS: Record<BathroomGroup, string> = {
  DEMO: 'Demolition',
  'ROUGH-IN': 'Rough-in',
  SUBSTRATE: 'Substrate',
  TILE: 'Tile install',
  INSTALL: 'Fixture install',
  FINISH: 'Finish',
  FIXTURES: 'Fixtures (client-provided)',
  EXTRAS: 'Extras',
}

function ReviewStep({
  measurements,
  lines,
  contractorTotal,
}: {
  measurements: BathroomMeasurements
  lines: BathroomLine[]
  contractorTotal: number
}) {
  const contractorLines = useMemo(() => lines.filter((l) => !l.isFixture), [lines])
  const fixtureLines = useMemo(() => lines.filter((l) => l.isFixture), [lines])

  const grouped = useMemo(() => {
    const buckets: Record<BathroomGroup, BathroomLine[]> = {
      DEMO: [],
      'ROUGH-IN': [],
      SUBSTRATE: [],
      TILE: [],
      INSTALL: [],
      FINISH: [],
      FIXTURES: [],
      EXTRAS: [],
    }
    for (const l of contractorLines) buckets[l.group].push(l)
    return buckets
  }, [contractorLines])

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl">
        <CardContent className="p-4 text-sm space-y-1">
          <div className="font-semibold text-foreground mb-1">Bathroom measurements</div>
          <div className="text-muted-foreground">
            {measurements.length} ft × {measurements.width} ft, {measurements.ceilingHeight} ft ceiling, tile to {measurements.tileCoverageHeight} ft
            {measurements.includesTub ? ', with tub' : ', walk-in shower'}
          </div>
        </CardContent>
      </Card>

      {/* CONTRACTOR SCOPE */}
      <div className="rounded-2xl border bg-card">
        <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-primary">
          Contractor scope
        </div>
        {CONTRACTOR_GROUPS.map((g) => {
          const items = grouped[g]
          if (items.length === 0) return null
          return (
            <div key={g} className="border-t">
              <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {GROUP_LABELS[g]}
              </div>
              <div className="px-4 pb-2 divide-y">
                {items.map((line) => (
                  <ContractorLineRow key={line.id} line={line} />
                ))}
              </div>
            </div>
          )
        })}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-b-2xl border-t">
          <span className="text-sm font-semibold text-foreground">Estimated total</span>
          <span className="text-lg font-bold tabular-nums text-foreground">{fmtMoney(contractorTotal)}</span>
        </div>
      </div>

      {/* FIXTURES (client-provided $0) — visually distinct */}
      {fixtureLines.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-muted bg-muted/20">
          <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {GROUP_LABELS.FIXTURES}
          </div>
          <div className="px-4 pb-2">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 my-2">
              <p className="text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
                <span className="font-semibold">You supply these.</span> Bring them on install day, or have them delivered to the project address.
              </p>
            </div>
            <div className="divide-y">
              {fixtureLines.map((line) => (
                <FixtureLineRow key={line.id} line={line} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
        <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
          <span className="font-semibold">Estimate</span> — your contractor confirms final pricing. Rates shown are starting points so you can compare quotes.
        </p>
      </div>
    </div>
  )
}

export function BathroomConfigurator() {
  const navigate = useNavigate()
  const location = useLocation()
  const profile = useAuthStore((s) => s.profile)
  const addItem = useCartStore((s) => s.addItem)
  const updateItem = useCartStore((s) => s.updateItem)
  const projectPermit = useCartStore((s) => s.projectPermit)
  const projectPermitWaiver = useCartStore((s) => s.projectPermitWaiver)
  const projectAssociation = useCartStore((s) => s.projectAssociation)
  const projectAssociationDocId = useCartStore((s) => s.projectAssociationDocId)

  const editData = (location.state && typeof location.state === 'object' && 'editItem' in location.state
    ? (location.state as { editItem: Record<string, unknown> }).editItem
    : null) as Record<string, unknown> | null
  const editItem = editData && editData.serviceId === 'bathroom' ? editData : null
  const editItemId = editItem?.id as string | undefined

  const [stepIdx, setStepIdx] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [measurements, setMeasurements] = useState<BathroomMeasurements>(
    (editItem?.bathroomMeasurements as BathroomMeasurements) ?? DEFAULT_MEASUREMENTS,
  )
  const [addressKey, setAddressKey] = useState<string>('primary')
  const [address, setAddress] = useState<CartItemAddress | null>(
    (editItem?.address as CartItemAddress | undefined) ?? null,
  )
  const [added, setAdded] = useState(false)

  useEffect(() => {
    if (address || !profile?.address) return
    setAddress({ label: 'Primary', full: profile.address })
  }, [address, profile?.address])

  const lines = useMemo(() => {
    if (!isBathroomMeasurementsValid(measurements)) return []
    return computeBathroomLineItems(measurements)
  }, [measurements])
  const contractorTotal = useMemo(() => sumBathroomContractorLineItems(lines), [lines])

  const step = STEP_ORDER[stepIdx]
  const meta = STEP_META[step]

  const measurementsValid = isBathroomMeasurementsValid(measurements)
  const permitValid =
    isProjectPermitValid(projectPermit ?? null, projectPermitWaiver ?? null) &&
    isProjectAssociationValid(projectAssociation ?? null, projectAssociationDocId ?? null)
  const addressValid = !!address

  let nextDisabled = false
  if (step === 'measurements') nextDisabled = !measurementsValid
  if (step === 'permit') nextDisabled = !permitValid
  if (step === 'address') nextDisabled = !addressValid

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
        bathroomMeasurements: measurements,
        address: address!,
      })
      toast.success('Updated in your project')
    } else {
      addItem({
        serviceId: 'bathroom',
        serviceName: 'Bathroom Remodel',
        selections: {},
        bathroomMeasurements: measurements,
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
          <ReviewStep
            measurements={measurements}
            lines={lines}
            contractorTotal={contractorTotal}
          />
        )}
      </CardSlideWizard>

      {/* Live estimate strip on measurements step so Rod can eyeball totals
          while editing inputs (same shape as remodel-configurator). */}
      {step === 'measurements' && measurementsValid && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto mt-6 rounded-2xl border bg-card p-4 text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-foreground">Live estimate</span>
            <span className="text-base font-bold tabular-nums text-foreground">{fmtMoney(contractorTotal)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {lines.length} itemized lines on the review step (contractor + client-provided fixtures).
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

// Re-export rates for any analytics / preview surface (mirror remodel).
export { BATHROOM_RATES }
