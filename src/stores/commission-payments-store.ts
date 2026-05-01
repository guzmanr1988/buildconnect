import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CommissionPayment {
  id: string
  amount: number
  paidAt: string
  totalCommissionAtWrite: number  // frozen at write per immutable_ledger_freeze_at_write
  note?: string
}

interface CommissionPaymentsState {
  paymentsBySale: Record<string, CommissionPayment[]>
  addPayment: (saleId: string, amount: number, totalCommission: number, note?: string) => void
}

export const useCommissionPaymentsStore = create<CommissionPaymentsState>()(
  persist(
    (set, get) => ({
      paymentsBySale: {},
      addPayment: (saleId, amount, totalCommission, note) => {
        const prior = get().paymentsBySale[saleId] ?? []
        const alreadyPaid = prior.reduce((s, p) => s + p.amount, 0)
        const remaining = totalCommission - alreadyPaid
        if (amount <= 0 || amount > remaining) return
        const payment: CommissionPayment = {
          id: crypto.randomUUID(),
          amount,
          paidAt: new Date().toISOString(),
          totalCommissionAtWrite: totalCommission,
          note: note?.trim() || undefined,
        }
        set((state) => ({
          paymentsBySale: {
            ...state.paymentsBySale,
            [saleId]: [...(state.paymentsBySale[saleId] ?? []), payment],
          },
        }))
      },
    }),
    { name: 'buildconnect-commission-payments' },
  ),
)
