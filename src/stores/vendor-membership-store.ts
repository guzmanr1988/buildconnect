import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * Vendor membership store — per-vendor subscription status for the $25/mo
 * portal membership. Ship #180 (Rodolfo-direct 2026-04-21 pivot #4). Holds
 * status + billing-day-of-month so the /vendor/membership page can render
 * the "next charge on the Nth" circle cleanly. Amount is fixed at $25 per
 * Rodolfo spec; would move to a per-vendor config when tiered pricing
 * lands post-launch.
 *
 * Cancellation semantics (per Rodolfo): status='cancelled' disables
 * portal access — user can still log in but nothing works until they
 * reactivate. Actual route-guard enforcement is a separate layer on top
 * of this store's status field.
 */

export type MembershipStatus = 'active' | 'cancelled'

export interface VendorMembership {
  status: MembershipStatus
  // Day-of-month the recurring charge runs. Seeded to the signup day;
  // clamped to 1-28 to avoid month-boundary edge cases.
  billingDay: number
  // Set on first activation; kept through cancellations so the UI can
  // show "member since" if we want.
  activatedAt: string
  // Last time status flipped to cancelled; null if never.
  cancelledAt: string | null
}

interface VendorMembershipState {
  membershipByVendor: Record<string, VendorMembership>
  // Activate or ensure-active for a vendor. Seeds with signup-day billing
  // if no prior membership exists; preserves activatedAt + billingDay on
  // reactivation so the charge schedule doesn't drift.
  activateMembership: (vendorId: string, billingDay?: number) => void
  cancelMembership: (vendorId: string) => void
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

export const useVendorMembershipStore = create<VendorMembershipState>()(
  persist(
    (set, get) => ({
      membershipByVendor: {},

      activateMembership: (vendorId, billingDay) =>
        set((state) => {
          const prior = state.membershipByVendor[vendorId]
          const resolvedDay = prior?.billingDay ?? safeBillingDay(billingDay)
          const next: VendorMembership = {
            status: 'active',
            billingDay: resolvedDay,
            activatedAt: prior?.activatedAt ?? new Date().toISOString(),
            cancelledAt: null,
          }
          return {
            membershipByVendor: { ...state.membershipByVendor, [vendorId]: next },
          }
        }),

      cancelMembership: (vendorId) =>
        set((state) => {
          const prior = state.membershipByVendor[vendorId]
          if (!prior) return state
          return {
            membershipByVendor: {
              ...state.membershipByVendor,
              [vendorId]: {
                ...prior,
                status: 'cancelled',
                cancelledAt: new Date().toISOString(),
              },
            },
          }
        }),

      getMembership: (vendorId) => get().membershipByVendor[vendorId],
    }),
    { name: 'buildconnect-vendor-membership' },
  ),
)

// Human-readable ordinal for the billing day circle — "15th", "1st", etc.
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
