import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useVendorMembershipStore } from '@/stores/vendor-membership-store'

interface RequireActiveMembershipProps {
  children: React.ReactNode
}

/*
 * Ship #181 (follow-up to Rodolfo-direct pivot #4 ship #180) — route-guard
 * for the vendor portal. Rodolfos spec on the /vendor/membership Cancel
 * flow: "portal will be disabled, login in will still be possible but
 * you won't have access to nothing unless membership is back to active."
 *
 * Shape:
 * - Non-vendor profiles pass through (homeowner admin guards aren't our
 *   concern here).
 * - Active or unset membership passes through — `unset` defends against
 *   the race window between first signup and activateMembership landing,
 *   so a brand-new vendor can't get falsely locked before the signup
 *   success handler commits.
 * - Cancelled status redirects every /vendor/* path to /vendor/membership
 *   EXCEPT /vendor/membership itself (always accessible so the user has
 *   a reactivate path).
 *
 * Nested inside <RequireAuth> on /vendor in router/index.tsx so the
 * login-check runs first.
 */

export function RequireActiveMembership({ children }: RequireActiveMembershipProps) {
  const location = useLocation()
  const profile = useAuthStore((s) => s.profile)
  const membership = useVendorMembershipStore((s) =>
    profile?.id ? s.membershipByVendor[profile.id] : undefined,
  )

  // Only applies to vendors. Any other role (or no profile yet) passes
  // through — RequireAuth already ensures we have a profile by the time
  // this mounts, but the defensive check costs nothing.
  if (!profile || profile.role !== 'vendor') {
    return <>{children}</>
  }

  // Active or not-yet-set → pass. Not-yet-set handles the brand-new
  // signup window before activateMembership fires; the membership page's
  // own useEffect will seed it on first visit.
  if (!membership || membership.status === 'active') {
    return <>{children}</>
  }

  // Cancelled. Membership page is the only permitted surface — the user
  // needs a path to reactivate without getting bounced in a loop.
  if (location.pathname === '/vendor/membership') {
    return <>{children}</>
  }

  return <Navigate to="/vendor/membership" replace />
}
