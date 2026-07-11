import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import type { UserRole } from '@/types'

// Canonical home per role. Non-matching role on a route block redirects
// here rather than spinning at /login. account_rep + admin_employee are
// scoped roles within vendor/admin trees respectively.
const ROLE_HOME: Record<UserRole, string> = {
  homeowner: '/home',
  vendor: '/vendor',
  account_rep: '/vendor',
  admin: '/admin',
  admin_employee: '/admin',
  rep: '/admin/rep-requests/mine',
}

interface RequireRoleProps {
  roles: UserRole[]
  children: React.ReactNode
}

// Lane-4 launch-gate (apollo Lane-3 + hermes Lane-1 + helios Lane-4
// 2026-05-22): RequireAuth alone leaks every authed user to every tree
// via direct URL. RequireRole nests inside RequireAuth and redirects
// any role outside the route block's allow-list to that role's canonical
// home. Auth-store hydrates profile.role on session resume; an authed
// session with null role falls back to /login (defensive — should not
// happen post-signup-trigger but covers stale localStorage).
export function RequireRole({ roles, children }: RequireRoleProps) {
  const role = useAuthStore((s) => s.role)
  if (!role) return <Navigate to="/login" replace />
  if (!roles.includes(role)) {
    return <Navigate to={ROLE_HOME[role] ?? '/login'} replace />
  }
  return <>{children}</>
}
