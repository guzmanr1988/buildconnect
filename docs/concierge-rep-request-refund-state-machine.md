# BuildConnect Concierge — Rep Request Refund State Machine

**Status:** ROD-SIGNED 2026-06-25 — Q3 = UNIFORM $200 refund / $50 retained at ALL non-terminal states (kratos msg 1782350922607). No feature-flag alt branch.
**Companion spec:** `/Users/rodolfoguzman/Sage/orgs/buildconnect/agents/athena/specs/buildconnect-concierge-rep-request.md`
**Migrations:** `supabase/migrations/100_*` through `104_*`
**Owner:** hephaestus (backend) / athena (spec authority)

This document captures the refund money-flow state machine for `rep_requests`. The DB-level state lives in two columns on `rep_requests`:

- `status` (`rep_request_status` enum — request lifecycle, 8 values)
- `charge_status` (`rep_request_charge_status` enum — money lifecycle, 4 values)

The two move in parallel and are kept consistent by Stripe webhook handlers + the `cancel-rep-request` edge function.

---

## 1. Money mechanics (locked)

Per athena spec §4 + kratos lock:

| Event | Amount | Stripe action |
|---|---|---|
| Request submitted (INSERT row at `pending_payment`) | $0 | `PaymentIntent.create` with `idempotency_key = rep_requests.stripe_idempotency_key` |
| `charge.succeeded` webhook | $250 captured | flip `status: pending_payment → new`, `charge_status: not_charged → charged` |
| `charge.failed` webhook | $0 (no capture) | flip `status: pending_payment → charge_failed` (terminal) |
| Cancellation (default branch, Q3=(a)) | $200 refund | `Refund.create` with `amount=20000`, `payment_intent=pi_xxx`, `metadata.kind='rep_request_cancel'` |
| `charge.refunded` webhook | (no money move; ack) | flip `charge_status: refund_pending → refunded`, set `refunded_at` |

Architecture: **Stripe platform direct-Charge**, NOT Stripe Connect. Single charge against the BuildConnect platform account; partial refund via `Refund.create` with `amount<charge_amount`. No connected-account routing.

---

## 2. Status + charge_status state product

The 8 status × 4 charge_status combinations collapse to a small set of legal pairs:

| status | charge_status | meaning | legal? |
|---|---|---|---|
| `pending_payment` | `not_charged` | row just INSERTed, charge in flight | YES (initial) |
| `pending_payment` | `charged` | (impossible — webhook flips status too) | NO |
| `new` | `charged` | charge succeeded; awaiting admin assignment | YES |
| `scheduled` | `charged` | normal mid-cycle | YES |
| `visited` | `charged` | normal mid-cycle | YES |
| `project_ready` | `charged` | normal mid-cycle | YES |
| `contractor_selected` | `charged` | terminal-happy | YES |
| `cancelled` | `refund_pending` | cancel fired, awaiting Stripe refund.* webhook | YES |
| `cancelled` | `refunded` | refund complete, $200 returned / $50 retained | YES |
| `cancelled` | `charged` | Q3=(b) admin-review-only branch: no auto-refund | YES (under feature flag) |
| `cancelled` | `not_charged` | cancel fired before charge.succeeded landed | RARE — see §4.3 |
| `charge_failed` | `not_charged` | terminal: initial charge failed | YES |

All other combinations are illegal and should be caught by the `rep_requests_status_consistency` CHECK constraint (mig 101) + edge-fn invariant checks.

---

## 3. Canonical refund branch (Rod §11 Q3 LOCKED: uniform)

When a homeowner OR an admin cancels a rep_request in any non-terminal state with `charge_status='charged'`:

```
                              ┌─────────────────────────────────────────┐
                              │ cancel-rep-request edge fn              │
                              │                                          │
  client POSTs cancel ──────► │ 1. Auth check (homeowner == row owner    │
                              │    OR profile.role IN admin set)         │
                              │ 2. Status check (current NOT IN          │
                              │    cancelled/charge_failed/CS)           │
                              │ 3. Q3 branch gate (default = uniform)    │
                              │                                          │
                              │ 4. BEGIN TX                              │
                              │     UPDATE rep_requests SET              │
                              │       status='cancelled',                │
                              │       charge_status='refund_pending',    │
                              │       cancelled_at=now(),                │
                              │       cancelled_by=actor_id,             │
                              │       cancellation_reason=$reason        │
                              │     INSERT INTO rep_request_events       │
                              │       (event_type='cancelled', ...)      │
                              │    COMMIT                                │
                              │                                          │
                              │ 5. Stripe.refunds.create({                │
                              │      payment_intent: row.stripe_pi_id,   │
                              │      amount: 20000,                       │
                              │      idempotency_key: row.stripe_idem    │
                              │        || '_cancel',                      │
                              │      metadata: {                          │
                              │        rep_request_id, kind: 'cancel'    │
                              │      }                                    │
                              │    })                                    │
                              │                                          │
                              │ 6. UPDATE rep_requests SET               │
                              │      stripe_refund_id=re.id              │
                              │    INSERT INTO rep_request_events        │
                              │      (event_type='refund_issued', ...)   │
                              │                                          │
                              │ 7. Return 200 to client                  │
                              └─────────────────────────────────────────┘
                                                │
                                                │ (async, eventually)
                                                ▼
                              ┌─────────────────────────────────────────┐
                              │ stripe-webhook handler                  │
                              │   charge.refunded event                 │
                              │     UPDATE rep_requests SET             │
                              │       charge_status='refunded',         │
                              │       refunded_at=now()                 │
                              │     INSERT INTO rep_request_events      │
                              │       (event_type='refund_succeeded')   │
                              │                                          │
                              │   refund.failed event                    │
                              │     (charge_status stays                │
                              │      'refund_pending' — admin manual)   │
                              │     INSERT INTO rep_request_events      │
                              │       (event_type='refund_failed')      │
                              └─────────────────────────────────────────┘
```

Key invariants:
- The status flip to `cancelled` is **synchronous** + irreversible at the rep_requests table.
- The Stripe refund call is **synchronous within the edge fn** (RefundCreate is fast — sub-second for Stripe), so the client sees one round-trip and the `stripe_refund_id` is captured before returning 200.
- The `charge_status` final flip (`refund_pending → refunded`) is **async** — driven by Stripe's `charge.refunded` webhook. The homeowner sees "$200 refund processing" until the webhook lands; then "$200 refunded".

---

## 4. Status transition triggers + actor scope

| Transition | Trigger | Authorized actor | Edge fn |
|---|---|---|---|
| `pending_payment → new` | `charge.succeeded` webhook | system | `stripe-webhook` |
| `pending_payment → charge_failed` | `charge.failed` webhook | system | `stripe-webhook` |
| `new → scheduled` | Admin assigns rep + visit window | admin only | `assign-rep` |
| `scheduled → visited` | Rep clicks "Mark Visited" | assigned rep or admin | `update-rep-request-status` |
| `visited → project_ready` | Rep clicks "Mark Project Ready" (gated on `project_id NOT NULL`) | assigned rep or admin | `update-rep-request-status` |
| `project_ready → contractor_selected` | Homeowner accepts first contractor bid | system (existing bid acceptance hook) | (existing project flow) |
| `* → cancelled` | Homeowner OR admin cancel | homeowner (own) or admin | `cancel-rep-request` |

Status transitions cannot reverse — `cancelled` / `charge_failed` / `contractor_selected` are terminal. A new `rep_request` row is required to restart.

---

## 5. Edge cases

### 5.1 Double-cancel
`cancel-rep-request` is **idempotent on `status='cancelled'`**: if the row is already cancelled, the fn returns `{ ok: true, already_cancelled: true }` without re-firing the Stripe refund. The `stripe_idempotency_key + '_cancel'` suffix is reused, so even a race that bypasses the DB check would be caught by Stripe's idempotency layer.

### 5.2 Cancellation during in-flight charge
Rare sub-second race: homeowner submits + immediately cancels while `pending_payment`. The fn's status-precondition check (`status NOT IN (cancelled, charge_failed, contractor_selected)`) accepts `pending_payment`, but:

- If `charge_status='not_charged'`: no Stripe PaymentIntent has been captured yet. Cancel sets `status='cancelled', charge_status='not_charged'`, NO refund needed. The PI may still capture if Stripe's `confirm` was already in flight — webhook arriving `charge.succeeded` on a `cancelled` row triggers an **auto-refund** (see §5.3).

- If `charge_status='charged'` (charge already succeeded but `status` is still `pending_payment` because webhook hasn't landed): impossible in practice (webhook flips both atomically) — treated as normal cancel-with-refund.

### 5.3 `charge.succeeded` webhook arrives on already-cancelled row
Edge case: homeowner cancelled before the webhook landed. The webhook handler MUST check current `status` and:

```ts
if (row.status === 'cancelled') {
  // Auto-fire refund for the captured charge.
  await stripe.refunds.create({
    payment_intent: pi.id,
    amount: 20000, // $200 refund per default policy
    idempotency_key: row.stripe_idempotency_key + '_late_cancel',
    metadata: { kind: 'late_arrival_cancel' },
  });
  await db.update(rep_requests, {
    charge_status: 'refund_pending',
    stripe_charge_id: pi.latest_charge,
  });
  await db.insert(rep_request_events, {
    event_type: 'refund_issued',
    payload: { reason: 'late_arrival_cancel', amount_cents: 20000 },
  });
  return; // do NOT flip status to 'new'
}
// else: normal pending_payment → new flow
```

### 5.4 Refund failure (Stripe `refund.failed`)
Stripe webhook reports `refund.failed` (rare — card declined refund, e.g., closed account). Edge fn:

```ts
// charge_status stays 'refund_pending' — admin manual handling
await db.insert(rep_request_events, {
  event_type: 'refund_failed',
  payload: { stripe_error: event.data.object.failure_reason },
});
await notifyAdminQueue(rep_request_id, 'refund_failed');
```

Admin retries via the admin queue surface; Stripe support escalation is the fallback. The row stays `status='cancelled' / charge_status='refund_pending'` indefinitely until admin closes the loop.

### 5.5 Orphan `pending_payment` rows
A `pending_payment` row older than ~10 minutes with `stripe_payment_intent_id IS NULL` means the edge fn crashed between INSERT and Stripe PaymentIntent.create. Admin sweep job (cron) deletes safely — no money moved.

A `pending_payment` row with `stripe_payment_intent_id NOT NULL` but no webhook arrival means Stripe ack delay OR webhook delivery failure. Admin tooling: query Stripe directly via `paymentIntents.retrieve(pi_id)`, reconcile manually if needed. Generally rare; Stripe's webhook delivery is reliable + retries up to 3 days.

---

## 6. Idempotency keys

`rep_requests.stripe_idempotency_key` is a `uuid UNIQUE NOT NULL DEFAULT gen_random_uuid()`, set at INSERT time and stable for the lifetime of the row.

Three uses:
- `PaymentIntent.create({ idempotency_key: <uuid> })` — initial charge
- `Refund.create({ idempotency_key: <uuid> + '_cancel' })` — cancel refund
- `Refund.create({ idempotency_key: <uuid> + '_late_cancel' })` — late-arrival cancel refund (§5.3)

Stripe enforces idempotency at its layer; a retry with the same key returns the same response object (PI / Refund). This makes the edge fns safe to retry at the wrangler layer (failed deploys, transient network) without risk of double-charging or double-refunding.

---

## 7. Audit trail (rep_request_events)

Every state transition + payment event writes a row to `rep_request_events` (mig 102) within the same transaction as the `rep_requests` update. The structured `from_status / to_status / actor_role` columns make `WHERE event_type IN ('cancelled', 'refund_issued', 'refund_succeeded', 'refund_failed')` the canonical refund-forensics query.

Append-only invariant: the `rep_request_events_deny_mutation` trigger denies UPDATE/DELETE even at service-role. Audit rows are immutable.

---

## 8. Apollo E2E walker hook points

The following are the canonical E2E walker assertions for the refund state machine. Apollo wires its walker to fire and check these against the dev/staging deploy (test Stripe keys). Production apply gated on apollo PASS + Rod live-flip.

### Hook [A] — Happy path: charge.succeeded → status=new

1. Homeowner submits intake form → POST `/api/rep-requests` with full payload
2. Assert: response 200 + `client_secret` returned + DB row exists with `status='pending_payment' / charge_status='not_charged' / stripe_payment_intent_id NOT NULL`
3. Walker fires Stripe.js `confirmCardPayment(client_secret)` with test card `4242 4242 4242 4242`
4. Wait for webhook landing (poll DB ~5s)
5. Assert: DB row mutated to `status='new' / charge_status='charged' / charged_at NOT NULL / stripe_charge_id NOT NULL`
6. Assert: `rep_request_events` row inserted with `event_type='charge_succeeded' / from_status='pending_payment' / to_status='new'`

### Hook [B] — Cancel → $200 refund landing

1. From a `status='scheduled'` row (use admin assignment walker to set up), POST `/api/rep-requests/:id/cancel` with `reason='walker_test'` as homeowner
2. Assert: response 200 + DB row mutated to `status='cancelled' / charge_status='refund_pending' / cancelled_at NOT NULL / cancelled_by=homeowner_uid / stripe_refund_id NOT NULL`
3. Assert: Stripe `Refund.retrieve(stripe_refund_id)` returns `amount=20000 / status='succeeded' or 'pending' / payment_intent=<original PI>`
4. Wait for `charge.refunded` webhook landing (poll DB ~5s)
5. Assert: DB row mutated to `charge_status='refunded' / refunded_at NOT NULL`
6. Assert: `rep_request_events` rows for both `event_type='cancelled' / from_status='scheduled' / to_status='cancelled'` AND `event_type='refund_succeeded'`
7. Assert: $200 in test-Stripe-account refunded ledger; $50 retained in platform balance

### Hook [C] — charge_failed → inline-error path (status terminal, NOT in customer tracker)

1. Homeowner submits intake form → POST `/api/rep-requests`
2. Assert: response 200 + `client_secret` returned
3. Walker fires Stripe.js `confirmCardPayment(client_secret)` with test card `4000 0000 0000 0002` (always-decline)
4. Wait for webhook landing (poll DB ~5s)
5. Assert: DB row mutated to `status='charge_failed' / charge_status='not_charged'` (terminal)
6. Assert: `rep_request_events` row inserted with `event_type='charge_failed' / from_status='pending_payment' / to_status='charge_failed' / payload.stripe_error NOT NULL`
7. Assert: FE state machine in `submitFormState='paymentError'` with retry CTA visible; status tracker NEVER renders
8. Negative: assert NO row visible in customer-facing tracker queue (RLS + FE state should hide)

### Hook [D] — Late-arrival cancel race (§5.3)

1. Homeowner submits intake form → DB row at `pending_payment / stripe_payment_intent_id NOT NULL`
2. Before walker fires `confirmCardPayment`, walker fires POST `/api/rep-requests/:id/cancel`
3. Assert: DB row mutated to `status='cancelled' / charge_status='not_charged' / stripe_refund_id IS NULL` (cancel happened before charge captured)
4. Walker fires `confirmCardPayment(client_secret)` with test card `4242 4242 4242 4242` (charge succeeds despite already-cancelled row)
5. Wait for `charge.succeeded` webhook landing (poll DB ~5s)
6. Assert: webhook handler took §5.3 branch — DB row mutated to `charge_status='refund_pending' / stripe_refund_id NOT NULL`; `status` remained `'cancelled'` (NOT flipped to `'new'`)
7. Assert: Stripe `Refund.retrieve(stripe_refund_id)` returns `amount=20000 / metadata.kind='late_arrival_cancel'`
8. Assert: `rep_request_events` row with `event_type='refund_issued' / payload.reason='late_arrival_cancel'`

### Walker primitives apollo can reuse from prior walks

- `stripe-test-mode-fixtures.cjs` — test card numbers + helper for `confirmCardPayment`
- `supabase-postgrest-rep-requests-poll.cjs` — DB poll with timeout for webhook landing
- `rep_request_events-cross-check.cjs` — APPEND-only event-log cross-check (verifies row was written + immutability via attempted UPDATE returning the trigger exception)

---

*End of refund state machine doc v1.1. Rod §11 Q3 = UNIFORM locked. Apollo E2E hook points [A][B][C][D] are the dev/staging acceptance gate before any live flip.*
