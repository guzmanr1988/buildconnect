import { useMemo } from 'react'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useVendorScope, useResolvedVendor, contractorMatchesVendor } from '@/lib/vendor-scope'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS } from '@/lib/mock-data'

// Ship #278 — extracted from src/features/vendor/pages/homeowners.tsx
// (#277 inline) at n=2 consumers per banked format-SoT-shared-helper
// rule. Roster page (#277) lists all; detail page (#278) finds-by-
// email. Same 3-source dedup-by-email, same vendor scope, same
// fixture bridge. Genuine deep-match — keeps the two consumers
// consistent if the derivation logic ever needs adjustment.

export interface VendorHomeownerEntry {
  id: string
  name: string
  email: string
  phone: string
  address: string
  avatar_color?: string
  initials?: string
  projectCount: number
}

// Local fixture mirror of admin/homeowners.tsx HOMEOWNERS const.
// Inline-duplicated because admin's array is not exported. Per banked
// surface-vs-deep audit: extract to a SHARED fixture module only when
// a 3rd consumer surfaces (currently 2: admin/homeowners + this hook).
const ADMIN_FIXTURE_HOMEOWNERS: VendorHomeownerEntry[] = [
  { id: 'ho-1', name: 'Maria Rodriguez', email: 'maria@email.com', phone: '(305) 555-0101', address: '1234 Coral Way, Miami, FL 33145', avatar_color: '#3b82f6', initials: 'MR', projectCount: 0 },
  { id: 'ho-2', name: 'James Thompson', email: 'james@email.com', phone: '(786) 555-0202', address: '5678 Kendall Dr, Miami, FL 33156', avatar_color: '#8b5cf6', initials: 'JT', projectCount: 0 },
  { id: 'ho-3', name: 'Sarah Chen', email: 'sarah@email.com', phone: '(954) 555-0303', address: '910 Princeton Blvd, Homestead, FL 33032', avatar_color: '#ec4899', initials: 'SC', projectCount: 0 },
  { id: 'ho-4', name: 'David Gonzalez', email: 'david.g@email.com', phone: '(305) 555-0404', address: '2200 Biscayne Blvd, Miami, FL 33137', avatar_color: '#f59e0b', initials: 'DG', projectCount: 0 },
  { id: 'ho-5', name: 'Lisa Patel', email: 'lisa.patel@email.com', phone: '(786) 555-0505', address: '4400 Collins Ave, Miami Beach, FL 33140', avatar_color: '#10b981', initials: 'LP', projectCount: 0 },
]

// Static map of homeowner → vendor.company strings (mirrors admin/
// homeowners.tsx CUSTOMER_PROJECTS contractor_assigned). Drives the
// source-c filter — surfaces fixture homeowners whose projects
// reference this vendor even when no MOCK_LEADS or sentProjects
// match.
const HOMEOWNER_VENDOR_COMPANIES: Record<string, string[]> = {
  'ho-1': ['Apex Roofing & Solar', 'Elite Paving Co', 'Paradise Pools FL'],
  'ho-2': ['Shield Impact Windows', 'Apex Roofing & Solar', 'Elite Paving Co'],
  'ho-3': ['Paradise Pools FL', 'Cool Breeze HVAC'],
  'ho-4': ['Shield Impact Windows', 'Paradise Pools FL'],
  'ho-5': ['Apex Roofing & Solar', 'Cool Breeze HVAC'],
}

export function useVendorHomeowners(): VendorHomeownerEntry[] {
  const { vendorId } = useVendorScope()
  const vendor = useResolvedVendor()
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const accountRepIdByLead = useProjectsStore((s) => s.accountRepIdByLead)
  const mockLeads = useEffectiveMockLeads()
  const profile = useAuthStore((s) => s.profile)
  const isRep = profile?.role === 'account_rep'
  // Clear Demo gate — source (c) below pulls hardcoded fixture homeowners
  // from HOMEOWNER_VENDOR_COMPANIES; honor demoDataHidden so the wipe
  // surfaces here too (mirrors useEffectiveMockLeads gating sources a/b).
  const demoDataHidden = useAdminModerationStore((s) => s.demoDataHidden)

  return useMemo(() => {
    if (!vendor) return []
    const byEmail = new Map<string, VendorHomeownerEntry>()
    const bumpProjectCount = (entry: VendorHomeownerEntry) => {
      const prior = byEmail.get(entry.email)
      if (prior) {
        prior.projectCount += entry.projectCount
      } else {
        byEmail.set(entry.email, { ...entry })
      }
    }

    // (a) MOCK_LEADS scoped by vendor_id — homeowner_name + email +
    // phone + address per lead row. Look up MOCK_HOMEOWNERS for
    // avatar/initials when matchable.
    mockLeads
      .filter((l) => {
        if (l.vendor_id !== vendorId) return false
        if (isRep && profile?.id) {
          return l.account_rep_id === profile.id || accountRepIdByLead[l.id] === profile.id
        }
        return true
      })
      .forEach((l) => {
        const fixtureMatch = MOCK_HOMEOWNERS.find((h) => h.email === l.email)
        bumpProjectCount({
          id: fixtureMatch?.id ?? l.homeowner_id,
          name: fixtureMatch?.name ?? l.homeowner_name,
          email: l.email,
          phone: l.phone,
          address: l.address,
          avatar_color: fixtureMatch?.avatar_color,
          initials: fixtureMatch?.initials,
          projectCount: 1,
        })
      })

    // (b) sentProjects filtered via contractorMatchesVendor — bidirectional
    // mock-id ↔ UUID match through DEMO_VENDOR_UUID_BY_MOCK_ID (forward +
    // reverse + company-name legacy fallback). PR-#443 closed this class at
    // the helper for lead-inbox / vendor-lead-stages but this consumer was
    // never migrated — naive direct equality `sp.contractor.vendor_id !==
    // vendor.id` compared real Supabase UUIDs against mock-id strings
    // ('v-1'..'v-5') for demo-vendor sessions where useResolvedVendor
    // returns the MOCK_VENDORS fixture (vendor.id='v-1') for profile.id
    // 3e0821aa. Symptom: real-substrate rows whose contractor.vendor_id is
    // the real UUID were filtered out → invisible-homeowner class on the
    // /vendor/homeowners roster + detail surfaces.
    sentProjects
      .filter((sp) => {
        if (!contractorMatchesVendor(sp.contractor, vendor)) return false
        if (isRep && profile?.id) {
          const leadId = `L-${sp.id.slice(0, 4).toUpperCase()}`
          return accountRepIdByLead[leadId] === profile.id
        }
        return true
      })
      .forEach((sp) => {
        if (!sp.homeowner?.email) return
        // pin-23 — demo-id gate. When demoDataHidden=true, seed-match
        // returns null and the `??` ops downstream fall through to
        // sp.homeowner.{name,phone,address} direct fields. Real-row
        // path untouched. mk-standalone (admin-count tiles / admin
        // reports) deferred to pin-24+ DB-query swap.
        const fixtureMatch = !demoDataHidden
          ? (MOCK_HOMEOWNERS.find((h) => h.email === sp.homeowner!.email) ??
             ADMIN_FIXTURE_HOMEOWNERS.find((h) => h.email === sp.homeowner!.email))
          : null
        bumpProjectCount({
          id: fixtureMatch?.id ?? sp.id,
          name: fixtureMatch?.name ?? sp.homeowner.name,
          email: sp.homeowner.email,
          phone: fixtureMatch?.phone ?? sp.homeowner.phone,
          address: fixtureMatch?.address ?? sp.homeowner.address,
          avatar_color: fixtureMatch?.avatar_color,
          initials: fixtureMatch?.initials,
          projectCount: 1,
        })
      })

    // (c) Admin-fixture homeowners — only for vendor-admin, not reps.
    // Reps see only their assigned homeowners (sources a + b above).
    // Skipped when demoDataHidden so Clear Demo wipes this surface.
    if (isRep) return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name))
    if (!demoDataHidden) {
      Object.entries(HOMEOWNER_VENDOR_COMPANIES).forEach(([hoId, companies]) => {
        if (!companies.includes(vendor.company)) return
        const entry = ADMIN_FIXTURE_HOMEOWNERS.find((h) => h.id === hoId)
        if (!entry) return
        const occurrences = companies.filter((c) => c === vendor.company).length
        bumpProjectCount({ ...entry, projectCount: occurrences })
      })
    }

    return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [vendor, vendorId, mockLeads, sentProjects, isRep, profile?.id, accountRepIdByLead, demoDataHidden])
}
