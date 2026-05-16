import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth-store'
import { isFinancingEnabled } from '@/lib/financing/feature-flag'
import { getActiveAdapter, listRegisteredAdapters } from '@/lib/financing/adapters'
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

export function FinancingApplyPage() {
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()

  const [amount, setAmount] = useState('')
  const [term, setTerm] = useState('60')
  const adapterKeys = listRegisteredAdapters()
  const [lenderKey, setLenderKey] = useState<string>(getActiveAdapter().key)
  const [submitting, setSubmitting] = useState(false)

  if (!isFinancingEnabled()) {
    return <Navigate to="/home" replace />
  }
  if (!profile) {
    return <Navigate to="/login" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountCents = dollarsToCents(amount)
    if (amountCents === null || amountCents <= 0) {
      toast.error('Enter a valid project amount.')
      return
    }
    setSubmitting(true)
    const bcApplicationId = crypto.randomUUID()
    try {
      const adapter = getActiveAdapter()
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
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/home')}
          className="-ml-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Home
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Apply for financing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about your project and we will route your application to our financing partners.
          Approvals typically come back within one business day.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" data-testid="financing-apply-form">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Project amount</Label>
          <Input
            id="amount"
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
          <Label htmlFor="term">Preferred term</Label>
          <Select value={term} onValueChange={(v) => v && setTerm(v)}>
            <SelectTrigger id="term" data-testid="financing-apply-term">
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="lender">Lender</Label>
          <Select value={lenderKey} onValueChange={(v) => v && setLenderKey(v)}>
            <SelectTrigger id="lender" data-testid="financing-apply-lender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {adapterKeys.map((key) => (
                <SelectItem key={key} value={key}>
                  {adapterDisplayName(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            We will send your application to the selected partner first. If denied, we can route to
            another partner from your account.
          </p>
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto"
          data-testid="financing-apply-submit"
        >
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>

        <p className="text-xs text-muted-foreground">
          Submitting routes your information to the lender for review. BuildConnect does not perform a
          credit check; the lender will determine what credit-check method applies to your application.
        </p>
      </form>
    </div>
  )
}

export default FinancingApplyPage
