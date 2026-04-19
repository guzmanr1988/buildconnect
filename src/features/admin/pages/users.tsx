import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import type { UserRole } from '@/types'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type UserStatus = 'active' | 'pending' | 'suspended'

interface MockUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  joined_at: string
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const INITIAL_USERS: MockUser[] = [
  { id: 'u1', name: 'Alex Rivera', email: 'alex@buildconnect.io', role: 'admin', status: 'active', joined_at: '2025-01-10' },
  { id: 'u2', name: 'Jordan Lee', email: 'jordan@buildconnect.io', role: 'admin', status: 'active', joined_at: '2025-02-14' },
  { id: 'u3', name: 'Sam Patel', email: 'sam@eliteroofing.com', role: 'vendor', status: 'active', joined_at: '2025-03-01' },
  { id: 'u4', name: 'Maria Gonzalez', email: 'maria@premiumwindows.com', role: 'vendor', status: 'active', joined_at: '2025-03-18' },
  { id: 'u5', name: 'Chen Wei', email: 'chen@poolpros.com', role: 'vendor', status: 'pending', joined_at: '2025-04-02' },
  { id: 'u6', name: 'Lisa Thompson', email: 'lisa.t@gmail.com', role: 'homeowner', status: 'active', joined_at: '2025-04-05' },
  { id: 'u7', name: 'Derek Williams', email: 'derek.w@outlook.com', role: 'homeowner', status: 'active', joined_at: '2025-04-08' },
  { id: 'u8', name: 'Priya Sharma', email: 'priya.s@yahoo.com', role: 'homeowner', status: 'suspended', joined_at: '2025-02-20' },
  { id: 'u9', name: 'Carlos Mendez', email: 'carlos@drivewayking.com', role: 'vendor', status: 'suspended', joined_at: '2025-01-25' },
  { id: 'u10', name: 'Nina Okafor', email: 'nina.o@gmail.com', role: 'homeowner', status: 'pending', joined_at: '2025-04-10' },
]

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
}

const ROLE_TABS: { value: UserRole | 'all'; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: Users },
  { value: 'admin', label: 'Admin', icon: Shield },
  { value: 'vendor', label: 'Vendor', icon: Briefcase },
  { value: 'homeowner', label: 'Homeowner', icon: Home },
]

function roleBadge(role: UserRole) {
  const map: Record<UserRole, { className: string }> = {
    admin: { className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
    vendor: { className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    homeowner: { className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  }
  const cfg = map[role]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', cfg.className)}>
      {role}
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

export default function UsersPage() {
  const [users, setUsers] = useState<MockUser[]>(INITIAL_USERS)
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

  /* ---- Filtered list ---- */
  const filtered = useMemo(() => {
    let list = users
    if (roleFilter !== 'all') {
      list = list.filter((u) => u.role === roleFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      )
    }
    return list
  }, [users, search, roleFilter])

  /* ---- Actions ---- */
  function toggleStatus(id: string) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, status: u.status === 'suspended' ? 'active' : 'suspended' }
          : u,
      ),
    )
  }

  function openEdit(user: MockUser) {
    setEditUser({ ...user })
    setEditOpen(true)
  }

  function saveEdit() {
    if (!editUser) return
    setUsers((prev) => prev.map((u) => (u.id === editUser.id ? editUser : u)))
    setEditOpen(false)
    setEditUser(null)
  }

  function addUser() {
    if (!newUser.name.trim() || !newUser.email.trim()) return
    const user: MockUser = {
      ...newUser,
      id: `u${Date.now()}`,
      joined_at: new Date().toISOString().slice(0, 10),
    }
    setUsers((prev) => [user, ...prev])
    setAddOpen(false)
    setNewUser({ name: '', email: '', role: 'homeowner', status: 'active' })
  }

  /* ---- Counts ---- */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users.length }
    for (const u of users) c[u.role] = (c[u.role] ?? 0) + 1
    return c
  }, [users])

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
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Role filter tabs */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter users by role">
          {ROLE_TABS.map(({ value, label, icon: Icon }) => (
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
                        <TableCell className="font-medium">{user.name}</TableCell>
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
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(user)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleStatus(user.id)}
                              title={user.status === 'suspended' ? 'Activate' : 'Suspend'}
                            >
                              {user.status === 'suspended' ? (
                                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                              ) : (
                                <ShieldAlert className="h-4 w-4 text-red-500" />
                              )}
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
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
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
    </div>
  )
}
