import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth-store'
import { getAdapterByKey } from '@/lib/financing/adapters'
import { adapterDisplayName } from '@/lib/financing/display'
import { AdapterCapabilityError } from '@/lib/financing/adapters/_contract'

const TERM_OPTIONS = [
  { value: '24', label: '24 months' },
  { value: '36', label: '36 months' },
  { value: '60', label: '60 months' },
  { value: '84', label: '84 months' },
  { value: '120', label: '120 months' },
]

function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[,$\s]/g, '')
  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(parseFloat(cleaned) * 100)
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  lenderKey: string
}

export function FinancingAdapterDialog({ open, onOpenChange, lenderKey }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [term, setTerm] = useState('60')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) {
      toast.error('Sign in required to submit a pre-fill application.')
      return
    }
    const amountCents = dollarsToCents(amount)
    if (amountCents === null || amountCents <= 0) {
      toast.error('Enter a valid project amount.')
      return
    }
    const adapter = getAdapterByKey(lenderKey)
    if (!adapter) {
      toast.error(`Adapter not registered for ${lenderKey}.`)
      return
    }
    setSubmitting(true)
    const bcApplicationId = crypto.randomUUID()
    try {
      const [firstName = profile.name ?? '', ...rest] = (profile.name ?? '').split(' ')
      const lastName = rest.join(' ').trim() || firstName
      await adapter.createApplication({
        customerProfile: {
          email: profile.email,
          first_name: firstName,
          last_name: lastName,
          phone: profile.phone,
        },
        projectScope: {
          service_category: 'general',
          estimated_amount_cents: amountCents,
        },
        bcApplicationId,
      })
      toast.success('Application submitted. We will email you when there is an update.')
      onOpenChange(false)
      navigate(`/home/financing/status/${bcApplicationId}`)
    } catch (err) {
      if (err instanceof AdapterCapabilityError) {
        toast.error('Financing adapter not yet wired. Please try again shortly.')
      } else {
        const msg = err instanceof Error ? err.message : 'Unable to submit application.'
        toast.error(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="financing-adapter-dialog">
        <DialogHeader>
          <DialogTitle>Pre-fill application — {adapterDisplayName(lenderKey)}</DialogTitle>
          <DialogDescription>
            Submit your project details and we will pre-fill {adapterDisplayName(lenderKey)}&apos;s
            application. Approvals typically come back within one business day.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" data-testid="financing-apply-form">
          <div className="flex flex-col gap-2">
            <Label htmlFor="adapter-amount">Project amount</Label>
            <Input
              id="adapter-amount"
              inputMode="decimal"
              placeholder="e.g. 12,500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="financing-apply-amount"
            />
            <p className="text-xs text-muted-foreground">
              Best estimate of the total project cost. You can update later if the scope changes.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="adapter-term">Preferred term</Label>
            <Select value={term} onValueChange={(v) => v && setTerm(v)}>
              <SelectTrigger id="adapter-term" data-testid="financing-apply-term">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Longer terms lower the monthly payment but increase total interest paid.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} data-testid="financing-apply-submit">
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default FinancingAdapterDialog
