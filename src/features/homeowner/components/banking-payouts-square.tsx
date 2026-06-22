// Banking / Payouts square for the homeowner profile page.
//
// Phase 2 of stripe-connect-preview track — task_1781574203261_132 directive #2.
//
// Surfaces the Stripe Connect Express onboarding entry point for homeowners
// who will receive payouts (referral bonuses, financing-disbursement returns).
//
// Status state machine (mirrors src/lib/financing/escrow/constants.ts):
//   not_connected        → "Set Up Banking" CTA (primary action)
//   pending_verification → "Continue Onboarding" CTA + "Stripe is verifying" hint
//   active               → green check + "Connected" + view-dashboard link
//   restricted           → amber warning + "Update info" CTA (re-link)
//   rejected             → red error + contact-support text (no CTA)
//
// Phase 3 wires account.updated webhook → status flip without poll. Until
// then, after the user returns from Stripe-hosted onboarding the client
// invalidates the query so the next render reflects DB-updated state.

import { Banknote, CheckCircle2, AlertTriangle, XCircle, ExternalLink, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useConnectUiState,
  useStartConnectOnboarding,
  useRefreshConnectOnboarding,
} from '@/lib/hooks/use-connect-onboarding';
import type { ConnectUiState } from '@/lib/financing/escrow/constants';

interface StateCopy {
  title: string;
  description: string;
  ctaLabel: string;
  ctaVariant: 'default' | 'outline' | 'destructive' | 'secondary';
  showCta: boolean;
}

function copyFor(state: ConnectUiState): StateCopy {
  switch (state) {
    case 'not_connected':
      return {
        title: 'Not Set Up',
        description: 'Add a payout method to receive referral bonuses and financing returns directly to your bank.',
        ctaLabel: 'Set Up Banking',
        ctaVariant: 'default',
        showCta: true,
      };
    case 'pending_verification':
      return {
        title: 'Verifying',
        description: 'Stripe is verifying your information. This usually takes a few minutes. You can continue or update your details below.',
        ctaLabel: 'Continue Onboarding',
        ctaVariant: 'outline',
        showCta: true,
      };
    case 'active':
      return {
        title: 'Connected',
        description: 'Payouts are enabled. Bonuses and returns will deposit to your linked bank account.',
        ctaLabel: 'Update Details',
        ctaVariant: 'outline',
        showCta: true,
      };
    case 'restricted':
      return {
        title: 'Action Required',
        description: 'Stripe needs additional information to keep payouts active. Update your details to continue receiving funds.',
        ctaLabel: 'Update Information',
        ctaVariant: 'outline',
        showCta: true,
      };
    case 'rejected':
      return {
        title: 'Account Closed',
        description: 'Your Stripe Connect account was closed. Contact BuildConnect support to restore payouts.',
        ctaLabel: 'Contact Support',
        ctaVariant: 'destructive',
        showCta: false,
      };
  }
}

function StatusIcon({ state }: { state: ConnectUiState }) {
  switch (state) {
    case 'not_connected':
      return <Banknote className="h-5 w-5 text-muted-foreground" />;
    case 'pending_verification':
      return <Loader2 className="h-5 w-5 animate-spin text-amber-500" />;
    case 'active':
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case 'restricted':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'rejected':
      return <XCircle className="h-5 w-5 text-destructive" />;
  }
}

export function HomeownerBankingPayoutsSquare() {
  const { state, isLoading, account } = useConnectUiState('homeowner');
  const startMutation = useStartConnectOnboarding('homeowner');
  const refreshMutation = useRefreshConnectOnboarding('homeowner');

  const handleCta = async () => {
    const returnUrl = `${window.location.origin}/home/profile?connect=return`;
    const refreshUrl = `${window.location.origin}/home/profile?connect=refresh`;

    try {
      const useRefresh = state !== 'not_connected' && account?.stripeAccountId;
      const result = useRefresh
        ? await refreshMutation.mutateAsync({ returnUrl, refreshUrl })
        : await startMutation.mutateAsync({ returnUrl, refreshUrl });
      if (result?.url) {
        window.location.assign(result.url);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/stripe_not_configured/i.test(msg)) {
        toast.error('Stripe is not configured yet. The admin will enable payouts soon.');
      } else {
        toast.error('Could not open Stripe onboarding. Please try again.');
      }
    }
  };

  const copy = copyFor(state);
  const pending = startMutation.isPending || refreshMutation.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.075 }}
    >
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2.5">
            <StatusIcon state={state} />
            <CardTitle className="text-base font-heading">Banking / Payouts</CardTitle>
          </div>
          <span
            className={
              state === 'active'
                ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400'
                : state === 'restricted'
                  ? 'rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400'
                  : state === 'rejected'
                    ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                    : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
            }
          >
            {copy.title}
          </span>
        </CardHeader>
        <CardContent className="pt-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Checking status…</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{copy.description}</p>
              {copy.showCta && (
                <Button
                  variant={copy.ctaVariant}
                  size="sm"
                  className="mt-4 w-full gap-1.5"
                  onClick={handleCta}
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Opening Stripe…
                    </>
                  ) : (
                    <>
                      {copy.ctaLabel}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              )}
              {!copy.showCta && state === 'rejected' && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Email <a className="underline" href="mailto:support@buildconnect.app">support@buildconnect.app</a> with your account ID and we will help reopen access.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
