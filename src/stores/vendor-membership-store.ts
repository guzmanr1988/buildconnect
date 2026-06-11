import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

/*
 * Vendor membership store — per-vendor subscription status for the $25/mo
 * portal membership. DB-canonical via public.vendor_memberships
 * (RLS: vendor_id = auth.uid()). Local vendor IDs (v-1/v-2/v-3 demos)
 * remain in-memory.
 *
 * Cancellation semantics (per Rodolfo): status='cancelled' disables
 * portal access — user can still log in but nothing works until they
 * reactivate. Route-guard reads `status` from the canonical DB row.
 */

export type MembershipStatus = 'active' | 'cancelled'

export interface VendorMembership {
  status: MembershipStatus
  billingDay: number
  activatedAt: string
  cancelledAt: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isLocalVendorId = (id: string) => !UUID_RE.test(id)

interface VendorMembershipState {
  membershipByVendor: Record<string, VendorMembership>
  hydratedVendors: Set<string>
  hydrate: (vendorId: string) => Promise<void>
  activateMembership: (vendorId: string, billingDay?: number) => Promise<void>
  cancelMembership: (vendorId: string) => Promise<void>
  getMembership: (vendorId: string) => VendorMembership | undefined
}

export const MEMBERSHIP_MONTHLY_CENTS = 2500 // $25/mo

function safeBillingDay(day?: number): number {
  if (typeof day !== 'number' || !Number.isFinite(day)) return todayClamped()
  const rounded = Math.round(day)
  if (rounded < 1) return 1
  if (rounded > 28) return 28
  return rounded
}

function todayClamped(): number {
  const d = new Date().getDate()
  return d > 28 ? 28 : d
}

function rowToMembership(row: Record<string, unknown>): VendorMembership {
  return {
    status: row.status as MembershipStatus,
    billingDay: row.billing_day as number,
    activatedAt: row.activated_at as string,
    cancelledAt: (row.cancelled_at as string) ?? null,
  }
}

export const useVendorMembershipStore = create<VendorMembershipState>()((set, get) => ({
  membershipByVendor: {},
  hydratedVendors: new Set(),

  hydrate: async (vendorId) => {
    if (isLocalVendorId(vendorId)) {
      // Local demo IDs have no DB row; mark hydrated so seed-on-empty
      // gates (membership.tsx auto-activate) can fire.
      if (!get().hydratedVendors.has(vendorId)) {
        set((state) => ({
          hydratedVendors: new Set([...state.hydratedVendors, vendorId]),
        }))
      }
      return
    }
    if (get().hydratedVendors.has(vendorId)) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const { data } = await supabase
      .from('vendor_memberships')
      .select('*')
      .eq('vendor_id', vendorId)
      .maybeSingle()
    set((state) => ({
      membershipByVendor: data
        ? { ...state.membershipByVendor, [vendorId]: rowToMembership(data) }
        : state.membershipByVendor,
      hydratedVendors: new Set([...state.hydratedVendors, vendorId]),
    }))
  },

  activateMembership: async (vendorId, billingDay) => {
    const prior = get().membershipByVendor[vendorId]
    const resolvedDay = prior?.billingDay ?? safeBillingDay(billingDay)
    const next: VendorMembership = {
      status: 'active',
      billingDay: resolvedDay,
      activatedAt: prior?.activatedAt ?? new Date().toISOString(),
      cancelledAt: null,
    }
    if (isLocalVendorId(vendorId)) {
      set((state) => ({
        membershipByVendor: { ...state.membershipByVendor, [vendorId]: next },
      }))
      return
    }
    const { data, error } = await supabase
      .from('vendor_memberships')
      .upsert({
        vendor_id: vendorId,
        status: 'active',
        billing_day: resolvedDay,
        activated_at: next.activatedAt,
        cancelled_at: null,
      })
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      membershipByVendor: { ...state.membershipByVendor, [vendorId]: rowToMembership(data) },
    }))
  },

  cancelMembership: async (vendorId) => {
    const prior = get().membershipByVendor[vendorId]
    if (!prior) return
    const cancelledAt = new Date().toISOString()
    if (isLocalVendorId(vendorId)) {
      set((state) => ({
        membershipByVendor: {
          ...state.membershipByVendor,
          [vendorId]: { ...prior, status: 'cancelled', cancelledAt },
        },
      }))
      return
    }
    const { data, error } = await supabase
      .from('vendor_memberships')
      .update({ status: 'cancelled', cancelled_at: cancelledAt })
      .eq('vendor_id', vendorId)
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      membershipByVendor: { ...state.membershipByVendor, [vendorId]: rowToMembership(data) },
    }))
  },

  getMembership: (vendorId) => get().membershipByVendor[vendorId],
}))

export function ordinal(n: number): string {
  const abs = Math.abs(n)
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = abs % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}
