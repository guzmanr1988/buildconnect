// Ship #270 — Non-Circumvention Agreement (Phase 1, vendor-side).
//
// DRAFT legal language — Rodolfo's attorney swaps the final language in
// Phase 2. The placeholders [$X — TBD by attorney] and [N months — TBD
// by attorney] are intentionally inline-literal so the attorney sees
// them while reading the document, rather than chasing a constants
// file. Same visibility-discipline applies to any future placeholders.
//
// Version-bump protocol: when the attorney returns final language,
// (1) replace AGREEMENT_TEXT, (2) bump CURRENT_AGREEMENT_VERSION (e.g.
// "v1.0" or "v2.0-final"), (3) all prior-signed vendors see the new
// version on their next /vendor route mount and the gate-modal
// re-prompts. Snapshot stored at sign-time on the vendor's profile
// preserves the signed-version body for audit.

export const CURRENT_AGREEMENT_VERSION = 'v1.0-draft' as const

export const AGREEMENT_TITLE = 'Non-Circumvention Agreement'

export const AGREEMENT_DRAFT_BANNER =
  'DRAFT — Subject to attorney review before launch'

export const AGREEMENT_EMAIL_FOOTER =
  'A copy of this agreement will be sent to your email.'

export const AGREEMENT_TEXT = `THIS AGREEMENT is entered into between BuildConnect ("Platform") and the undersigned vendor ("Vendor") as of the date of electronic signature below.

1. DEFINITIONS

"Platform" refers to BuildConnect, an online marketplace operating in the State of Florida that connects homeowners and consumers ("Consumers") with home-services contractors and vendors. "Lead" means any inquiry, project request, or business opportunity referred to Vendor through the Platform. "Consumer" means any homeowner, property owner, or other end-user introduced to Vendor through the Platform.

2. SCOPE OF ENGAGEMENT

The Platform provides Vendor with access to Consumer leads, scheduling tools, communication channels, payment processing, and related services in exchange for a commission on completed transactions, as set forth in Vendor's separate commission agreement. Vendor acknowledges that the Platform's value derives from its referral network and Consumer relationships.

3. NON-CIRCUMVENTION

Vendor agrees that during the term of this Agreement and for a period of [N months — TBD by attorney] following termination, Vendor shall NOT:

(a) Directly or indirectly contact any Consumer introduced through the Platform outside of Platform-provided communication channels, except for the express purpose of completing a Platform-originated project;

(b) Solicit, accept, or perform business with any Platform-introduced Consumer outside of the Platform, whether for the originally-quoted project or any subsequent or related project;

(c) Encourage, induce, or assist any Consumer to bypass the Platform for any future engagement, including referrals to other contractors;

(d) Use Consumer contact information obtained through the Platform for any purpose other than fulfilling a Platform-originated transaction.

4. LIQUIDATED DAMAGES

In recognition that actual damages from circumvention are difficult to quantify, Vendor agrees that any breach of Section 3 shall result in liquidated damages of [$X — TBD by attorney] per violation, OR an amount equal to the commission the Platform would have earned on the bypassed transaction (calculated at Vendor's then-current commission rate), whichever is greater. Vendor acknowledges this amount is a reasonable estimate of the Platform's loss and not a penalty.

5. TERM AND TERMINATION

This Agreement is effective on the date of electronic signature and continues until Vendor's account is closed or terminated by either party. The non-circumvention obligations in Section 3 shall survive termination for the period specified in Section 3.

6. GOVERNING LAW AND JURISDICTION

This Agreement shall be governed by the laws of the State of Florida, without regard to its conflict-of-law principles. Any dispute arising under this Agreement shall be brought exclusively in the state or federal courts located in the county of Vendor's principal business address within Florida. Vendor consents to personal jurisdiction in such courts.

7. SEVERABILITY AND ENTIRE AGREEMENT

If any provision of this Agreement is held unenforceable, the remaining provisions shall remain in full force and effect, and the unenforceable provision shall be reformed only to the extent necessary to make it enforceable. This Agreement, together with Vendor's commission agreement and Platform Terms of Service, constitutes the entire agreement between the parties on the subject of non-circumvention and supersedes all prior negotiations and understandings.

By typing my full legal name and clicking Submit below, I attest that I have read, understood, and agree to be bound by the terms of this Agreement. I acknowledge that this electronic signature constitutes a legally binding signature pursuant to the federal E-SIGN Act and the Uniform Electronic Transactions Act.`

export interface AgreementSnapshot {
  version: string
  text: string
}

export function getCurrentAgreementSnapshot(): AgreementSnapshot {
  return {
    version: CURRENT_AGREEMENT_VERSION,
    text: AGREEMENT_TEXT,
  }
}
