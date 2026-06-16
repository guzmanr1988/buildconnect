// Referral invite store — persists locally-added pending invitations from the
// homeowner Refer-a-Friend form on /home. Each entry starts at status='invited'.
// Real status upgrades (signed_up → hired → paid) come from Supabase
// (referral_attributions + referral_qualifying_events + referral_payouts).
//
// Shape matches what an email-send hook will need: firstName, lastName,
// email, phone, referrerId, invitedAt — plus status for UI display.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LocalReferralStatus = 'invited' | 'signed_up' | 'hired' | 'paid'

export type LocalReferral = {
  id: string
  referrerId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  invitedAt: string
  status: LocalReferralStatus
}

type ReferralStore = {
  referralsByReferrer: Record<string, LocalReferral[]>
  addReferral: (referrerId: string, entry: Omit<LocalReferral, 'id' | 'invitedAt' | 'status'>) => void
}

export const useReferralStore = create<ReferralStore>()(
  persist(
    (set) => ({
      referralsByReferrer: {},
      addReferral: (referrerId, entry) =>
        set((prev) => {
          const existing = prev.referralsByReferrer[referrerId] ?? []
          const newEntry: LocalReferral = {
            id: crypto.randomUUID(),
            referrerId,
            firstName: entry.firstName,
            lastName: entry.lastName,
            email: entry.email,
            phone: entry.phone,
            invitedAt: new Date().toISOString(),
            status: 'invited',
          }
          return {
            referralsByReferrer: {
              ...prev.referralsByReferrer,
              [referrerId]: [...existing, newEntry],
            },
          }
        }),
    }),
    { name: 'buildconnect-referrals' },
  ),
)
