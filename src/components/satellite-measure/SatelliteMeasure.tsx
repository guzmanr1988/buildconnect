import { useState } from 'react'
import { MapPin, Ruler, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  measureFromAddress,
  buildMockResult,
  SERVICE_DEFAULT_AREAS,
  type SatelliteMeasureProps,
  type MeasurementResult,
  type FallbackReason,
} from '@/lib/satellite-measure'

export type { MeasurementResult, FallbackReason }

export function SatelliteMeasure({
  serviceCategory,
  onMeasure,
  initialAddress = '',
  gmpEnabled = false,
  onFallback,
}: SatelliteMeasureProps) {
  const [address, setAddress] = useState(initialAddress)
  const [loading, setLoading] = useState(false)
  const [measured, setMeasured] = useState<MeasurementResult | null>(null)

  // When GMP is disabled, render manual-entry form — no API calls, flow unblocked.
  if (!gmpEnabled) {
    return (
      <ManualEntryForm
        serviceCategory={serviceCategory}
        onMeasure={onMeasure}
      />
    )
  }

  async function handleMeasure() {
    if (!address.trim()) return
    setLoading(true)
    try {
      const result = await measureFromAddress(serviceCategory, address, onFallback)
      setMeasured(result)
      onMeasure(result)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4" data-satellite-measure={serviceCategory} data-measure-state={measured ? 'measured' : 'idle'}>
      <div className="space-y-1.5">
        <Label htmlFor="satellite-address">Project address</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="satellite-address"
              data-satellite-input="address"
              className="pl-9"
              placeholder="123 Main St, Miami, FL"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleMeasure() }}
            />
          </div>
          <Button
            data-measure-action="measure"
            onClick={handleMeasure}
            disabled={loading || !address.trim()}
            className="shrink-0"
          >
            {loading ? 'Measuring…' : 'Measure'}
          </Button>
        </div>
      </div>

      {measured && (
        <MeasurementSummary result={measured} />
      )}
    </div>
  )
}

function MeasurementSummary({ result }: { result: MeasurementResult }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-1.5',
        result.isMock
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20',
      )}
      data-measurement-result={result.isMock ? 'mock' : 'live'}
      data-measurement-sqft={result.areaSqft}
    >
      <div className="flex items-center gap-2">
        {result.isMock
          ? <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          : <Ruler className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        }
        <p className="text-sm font-medium text-foreground">
          {result.areaSqft.toLocaleString()} sqft
          {result.isMock && ' (estimate — adjust below if needed)'}
        </p>
      </div>
      {result.address && (
        <p className="text-xs text-muted-foreground truncate">{result.address}</p>
      )}
    </div>
  )
}

// Manual entry fallback — shown when GMP is disabled or address can't resolve.
// Never blocks the user; always has a path forward (Rule #5).
function ManualEntryForm({
  serviceCategory,
  onMeasure,
}: {
  serviceCategory: SatelliteMeasureProps['serviceCategory']
  onMeasure: (r: MeasurementResult) => void
}) {
  const defaultArea = SERVICE_DEFAULT_AREAS[serviceCategory] ?? 500
  const [sqft, setSqft] = useState(String(defaultArea))

  function handleApply() {
    const area = Math.max(1, Number(sqft) || defaultArea)
    const result = buildMockResult(serviceCategory, '')
    onMeasure({ ...result, areaSqft: area, measurements: { ...result.measurements, areaSqft: area } })
  }

  return (
    <div className="space-y-3" data-satellite-measure={serviceCategory} data-measure-mode="manual">
      <div className="space-y-1.5">
        <Label htmlFor="manual-sqft">Estimated area (sqft)</Label>
        <div className="flex gap-2">
          <Input
            id="manual-sqft"
            data-satellite-input="sqft"
            type="number"
            min={1}
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            className="max-w-[140px]"
          />
          <Button variant="outline" data-measure-action="apply-manual" onClick={handleApply}>Apply</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter the approximate area. You can adjust this later.
      </p>
    </div>
  )
}
