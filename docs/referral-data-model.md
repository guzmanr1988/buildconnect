# Referral Data Model — Design + DDL Draft

**Task:** `task_1781569755422_690` (kratos msg `1781569766547-kratos-4fqwr`)
**Status:** Design only — no migration filed, no merge. Coordinates naming with `homeowner_payouts` from `069_stripe_connect_express.sql`.

## Requirements (from Rod)

1. **Permanent attribution** — a referee BELONGS TO their referrer for LIFE; attribution is set on signup via referral link / invite code and never changes.
2. **Recurring payout** — referrer earns **$500 per qualifying project** the referee completes. Recurring every project, lifetime, NOT one-time.
3. **Per-customer bonus override** — default $500; admin can set $1000, $2000, $3000 — or LOWER — for specific referrers.

## Concept map

```
referrer (auth.users)
   │
   │  shares
   ▼
referral_codes  ────────── 1:1 active code per referrer
   │
   │  attribution at referee signup
   ▼
referral_attributions ──── 1 row per referee (PK = referee_id)
   │
   │  triggers
   ▼
referral_qualifying_events ── 1 row per "qualifying project" event
   │
   │  computes payout
   ▼
referral_payouts ────────── 1 row per payout (UNIQUE on referee_id + qualifying_event_id)
   │
   │  optional Stripe transfer
   ▼
homeowner_payouts (Stripe table from 069)
   reason = 'referral'
   related_ref = referral_payouts.id::text
```

## Naming coordination with `homeowner_payouts`

`homeowner_payouts.reason` already has `'referral'` as one of its enum values (`069_stripe_connect_express.sql` line 137). `homeowner_payouts.related_ref text` carries the foreign reference — for referral payouts it stores `referral_payouts.id::text`. This keeps the Stripe-transfer table generic and lets the referral table own its own audit + state machine.

The flow:

1. Referee finishes a qualifying project.
2. `referral_qualifying_events` gets a row inserted.
3. Trigger or background job creates a `referral_payouts` row (status `pending`).
4. When Stripe transfer fires (Phase 3 of Stripe wiring), a `homeowner_payouts` row is created with `reason='referral'`, `related_ref=<referral_payouts.id>`, and `referral_payouts.homeowner_payout_id` is set to the transfer row's id.
5. Webhook `transfer.created` / `transfer.updated` updates `homeowner_payouts.status`; a small reconcile job mirrors it back to `referral_payouts.status`.

## Tables

### `referral_codes`

```sql
CREATE TABLE referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,           -- e.g. 'ROD-9X4F' or slugified email
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);

CREATE INDEX referral_codes_referrer_active_idx
  ON referral_codes (referrer_id) WHERE is_active;
```

Notes:
- One referrer can have multiple historic codes (rotate for campaigns / leak recovery), but only one active at a time enforced at app layer (DB allows multiple).
- `code` is URL-safe and short-shareable.

### `referral_attributions`

```sql
CREATE TABLE referral_attributions (
  referee_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code_id uuid REFERENCES referral_codes(id) ON DELETE SET NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'link'
    CHECK (source IN ('link', 'invite', 'admin_manual')),
  notes text,
  CHECK (referee_id != referrer_id)
);

CREATE INDEX referral_attributions_referrer_idx
  ON referral_attributions (referrer_id);
```

Notes:
- **PERMANENT** — `referee_id` as PK means one row per referee, ever. A referee can never be re-attributed to a different referrer. This satisfies "for life" requirement #1.
- `referrer_id` ON DELETE RESTRICT — we don't accidentally orphan attributions if a referrer account is deleted; the deletion must be intentional (admin downgrades or reassigns first).
- `source='admin_manual'` lets ops correct an attribution that was missed at signup (rare; audit-logged).

### `referral_bonus_overrides`

```sql
CREATE TABLE referral_bonus_overrides (
  referrer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bonus_cents bigint NOT NULL CHECK (bonus_cents >= 0),
  reason text,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);
```

Notes:
- PK = `referrer_id` → at most one override per referrer (admin updates by UPSERT).
- Absence of a row = default of $500 (50000 cents). The default lives in app code as `DEFAULT_REFERRAL_BONUS_CENTS = 50000`, NOT in this table, so the table stays sparse (only overrides materialize rows).
- Rod's $1000 / $2000 / $3000 buckets are just specific bonus_cents values; the schema doesn't enforce tiers — admin UI presents them as suggested values.

### `referral_qualifying_events`

```sql
CREATE TABLE referral_qualifying_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_ref text NOT NULL,           -- e.g. sent_project_id or financing_application_id
  project_ref_type text NOT NULL
    CHECK (project_ref_type IN ('sent_project', 'financing_application', 'other')),
  qualifying_event text NOT NULL
    CHECK (qualifying_event IN ('project_completed', 'first_payment_made', 'milestone_complete', 'other')),
  amount_context_cents bigint,         -- project size at qualifying moment (audit)
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (referee_id, project_ref, qualifying_event)
);

CREATE INDEX referral_qualifying_events_referee_idx
  ON referral_qualifying_events (referee_id);
```

Notes:
- UNIQUE constraint prevents double-counting a single project under the same event type. A single project CAN generate multiple events (e.g., `first_payment_made` + `project_completed`) — but only one bonus per event-type per project.
- The exact definition of "qualifying" is a policy decision Rod must lock — for now `project_completed` is the placeholder. Multiple event types are listed so we can rotate the policy without schema migrations.

### `referral_payouts`

```sql
CREATE TABLE referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  referee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  qualifying_event_id uuid NOT NULL REFERENCES referral_qualifying_events(id) ON DELETE RESTRICT,
  bonus_cents bigint NOT NULL CHECK (bonus_cents >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'failed', 'reversed', 'voided')),
  homeowner_payout_id uuid REFERENCES homeowner_payouts(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  voided_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qualifying_event_id)         -- one payout per qualifying event
);

CREATE INDEX referral_payouts_referrer_idx ON referral_payouts (referrer_id);
CREATE INDEX referral_payouts_status_idx ON referral_payouts (status);
```

Notes:
- UNIQUE on `qualifying_event_id` enforces "one payout per qualifying event" — combined with the UNIQUE on `referral_qualifying_events(referee_id, project_ref, qualifying_event)` this gives a clean idempotency story.
- `status` machine: `pending` (event recorded) → `approved` (admin or auto-rule passed) → `paid` (Stripe transfer fired) → terminal. `failed` / `reversed` / `voided` for the various recovery paths.
- `bonus_cents` is captured AT PAYOUT-CREATION TIME from the override-or-default lookup (NOT recomputed at pay-time). This way a later override change doesn't retroactively alter pending payouts.
- `homeowner_payout_id` is the Stripe-side transfer linkage — nullable until Phase 3 Stripe wiring lands or while a payout is in `pending`/`approved` state.

## RLS sketch

| Table | authenticated read | authenticated write | service_role write |
|---|---|---|---|
| `referral_codes` | own + admin | own (UPDATE is_active only) + admin | yes |
| `referral_attributions` | own (as referee or referrer) + admin | admin only | yes |
| `referral_bonus_overrides` | admin | admin | yes |
| `referral_qualifying_events` | admin | admin | yes (server inserts on completion trigger) |
| `referral_payouts` | own (as referrer) + admin | admin (approve/void) | yes |

## Bonus resolution (app code, NOT a column)

```typescript
// src/lib/referrals/bonus.ts (Phase-2 code, NOT in this DDL)
export const DEFAULT_REFERRAL_BONUS_CENTS = 50_000  // $500

export async function resolveReferralBonusCents(referrerId: string): Promise<number> {
  const { data } = await supabase
    .from('referral_bonus_overrides')
    .select('bonus_cents')
    .eq('referrer_id', referrerId)
    .maybeSingle()
  return data?.bonus_cents ?? DEFAULT_REFERRAL_BONUS_CENTS
}
```

## Open questions for Rod

1. **What event is "qualifying"?** Project marked complete by vendor? First customer payment made on financing app? Both? Different by project type? — this is the gating policy decision before this table can fire payouts in production.
2. **Approval workflow** — do payouts auto-approve on qualifying event, or do they sit in `pending` for admin review? Recommend: auto-approve below a threshold (e.g., default $500), manual review above (overrides $1000+).
3. **Anti-self-deal** — is it OK for a homeowner to refer themselves on a different email? Recommend: enforce at `referral_attributions` level by checking the referrer's known account fingerprint (email domain, primary phone). Out of scope for v1, flag for Phase 2.
4. **Caps** — annual cap per referrer? Per-referee count cap? Recommend: no cap in v1; add column later if abuse appears.
5. **Stripe Connect dependency for payout** — referral payouts require the referrer to have completed Stripe Connect Express onboarding (from `069`'s `escrow_accounts WHERE party_type='homeowner'`). If they haven't, what happens to a qualifying event? Recommend: payout sits in `approved` state with `homeowner_payout_id=null` until onboarding completes; admin-visible "owed but not connected" queue.

## Coordinated migration filename suggestion

When this is approved for build:

```
supabase/migrations/072_referral_program.sql
```

(`070` and `071` are taken; `072` is the next free slot at this commit.)

## Out of scope of this design

- The actual signup-flow capture of `?ref=CODE` URL param → attribution write (Phase 2 frontend work).
- The qualifying-event TRIGGER (database trigger vs Edge Function vs cron job — engineering decision after Rod confirms what "qualifying" means).
- Admin UI for editing overrides (small Phase 2 page, parallel to `/admin/settings`).
- Referrer-facing dashboard ("you have $X pending, $Y paid this year").
