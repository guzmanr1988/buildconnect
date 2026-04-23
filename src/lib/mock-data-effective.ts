// Ship #250 — effective-fixture hooks honoring the demoDataHidden flag.
// Clear Demo Data sets useAdminModerationStore.demoDataHidden=true; every
// user-visible surface that renders seeded data should read through these
// hooks instead of importing the raw fixture arrays directly. Consumers get
// either the fixture OR [] depending on flag state, with zustand subscription
// driving re-renders when the flag flips.
//
// Out-of-scope: internal-logic consumers that compute over fixtures for
// analytics / routing / vendor-scope resolution keep reading the raw imports;
// they don't render to Rodolfo so the hidden-flag doesn't apply there.

import { useMemo } from 'react'
import {
  MOCK_LEADS,
  MOCK_CLOSED_SALES,
  MOCK_MESSAGES,
  MOCK_HOMEOWNERS,
} from '@/lib/mock-data'
import type { Lead, ClosedSale, Message, Profile } from '@/types'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'

const EMPTY_LEADS: Lead[] = []
const EMPTY_CLOSED_SALES: ClosedSale[] = []
const EMPTY_MESSAGES: Message[] = []
const EMPTY_HOMEOWNERS: Profile[] = []

export function useEffectiveMockLeads(): Lead[] {
  const hidden = useAdminModerationStore((s) => s.demoDataHidden)
  // useMemo with the flag as dep keeps the reference stable across renders
  // when the flag hasn't changed — avoids unnecessary re-renders in
  // consumers that use the array as a useMemo/useEffect dep.
  return useMemo(() => (hidden ? EMPTY_LEADS : MOCK_LEADS), [hidden])
}

export function useEffectiveMockClosedSales(): ClosedSale[] {
  const hidden = useAdminModerationStore((s) => s.demoDataHidden)
  return useMemo(() => (hidden ? EMPTY_CLOSED_SALES : MOCK_CLOSED_SALES), [hidden])
}

export function useEffectiveMockMessages(): Message[] {
  const hidden = useAdminModerationStore((s) => s.demoDataHidden)
  return useMemo(() => (hidden ? EMPTY_MESSAGES : MOCK_MESSAGES), [hidden])
}

export function useEffectiveMockHomeowners(): Profile[] {
  const hidden = useAdminModerationStore((s) => s.demoDataHidden)
  return useMemo(() => (hidden ? EMPTY_HOMEOWNERS : MOCK_HOMEOWNERS), [hidden])
}
