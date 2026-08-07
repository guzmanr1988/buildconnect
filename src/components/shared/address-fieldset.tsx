import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useFeatureFlagsStore } from '@/stores/feature-flags-store'
import { usePlacesAutocomplete, type StructuredAddress } from '@/hooks/use-places-autocomplete'

export interface AddressFields {
  street: string
  city: string
  state: string
  zip: string
}

export const emptyAddress: AddressFields = { street: '', city: '', state: '', zip: '' }

interface AddressFieldsetProps {
  value: AddressFields
  onChange: (next: AddressFields) => void
  idPrefix?: string
  required?: boolean
  labelSize?: 'default' | 'sm'
  errors?: Partial<Record<keyof AddressFields, string>>
  className?: string
  enableAddressAutocomplete?: boolean
}

/**
 * Shared address input component used across signup + homeowner profile
 * edit + multi-address + any other address-collecting surface. Ships
 * Street / City / State / ZIP as 4 separate inputs with consistent
 * validation hooks + optional required-asterisk indicators.
 *
 * State-shape-caller-owned: component is fully controlled via value +
 * onChange. Caller composes the final display-string via composeAddress
 * helper (single-string stores) OR persists the structured shape
 * directly (Tranche-2 structured-address migration).
 *
 * Google Places autocomplete is enabled by default on the street field via
 * usePlacesAutocomplete hook (tied to VITE_GOOGLE_MAPS_API_KEY). When a place
 * is selected, all 4 fields are populated from the structured address parts.
 *
 * Ship #113 per kratos msg 1776720207707 + 1776720256016.
 */
export function AddressFieldset({
  value,
  onChange,
  idPrefix = 'addr',
  required = true,
  labelSize = 'default',
  errors,
  className,
  enableAddressAutocomplete = true,
}: AddressFieldsetProps) {
  const labelClass = labelSize === 'sm' ? 'text-xs' : ''
  const update = (patch: Partial<AddressFields>) => onChange({ ...value, ...patch })
  const req = required ? <span className="text-destructive">*</span> : null

  const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
  const gmpEnabled = useFeatureFlagsStore((s) => s.getFlag('googleMapsPlatform'))

  const setStreetInputRef = usePlacesAutocomplete(
    enableAddressAutocomplete && gmpEnabled && !!MAPS_KEY,
    MAPS_KEY,
    (formatted) => update({ street: formatted }),
    (parts: StructuredAddress) =>
      update({
        street: parts.line1,
        city: parts.city,
        state: parts.state,
        zip: parts.zip,
      }),
  )

  return (
    <div className={cn('grid gap-3', className)}>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-street`} className={labelClass}>Street Address {req}</Label>
        <Input
          ref={setStreetInputRef}
          id={`${idPrefix}-street`}
          value={value.street}
          onChange={(e) => update({ street: e.target.value })}
          placeholder="1234 Main St"
          aria-invalid={!!errors?.street}
          autoComplete="off"
        />
        {errors?.street && <p className="text-xs text-destructive">{errors.street}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-city`} className={labelClass}>City {req}</Label>
          <Input
            id={`${idPrefix}-city`}
            value={value.city}
            onChange={(e) => update({ city: e.target.value })}
            placeholder="Miami"
            aria-invalid={!!errors?.city}
          />
          {errors?.city && <p className="text-xs text-destructive">{errors.city}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-state`} className={labelClass}>State {req}</Label>
          <Input
            id={`${idPrefix}-state`}
            value={value.state}
            onChange={(e) => update({ state: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="FL"
            maxLength={2}
            aria-invalid={!!errors?.state}
          />
          {errors?.state && <p className="text-xs text-destructive">{errors.state}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-zip`} className={labelClass}>ZIP Code {req}</Label>
        <Input
          id={`${idPrefix}-zip`}
          value={value.zip}
          onChange={(e) => update({ zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
          placeholder="33101"
          inputMode="numeric"
          maxLength={5}
          aria-invalid={!!errors?.zip}
        />
        {errors?.zip && <p className="text-xs text-destructive">{errors.zip}</p>}
      </div>
    </div>
  )
}
