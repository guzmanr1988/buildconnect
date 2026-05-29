import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { deriveInitials } from '@/lib/initials'
import type { Vendor } from '@/types'

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
    // Ship #222 — demo-alias LS override (priority-0, before UUID map).
    // Vendor demo login handler in login.tsx sets 'buildconnect-demo-
    // mock-vendor-id' = 'v-1' so the generic Vendor demo account
    // resolves to Apex scope for this session. Lets Vendor demo see
    // leads that homeowners send to Apex on vendor-compare. Cleared on
    // Homeowner/Admin demo login so the alias doesn't leak cross-role.
    if (typeof window !== 'undefined') {
      const demoAlias = localStorage.getItem('buildconnect-demo-mock-vendor-id')
      if (demoAlias && MOCK_VENDOR_IDS.has(demoAlias)) {
        return { mockVendorId: demoAlias, vendorId: demoAlias, isMock: true }
      }
    }
    const entry = Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID).find(
      ([, uuid]) => uuid === profile.id
    )
    const mockVendorId = entry ? entry[0] : null
    const vendorId = mockVendorId ?? profile.id
    return { mockVendorId, vendorId, isMock: !!mockVendorId }
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
export function useResolvedVendor(): Vendor | null {
  const { mockVendorId } = useVendorScope()
  const profile = useAuthStore((s) => s.profile)
  return useMemo(() => {
    if (mockVendorId) {
      const m = MOCK_VENDORS.find((v) => v.id === mockVendorId)
      if (m) return m
    }
    if (!profile) return null
    // Ship #333 Phase A — account_rep auth-resolution. Reps resolve to
    // their PARENT vendor's profile via account_rep_for_vendor_id FK.
    // Per banked CHAIN IS GOD: this is auth-resolution-layer (which
    // Vendor profile to use), NOT chain modification (chain consumes
    // Vendor type the same way regardless of resolution-path). Adds-to-
    // chain (new resolution path) without changing how chain works.
    // Real Supabase fetch of parent profile lands in Phase B; for Phase
    // A the synthesized vendor-shape returns null when parent FK is
    // unset so reps without a parent vendor see empty-state rather than
    // crash.
    if (profile.role === 'account_rep') {
      // Phase A: parent-vendor resolution requires fetching parent
      // profile. Real fetch lands in Phase B. For now return null so
      // dashboard renders empty-state instead of synth-from-rep-profile
      // (which would give wrong company / commission_pct). Reps who
      // log in pre-Phase-B see auth-success + empty-vendor-context;
      // navigation works but lead-data unscoped until Phase B wires
      // the parent fetch.
      return null
    }
    if (profile.role !== 'vendor') return null
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: 'vendor',
      phone: profile.phone ?? '',
      address: profile.address ?? '',
      company: profile.company ?? profile.name,
      avatar_color: profile.avatar_color ?? '#3b82f6',
      initials: profile.initials ?? deriveInitials(profile.name),
      status: profile.status ?? 'active',
      created_at: profile.created_at ?? new Date().toISOString(),
      service_categories: [],
      rating: 0,
      response_time: '—',
      verified: false,
      financing_available: false,
      total_reviews: 0,
      // Ship #290 — Rodolfo-direct: platform-default commission for
      // new vendor signups is 10%. Admin override via setVendorCommission
      // (#286-#289 Save Changes flow) takes precedence per existing
      // vendorCommissionOverrides resolution. Pre-#290 default was 15;
      // changed to match Rodolfo's "every vendor that signs up the
      // preset % is 10% unless I go and manually adjust" directive.
      // MOCK_VENDORS fixtures (v-1..v-5) keep their per-fixture values
      // per kratos lean — Rodolfo's "signs up" language targets new-
      // signups, not pre-existing fixtures.
      commission_pct: 10,
    }
  }, [mockVendorId, profile])
}
