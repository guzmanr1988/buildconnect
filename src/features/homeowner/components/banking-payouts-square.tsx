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

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banknote, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConnectUiState } from '@/lib/hooks/use-connect-onboarding';
import type { ConnectUiState } from '@/lib/financing/escrow/constants';
import { ConnectOnboardingDialog } from './connect-onboarding-dialog';
import { VendorPaymentDialog } from '@/features/auth/components/vendor-payment-dialog';

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
  const { state, isLoading, account } = useConnectUiState('homeowner');
  const [dialogOpen, setDialogOpen] = useState(false);
  // Bank-attach dialog is a separate surface from the KYC onboarding dialog
  // (compliance boundary: KYC iframe is non-removable, bank-attach is a
  // typed-fields createToken path that requires an already-onboarded account
  // per hephaestus contract msg 1782433981527 connect_account_not_eligible
  // gate). Both can't be open simultaneously.
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const qc = useQueryClient();
  const copy = copyFor(state);
  const externalAccount = account?.externalAccount ?? null;
  // bank-attach surface is reachable only when the Connect account is already
  // onboarded. Mirrors hephaestus connect_account_not_eligible whitelist on
  // the edge fn so we don't render a CTA that the server would reject.
  const canAttachBank =
    state === 'active' || state === 'pending_verification' || state === 'restricted';

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

                {externalAccount && (
                  <div
                    data-testid="banking-payouts-external-account"
                    className="mt-3 rounded-lg border bg-emerald-500/5 px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">
                      Payouts bank
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {externalAccount.bankName ?? 'Bank'} •••• {externalAccount.last4}
                    </p>
                  </div>
                )}

                {canAttachBank && !externalAccount && (
                  <div
                    data-testid="banking-payouts-no-bank-yet"
                    className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      Bank not yet attached
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Add a payout bank so we can release funds to you.
                    </p>
                  </div>
                )}

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

                {canAttachBank && (
                  <Button
                    variant={externalAccount ? 'outline' : 'default'}
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => setBankDialogOpen(true)}
                    data-testid="banking-payouts-attach-bank-btn"
                  >
                    {externalAccount ? 'Change payout bank' : 'Add payout bank'}
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
      {canAttachBank && (
        <VendorPaymentDialog
          open={bankDialogOpen}
          onOpenChange={setBankDialogOpen}
          mode="pay_out"
          partyType="homeowner"
          blocking={false}
          showPurposeRadio={false}
          ctaSuccessCopy="Your payout bank is on file."
          onSuccess={() => {
            // Server-side write already landed on stripe-connect-external-
            // account-attach 200. Invalidate the escrow_accounts query so
            // the next render reads the freshly-attached external_account_*
            // fields. No persisted-store write — payment-methods source of
            // truth is the DB row, not Zustand.
            qc.invalidateQueries({ queryKey: ['escrow_accounts', 'homeowner'] });
          }}
        />
      )}
    </>
  );
}
