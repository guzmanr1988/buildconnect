// usePaymentMethods — DB-backed hydration for the post-M1 payment_methods
// table. Replaces the legacy Zustand-persisted useVendorBillingStore for the
// vendor/banking, vendor/membership, and auth/register surfaces.
//
// Source of truth: the `payment_methods` table (Stripe-token-backed rows).
// Own-read / own-update / own-delete RLS is in place from M1 migration 094;
// the caller is auto-scoped to their own user_id. No client service-role.
//
// Side effect on first hydrate: clears the legacy localStorage key
// `buildconnect-vendor-billing` so the persisted mock store is dropped
// cleanly with NO dual-write and NO DB row removal. Idempotent.
//
// Shape: returns rows mapped to VendorPaymentMethod so existing UI code
// (badge labels, masked tail rendering, etc.) keeps working without
// per-component refactor.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type {
  VendorPaymentMethod,
  VendorPaymentMethodKind,
  VendorPaymentPurpose,
} from '@/stores/vendor-billing-store'

const LEGACY_LOCALSTORAGE_KEY = 'buildconnect-vendor-billing'

interface PaymentMethodRow {
  id: string
  stripe_payment_method_id: string
  kind: 'card' | 'us_bank_account'
  purpose: VendorPaymentPurpose
  brand: string | null
  last4: string
  exp_month: number | null
  exp_year: number | null
  bank_name: string | null
  routing_last4: string | null
  holder: string | null
  status: 'active' | 'pending_verification'
  created_at: string
}

function dbKindToUiKind(dbKind: PaymentMethodRow['kind']): VendorPaymentMethodKind {
  return dbKind === 'us_bank_account' ? 'checking' : 'card'
}

function expiryString(month: number | null, year: number | null): string | undefined {
  if (!month || !year) return undefined
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

export function rowToVendorPaymentMethod(row: PaymentMethodRow): VendorPaymentMethod {
  return {
    id: row.id,
    purpose: row.purpose,
    kind: dbKindToUiKind(row.kind),
    last4: row.last4,
    holder: row.holder ?? '',
    brand: row.brand ?? undefined,
    expiry: expiryString(row.exp_month, row.exp_year),
    bankName: row.bank_name ?? undefined,
    routingLast4: row.routing_last4 ?? undefined,
    addedAt: row.created_at,
  }
}

// Module-level one-shot guard so multiple surface mounts don't repeat the
// clear (harmless but noisy in console).
let legacyCacheCleared = false
function clearLegacyLocalStorageOnce() {
  if (legacyCacheCleared) return
  legacyCacheCleared = true
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY)
    }
  } catch {
    // Private-mode / quota-exceeded etc. — swallow; DB hydrate still wins.
  }
}

export interface UsePaymentMethodsResult {
  paymentMethods: VendorPaymentMethod[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  removeMethod: (id: string) => Promise<void>
  updateMethodPurpose: (id: string, purpose: VendorPaymentPurpose) => Promise<void>
}

export function usePaymentMethods(): UsePaymentMethodsResult {
  const sessionToken = useAuthStore((s) => s.session?.access_token ?? null)
  const userId = useAuthStore((s) => s.session?.user.id ?? null)
  const [paymentMethods, setPaymentMethods] = useState<VendorPaymentMethod[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guard against setState after unmount during async refetch.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const refetch = useCallback(async () => {
    if (!sessionToken || !userId) {
      setPaymentMethods([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: selErr } = await supabase
        .from('payment_methods')
        .select(
          'id, stripe_payment_method_id, kind, purpose, brand, last4, exp_month, exp_year, bank_name, routing_last4, holder, status, created_at',
        )
        .order('created_at', { ascending: true })
      if (!aliveRef.current) return
      if (selErr) {
        setError(selErr.message)
        setPaymentMethods([])
      } else {
        const rows = (data ?? []) as PaymentMethodRow[]
        setPaymentMethods(rows.map(rowToVendorPaymentMethod))
      }
    } catch (e) {
      if (!aliveRef.current) return
      setError(e instanceof Error ? e.message : String(e))
      setPaymentMethods([])
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [sessionToken, userId])

  useEffect(() => {
    clearLegacyLocalStorageOnce()
    void refetch()
  }, [refetch])

  const removeMethod = useCallback(
    async (id: string) => {
      // Own-delete RLS gates this on user_id; passing the wrong id 404s
      // (no-op), passing a foreign id 0-row-affected.
      const { error: delErr } = await supabase.from('payment_methods').delete().eq('id', id)
      if (delErr) {
        setError(delErr.message)
        throw delErr
      }
      await refetch()
    },
    [refetch],
  )

  const updateMethodPurpose = useCallback(
    async (id: string, purpose: VendorPaymentPurpose) => {
      // Only `purpose` is user-mutable post-create. Brand / last4 / exp /
      // bank_name etc. are Stripe-canonical and immutable from the client.
      const { error: upErr } = await supabase
        .from('payment_methods')
        .update({ purpose })
        .eq('id', id)
      if (upErr) {
        setError(upErr.message)
        throw upErr
      }
      await refetch()
    },
    [refetch],
  )

  return { paymentMethods, loading, error, refetch, removeMethod, updateMethodPurpose }
}
