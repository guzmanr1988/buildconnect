import { useMemo, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Search, Plus, Users, Mail, Phone, MapPin, Landmark, Shield, Pencil, UserX, UserCheck, Trash2, Briefcase, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import {
  useVendorEmployeesStore,
  EMPLOYEE_STATUS_LABELS,
  type VendorEmployee,
  type VendorEmployeeInput,
  type EmploymentStatus,
  type EmployeeAccountType,
} from '@/stores/vendor-employees-store'
import { useVendorScope } from '@/lib/vendor-scope'
import { deriveInitials } from '@/lib/initials'
import { cn } from '@/lib/utils'

/*
 * Ship #204 (Rodolfo-direct 2026-04-21 pivot #18, correctly-scoped
 * third pass). Vendor manages their own crew — mirror of #199 admin
 * Employees shape. Bank-for-payments section is gated by a vendor-
 * level "Payroll integration" toggle in the header: some vendors use
 * external systems and don't want to enter bank info here.
 *
 * Toggle OFF (default for fresh signups): bank section hidden in
 * Add/Edit form + Detail Dialog. Bank data on existing records stays
 * intact under the hood — toggling back ON restores visibility.
 *
 * Pattern library at write-time (fired): feature-label grep confirmed
 * no duplicate vendor-employees surface; raw-map selectors with
 * render-body per-vendor lookup per post-#190 discipline; Dialog
 * mounts unconditional; PAN-never bank storage; destructive-confirm-
 * names-the-break on deactivate + harder-copy-with-alternative-steer
 * on delete per #199 Stage-4 refinement.
 */

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.32, ease: 'easeOut' },
  }),
} satisfies Variants

const STATUS_STYLES: Record<EmploymentStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  on_leave: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  inactive: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

const AVATAR_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6']

function blankEmployee(): VendorEmployeeInput {
  return {
    employeeCode: `E-${Math.floor(1000 + Math.random() * 9000)}`,
    firstName: '',
    lastName: '',
    title: '',
    department: '',
    status: 'active',
    startDate: new Date().toISOString().slice(0, 10),
    email: '',
    phone: '',
    address: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: '',
    managerName: '',
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    bankAccountHolder: '',
    bankName: '',
    bankAccountLast4: '',
    bankRoutingLast4: '',
    bankAccountType: 'checking',
    notes: '',
  }
}

function toInput(e: VendorEmployee): VendorEmployeeInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = e
  return rest
}

export default function VendorEmployeesPage() {
  const { vendorId } = useVendorScope()
  // Raw-map selectors per post-#190 pattern — stable references; per-
  // vendor lookups happen in render body, not inside the selector.
  const employeesMap = useVendorEmployeesStore((s) => s.employeesByVendor)
  const bankEnabledMap = useVendorEmployeesStore((s) => s.bankEnabledByVendor)
  const employees = employeesMap[vendorId] ?? []
  const bankEnabled = bankEnabledMap[vendorId] ?? false
  const addEmployee = useVendorEmployeesStore((s) => s.addEmployee)
  const updateEmployee = useVendorEmployeesStore((s) => s.updateEmployee)
  const deactivateEmployee = useVendorEmployeesStore((s) => s.deactivateEmployee)
  const reactivateEmployee = useVendorEmployeesStore((s) => s.reactivateEmployee)
  const removeEmployee = useVendorEmployeesStore((s) => s.removeEmployee)
  const setBankEnabled = useVendorEmployeesStore((s) => s.setBankEnabled)

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VendorEmployeeInput>(blankEmployee())
  const [deactivateTarget, setDeactivateTarget] = useState<VendorEmployee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VendorEmployee | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) => {
      const haystack = `${e.firstName} ${e.lastName} ${e.title} ${e.department} ${e.email} ${e.employeeCode}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [employees, query])

  const selected = useMemo(
    () => (selectedId ? employees.find((e) => e.id === selectedId) ?? null : null),
    [selectedId, employees],
  )

  function openAdd() {
    setEditingId(null)
    setForm(blankEmployee())
    setFormOpen(true)
  }

  function openEdit(emp: VendorEmployee) {
    setEditingId(emp.id)
    setForm(toInput(emp))
    setFormOpen(true)
  }

  function submitForm() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('First and last name are required.')
      return
    }
    if (editingId) {
      updateEmployee(vendorId, editingId, form)
      toast.success('Employee updated.')
    } else {
      addEmployee(vendorId, form)
      toast.success('Employee added.')
    }
    setFormOpen(false)
    setEditingId(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Employees" description={`${employees.length} total · ${employees.filter((e) => e.status === 'active').length} active`}>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Payroll integration toggle — vendor-level flag controlling
              whether the per-employee Bank for Payments section appears
              in forms + detail view. Rodolfo spec: vendors with external
              payroll systems opt out; vendors running payroll in-app opt
              in. Default OFF for fresh signups. */}
          <div className="flex items-center gap-2" data-vendor-employees-bank-toggle>
            <Switch
              id="bank-toggle"
              checked={bankEnabled}
              onCheckedChange={(v) => {
                setBankEnabled(vendorId, !!v)
                toast.success(v ? 'Payroll integration enabled' : 'Payroll integration disabled')
              }}
              data-vendor-employees-bank-toggle-switch
            />
            <Label htmlFor="bank-toggle" className="text-xs font-medium cursor-pointer">
              Payroll integration
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({bankEnabled ? 'on' : 'off'})
              </span>
            </Label>
          </div>
          <Button onClick={openAdd} className="gap-1.5" data-employee-add>
            <Plus className="h-4 w-4" />
            Add Employee
          </Button>
        </div>
      </PageHeader>

      {/* Optional disclosure when toggle is OFF so vendors understand
          what they're missing + how to turn on. */}
      {!bankEnabled && employees.length > 0 && (
        <Card className="rounded-xl border-dashed bg-muted/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Payroll integration is off — bank details hidden on all employees. Flip the toggle above if you want to manage pay here instead of an outside system.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, title, department, email, or ID..."
          className="pl-9 h-10"
          data-employee-search
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {query.trim() ? 'No employees match your search.' : 'No employees on file yet. Add your crew to start tracking.'}
            </p>
            {!query.trim() && (
              <Button onClick={openAdd} className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" />
                Add your first crew member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((emp, i) => (
            <motion.div
              key={emp.id}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              data-employee-row
              data-employee-id={emp.id}
            >
              <Card
                className="rounded-xl hover:shadow-md transition cursor-pointer"
                onClick={() => setSelectedId(emp.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(emp.id)
                  }
                }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <AvatarInitials
                    initials={deriveInitials(`${emp.firstName} ${emp.lastName}`)}
                    color={emp.avatarColor}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-mono">{emp.employeeCode}</span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          STATUS_STYLES[emp.status],
                        )}
                      >
                        {EMPLOYEE_STATUS_LABELS[emp.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {emp.title} · {emp.department}
                    </p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {emp.email || '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {emp.phone || '—'}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEdit(emp)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <AvatarInitials
                    initials={deriveInitials(`${selected.firstName} ${selected.lastName}`)}
                    color={selected.avatarColor}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <DialogTitle className="font-heading text-lg">
                      {selected.firstName} {selected.lastName}
                    </DialogTitle>
                    <DialogDescription className="mt-0.5">
                      {selected.title} · {selected.department}
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-muted-foreground font-mono">{selected.employeeCode}</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      STATUS_STYLES[selected.status],
                    )}
                  >
                    {EMPLOYEE_STATUS_LABELS[selected.status]}
                  </span>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <section className="rounded-lg border p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{selected.email || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{selected.phone || '—'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span>{selected.address || '—'}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employment</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Start</span>
                      <span className="font-medium">{selected.startDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Manager</span>
                      <span className="font-medium">{selected.managerName || '—'}</span>
                    </div>
                  </div>
                </section>

                {(selected.emergencyContactName || selected.emergencyContactPhone) && (
                  <section className="rounded-lg border p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Emergency Contact
                    </h4>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">
                        {selected.emergencyContactName || '—'}
                        {selected.emergencyContactRelationship && (
                          <span className="text-muted-foreground font-normal"> · {selected.emergencyContactRelationship}</span>
                        )}
                      </p>
                      {selected.emergencyContactPhone && (
                        <p className="text-muted-foreground flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          {selected.emergencyContactPhone}
                        </p>
                      )}
                    </div>
                  </section>
                )}

                {/* Bank for Payments — gated by vendor-level toggle. When
                    OFF, section is hidden entirely. When ON, renders same
                    as #199 admin employee bank section. */}
                {bankEnabled && (
                  <section className="rounded-lg border p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5" />
                      Bank for Payments
                    </h4>
                    {selected.bankAccountLast4 ? (
                      <div className="space-y-1 text-sm">
                        <p className="font-medium">
                          {selected.bankName ?? 'Bank'}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            •••• {selected.bankAccountLast4}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selected.bankAccountHolder || '—'}
                          {selected.bankAccountType && ` · ${selected.bankAccountType === 'checking' ? 'Checking' : 'Savings'}`}
                          {selected.bankRoutingLast4 && ` · Routing ••••${selected.bankRoutingLast4}`}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No bank account on file for this employee.</p>
                    )}
                  </section>
                )}

                {selected.notes && (
                  <section className="rounded-lg border p-4 space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                    <p className="text-sm whitespace-pre-wrap">{selected.notes}</p>
                  </section>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" onClick={() => openEdit(selected)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {selected.status === 'inactive' ? (
                    <Button
                      variant="outline"
                      className="gap-1.5 border-emerald-400/60 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => {
                        reactivateEmployee(vendorId, selected.id)
                        toast.success(`${selected.firstName} reactivated.`)
                      }}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Reactivate
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="gap-1.5 border-amber-400/60 text-amber-700 hover:bg-amber-50"
                      onClick={() => setDeactivateTarget(selected)}
                    >
                      <UserX className="h-3.5 w-3.5" />
                      Deactivate
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="ml-auto gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add / Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingId ? 'Edit Employee' : 'Add Employee'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update identity, contact, emergency, and bank details.'
                : 'Enter name + title to add. Emergency contact + bank can be filled later.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">First name</Label>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="h-10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Last name</Label>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="h-10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Title</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-10 text-sm" placeholder="e.g. Lead Roofer" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Department</Label>
                  <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="h-10 text-sm" placeholder="e.g. Installation" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Employee code</Label>
                  <Input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} className="h-10 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Start date</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="h-10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: (v ?? 'active') as EmploymentStatus })}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Manager</Label>
                  <Input value={form.managerName ?? ''} onChange={(e) => setForm({ ...form, managerName: e.target.value })} className="h-10 text-sm" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 text-sm" placeholder="(305) 555-0100" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Address</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="h-10 text-sm" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Emergency Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Name</Label>
                  <Input value={form.emergencyContactName ?? ''} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className="h-10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Relationship</Label>
                  <Input value={form.emergencyContactRelationship ?? ''} onChange={(e) => setForm({ ...form, emergencyContactRelationship: e.target.value })} className="h-10 text-sm" placeholder="e.g. Spouse" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input value={form.emergencyContactPhone ?? ''} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className="h-10 text-sm" />
                </div>
              </div>
            </section>

            {/* Bank section gated by toggle — hidden entirely when
                Payroll integration is off. Data persists on record
                regardless; toggling back ON restores visibility. */}
            {bankEnabled && (
              <section className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5" />
                  Bank for Payments
                </h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Payroll routes to this account. Full numbers are never stored — only the last 4 digits + bank name are kept.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold">Account holder</Label>
                    <Input value={form.bankAccountHolder ?? ''} onChange={(e) => setForm({ ...form, bankAccountHolder: e.target.value })} className="h-10 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Bank name</Label>
                    <Input value={form.bankName ?? ''} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="h-10 text-sm" placeholder="e.g. Chase" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Account type</Label>
                    <Select value={form.bankAccountType ?? 'checking'} onValueChange={(v) => setForm({ ...form, bankAccountType: (v ?? 'checking') as EmployeeAccountType })}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Routing (last 4)</Label>
                    <Input value={form.bankRoutingLast4 ?? ''} onChange={(e) => setForm({ ...form, bankRoutingLast4: e.target.value.replace(/\D/g, '').slice(-4) })} inputMode="numeric" className="h-10 text-sm font-mono" placeholder="1234" maxLength={4} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Account (last 4)</Label>
                    <Input value={form.bankAccountLast4 ?? ''} onChange={(e) => setForm({ ...form, bankAccountLast4: e.target.value.replace(/\D/g, '').slice(-4) })} inputMode="numeric" className="h-10 text-sm font-mono" placeholder="5678" maxLength={4} />
                  </div>
                </div>
              </section>
            )}

            <section className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
                placeholder="Internal notes..."
              />
            </section>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={submitForm} className="w-full sm:w-auto">
              {editingId ? 'Save changes' : 'Add employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Deactivate employee?</DialogTitle>
            <DialogDescription>
              {deactivateTarget && (
                <>
                  {deactivateTarget.firstName} {deactivateTarget.lastName} will move to <span className="font-semibold">Inactive</span> —
                  hidden from scheduling + payroll visibility, but the record stays on file for audit. Reactivate any time from their detail view.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeactivateTarget(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deactivateTarget) {
                  deactivateEmployee(vendorId, deactivateTarget.id)
                  toast.success(`${deactivateTarget.firstName} deactivated.`)
                }
                setDeactivateTarget(null)
              }}
              className="w-full sm:w-auto"
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">Delete employee permanently?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  This removes {deleteTarget.firstName} {deleteTarget.lastName} from your crew roster entirely.
                  Audit history for this record will be lost. For normal offboarding, use Deactivate instead — it keeps the record for future reference.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="w-full sm:w-auto">Keep record</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  removeEmployee(vendorId, deleteTarget.id)
                  setSelectedId(null)
                  toast.success(`${deleteTarget.firstName} ${deleteTarget.lastName} deleted.`)
                }
                setDeleteTarget(null)
              }}
              className="w-full sm:w-auto"
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
