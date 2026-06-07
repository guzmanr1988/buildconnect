import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeadStageMeta, LeadStageKey } from '@/lib/vendor-lead-stages'

// PR-275 — pipeline preview row shared across admin/workflow,
// vendor/dashboard, and vendor/lead-workflow. Single-SoT renderer
// for the 5-card stage-summary pattern (colored icon-square + big
// number + label) with chevron separators between cards. Extracted
// from admin/workflow.tsx L269-292 inline per banked feedback_
// wizard_inline_duplicate_systematic_class — admin had the original
// pattern (N=1) and the vendor port creates 2 new sites (N=2/N=3),
// so we extract on first detection.
//
// Click behavior resolves in this precedence order:
//   1. hrefForStage(key) → wrap each card in <Link> (admin dashboard
//      deep-link contract — currently /vendor/lead-workflow?stage=)
//   2. onStageClick(key) → wrap each card in <button> (vendor/lead-
//      workflow scroll-and-expand pattern)
//   3. neither → plain <div> (admin/workflow informational case)
//
// pulseByKey is optional; when present, applies animate-pulse to the
// icon-square for stages where pulseByKey[key] is true. Falls back
// to stage.pulse if not provided. Admin currently omits; vendor
// passes STAGE_PULSE_BY_KEY.
export interface PipelineStatRowProps {
  stages: LeadStageMeta[]
  counts: Record<LeadStageKey, number>
  hrefForStage?: (key: LeadStageKey) => string
  onStageClick?: (key: LeadStageKey) => void
  pulseByKey?: Record<LeadStageKey, boolean>
  className?: string
  // testid namespace for downstream walker assertions (admin uses
  // data-workflow-stage; vendor uses data-vendor-pipeline-stage).
  testIdPrefix?: string
}

export function PipelineStatRow({
  stages,
  counts,
  hrefForStage,
  onStageClick,
  pulseByKey,
  className,
  testIdPrefix = 'pipeline-stage',
}: PipelineStatRowProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:flex lg:items-center lg:justify-between', className)}>
      {stages.map((stage, idx) => {
        const StageIcon = stage.icon
        const count = counts[stage.key] ?? 0
        const pulse = pulseByKey ? pulseByKey[stage.key] : stage.pulse
        const cardClass = cn(
          'flex-1 rounded-xl border p-3 sm:p-4 text-center transition',
          stage.bgColor,
          stage.borderColor,
          (hrefForStage || onStageClick) && 'hover:shadow-md cursor-pointer',
        )
        const cardInner = (
          <>
            <div className={cn('inline-flex items-center justify-center rounded-lg p-2 mb-2', stage.color, pulse && 'animate-pulse')}>
              <StageIcon className="h-4 w-4 text-white" />
            </div>
            <p className="text-2xl font-bold font-heading">{count}</p>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{stage.title}</p>
          </>
        )
        let card: React.ReactNode
        if (hrefForStage) {
          card = (
            <Link
              to={hrefForStage(stage.key)}
              className={cardClass}
              data-stage-key={stage.key}
              data-stage-count={count}
              data-testid={`${testIdPrefix}-${stage.key}`}
              aria-label={`${stage.title}: ${count}`}
            >
              {cardInner}
            </Link>
          )
        } else if (onStageClick) {
          card = (
            <button
              type="button"
              onClick={() => onStageClick(stage.key)}
              className={cn(cardClass, 'block w-full')}
              data-stage-key={stage.key}
              data-stage-count={count}
              data-testid={`${testIdPrefix}-${stage.key}`}
              aria-label={`${stage.title}: ${count}`}
            >
              {cardInner}
            </button>
          )
        } else {
          card = (
            <div
              className={cardClass}
              data-stage-key={stage.key}
              data-stage-count={count}
              data-testid={`${testIdPrefix}-${stage.key}`}
            >
              {cardInner}
            </div>
          )
        }
        return (
          <div key={stage.key} className="flex items-center gap-2 sm:gap-3 flex-1">
            {card}
            {idx < stages.length - 1 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0 hidden lg:block" />
            )}
          </div>
        )
      })}
    </div>
  )
}
