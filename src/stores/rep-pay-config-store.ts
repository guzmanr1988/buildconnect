import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RepPayMode = 'flat' | 'percent'

export interface RepPayConfig {
  mode: RepPayMode
  value: number
}

interface RepPayConfigState {
  configByRep: Record<string, RepPayConfig>
  setRepPayConfig: (repId: string, config: RepPayConfig) => void
}

export const useRepPayConfigStore = create<RepPayConfigState>()(
  persist(
    (set) => ({
      configByRep: {},
      setRepPayConfig: (repId, config) =>
        set((state) => ({
          configByRep: { ...state.configByRep, [repId]: config },
        })),
    }),
    { name: 'buildconnect-rep-pay-config' },
  ),
)
