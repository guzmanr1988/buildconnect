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
export const MOCK_VENDOR_IDS = new Set(['v-1', 'v-2', 'v-3', 'v-4', 'v-5'])

export function isMockVendor(id: string | null | undefined): boolean {
  return !!id && MOCK_VENDOR_IDS.has(id)
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
