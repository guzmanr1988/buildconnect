import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * Vendor payments store — account-rep payment history per vendor
 * (Rodolfo-direct pivot #22). Logs each mock payment from a vendor
 * to an account rep, with the frozen-at-payment-time ACH-style
 * descriptor ("BUILDCONNECT · [VENDOR COMPANY] · PAYROLL") so the
 * history view shows what would appear on real bank statements.
 *
 * Keyed by vendorId resolved via useVendorScope (v-1/v-2/v-3 for demo
 * logins, profile.id otherwise) — matches the bankEnabledByVendor key
 * source on the vendor-employees store so cross-surface consumers stay
 * state-consistent per the banked key-source-consistency rule.
 *
 * Payment records are append-only from the user's perspective (no edit
 * or delete actions) — past payments are ledger entries, not editable
 * state. Mock-mode per "mock closes loop as if real" directive: every
 * field that would exist on a real ACH record is present and visible.
 */

export type VendorPaymentStatus = 'settled'

export interface VendorPayment {
  id: string
  vendorId: string
  accountRepId: string
  accountRepName: string
  amount: number
  descriptor: string
  bankAccountLast4: string
  bankName: string
  paidAt: string
  status: VendorPaymentStatus
}

export type VendorPaymentInput = Omit<VendorPayment, 'id' | 'paidAt' | 'status'>

const SEED_PAYMENTS: Record<string, VendorPayment[]> = {
  'v-1': [
    {
      id: 'apex-pay-1',
      vendorId: 'v-1',
      accountRepId: 'apex-emp-1',
      accountRepName: 'Miguel Reyes',
      amount: 2800,
      descriptor: 'BUILDCONNECT · APEX ROOFING & SOLAR · PAYROLL',
      bankAccountLast4: '7788',
      bankName: 'Wells Fargo',
      paidAt: '2026-04-15T14:00:00Z',
      status: 'settled',
    },
  ],
  'v-2': [
    {
      id: 'shield-pay-1',
      vendorId: 'v-2',
      accountRepId: 'shield-emp-1',
      accountRepName: 'Luis Ramirez',
      amount: 3200,
      descriptor: 'BUILDCONNECT · SHIELD IMPACT WINDOWS · PAYROLL',
      bankAccountLast4: '2233',
      bankName: 'Chase',
      paidAt: '2026-04-14T10:30:00Z',
      status: 'settled',
    },
    {
      id: 'shield-pay-2',
      vendorId: 'v-2',
      accountRepId: 'shield-emp-2',
      accountRepName: 'Rafael Cortez',
      amount: 2400,
      descriptor: 'BUILDCONNECT · SHIELD IMPACT WINDOWS · PAYROLL',
      bankAccountLast4: '6677',
      bankName: 'Truist',
      paidAt: '2026-04-17T09:15:00Z',
      status: 'settled',
    },
  ],
  'v-3': [
    {
      id: 'paradise-pay-1',
      vendorId: 'v-3',
      accountRepId: 'paradise-emp-1',
      accountRepName: 'Sofia Gutierrez',
      amount: 3500,
      descriptor: 'BUILDCONNECT · PARADISE POOLS FL · PAYROLL',
      bankAccountLast4: '8899',
      bankName: 'Bank of America',
      paidAt: '2026-04-12T11:00:00Z',
      status: 'settled',
    },
    {
      id: 'paradise-pay-2',
      vendorId: 'v-3',
      accountRepId: 'paradise-emp-2',
      accountRepName: 'Diego Morales',
      amount: 2600,
      descriptor: 'BUILDCONNECT · PARADISE POOLS FL · PAYROLL',
      bankAccountLast4: '3344',
      bankName: 'Wells Fargo',
      paidAt: '2026-04-16T09:30:00Z',
      status: 'settled',
    },
  ],
}

interface VendorPaymentsState {
  paymentsByVendor: Record<string, VendorPayment[]>
  addPayment: (vendorId: string, input: VendorPaymentInput) => void
}

export const useVendorPaymentsStore = create<VendorPaymentsState>()(
  persist(
    (set) => ({
      paymentsByVendor: SEED_PAYMENTS,

      addPayment: (vendorId, input) =>
        set((state) => {
          const now = new Date().toISOString()
          const next: VendorPayment = {
            ...input,
            id: crypto.randomUUID(),
            paidAt: now,
            status: 'settled',
          }
          const prior = state.paymentsByVendor[vendorId] ?? []
          return {
            paymentsByVendor: {
              ...state.paymentsByVendor,
              [vendorId]: [next, ...prior],
            },
          }
        }),
    }),
    { name: 'buildconnect-vendor-payments' },
  ),
)

export function buildPayrollDescriptor(vendorCompany: string): string {
  return `BUILDCONNECT · ${vendorCompany.toUpperCase()} · PAYROLL`
}
