// Walker exclusion — shared filter for every reader of `profiles WHERE role='vendor'`
// that surfaces vendors in a Rod-facing directory / list / search view.
//
// Apollo's verification walkers provision isolated persona rows in prod
// (walker-vendor@buildc.net, walker-homeowner@buildc.net, and any future
// __walker__-prefixed literals) so their fire-time writes never touch demo
// personas Rod opens. But an unfiltered `.eq('role','vendor')` list read
// still returns those persona rows into consumer UIs alongside real vendors
// — the read-path leak caught 2026-07-24.
//
// String-prefix on name/company (not id-Set) is the load-bearing filter:
//   1. Structurally survives sibling __walker__ persona rows without
//      further code changes.
//   2. Matches the same __walker__ convention the L2 backend sweep already
//      keys on for sent_projects contamination. One tag across write + read.
//   3. Works regardless of the walker-vendor's status (active | suspended);
//      the ship-time end-state is active-but-excluded.
//
// Every reader of `profiles WHERE role='vendor'` that displays results in
// a Rod-facing list MUST import isWalkerVendor() and apply it in its
// client-side filter chain. Grep for isWalkerVendor before adding a new
// vendor list surface.

const WALKER_PREFIX = '__walker__'

export function isWalkerVendor(row: {
  name?: string | null
  company?: string | null
}): boolean {
  return (
    (row.name?.startsWith(WALKER_PREFIX) ?? false) ||
    (row.company?.startsWith(WALKER_PREFIX) ?? false)
  )
}

// sent_projects row-level predicate for the admin (unscoped) hydrate.
// Tenant-scoped hydrates (homeowner / vendor / account_rep) already
// filter by userUuid — walker rows only surface there when the user IS
// the walker's own identity, and those flows legitimately need to see
// their own rows. Only the admin branch (no tenant filter) leaks walker
// rows to Rod, so this predicate is applied only in that branch.
export function isWalkerProject(row: {
  contractor?: { name?: string | null; company?: string | null } | null
  homeowner_name?: string | null
}): boolean {
  const c = row.contractor
  return (
    (c?.name?.startsWith(WALKER_PREFIX) ?? false) ||
    (c?.company?.startsWith(WALKER_PREFIX) ?? false) ||
    (row.homeowner_name?.startsWith(WALKER_PREFIX) ?? false)
  )
}
