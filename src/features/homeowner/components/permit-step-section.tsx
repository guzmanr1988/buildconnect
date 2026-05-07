import { useEffect, useState } from 'react'
import { useCartStore, type ProjectPermitWaiver } from '@/stores/cart-store'
import { cn } from '@/lib/utils'

// Standard project-permit step shape used by every wizard + inline
// configurator. Reads/writes cart-store projectPermit + projectPermitWaiver
// (project-level SoT). Per kratos verdict 2026-05-07 (Q1/Q4/Q6): same copy
// across every flow, identical waiver semantics, no per-flow forking.
export const PERMIT_HEADING = 'Do you need a permit?'
export const PERMIT_SUBTITLE = 'Permits are required for full replacements in most Florida counties.'

export function isProjectPermitValid(
  permit: 'yes' | 'no' | null,
  waiver: ProjectPermitWaiver | null,
): boolean {
  if (permit === 'yes') return true
  if (permit === 'no' && waiver?.acknowledged && waiver.signedName.trim().length >= 2) return true
  return false
}

export function PermitStepSection() {
  const projectPermit = useCartStore((s) => s.projectPermit)
  const setProjectPermit = useCartStore((s) => s.setProjectPermit)
  const projectPermitWaiver = useCartStore((s) => s.projectPermitWaiver)
  const setProjectPermitWaiver = useCartStore((s) => s.setProjectPermitWaiver)

  const [waiverAcknowledged, setWaiverAcknowledged] = useState<boolean>(
    projectPermitWaiver?.acknowledged ?? false,
  )
  const [waiverName, setWaiverName] = useState<string>(
    projectPermitWaiver?.signedName ?? '',
  )

  useEffect(() => {
    if (projectPermit !== 'no') return
    if (waiverAcknowledged && waiverName.trim().length >= 2) {
      setProjectPermitWaiver({
        acknowledged: true,
        signedName: waiverName.trim(),
        signedAt: new Date().toISOString(),
      })
    } else {
      setProjectPermitWaiver(null)
    }
  }, [projectPermit, waiverAcknowledged, waiverName, setProjectPermitWaiver])

  function selectYes() {
    setProjectPermit('yes')
    setProjectPermitWaiver(null)
    setWaiverAcknowledged(false)
    setWaiverName('')
  }

  function selectNo() {
    setProjectPermit('no')
    setWaiverAcknowledged(false)
    setWaiverName('')
  }

  return (
    <div className="flex flex-col gap-3" data-permit-step-section="true">
      <button
        type="button"
        onClick={selectYes}
        data-permit-choice="yes"
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
          projectPermit === 'yes'
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : 'border-border hover:border-primary/40 hover:bg-muted',
        )}
      >
        <div
          className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
            projectPermit === 'yes' ? 'border-primary bg-primary' : 'border-muted-foreground',
          )}
        >
          {projectPermit === 'yes' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Yes — include permit</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required for full replacements in most FL counties. Adds ~2 weeks but ensures code compliance.
          </p>
          <p className="text-xs text-green-700 dark:text-green-400 mt-1 font-medium">
            Financing options available with permit.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={selectNo}
        data-permit-choice="no"
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
          projectPermit === 'no'
            ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-2 ring-amber-200 dark:ring-amber-800'
            : 'border-border hover:border-primary/40 hover:bg-muted',
        )}
      >
        <div
          className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
            projectPermit === 'no' ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground',
          )}
        >
          {projectPermit === 'no' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No permit needed</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            For repairs. Payment is cash, check, or wire transfer only.
          </p>
        </div>
      </button>

      {projectPermit === 'no' && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
            Acknowledgment Required
          </p>
          <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
            I acknowledge that proceeding without a permit means I am personally responsible for any fines, penalties, or remediation costs imposed by the city or county if code-enforcement becomes involved. BuildConnect and the contractor are not liable for any penalties resulting from this decision.
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={waiverAcknowledged}
              onChange={(e) => setWaiverAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-600 shrink-0"
              data-permit-waiver-ack="true"
            />
            <span className="text-xs text-amber-900 dark:text-amber-300">
              I understand and accept full responsibility.
            </span>
          </label>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-amber-800 dark:text-amber-400">
              Print full name
            </label>
            <input
              type="text"
              value={waiverName}
              onChange={(e) => setWaiverName(e.target.value)}
              placeholder="Your full legal name"
              className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              data-permit-waiver-name="true"
            />
          </div>
        </div>
      )}
    </div>
  )
}
