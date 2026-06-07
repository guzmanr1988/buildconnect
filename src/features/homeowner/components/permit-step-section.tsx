import { useEffect, useState } from 'react'
import {
  useCartStore,
  type ProjectPermitWaiver,
  type ProjectYesNoChoice,
} from '@/stores/cart-store'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Standard project-permit step shape used by every wizard + inline
// configurator. Reads/writes cart-store projectPermit + projectPermitWaiver
// (project-level SoT). Per kratos verdict 2026-05-07 (Q1/Q4/Q6): same copy
// across every flow, identical waiver semantics, no per-flow forking.
//
// task_1780776240716_817 widened the step to also cover the Association
// question (every service). Step title constants updated accordingly so
// consumers don't need to know about the second Q.
//
// Re-scope 2026-06-07 (kratos arc#21 Part A): Association is now PURE Y/N
// mirroring the Permit question — no upload at submission time. Customers
// must be able to submit + match a contractor with zero document upload.
// The association permit document moves to engagement-time (Part B, after
// the customer has selected/engaged a contractor); the doc-fetch + display
// scaffolding (AssociationDisplayRow with onDownload) is kept dormant for
// Part B reactivation.
export const PERMIT_HEADING = 'A few last questions'
export const PERMIT_SUBTITLE = 'These help us match you with the right paperwork up front.'

export const ASSOCIATION_HEADING = 'Do you have an association?'
export const ASSOCIATION_SUBTITLE = 'Some neighborhoods require an HOA / association permit before work can start.'

export function isProjectPermitValid(
  permit: 'yes' | 'no' | null,
  waiver: ProjectPermitWaiver | null,
): boolean {
  if (permit === 'yes') return true
  if (permit === 'no' && waiver?.acknowledged && waiver.signedName.trim().length >= 2) return true
  return false
}

// Pure Y/N — answer must be 'yes' or 'no'. No document requirement.
// Part B engagement-time upload is a separate gate on a different surface.
export function isProjectAssociationValid(
  association: ProjectYesNoChoice | null,
): boolean {
  return association === 'yes' || association === 'no'
}

// Read-only display row for parent surfaces (cart project-detail dialog,
// admin project-detail-dialog, anywhere a snapshot is shown). Permit lives
// at project level, not roofing-spec level, so this row sits at parent
// contexts rather than inside RoofSpecCard.
export function PermitDisplayRow({ permit }: { permit: 'yes' | 'no' | undefined | null }) {
  if (!permit) return null
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permit</h4>
      <div className="flex flex-col gap-1">
        <Badge
          variant="secondary"
          className={`text-sm px-3 py-1 w-fit ${
            permit === 'yes'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          }`}
        >
          {permit === 'yes' ? 'Yes — permit will be pulled' : 'No permit'}
        </Badge>
        {permit === 'no' && (
          <span className="text-xs text-muted-foreground italic">Cash only — financing not available</span>
        )}
      </div>
    </div>
  )
}

// Read-only display row for the Association question (vendor + admin project
// detail surfaces). Mirrors PermitDisplayRow shape. When association is 'yes'
// AND a doc was uploaded, renders a download link alongside the badge.
export function AssociationDisplayRow({
  association,
  docFilename,
  onDownload,
}: {
  association: 'yes' | 'no' | undefined | null
  docFilename?: string
  onDownload?: () => void
}) {
  if (!association) return null
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Association</h4>
      <div className="flex flex-col gap-2">
        <Badge
          variant="secondary"
          className={`text-sm px-3 py-1 w-fit ${
            association === 'yes'
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {association === 'yes' ? 'Yes — association permit included' : 'No association'}
        </Badge>
        {association === 'yes' && docFilename && (
          <button
            type="button"
            onClick={onDownload}
            className="text-xs text-primary hover:underline text-left w-fit"
          >
            Download: {docFilename}
          </button>
        )}
      </div>
    </div>
  )
}

// Read-only display row for the Pool survey question. Pool-only — every
// other service leaves the value NULL so this returns null cleanly.
export function PoolSurveyDisplayRow({ survey }: { survey: 'yes' | 'no' | undefined | null }) {
  if (!survey) return null
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Property survey</h4>
      <Badge
        variant="secondary"
        className={`text-sm px-3 py-1 w-fit ${
          survey === 'yes'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {survey === 'yes' ? 'Yes — homeowner has survey' : 'No survey on file'}
      </Badge>
    </div>
  )
}

function AssociationSection() {
  const projectAssociation = useCartStore((s) => s.projectAssociation)
  const setProjectAssociation = useCartStore((s) => s.setProjectAssociation)

  return (
    <div className="flex flex-col gap-3" data-association-step-section="true">
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold text-foreground">{ASSOCIATION_HEADING}</h3>
        <p className="text-sm text-muted-foreground">{ASSOCIATION_SUBTITLE}</p>
      </div>

      <button
        type="button"
        onClick={() => setProjectAssociation('yes')}
        data-association-choice="yes"
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
          projectAssociation === 'yes'
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : 'border-border hover:border-primary/40 hover:bg-muted',
        )}
      >
        <div
          className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
            projectAssociation === 'yes' ? 'border-primary bg-primary' : 'border-muted-foreground',
          )}
        >
          {projectAssociation === 'yes' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Yes — I have an association</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your contractor will request the association permit form once you've matched.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setProjectAssociation('no')}
        data-association-choice="no"
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
          projectAssociation === 'no'
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : 'border-border hover:border-primary/40 hover:bg-muted',
        )}
      >
        <div
          className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
            projectAssociation === 'no' ? 'border-primary bg-primary' : 'border-muted-foreground',
          )}
        >
          {projectAssociation === 'no' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No — no association</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Skip this step and continue.
          </p>
        </div>
      </button>
    </div>
  )
}

function PermitSection() {
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
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold text-foreground">Do you need a permit?</h3>
        <p className="text-sm text-muted-foreground">
          Permits are required for full replacements in most Florida counties.
        </p>
      </div>

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

export function PermitStepSection() {
  return (
    <div className="flex flex-col gap-6">
      <AssociationSection />
      <PermitSection />
    </div>
  )
}

export const POOL_SURVEY_HEADING = 'Do you have the survey of the property?'
export const POOL_SURVEY_SUBTITLE = 'A property survey helps us plan the pool layout and confirm setback distances.'

export function isPoolSurveyValid(survey: ProjectYesNoChoice | null): boolean {
  return survey === 'yes' || survey === 'no'
}

// Pool-only survey question — plain Yes / No (no upload). Mirrors
// AssociationSection styling so the step keeps a consistent shape, but lives
// outside the shared PermitStepSection so non-Pool flows never see it.
export function PoolSurveySection() {
  const poolSurvey = useCartStore((s) => s.poolSurvey)
  const setPoolSurvey = useCartStore((s) => s.setPoolSurvey)

  return (
    <div className="flex flex-col gap-3" data-pool-survey-section="true">
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold text-foreground">{POOL_SURVEY_HEADING}</h3>
        <p className="text-sm text-muted-foreground">{POOL_SURVEY_SUBTITLE}</p>
      </div>

      <button
        type="button"
        onClick={() => setPoolSurvey('yes')}
        data-pool-survey-choice="yes"
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
          poolSurvey === 'yes'
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : 'border-border hover:border-primary/40 hover:bg-muted',
        )}
      >
        <div
          className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
            poolSurvey === 'yes' ? 'border-primary bg-primary' : 'border-muted-foreground',
          )}
        >
          {poolSurvey === 'yes' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Yes — I have a survey</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The contractor will request a copy before scheduling layout.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setPoolSurvey('no')}
        data-pool-survey-choice="no"
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
          poolSurvey === 'no'
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : 'border-border hover:border-primary/40 hover:bg-muted',
        )}
      >
        <div
          className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
            poolSurvey === 'no' ? 'border-primary bg-primary' : 'border-muted-foreground',
          )}
        >
          {poolSurvey === 'no' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No — no survey on file</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The contractor can order or verify one as part of the project.
          </p>
        </div>
      </button>
    </div>
  )
}
