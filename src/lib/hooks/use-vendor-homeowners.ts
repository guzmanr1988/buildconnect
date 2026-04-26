import { useMemo } from 'react'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useProjectsStore } from '@/stores/projects-store'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
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
  const mockLeads = useEffectiveMockLeads()

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
      .filter((l) => l.vendor_id === vendorId)
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

    // (b) sentProjects filtered by contractor.vendor_id (preferred) or
    // contractor.company (legacy fallback). #214 strict-filter shape.
    sentProjects
      .filter((sp) => {
        if (sp.contractor?.vendor_id) return sp.contractor.vendor_id === vendor.id
        return sp.contractor?.company === vendor.company
      })
      .forEach((sp) => {
        if (!sp.homeowner?.email) return
        const fixtureMatch =
          MOCK_HOMEOWNERS.find((h) => h.email === sp.homeowner!.email) ??
          ADMIN_FIXTURE_HOMEOWNERS.find((h) => h.email === sp.homeowner!.email)
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

    // (c) Admin-fixture homeowners whose CUSTOMER_PROJECTS reference
    // this vendor.company. Surfaces ho-N entries from the admin demo
    // seed even when no MOCK_LEADS or sentProjects exist for them.
    Object.entries(HOMEOWNER_VENDOR_COMPANIES).forEach(([hoId, companies]) => {
      if (!companies.includes(vendor.company)) return
      const entry = ADMIN_FIXTURE_HOMEOWNERS.find((h) => h.id === hoId)
      if (!entry) return
      const occurrences = companies.filter((c) => c === vendor.company).length
      bumpProjectCount({ ...entry, projectCount: occurrences })
    })

    return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [vendor, vendorId, mockLeads, sentProjects])
}
