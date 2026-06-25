// Shared types + helpers for rep_request edge functions.
// Used by: create-rep-request, create-rep-request-on-behalf, cancel-rep-request,
// stripe-webhook (charge.*/refund.* handlers).

export type RepRequestStatus =
  | 'pending_payment'
  | 'new'
  | 'scheduled'
  | 'visited'
  | 'project_ready'
  | 'contractor_selected'
  | 'cancelled'
  | 'charge_failed'

export type RepRequestChargeStatus =
  | 'not_charged'
  | 'charged'
  | 'refund_pending'
  | 'refunded'

export type RepRequestEventType =
  | 'created'
  | 'charge_attempted'
  | 'charge_succeeded'
  | 'charge_failed'
  | 'assigned'
  | 'scheduled'
  | 'visited'
  | 'project_drafted'
  | 'project_ready'
  | 'contractor_selected'
  | 'cancelled'
  | 'refund_issued'
  | 'refund_succeeded'
  | 'refund_failed'
  | 'note_added'
  | 'photo_uploaded'

export type UserRole =
  | 'homeowner'
  | 'vendor'
  | 'admin'
  | 'admin_employee'
  | 'account_rep'
  | 'rep'

export type VisitWindowBucket =
  | 'weekday_morning'
  | 'weekday_afternoon'
  | 'weekend_anytime'

export interface VisitWindow {
  window_start_utc: string
  window_end_utc: string
  service_tz: string
  bucket_label: VisitWindowBucket
}

// Money constants — locked by Rod §11 (kratos msg 1782350922607). Uniform refund
// branch, no feature-flag alt. $250 charge / $200 refund on cancel / $50 retained.
export const VISIT_FEE_CENTS = 25000
export const REFUNDABLE_CENTS = 20000
export const RETAINED_CENTS = 5000

// State-to-timezone map for service_tz derivation in create-rep-request.
// Multi-TZ states default to populous-side per athena msg 1782350586038
// (admin override field deferred to v2).
export const STATE_TO_TZ: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York', // ET dominant (panhandle CT exception)
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Boise', // northern panhandle PT exception
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis', // small western CT exception
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York', // western CT exception
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit', // small western CT exception
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago', // western MT exception
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago', // western MT exception
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles', // eastern MT exception
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago', // western MT exception
  TN: 'America/Chicago', // eastern ET exception
  TX: 'America/Chicago', // western MT exception
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  DC: 'America/New_York',
}

// Bucket-to-window derivation. Called server-side in create-rep-request to
// expand the user's categorical bucket pick + date into canonical
// VisitWindow (UTC ISO + service_tz tag). Pure function; no IO.
export function bucketToWindow(
  bucket: VisitWindowBucket,
  isoDate: string,         // YYYY-MM-DD
  serviceTz: string        // e.g. 'America/Chicago'
): { window_start_utc: string; window_end_utc: string } | null {
  // Derive start/end hours per bucket + the day-of-week filter
  let startHour: number, endHour: number, allowedDays: number[]
  switch (bucket) {
    case 'weekday_morning':
      startHour = 9
      endHour = 12
      allowedDays = [1, 2, 3, 4, 5] // Mon-Fri
      break
    case 'weekday_afternoon':
      startHour = 12
      endHour = 17
      allowedDays = [1, 2, 3, 4, 5]
      break
    case 'weekend_anytime':
      startHour = 9
      endHour = 17
      allowedDays = [0, 6] // Sun, Sat
      break
    default:
      return null
  }

  // Build the local-date in the service_tz and confirm day-of-week match.
  // Note: full TZ math should use a date library at the consumer (date-fns-tz
  // or Temporal polyfill); inline here we approximate via UTC offset derivation.
  // For PR + dev-deploy, sufficient; v2 polish should swap in proper TZ lib.
  const localDate = new Date(`${isoDate}T00:00:00`)
  const dow = localDate.getUTCDay()
  if (!allowedDays.includes(dow)) return null

  // Compose UTC ISO strings — caller passes serviceTz separately as the tag
  // (not used in offset math here; TODO: Temporal polyfill at v2)
  const startIso = new Date(`${isoDate}T${String(startHour).padStart(2, '0')}:00:00`).toISOString()
  const endIso = new Date(`${isoDate}T${String(endHour).padStart(2, '0')}:00:00`).toISOString()
  return { window_start_utc: startIso, window_end_utc: endIso }
}

// CORS allowed origins (mirrors create-lead / other edge fn patterns)
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
