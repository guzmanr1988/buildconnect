// Embedded Stripe Connect onboarding / management dialog.
//
// Flow-B (banking-flowb): replaces the hosted-redirect path
// (window.location.assign(stripe-hosted URL)) with an in-app iframe mount
// of Stripe's Connect Embedded Components. KYC stays inside the Stripe-
// owned iframe (federal AML / Connect compliance is non-removable); only
// the surrounding chrome moves into BuildConnect.
//
// Two modes:
//   - 'onboarding'  → ConnectAccountOnboarding   (KYC capture flow)
//                     Used for not_connected / pending_verification /
//                     restricted re-link.
//   - 'management'  → ConnectAccountManagement   (post-onboard self-service)
//                     Used for active accounts ("Update Details" CTA).
//
// AccountSession client_secret is short-TTL (~1min). loadConnectAndInitialize
// caches one instance per dialog open; fetchClientSecret re-fires if the SDK
// asks for a refresh. We mint a fresh instance on each dialog open by keying
// the provider on `open` so a stale instance from a prior session can't leak.
//
// onExit → close dialog + invalidate the escrow_accounts query so the parent
// re-fetches and the state machine reflects the post-KYC status (the
// account.updated webhook in stripe-webhook also fires server-side, which is
// the source of truth; the client invalidate just avoids waiting on the
// 30s poll).

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js'
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  ConnectAccountManagement,
} from '@stripe/react-connect-js'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { fetchConnectAccountSession } from '@/lib/hooks/use-connect-onboarding'
import type { PartyType } from '@/lib/financing/escrow/constants'

const env = ((import.meta as { env?: Record<string, string | undefined> }).env) ?? {}
const PUBLISHABLE_KEY = env.VITE_STRIPE_PUBLISHABLE_KEY || env.VITE_STRIPE_PUBLIC_KEY || ''

type Mode = 'onboarding' | 'management'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  partyType: PartyType
}

export function ConnectOnboardingDialog({ open, onOpenChange, mode, partyType }: Props) {
  const qc = useQueryClient()
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Build a fresh connect instance whenever the dialog opens.
  // Keying on `open` ensures a closed-then-reopened dialog doesn't reuse a
  // stale instance whose AccountSession has expired.
  useEffect(() => {
    if (!open) {
      setInstance(null)
      setError(null)
      return
    }
    if (!PUBLISHABLE_KEY) {
      setError('Stripe is not configured. Contact support.')
      return
    }

    let cancelled = false
    const next = loadConnectAndInitialize({
      publishableKey: PUBLISHABLE_KEY,
      fetchClientSecret: async () => {
        const session = await fetchConnectAccountSession(partyType)
        return session.client_secret
      },
    })
    if (!cancelled) setInstance(next)
    return () => {
      cancelled = true
    }
  }, [open, partyType])

  const title = mode === 'onboarding' ? 'Set Up Payouts' : 'Update Banking Details'
  const description = useMemo(() => {
    if (mode === 'onboarding') {
      return 'Stripe will collect the identity and banking details required to receive payouts. Your information is handled by Stripe — BuildConnect never sees your full SSN or account numbers.'
    }
    return 'Update your linked bank account or KYC information. Changes save directly to Stripe.'
  }, [mode])

  const handleExit = () => {
    // Invalidate the escrow_accounts query so the state machine refreshes.
    qc.invalidateQueries({ queryKey: ['escrow_accounts', partyType] })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !instance ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading secure session…</span>
          </div>
        ) : (
          <ConnectComponentsProvider connectInstance={instance}>
            {mode === 'onboarding' ? (
              <ConnectAccountOnboarding
                onExit={handleExit}
                onLoadError={(e) => {
                  toast.error('Could not load Stripe onboarding. Please try again.')
                  setError(e?.error?.message || 'Stripe load error')
                }}
              />
            ) : (
              <ConnectAccountManagement
                onLoadError={(e) => {
                  toast.error('Could not load Stripe management. Please try again.')
                  setError(e?.error?.message || 'Stripe load error')
                }}
              />
            )}
          </ConnectComponentsProvider>
        )}
      </DialogContent>
    </Dialog>
  )
}
