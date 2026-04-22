import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { MOCK_VENDORS } from '@/lib/mock-data'

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
    // Primary: UUID-mapped mock vendor via DEMO_VENDOR_UUID_BY_MOCK_ID.
    // Seeded for the Apex/Shield/Paradise demo vendors pre-#217.
    const entry = Object.entries(DEMO_VENDOR_UUID_BY_MOCK_ID).find(
      ([, uuid]) => uuid === profile.id
    )
    if (entry) {
      const mockVendorId = entry[0]
      return { mockVendorId, vendorId: mockVendorId, isMock: true }
    }
    // Ship #217 fallback: email-match against MOCK_VENDORS. Added so
    // the single v-demo vendor linked to vendor@buildc.net demo login
    // resolves correctly without requiring its real Supabase UUID in
    // the DEMO_VENDOR_UUID_BY_MOCK_ID map (that map is auto-generated
    // by scripts/seed-vendor-prices.mjs and only contains the
    // originally-seeded demo vendor UUIDs — adding v-demo to it
    // requires a separate Bode action if desired, but the email-match
    // fallback makes the demo-vendor flow work without it).
    const byEmail = MOCK_VENDORS.find((v) => v.email === profile.email)
    if (byEmail) {
      return { mockVendorId: byEmail.id, vendorId: byEmail.id, isMock: true }
    }
    return { mockVendorId: null, vendorId: profile.id, isMock: false }
  }, [profile])
}
