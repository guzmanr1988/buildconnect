# Stripe Connect Express — Phase 1 Foundation + Phase 2 Mini-Plan

**Branch:** `stripe-connect-preview` (off live `main` 9211f1a)
**Status:** Phase 1 foundation landed; Phase 2+ HOLD until Rod provides test keys + confirms fee decisions.
**Authority:** kratos approval msg `1781569611114-kratos-rt7wo`, homeowner-payout addendum msg `1781569441513-kratos-a9ryn`.

## Phase 0 Decisions (locked)

| Decision | Value |
|---|---|
| Connect type | Express (both vendor + homeowner) |
| Mode for preview | test-mode only |
| Country | US-only |
| `homeowner_payout_fee_bps` default | 0 (referrer keeps full payout) |
| `application_fee_bps` storage | `platform_settings` + per-customer override |
| Secret key storage | Supabase Edge Function secrets (`supabase secrets set`), NOT a DB row |
| Application fee model | Rod admin Referral-Program requirement: per-customer override supported |

## Phase 1 — what landed in this commit

### Migration `069_stripe_connect_express.sql`

Six new tables, RLS enabled on all, `touch_updated_at` triggers wired.

1. **`platform_settings`** — singleton (PK = 1) holding `stripe_enabled`, `application_fee_bps`, `homeowner_payout_fee_bps`, `updated_at`, `updated_by`. Admin-only write; authenticated read.
2. **`application_fee_overrides`** — per-customer fee override. UNIQUE(customer_id) so update-then-query path is idempotent. Admin-only.
3. **`escrow_accounts`** — Connected Account registry. `party_type ∈ {vendor, homeowner}`, UNIQUE(party_type, party_id), `stripe_account_id` UNIQUE, `status ∈ {pending_verification, active, restricted, rejected}`. Party reads own row; admin reads all; writes service-role only.
4. **`escrow_holds`** — customer-side PaymentIntent / Checkout Session captures. UNIQUE on each Stripe id field.
5. **`escrow_releases`** — milestone release transfers. `application_fee_cents` recorded per release for audit.
6. **`homeowner_payouts`** — referral + financing-disbursement payouts. `reason ∈ {referral, financing_disbursement, other}`. Separate from `escrow_releases` so 1099 audit paths stay clean.

### Code

- `src/lib/financing/escrow/constants.ts` — Phase-0 defaults as exported constants (`ESCROW_ADAPTER_KEY`, `SUPPORTED_COUNTRIES`, `PARTY_TYPES`, `DEFAULT_APPLICATION_FEE_BPS=0`, `STRIPE_EVENTS_NEEDED` whitelist).
- `src/lib/financing/escrow/registry.ts` — `getActiveEscrowAdapter()` / `getEscrowAdapterByKey(key)`. Phase 1 returns the stub; Phase 2 swaps the impl in-place behind the same key.
- `src/lib/hooks/use-platform-settings.ts` — react-query `usePlatformSettings()` + `useSavePlatformSettings()`. Single source of truth for the Stripe-relevant subset of the admin settings form.
- `src/features/admin/pages/settings.tsx` — `useEffect` loads platform_settings on mount, `handleSave` calls `useSavePlatformSettings.mutateAsync`. The misleading plaintext Stripe API Key input was replaced with an informational callout (secret-key storage is server-side per kratos directive).
- Two new admin inputs: Application Fee (bps) and Homeowner Payout Fee (bps), both with 0–10000 range + 25-bps step.
- `package.json` — `stripe@^17.7.0` added (server-side SDK, used by Phase 2 Edge Functions). Client uses Stripe-hosted Checkout Session URL; `@stripe/stripe-js` is NOT required for v1.
- `.env.example` — added commented-out server-side var references (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_APP_URL`) with an explicit "set via `supabase secrets set`, never commit real values" note.

### Verification

- `npm run build` clean. Bundle: `index-D6NSxkyH.js` (different from live `index-CCh2WeWV.js` / `f931fd98` as expected — preview branch, different SHA).
- No Stripe API calls happen at runtime. The stub adapter still throws on all 4 methods if invoked, but no caller invokes it in this branch yet.

## Phase 2 mini-plan (HOLD until Rod test keys + fee decisions)

### Edge Function: `stripe-connect-onboarding`

```typescript
// supabase/functions/stripe-connect-onboarding/index.ts
import Stripe from 'stripe'

interface OnboardingRequest {
  partyType: 'vendor' | 'homeowner'
}

export default async (req: Request) => {
  // 1. Auth — read JWT, get auth.uid as party_id
  // 2. Read platform_settings.stripe_enabled, abort 403 if false
  // 3. Lookup escrow_accounts WHERE party_type+party_id; if missing:
  //      stripe.accounts.create({
  //        type: 'express',
  //        country: 'US',
  //        email: <profile email>,
  //        capabilities: { transfers: { requested: true } },
  //        metadata: { bc_party_type, bc_party_id }
  //      })
  //      INSERT escrow_accounts row, status='pending_verification'
  // 4. stripe.accountLinks.create({
  //      account: stripe_account_id,
  //      refresh_url: `${STRIPE_APP_URL}/${partyType}/${returnRoute}?stripe_refresh=1`,
  //      return_url: `${STRIPE_APP_URL}/${partyType}/${returnRoute}?stripe_return=1`,
  //      type: 'account_onboarding'
  //    })
  // 5. Return { onboardingUrl }
}
```

### Edge Function: `stripe-connect-refresh`

Same shape, regenerates an Account Link for an existing `stripe_account_id`. Called from `?stripe_refresh=1` landing.

### Edge Function update: `stripe-webhook/index.ts`

- Enable signature verification (currently lines 8–10 commented out).
- Switch on `event.type` for the events in `STRIPE_EVENTS_NEEDED`:
  - `account.updated` → update `escrow_accounts.{charges_enabled, payouts_enabled, requirements, status}` keyed on `stripe_account_id`.
  - `payment_intent.succeeded` → update `escrow_holds.status='funded'`.
  - `checkout.session.completed` → cache `stripe_payment_intent_id` on the matching `escrow_holds` row.
  - `transfer.created` / `transfer.updated` → update `escrow_releases` and `homeowner_payouts`.
  - `charge.refunded` → update `escrow_holds.status='refunded'`.
  - `charge.dispute.created` → flag a row + notify admin.

### Vendor Banking CTA — `src/features/vendor/pages/banking.tsx`

The page already has a `Tranche-2: wire to Plaid/Stripe` comment marker on lines 14–15. Phase 2 adds:

```tsx
<Card className="rounded-xl">
  <CardHeader>
    <CardTitle>Payout Account</CardTitle>
  </CardHeader>
  <CardContent>
    {escrowAccount.status === 'active' ? (
      <ConnectedBadge stripeAccountId={escrowAccount.stripe_account_id} />
    ) : escrowAccount.status === 'pending_verification' ? (
      <PendingBadge resumeUrl={resumeUrl} />
    ) : escrowAccount.status === 'restricted' ? (
      <RestrictedCallout resumeUrl={resumeUrl} />
    ) : (
      <ConnectStripeButton partyType="vendor" />
    )}
  </CardContent>
</Card>
```

### Homeowner Banking / Payouts square — `src/features/homeowner/pages/profile.tsx`

Inserted as a new `motion.div` Card sibling immediately after the Additional Properties section (line 338). Component tree:

```
<Card mb-6>
  <CardHeader flex-row justify-between pb-2>
    <CardTitle text-base font-heading>Banking / Payouts</CardTitle>
    <Badge variant={statusVariant}>{statusLabel}</Badge>
  </CardHeader>
  <CardContent pt-2>
    {status === 'not_connected' && (
      <>
        <p text-sm muted>
          Connect a bank account to receive referral payouts and financing disbursements.
          Banking details are collected and verified securely by Stripe — BuildConnect
          never sees or stores your account or routing numbers.
        </p>
        <Button onClick={onConnect} mt-3>
          <StripeIcon /> Connect with Stripe
        </Button>
      </>
    )}
    {status === 'pending_verification' && (
      <PendingCallout resumeUrl={resumeUrl} />
    )}
    {status === 'active' && (
      <ActiveSummary
        last4={maskedLast4}        /* fetched server-side, never persisted client */
        onDisconnect={onDisconnect}
      />
    )}
    {status === 'restricted' && (
      <RestrictedCallout resumeUrl={resumeUrl} />
    )}
  </CardContent>
</Card>
```

Status labels:

| status | label | variant |
|---|---|---|
| not_connected | Not connected | outline |
| pending_verification | Verifying… | secondary |
| active | Bank linked | default (green-tinted via tailwind class) |
| restricted | Action required | destructive |

`onConnect` triggers `useConnectOnboarding({ partyType: 'homeowner' }).mutate()` which calls the Edge Function and opens the returned URL in a new tab (or replaces the current location depending on the device — TBD with Rod).

### Hook: `useConnectOnboarding`

```typescript
// src/lib/financing/hooks/use-connect-onboarding.ts
export function useConnectOnboarding() {
  return useMutation({
    mutationFn: async (input: { partyType: 'vendor' | 'homeowner' }) => {
      const { data } = await supabase.functions.invoke('stripe-connect-onboarding', { body: input })
      return data as { onboardingUrl: string }
    },
    onSuccess: ({ onboardingUrl }) => {
      window.location.href = onboardingUrl
    },
  })
}
```

### Polling for status flips

When the user lands back from Stripe (`?stripe_return=1`), the profile/banking page invalidates `['escrow_accounts', party_id]` and polls for ~30s waiting for the `account.updated` webhook to flip status. If `restricted` after 30s, show the resume link prominently.

## Phase 3 sketch (for context — NOT in mini-plan scope)

- Real impl of `stripe_express.ts` `fundEscrow` (creates Checkout Session) + `releaseMilestone` (creates Transfer with `application_fee_amount` computed from `platform_settings` ∪ override) + `refundEscrow`.
- `homeowner-payout-create` Edge Function for referral payouts.
- `draw-request-create` / `draw-request-approve` / `draw-request-finalize` wired to escrow adapter.
- `/financing/draw-approve` page surfaces funding/release status.

## Risks Phase 2 carries

- **Webhook deliverability on preview:** Stripe needs a public URL. Supabase Edge Functions on the preview project work but the webhook signing secret per environment must be set correctly.
- **Account Link short TTL:** ~30 minutes. The refresh function must be wired so users who time out can resume.
- **Email collision:** if the homeowner email already exists on a different connected account (their other platform), Stripe rejects. Plan to surface a clean error message.
- **Refund + dispute:** Phase 4 work; Phase 2/3 ship without these and rely on admin manual handling via Stripe dashboard.

## Out of scope (explicit)

- Customer card-entry UI (we use hosted Checkout Session URL).
- Vendor or homeowner manual ACH detail capture (Stripe collects on their side).
- Multi-country support.
- Live-mode flip (Phase 4, separate Rod gate).
- Stripe Tax integration.
