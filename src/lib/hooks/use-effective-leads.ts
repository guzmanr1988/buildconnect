// Wave-9 9b — role-scoped conversation-source: real-mode queries
// sent_projects (the SoT for "contractors the homeowner is working with",
// migration 018) and maps each row to a Lead-shape carrying the frozen
// contractor.company snapshot so the UI can render vendor avatar/name
// without a MOCK_VENDORS lookup. The leads table stays empty in prod;
// pre-9b the hook read it and produced invisible threads. Demo-mode still
// reads MOCK_LEADS so ?demo=1 preserves the live-demo path.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import type { Lead, ServiceCategory, LeadStatus } from '@/types'

export type LeadThread = Lead & {
  // Snapshot fallbacks for vendor display when vendor_id is a real auth.uid
  // (no MOCK_VENDORS entry). Frozen on sent_projects.contractor at booking.
  contractor_company?: string
  contractor_initials?: string
  contractor_avatar_color?: string
}

type SentProjectRow = {
  id: string
  homeowner_id: string
  vendor_id: string
  item: { serviceId?: string; serviceName?: string } & Record<string, unknown>
  contractor: { company?: string; name?: string; initials?: string; avatar_color?: string } & Record<string, unknown>
  booking_date: string
  booking_time: string
  homeowner_name: string | null
  homeowner_phone: string | null
  homeowner_email: string | null
  homeowner_address: string | null
  status: 'pending' | 'approved' | 'declined' | 'sold'
  sent_at: string
  quoted_price_cents: number | null
}

function deriveInitials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function mapSentProjectToThread(sp: SentProjectRow): LeadThread {
  const company = sp.contractor?.company || sp.contractor?.name || 'Contractor'
  const serviceName = sp.item?.serviceName || 'Project'
  return {
    id: sp.id,
    homeowner_id: sp.homeowner_id,
    vendor_id: sp.vendor_id,
    project: serviceName,
    value: (sp.quoted_price_cents ?? 0) / 100,
    status: (sp.status === 'declined' ? 'rejected' : sp.status === 'approved' ? 'confirmed' : sp.status) as LeadStatus,
    slot: `${sp.booking_date}T${sp.booking_time || '00:00'}:00`,
    permit_choice: false,
    service_category: ((sp.item?.serviceId as string) || 'roofing') as ServiceCategory,
    pack_items: {},
    sq_ft: 0,
    financing: false,
    address: sp.homeowner_address ?? '',
    phone: sp.homeowner_phone ?? '',
    email: sp.homeowner_email ?? '',
    homeowner_name: sp.homeowner_name ?? '',
    received_at: sp.sent_at,
    contractor_company: company,
    contractor_initials: sp.contractor?.initials || deriveInitials(company),
    contractor_avatar_color: sp.contractor?.avatar_color,
  }
}

export function useEffectiveLeads(
  role: 'homeowner' | 'vendor',
  userId: string | null | undefined,
): LeadThread[] {
  const demoMode = useDemoMode()
  const mockLeads = useEffectiveMockLeads()
  const [realThreads, setRealThreads] = useState<LeadThread[]>([])

  useEffect(() => {
    if (demoMode || !userId) {
      setRealThreads([])
      return
    }
    const column = role === 'homeowner' ? 'homeowner_id' : 'vendor_id'
    let cancelled = false
    supabase
      .from('sent_projects')
      .select('*')
      .eq(column, userId)
      .order('sent_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[wave-9-9b useEffectiveLeads] fetch error', error)
          setRealThreads([])
          return
        }
        const rows = (data as SentProjectRow[]) || []
        setRealThreads(rows.map(mapSentProjectToThread))
      })
    return () => {
      cancelled = true
    }
  }, [demoMode, role, userId])

  return useMemo<LeadThread[]>(() => {
    if (!demoMode) return realThreads
    if (!userId) return []
    const column = role === 'homeowner' ? 'homeowner_id' : 'vendor_id'
    return mockLeads.filter((l) => (l as unknown as Record<string, string>)[column] === userId) as LeadThread[]
  }, [demoMode, role, userId, mockLeads, realThreads])
}
