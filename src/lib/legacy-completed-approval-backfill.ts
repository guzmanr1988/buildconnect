import { useProjectsStore } from '@/stores/projects-store'

// Ship #318 — one-time backfill for pre-#317 sentProjects where the
// vendor pressed Project Completed (completedAt set) before the
// approval-gate landed. Without this backfill, those entries would
// fail the new strict bucketing rule (Projects Completed requires
// reviewStatus='approved') and snap back into Sold Active with the
// "Project Completed" button disabled — visible regression for
// pre-existing user state.
//
// Backfill stamps reviewStatus='approved' + reviewedAt + reviewedBy=
// 'legacy-backfill' on every entry where completedAt is set AND
// reviewStatus is undefined (legacy state). Per #94 truthfulness:
// reviewedBy explicitly names the migration source so the audit trail
// remains honest about how the entry got approved.
//
// Idempotent via localStorage flag + per-entry guard (skip if already
// has any reviewStatus). Sibling-pattern of legacy-data-backfill-as-
// rule-enforcement-companion class banked at #143 anchor.

const BACKFILL_FLAG_KEY = 'buildconnect-legacy-approval-backfilled'
const LEGACY_REVIEWED_BY = 'legacy-backfill'

export function maybeBackfillLegacyApprovals(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(BACKFILL_FLAG_KEY)) return
  } catch {
    return
  }

  const projectsStore = useProjectsStore.getState()
  const targets = projectsStore.sentProjects.filter(
    (p) => !!p.completedAt && p.reviewStatus === undefined,
  )

  if (targets.length === 0) {
    // Nothing to backfill. Set flag anyway so we skip the no-op walk
    // on every future mount.
    try { localStorage.setItem(BACKFILL_FLAG_KEY, '1') } catch {}
    return
  }

  const now = new Date().toISOString()
  useProjectsStore.setState((state) => ({
    sentProjects: state.sentProjects.map((p) => {
      if (!p.completedAt || p.reviewStatus !== undefined) return p
      return {
        ...p,
        reviewStatus: 'approved',
        reviewedAt: now,
        reviewedBy: LEGACY_REVIEWED_BY,
      }
    }),
  }))

  try { localStorage.setItem(BACKFILL_FLAG_KEY, '1') } catch {}
}
