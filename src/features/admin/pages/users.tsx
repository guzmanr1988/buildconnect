import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  Search,
  UserPlus,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Users,
  Shield,
  Home,
  Briefcase,
  KeyRound,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { matchesSearch } from '@/lib/search-match'
import { useUsersStore, type MockUser, type UserStatus } from '@/stores/users-store'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_VENDORS } from '@/lib/mock-data'
import type { UserRole } from '@/types'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

const ROLE_TABS: { value: UserRole | 'all'; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: Users },
  { value: 'admin', label: 'Admin', icon: Shield },
  { value: 'vendor', label: 'Vendor', icon: Briefcase },
  { value: 'homeowner', label: 'Homeowner', icon: Home },
  { value: 'account_rep', label: 'Account Rep', icon: KeyRound },
]

function roleBadge(role: UserRole) {
  // Ship #333 Phase A — account_rep added to UserRole; admin Users page
  // displays it with a distinct color to differentiate from vendor.
  const map: Record<UserRole, { className: string }> = {
    admin: { className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
    vendor: { className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    homeowner: { className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    account_rep: { className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
    admin_employee: { className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
  }
  const cfg = map[role]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', cfg.className)}>
      {role.replace(/_/g, ' ')}
    </span>
  )
}

function statusBadge(status: UserStatus) {
  const map: Record<UserStatus, { className: string }> = {
    active: { className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    pending: { className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    suspended: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }
  const cfg = map[status]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', cfg.className)}>
      {status}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// Roles that admin_employee is allowed to see/manage: vendor, homeowner,
// account_rep only. No admin, no admin_employee.
const ADMIN_EMPLOYEE_VISIBLE_ROLES = new Set<UserRole>(['vendor', 'homeowner', 'account_rep'])

export default function UsersPage() {
  const users = useUsersStore((s) => s.users)
  const addUserToStore = useUsersStore((s) => s.addUser)
  const updateUserInStore = useUsersStore((s) => s.updateUser)
  const toggleStatusInStore = useUsersStore((s) => s.toggleStatus)
  const profile = useAuthStore((s) => s.profile)
  const isAdminEmployee = profile?.role === 'admin_employee'
  const visibleRoleTabs = useMemo(
    () =>
      isAdminEmployee
        ? ROLE_TABS.filter((t) => t.value === 'all' || ADMIN_EMPLOYEE_VISIBLE_ROLES.has(t.value as UserRole))
        : ROLE_TABS,
    [isAdminEmployee],
  )
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')

  // Edit dialog
  const [editUser, setEditUser] = useState<MockUser | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newUser, setNewUser] = useState<Omit<MockUser, 'id' | 'joined_at'>>({
    name: '',
    email: '',
    role: 'homeowner',
    status: 'active',
  })

  // Reset-password dialog (ship #136 + task_1776743274579_661 Tranche-2).
  // Both paths now call the admin-reset-password Edge Function which holds
  // the service-role key server-side. Bearer token is the admin's session
  // JWT; Edge Function re-verifies it + checks profiles.role='admin' before
  // doing anything privileged.
  const [resetTarget, setResetTarget] = useState<MockUser | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetTab, setResetTab] = useState<'link' | 'password'>('link')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)

  // Four-refinement confirm dialog state for the destructive
  // set-password-manually path (per feedback_destructive_confirm_four_refinements):
  // named-target + earned-by-typing + steer-to-cancel + verb-matched-cancel.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTypedEmail, setConfirmTypedEmail] = useState('')

  function openResetPassword(user: MockUser) {
    setResetTarget(user)
    setResetTab('link')
    setResetNewPassword('')
    setResetConfirmPassword('')
    setResetOpen(true)
  }

  // Calls the admin-reset-password Edge Function. Returns the parsed JSON
  // response and HTTP status — callers map status to toast shape so error
  // codes from the function (e.g. rate_limit_exceeded) surface to the
  // operator instead of being swallowed as a generic 'failed' toast.
  async function callAdminResetFn(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      return { ok: false, status: 401, data: { error: 'no_admin_session' } }
    }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    let data: Record<string, unknown> = {}
    try {
      data = await resp.json()
    } catch {
      data = { error: 'invalid_response' }
    }
    return { ok: resp.ok, status: resp.status, data }
  }

  async function submitResetLink() {
    if (!resetTarget || resetSubmitting) return
    setResetSubmitting(true)
    try {
      const { ok, data } = await callAdminResetFn({
        action: 'send-reset-link',
        targetEmail: resetTarget.email,
      })
      if (!ok) {
        toast.error(`Reset link failed: ${data.error ?? 'unknown_error'}`)
        return
      }
      toast.success(`Reset link sent to ${resetTarget.email}`)
      setResetOpen(false)
    } finally {
      setResetSubmitting(false)
    }
  }

  // Step 1 of set-password flow — validates inputs then opens the
  // four-refinement confirm dialog. The actual privileged call happens in
  // confirmAndSetPassword(), gated on the operator typing the target email.
  function submitResetPassword() {
    if (!resetTarget) return
    if (resetNewPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setConfirmTypedEmail('')
    setConfirmOpen(true)
  }

  async function confirmAndSetPassword() {
    if (!resetTarget || resetSubmitting) return
    if (confirmTypedEmail.trim().toLowerCase() !== resetTarget.email.toLowerCase()) {
      toast.error('Typed email does not match target')
      return
    }
    setResetSubmitting(true)
    try {
      const { ok, data } = await callAdminResetFn({
        action: 'set-user-password',
        targetEmail: resetTarget.email,
        newPassword: resetNewPassword,
      })
      if (!ok) {
        toast.error(`Set password failed: ${data.error ?? 'unknown_error'}`)
        return
      }
      toast.success(`Password set for ${resetTarget.email}`)
      setConfirmOpen(false)
      setResetOpen(false)
    } finally {
      setResetSubmitting(false)
    }
  }

  /* ---- Filtered list ---- */
  const filtered = useMemo(() => {
    let list = users
    if (isAdminEmployee) {
      list = list.filter((u) => ADMIN_EMPLOYEE_VISIBLE_ROLES.has(u.role))
    }
    if (roleFilter !== 'all') {
      list = list.filter((u) => u.role === roleFilter)
    }
    if (search.trim()) {
      list = list.filter((u) =>
        matchesSearch({
          query: search,
          fields: [u.name, u.email, u.role],
          ids: [u.id],
        }),
      )
    }
    return list
  }, [users, search, roleFilter, isAdminEmployee])

  /* ---- Actions ---- */
  function toggleStatus(id: string) {
    toggleStatusInStore(id)
  }

  function openEdit(user: MockUser) {
    setEditUser({ ...user })
    setEditOpen(true)
  }

  function saveEdit() {
    if (!editUser) return
    updateUserInStore(editUser.id, editUser)
    setEditOpen(false)
    setEditUser(null)
  }

  function addUser() {
    if (!newUser.name.trim() || !newUser.email.trim()) return
    addUserToStore(newUser)
    setAddOpen(false)
    setNewUser({ name: '', email: '', role: 'homeowner', status: 'active' })
  }

  /* ---- Counts ---- */
  const counts = useMemo(() => {
    const scoped = isAdminEmployee
      ? users.filter((u) => ADMIN_EMPLOYEE_VISIBLE_ROLES.has(u.role))
      : users
    const c: Record<string, number> = { all: scoped.length }
    for (const u of scoped) c[u.role] = (c[u.role] ?? 0) + 1
    return c
  }, [users, isAdminEmployee])

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Manage platform users and roles">
        <Button onClick={() => setAddOpen(true)} size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </PageHeader>

      {/* Search + Role Tabs */}
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" className="space-y-4">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, role, or user ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Role filter tabs */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter users by role">
          {visibleRoleTabs.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={roleFilter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter(value)}
              // aria-pressed makes the active filter discoverable to screen readers.
              // Visual active-state uses variant="default" (bg-primary); a11y parity
              // requires the same signal on the accessibility tree.
              aria-pressed={roleFilter === value}
              className="gap-2"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] rounded-full px-1.5 text-[10px]">
                {counts[value] ?? 0}
              </Badge>
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Users Table */}
      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Email</TableHead>
                    <TableHead className="font-semibold">Role</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Joined</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div>{user.name}</div>
                          {user.role === 'account_rep' && user.account_rep_for_vendor_id && (() => {
                            const v = MOCK_VENDORS.find((v) => v.id === user.account_rep_for_vendor_id)
                            return v ? <div className="text-xs text-muted-foreground font-normal">{v.company}</div> : null
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>{roleBadge(user.role)}</TableCell>
                        <TableCell>{statusBadge(user.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(user.joined_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" data-admin-employee-users-edit-hidden={isAdminEmployee ? 'true' : undefined}>
                            {!isAdminEmployee && (
                              <Button variant="ghost" size="icon" onClick={() => openEdit(user)} title="Edit" aria-label={`Edit ${user.name}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openResetPassword(user)}
                              title="Reset password"
                              aria-label={`Reset password for ${user.name}`}
                              data-testid="admin-reset-row-trigger"
                              data-target-email={user.email}
                            >
                              <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </Button>
                            {!isAdminEmployee && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleStatus(user.id)}
                                title={user.status === 'suspended' ? 'Activate' : 'Suspend'}
                                aria-label={user.status === 'suspended' ? `Activate ${user.name}` : `Suspend ${user.name}`}
                              >
                                {user.status === 'suspended' ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                                ) : (
                                  <ShieldAlert className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ---- Edit User Dialog ---- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editUser.role}
                  onValueChange={(v) => setEditUser({ ...editUser, role: v as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="homeowner">Homeowner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editUser.status}
                  onValueChange={(v) => setEditUser({ ...editUser, status: v as UserStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Add User Dialog ---- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser({ ...newUser, role: v as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!isAdminEmployee && <SelectItem value="admin">Admin</SelectItem>}
                  {!isAdminEmployee && <SelectItem value="admin_employee">Admin Employee</SelectItem>}
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="account_rep">Account Rep</SelectItem>
                  <SelectItem value="homeowner">Homeowner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={newUser.status}
                onValueChange={(v) => setNewUser({ ...newUser, status: v as UserStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Reset Password Dialog (ship #136) ---- */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md" data-testid="admin-reset-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-600" />
              Reset Password
            </DialogTitle>
            {resetTarget && (
              <DialogDescription>
                Reset the password for <span className="font-medium text-foreground">{resetTarget.name}</span> ({resetTarget.email}).
              </DialogDescription>
            )}
          </DialogHeader>
          <Tabs value={resetTab} onValueChange={(v) => setResetTab(v as 'link' | 'password')} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link" className="gap-1.5" data-testid="admin-reset-tab-link">
                <Mail className="h-3.5 w-3.5" />
                Send Reset Link
              </TabsTrigger>
              <TabsTrigger value="password" className="gap-1.5" data-testid="admin-reset-tab-password">
                <KeyRound className="h-3.5 w-3.5" />
                Set New Password
              </TabsTrigger>
            </TabsList>
            <TabsContent value="link" className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground">
                An email with a password-reset link will be sent to the user. They can set their own new password from the link.
              </p>
              <Button
                onClick={submitResetLink}
                disabled={resetSubmitting}
                className="w-full gap-2"
                data-testid="admin-reset-submit-link"
              >
                <Mail className="h-4 w-4" />
                {resetSubmitting ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </TabsContent>
            <TabsContent value="password" className="space-y-3 py-4">
              <div className="space-y-2">
                <Label htmlFor="reset-new-password">New password</Label>
                <Input
                  id="reset-new-password"
                  data-testid="admin-reset-new-password"
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-confirm-password">Confirm password</Label>
                <Input
                  id="reset-confirm-password"
                  data-testid="admin-reset-confirm-password-input"
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
              </div>
              <Button
                onClick={submitResetPassword}
                disabled={resetSubmitting}
                variant="destructive"
                className="w-full gap-2"
                data-testid="admin-reset-submit-password"
              >
                <KeyRound className="h-4 w-4" />
                Set Password Manually
              </Button>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Four-refinement confirm for destructive set-password path ----
         Named-target: dialog quotes the exact target user + email.
         Earned: confirm button stays disabled until operator types the
                 target email back verbatim (case-insensitive).
         Steer:   Cancel is the default-styled action; destructive is red.
         Verb-matched-cancel: cancel verb is "Cancel" not "Close" — the
                 cancel button reverses the same verb the user is about to
                 commit (set password). */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md" data-testid="admin-reset-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-400">
              Set password for {resetTarget?.name}?
            </DialogTitle>
            <DialogDescription>
              This will overwrite the current password for{' '}
              <span
                className="font-medium text-foreground"
                data-testid="admin-reset-confirm-target-email"
              >
                {resetTarget?.email}
              </span>{' '}
              immediately. The user will not be notified by email. Prefer
              "Send Reset Link" unless you have a direct out-of-band way to
              tell them the new password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-typed-email">
              Type <span className="font-mono text-foreground">{resetTarget?.email}</span> to confirm
            </Label>
            <Input
              id="confirm-typed-email"
              data-testid="admin-reset-confirm-typed-email"
              value={confirmTypedEmail}
              onChange={(e) => setConfirmTypedEmail(e.target.value)}
              placeholder={resetTarget?.email}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              data-testid="admin-reset-confirm-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmAndSetPassword}
              data-testid="admin-reset-confirm-submit"
              disabled={
                resetSubmitting ||
                confirmTypedEmail.trim().toLowerCase() !==
                  (resetTarget?.email.toLowerCase() ?? '')
              }
            >
              {resetSubmitting ? 'Setting...' : 'Set password now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
