import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { deriveInitials } from '@/lib/initials'
import { supabase } from '@/lib/supabase'
import type { Profile, Vendor } from '@/types'

/**
 * Set of mock-vendor ids that MOCK_LEADS + MOCK_CLOSED_SALES fixtures are
 * scoped to. Only these 5 featured vendors see the seeded test-harness data.
 * Any other vendor (synthesized-from-profile, generic demo-vendor accounts,
 * authed-but-unmapped) sees their own sentProjects / assignedReps only.
 *
 * Gating discipline: MOCK_LEADS.filter(l => l.vendor_id === mockVendorId) is
 * already vendor-scoped, but without an additional check an authed profile
 * whose id happens to coincide with 'v-1'..'v-5' strings could collide. The
 * Set + helper make the test-harness scope explicit.
 */
// Source-of-truth union for featured mock-vendor IDs.
// Add/remove here AND in MOCK_VENDORS — the compile-time guard below
// will error at build time if the two fall out of sync.
export type MockVendorId = 'v-1' | 'v-2' | 'v-3' | 'v-4' | 'v-5'

// Compile-time guard (hardcoded-fixture-shape-assumption class).
// If any MockVendorId is absent from MOCK_VENDORS, Exclude<> produces a
// non-never type and the export fails tsc — surfacing the breakage at
// build time instead of as a silent undefined at runtime.
type _AssertNever<T extends never> = T
export type _FixtureGuard_MockVendorId = _AssertNever<
  Exclude<MockVendorId, (typeof MOCK_VENDORS)[number]['id']>
>

// Keep as Set<string> so callers can pass arbitrary strings without casting.
export const MOCK_VENDOR_IDS = new Set<string>(['v-1', 'v-2', 'v-3', 'v-4', 'v-5'])

// Keyed lookup record — O(1) access, no non-null assertion needed.
// Type is `Record<MockVendorId, Vendor>` so TypeScript knows every
// known ID resolves to a Vendor (not Vendor | undefined).
export const MOCK_VENDOR_BY_ID = Object.fromEntries(
  MOCK_VENDORS.map((v) => [v.id, v])
) as Record<MockVendorId, Vendor>

export function isMockVendor(id: string | null | undefined): boolean {
  return !!id && MOCK_VENDOR_IDS.has(id)
}

/**
 * Bidirectional match between a sentProject's contractor identity and
 * the resolved vendor object. Pre-launch fix for the identity-scheme
 * gap between booking-write side (vendor-compare.tsx writes
 * contractor.vendor_id from MOCK_VENDORS featured list, always a
 * mock-id like 'v-1') and read-side (useResolvedVendor returns
 * MOCK_VENDORS entry with id='v-1' for mapped accounts but synthesizes
 * vendor.id = profile.id (a real Supabase UUID) for unmapped vendors).
 *
 * Match attempts, in order:
 * 1. Direct id equality (mock==mock or UUID==UUID, after a future
 *    write-side normalization)
 * 2. Forward mock->UUID via DEMO_VENDOR_UUID_BY_MOCK_ID (today's
 *    common case: contractor stored as 'v-1', vendor synthesized
 *    as the corresponding UUID)
 * 3. Reverse UUID->mock (forward-compat for if booking-write switches
 *    schemes and starts writing UUIDs)
 * 4. Company-name fallback for legacy pre-#165 sentProjects that
 *    pre-date the contractor.vendor_id field
 *
 * Used by lead-inbox.tsx and vendor-lead-stages.ts so /vendor/projects
 * and /vendor/lead-workflow apply the same scope predicate (was
 * intentionally divergent pre-task_1776818232208_731 lift).
 */
export function contractorMatchesVendor(
  contractor: { vendor_id?: string; company?: string } | undefined,
  vendor: Vendor,
): boolean {
  if (!contractor) return false
  const cid = contractor.vendor_id
  if (cid) {
    if (cid === vendor.id) return true
    if (DEMO_VENDOR_UUID_BY_MOCK_ID[cid] === vendor.id) return true
    for (const [mockId, uuid] of Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID)) {
      if (uuid === cid && mockId === vendor.id) return true
    }
    // PR-#443 — fall through to company-name fallback when cid is
    // present but no UUID-path matches. Handles the UUID-flip case
    // where vendor-compare writes the post-flip APEX_REAL_UUID
    // (3e0821aa, PR-#437) into contractor.vendor_id but an authed
    // demo-Apex session resolves to MOCK_VENDORS v-1 whose seed-
    // script UUID is the pre-flip fc0d8ff3 (stale in DEMO_VENDOR_
    // UUID_BY_MOCK_ID since the seed script lags hand-edited FE
    // constants). Pre-PR-#443 the early `return false` here caused
    // demo-Apex sessions to see 0 leads in all 5 Lead Workflow
    // buckets while the unscoped Active Leads counter showed 1 —
    // the smoking-gun mismatch Rod surfaced 2026-05-29. Company-
    // name match is safe at this layer because `vendor` is the
    // authed session's resolved identity, so a company-name
    // collision means same logical vendor.
  }
  return !!contractor.company && contractor.company === vendor.company
}

/**
 * Resolve the current authed vendor's scope — returns:
 * - mockVendorId: string in 'v-1'..'v-5' if the profile maps to a featured
 *   mock vendor via DEMO_VENDOR_UUID_BY_MOCK_ID, else null.
 * - vendorId: the mock id when mapped, or the raw profile.id when not.
 * - isMock: true when the profile maps to a featured mock vendor (and thus
 *   should see MOCK_LEADS / MOCK_CLOSED_SALES fixtures).
 *
 * Replaces the hardcoded `const VENDOR_ID = 'v-1'` pattern in lead-inbox +
 * calendar + any other vendor surface that needs to scope fixture data.
 */
export function useVendorScope(): {
  mockVendorId: string | null
  vendorId: string
  isMock: boolean
} {
  const profile = useAuthStore((s) => s.profile)
  return useMemo(() => {
    if (!profile) return { mockVendorId: null, vendorId: '', isMock: false }
    // pin-20 — vendorId is ALWAYS the real profile.id. The Ship #222 LS-
    // override branch (`buildconnect-demo-mock-vendor-id`) is removed:
    // it caused real Apex vendor sessions to read `vendorId='v-1'` after
    // a plain reload, dropping live homeowner leads on the floor because
    // every DB query keyed on the mock string instead of the real UUID.
    // mockVendorId is still derived from the reverse-map so fixture
    // surfaces can scope MOCK_LEADS / MOCK_CLOSED_SALES — but it's a
    // SEPARATE field, never mixed into vendorId.
    const entry = Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID).find(
      ([, uuid]) => uuid === profile.id
    )
    const mockVendorId = entry ? entry[0] : null
    return { mockVendorId, vendorId: profile.id, isMock: !!mockVendorId }
  }, [profile])
}

/**
 * Resolve the current authed user into a full Vendor object — for surfaces
 * that need vendor-shaped fields (rating, response_time, commission_pct,
 * etc.) rather than just an id.
 *
 * - If the profile maps to a featured mock vendor (v-1..v-5), returns the
 *   MOCK_VENDORS entry (full fixture data).
 * - If the profile is a real authed vendor (role === 'vendor') without a
 *   mock mapping, synthesizes a Vendor from profile fields with sane
 *   defaults for fixture-only fields (rating=0, verified=false, etc.).
 * - If profile is null OR not a vendor, returns null. Critical guard —
 *   pre-#212 dashboard flashed a homeowner's name as the vendor name
 *   before the auth-redirect committed (Rod P0 2026-04-20).
 *
 * Extracted from dashboard.tsx + lead-inbox.tsx where this exact synthesis
 * was duplicated. task_1776818232208_731 — extraction was originally
 * scoped to also include the homeownerLeads filter, but post-#223 the
 * predicates intentionally diverge (dashboard permissive, lead-inbox
 * strict) so only the vendor resolution is deep-shared.
 */
// Synthesize a Vendor object from a vendor-role Profile. Shared by both
// the authed-vendor self-resolve path and the account_rep parent-vendor
// resolve path so both surfaces show identical vendor shape.
function profileToVendor(p: Profile): Vendor {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: 'vendor',
    phone: p.phone ?? '',
    address: p.address ?? '',
    company: p.company ?? p.name,
    avatar_color: p.avatar_color ?? '#3b82f6',
    initials: p.initials ?? deriveInitials(p.name),
    status: p.status ?? 'active',
    created_at: p.created_at ?? new Date().toISOString(),
    service_categories: [],
    rating: 0,
    response_time: '—',
    verified: false,
    financing_available: false,
    total_reviews: 0,
    // Ship #290 — Rodolfo-direct: platform-default commission for new
    // vendor signups is 10%. Admin override via setVendorCommission
    // takes precedence per existing vendorCommissionOverrides resolution.
    commission_pct: 10,
  }
}

// Ship #333 Phase B — fetch parent-vendor profile for an authed account_rep
// via the account_rep_for_vendor_id FK. Returns null while loading, when no
// FK is set, or when the parent profile can't be found (suspended/deleted/
// RLS-denied). Dashboard renders empty-state until the fetch resolves —
// same shape as Phase A's synchronous null-return so consumers don't need
// to differentiate loading vs unset.
// Phase B-RPC — calls the substrate-side SECURITY DEFINER function
// get_my_assigned_vendor() rather than SELECTing profiles directly, because
// the profiles RLS policy set (migration 010) has no account_rep -> assigned-
// vendor SELECT carve-out and a permissive table-level policy would over-
// expose vendor PII beyond the single assigned parent. The RPC scopes return
// to ONLY the calling rep's account_rep_for_vendor_id row via subquery —
// matches the auth_role() SECURITY DEFINER pattern already in migration 010.
// Hook is called unconditionally; internal `role !== 'account_rep'` gate
// skips the RPC otherwise.
function useRepParentVendor(): Vendor | null {
  const profile = useAuthStore((s) => s.profile)
  const isRep = profile?.role === 'account_rep'
  const [parent, setParent] = useState<Vendor | null>(null)
  useEffect(() => {
    let cancelled = false
    setParent(null)
    if (!isRep) return
    void (async () => {
      const { data, error } = await supabase
        .rpc('get_my_assigned_vendor')
        .maybeSingle()
      if (cancelled) return
      if (error) {
        console.error('[vendor-scope] rep parent-vendor RPC failed:', error.message)
        return
      }
      if (!data) return
      setParent(profileToVendor(data as Profile))
    })()
    return () => {
      cancelled = true
    }
  }, [isRep])
  return parent
}

export function useResolvedVendor(): Vendor | null {
  const { mockVendorId } = useVendorScope()
  const profile = useAuthStore((s) => s.profile)
  // Phase B — fetched parent vendor for account_rep role. Called
  // unconditionally per Rules of Hooks; internal gate skips fetch when
  // profile.role !== 'account_rep' or parent FK unset.
  const repParentVendor = useRepParentVendor()
  return useMemo(() => {
    if (mockVendorId) {
      const m = MOCK_VENDORS.find((v) => v.id === mockVendorId)
      if (m) return m
    }
    if (!profile) return null
    // Ship #333 Phase B — account_rep resolves to PARENT vendor's profile
    // via account_rep_for_vendor_id FK. Returns the fetched parent (or null
    // while loading / FK unset / parent missing). Per banked CHAIN IS GOD:
    // this is auth-resolution-layer (which Vendor profile to use), NOT
    // chain modification (chain consumes Vendor type the same way
    // regardless of resolution path).
    if (profile.role === 'account_rep') {
      return repParentVendor
    }
    if (profile.role !== 'vendor') return null
    return profileToVendor(profile)
  }, [mockVendorId, profile, repParentVendor])
}
