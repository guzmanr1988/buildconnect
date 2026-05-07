import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ProjectPermitChoice, ProjectPermitWaiver } from '@/stores/cart-store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (choice: ProjectPermitChoice, waiver: ProjectPermitWaiver | null) => void
}

export function ProjectPermitDialog({ open, onOpenChange, onConfirm }: Props) {
  const [choice, setChoice] = useState<ProjectPermitChoice | null>(null)
  const [waiverAcknowledged, setWaiverAcknowledged] = useState(false)
  const [waiverName, setWaiverName] = useState('')

  const canSubmit =
    choice === 'yes' ||
    (choice === 'no' && waiverAcknowledged && waiverName.trim().length >= 2)

  const handleConfirm = () => {
    if (!canSubmit || !choice) return
    if (choice === 'yes') {
      onConfirm('yes', null)
    } else {
      onConfirm('no', {
        acknowledged: true,
        signedName: waiverName.trim(),
        signedAt: new Date().toISOString(),
      })
    }
    setChoice(null)
    setWaiverAcknowledged(false)
    setWaiverName('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Do you need a permit?</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <p className="text-xs text-muted-foreground">
            One question for the entire project. Vendors will price permit fees per service when applicable.
          </p>

          <button
            type="button"
            onClick={() => setChoice('yes')}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
              choice === 'yes'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border hover:border-primary/40 hover:bg-muted'
            )}
          >
            <div className={cn(
              'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
              choice === 'yes' ? 'border-primary bg-primary' : 'border-muted-foreground'
            )}>
              {choice === 'yes' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Yes — pull permits for this project</p>
              <p className="text-xs text-muted-foreground mt-0.5">Required for full replacements and most code-regulated work in FL.</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-1 font-medium">Financing options available with a permit.</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { setChoice('no'); setWaiverAcknowledged(false); setWaiverName('') }}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
              choice === 'no'
                ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-2 ring-amber-200 dark:ring-amber-800'
                : 'border-border hover:border-primary/40 hover:bg-muted'
            )}
          >
            <div className={cn(
              'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
              choice === 'no' ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground'
            )}>
              {choice === 'no' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No permit needed</p>
              <p className="text-xs text-muted-foreground mt-0.5">Repair-only or code-exempt work. Payment is cash, check, or wire only — no financing.</p>
            </div>
          </button>

          {choice === 'no' && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">Acknowledgment Required</p>
              <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
                I acknowledge that proceeding without a permit means I am personally responsible for any fines, penalties, or remediation costs imposed by the city or county if code-enforcement becomes involved. BuildConnect and the contractor are not liable for any penalties resulting from this decision.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waiverAcknowledged}
                  onChange={(e) => setWaiverAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-600 shrink-0"
                />
                <span className="text-xs text-amber-900 dark:text-amber-300">I understand and accept full responsibility.</span>
              </label>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-amber-800 dark:text-amber-400">Print full name</label>
                <Input
                  type="text"
                  value={waiverName}
                  onChange={(e) => setWaiverName(e.target.value)}
                  placeholder="Your full legal name"
                  className="bg-white dark:bg-background"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={!canSubmit}
            onClick={handleConfirm}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
