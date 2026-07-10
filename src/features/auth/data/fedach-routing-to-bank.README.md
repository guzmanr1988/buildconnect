# fedach-routing-to-bank.json

Live bank-name auto-detect map for the Vendor Payment dialog Checking tab.

**Purpose:** show `Bank: <name>` under the routing-number field as the user
types. Stripe's `paymentMethod.us_bank_account.bank_name` is still authoritative
at tokenization time — this map is a UX affordance only.

**Format:** `{ "<9-digit routing_number>": "<bank name>" }` — sorted keys,
minified. Only "main office" (office_code=O) records; branches share the
main-office name so we skip them.

**Source:** derived from the Federal Reserve FedACH Participants Directory,
fetched via a public open-source mirror (moov-io/fed, Apache 2.0):

```
https://raw.githubusercontent.com/moov-io/fed/master/data/FedACHdir.txt
```

The Federal Reserve is the canonical source
(https://www.frbservices.org/EPaymentsDirectory). It sits behind a T&C
click-through so direct programmatic fetch requires JS execution; the moov-io
mirror is refreshed against the same source and is stable across weekly
FedACH cadence.

**Fetched:** 2026-07-10 (record count: 18,007 unique routing numbers).

**Refresh:** re-run the extraction against the same URL (or the FedACH
directory directly if it becomes programmatically fetchable). Bank names
churn slowly (M&A, rebrands); refresh quarterly or on failed lookups.

**Extraction:** columns 1-9 (routing_number), col 10 (office_code, keep 'O'),
columns 36-71 (customer_name, ASCII trimmed, title-cased with initialism
preservation).
