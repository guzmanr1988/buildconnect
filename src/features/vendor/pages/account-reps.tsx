import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import { UserPlus, Pencil, ShieldAlert, ShieldCheck, KeyRound, Mail, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { matchesSearch } from '@/lib/search-match'
import { useUsersStore, type MockUser, type UserStatus } from '@/stores/users-store'
import { useVendorScope } from '@/lib/vendor-scope'
import { MOCK_VENDORS } from '@/lib/mock-data'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

function statusBadge(status: UserStatus) {
  const map: Record<UserStatus, { className: string }> = {
    active: { className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    pending: { className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    suspended: { className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', map[status].className)}>
      {status}
    </span>
  )
}

export default function VendorAccountRepsPage() {
  const { vendorId } = useVendorScope()
  const vendor = useMemo(() => MOCK_VENDORS.find((v) => v.id === vendorId), [vendorId])

  const users = useUsersStore((s) => s.users)
  const addUserToStore = useUsersStore((s) => s.addUser)
  const updateUserInStore = useUsersStore((s) => s.updateUser)
  const toggleStatusInStore = useUsersStore((s) => s.toggleStatus)
  const removeUserFromStore = useUsersStore((s) => s.removeUser)

  // Only show account_reps scoped to this vendor
  const reps = useMemo(
    () => users.filter((u) => u.role === 'account_rep' && u.account_rep_for_vendor_id === vendorId),
    [users, vendorId],
  )

  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    if (!search.trim()) return reps
    return reps.filter((u) =>
      matchesSearch({ query: search, fields: [u.name, u.email], ids: [u.id] }),
    )
  }, [reps, search])

  // Edit dialog
  const [editUser, setEditUser] = useState<MockUser | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<MockUser | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function openDelete(user: MockUser) {
    setDeleteTarget(user)
    setDeleteOpen(true)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    removeUserFromStore(deleteTarget.id)
    toast.success(`${deleteTarget.name} has been removed.`)
    setDeleteOpen(false)
    setDeleteTarget(null)
  }

  // Reset-password dialog (mock stub, same as admin/users)
  const [resetTarget, setResetTarget] = useState<MockUser | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetTab, setResetTab] = useState<'link' | 'password'>('link')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')

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

  function addRep() {
    if (!newName.trim() || !newEmail.trim()) return
    addUserToStore({
      name: newName.trim(),
      email: newEmail.trim(),
      role: 'account_rep',
      status: 'active',
      account_rep_for_vendor_id: vendorId,
    })
    toast.success(`Account rep ${newName.trim()} created`)
    setAddOpen(false)
    setNewName('')
    setNewEmail('')
  }

  function openResetPassword(user: MockUser) {
    setResetTarget(user)
    setResetTab('link')
    setResetNewPassword('')
    setResetConfirmPassword('')
    setResetOpen(true)
  }

  function submitResetLink() {
    if (!resetTarget) return
    toast.success(`Reset link sent to ${resetTarget.email} (mock)`, {
      description: 'Tranche-2: wire to Supabase Edge Function with service-role.',
    })
    setResetOpen(false)
  }

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
    toast.success(`Password reset for ${resetTarget.email} (mock)`, {
      description: 'Tranche-2: wire to Supabase Edge Function with service-role.',
    })
    setResetOpen(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Reps"
        description={vendor ? `Login access for ${vendor.company} account representatives` : 'Manage account rep logins'}
      >
        <Button onClick={() => setAddOpen(true)} size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Account Rep
        </Button>
      </PageHeader>

      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </motion.div>

      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Email</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Joined</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        {reps.length === 0
                          ? 'No account reps yet. Add one to give your team login access.'
                          : 'No reps match your search.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>{statusBadge(user.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(user.joined_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(user)} title="Edit" aria-label={`Edit ${user.name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openResetPassword(user)}
                              title="Reset password"
                              aria-label={`Reset password for ${user.name}`}
                            >
                              <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleStatusInStore(user.id)}
                              title={user.status === 'suspended' ? 'Activate' : 'Suspend'}
                              aria-label={user.status === 'suspended' ? `Activate ${user.name}` : `Suspend ${user.name}`}
                            >
                              {user.status === 'suspended' ? (
                                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                              ) : (
                                <ShieldAlert className="h-4 w-4 text-red-500" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDelete(user)}
                              title="Remove rep"
                              aria-label={`Remove ${user.name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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

      {/* ---- Delete Confirm Dialog ---- */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Remove {deleteTarget?.name}?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This permanently removes their login. <span className="font-medium text-foreground">{deleteTarget?.name}</span> will immediately lose access to your vendor portal — they won't be able to sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Need to temporarily restrict access instead? <span className="font-medium text-foreground">Suspend their account</span> — that blocks login without deleting the rep. You can reactivate them any time.
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Keep rep</Button>
            <Button variant="destructive" onClick={confirmDelete}>Remove permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Add Account Rep Dialog ---- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Account Rep</DialogTitle>
            <DialogDescription>
              Create a login for a team member. They'll access your vendor dashboard with limited permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rep-name">Full name</Label>
              <Input
                id="rep-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep-email">Email</Label>
              <Input
                id="rep-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jane@yourcompany.com"
                autoComplete="off"
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-semibold">Demo note:</span> v1 stubs the invite email. Production wiring (Supabase auth invite + service-role key) is a Tranche-2 task.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addRep} disabled={!newName.trim() || !newEmail.trim()}>Create Login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit Dialog ---- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account Rep</DialogTitle>
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
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Reset Password Dialog ---- */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
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
              <TabsTrigger value="link" className="gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Send Reset Link
              </TabsTrigger>
              <TabsTrigger value="password" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Set New Password
              </TabsTrigger>
            </TabsList>
            <TabsContent value="link" className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground">
                An email with a password-reset link will be sent to the rep. They can set their own new password from the link.
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <span className="font-semibold">Demo note:</span> v1 stubs this with a toast. Tranche-2: Supabase Edge Function + service-role key.
              </div>
              <Button onClick={submitResetLink} className="w-full gap-2">
                <Mail className="h-4 w-4" />
                Send Reset Link
              </Button>
            </TabsContent>
            <TabsContent value="password" className="space-y-3 py-4">
              <div className="space-y-2">
                <Label htmlFor="rep-reset-new">New password</Label>
                <Input
                  id="rep-reset-new"
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rep-reset-confirm">Confirm password</Label>
                <Input
                  id="rep-reset-confirm"
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <span className="font-semibold">Demo note:</span> v1 stubs this with a toast. Tranche-2: Supabase Edge Function + service-role key.
              </div>
              <Button onClick={submitResetPassword} className="w-full gap-2">
                <KeyRound className="h-4 w-4" />
                Set New Password
              </Button>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
