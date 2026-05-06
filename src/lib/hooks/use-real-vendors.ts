import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import { deriveInitials } from '@/lib/initials'
import type { Vendor, ServiceCategory } from '@/types'

// UUIDs already represented in MOCK_VENDORS — skip to avoid duplicates.
const DEMO_UUIDS = new Set(Object.values(DEMO_VENDOR_UUID_BY_MOCK_ID))

export function useRealVendors(includeUuids?: Set<string>): Vendor[] {
  const [vendors, setVendors] = useState<Vendor[]>([])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, name, email, phone, address, company, avatar_color, initials, status, service_categories, latitude, longitude, created_at')
      .eq('role', 'vendor')
      .eq('status', 'active')
      .then(({ data }) => {
        if (!data) return
        const mapped: Vendor[] = data
          .filter((row) => !DEMO_UUIDS.has(row.id as string) || !!includeUuids?.has(row.id as string))
          .filter((row) => !!(row.company as string | null))
          .map((row) => ({
            id: row.id as string,
            email: row.email as string,
            name: row.name as string,
            role: 'vendor' as const,
            phone: (row.phone as string) || '',
            address: (row.address as string) || '',
            company: (row.company as string) || (row.name as string),
            avatar_color: (row.avatar_color as string) || '#3b82f6',
            initials: (row.initials as string) || deriveInitials(row.name as string),
            status: (row.status as Vendor['status']) || 'active',
            created_at: row.created_at as string,
            service_categories: ((row.service_categories as string[]) || []) as ServiceCategory[],
            latitude: typeof row.latitude === 'number' ? (row.latitude as number) : undefined,
            longitude: typeof row.longitude === 'number' ? (row.longitude as number) : undefined,
            rating: 0,
            response_time: '—',
            total_reviews: 0,
            verified: false,
            financing_available: false,
            commission_pct: 0,
          }))
        setVendors(mapped)
      })
  }, [])

  return vendors
}
