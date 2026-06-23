// Banking / Payouts square for the homeowner profile page.
//
// Flow-B (banking-flowb): in-app embedded Stripe Connect Components.
// Replaced the prior hosted-redirect path (window.location.assign(stripe URL))
// with ConnectOnboardingDialog, which mounts ConnectAccountOnboarding or
// ConnectAccountManagement inside a BuildConnect-chrome dialog. KYC stays
// inside the Stripe-owned iframe (compliance requirement); only the surrounding
// chrome moves into the app.
//
// Status state machine (mirrors src/lib/financing/escrow/constants.ts):
//   not_connected        → "Set Up Banking" CTA → ConnectOnboardingDialog (mode=onboarding)
//   pending_verification → "Continue Onboarding" CTA → ConnectOnboardingDialog (mode=onboarding)
//   active               → green check + "Update Details" CTA → ConnectOnboardingDialog (mode=management)
//   restricted           → amber warning + "Update Information" CTA → ConnectOnboardingDialog (mode=onboarding) for re-link
//   rejected             → red error + contact-support text (no CTA)
//
// State updates: dialog onExit invalidates the escrow_accounts query. The
// account.updated webhook in stripe-webhook is the server-side source of
// truth — by the time the user closes the dialog, the webhook has typically
// already flipped status, so the invalidate-triggered refetch returns the
// updated row. If the webhook is in flight, the 30s polling in useConnectAccount
// catches up as a fallback.

import { useState } from 'react';
import { Banknote, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConnectUiState } from '@/lib/hooks/use-connect-onboarding';
import type { ConnectUiState } from '@/lib/financing/escrow/constants';
import { ConnectOnboardingDialog } from './connect-onboarding-dialog';

interface StateCopy {
  title: string;
  description: string;
  ctaLabel: string;
  ctaVariant: 'default' | 'outline' | 'destructive' | 'secondary';
  showCta: boolean;
  dialogMode: 'onboarding' | 'management';
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
        dialogMode: 'onboarding',
      };
    case 'pending_verification':
      return {
        title: 'Verifying',
        description: "We're verifying your information. This usually takes a few minutes. You can continue or update your details below.",
        ctaLabel: 'Continue Onboarding',
        ctaVariant: 'outline',
        showCta: true,
        dialogMode: 'onboarding',
      };
    case 'active':
      return {
        title: 'Connected',
        description: 'Payouts are enabled. Bonuses and returns will deposit to your linked bank account.',
        ctaLabel: 'Update Details',
        ctaVariant: 'outline',
        showCta: true,
        dialogMode: 'management',
      };
    case 'restricted':
      return {
        title: 'Action Required',
        description: 'Additional information is required to keep payouts active. Update your details to continue receiving funds.',
        ctaLabel: 'Update Information',
        ctaVariant: 'outline',
        showCta: true,
        dialogMode: 'onboarding',
      };
    case 'rejected':
      return {
        title: 'Account Closed',
        description: 'Your payouts account was closed. Contact BuildConnect support to restore payouts.',
        ctaLabel: 'Contact Support',
        ctaVariant: 'destructive',
        showCta: false,
        dialogMode: 'onboarding',
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
  const { state, isLoading } = useConnectUiState('homeowner');
  const [dialogOpen, setDialogOpen] = useState(false);
  const copy = copyFor(state);

  return (
    <>
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
                    className="mt-4 w-full"
                    onClick={() => setDialogOpen(true)}
                  >
                    {copy.ctaLabel}
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
      <ConnectOnboardingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={copy.dialogMode}
        partyType="homeowner"
      />
    </>
  );
}
