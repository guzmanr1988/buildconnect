import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * Vendor employees store — per-vendor crew roster per ship #204
 * (Rodolfo-direct 2026-04-21 pivot #18, correctly-scoped third pass).
 * Each vendor manages their own crew (roofers, installers, etc.)
 * scoped by vendor-id. Distinct from platform-staff useEmployeesStore
 * (#199) — vendor crew ≠ BuildConnect HR.
 *
 * Vendor-togglable bank integration: `bankEnabledByVendor` gates
 * whether the per-employee Bank for Payments section appears in UI.
 * Rodolfo spec: "some vendors have outside systems already configured
 * if they choose not to use the function here in the app". Default OFF
 * (opt-in); toggle flips per-vendor. Employee records still carry the
 * bank fields under the hood so toggling back ON reveals prior data.
 *
 * Banked PAN-never discipline on bank fields (last4 / routing-last4 /
 * bank-name / holder only). Inputs strip non-digits + cap at last-4 at
 * the UI layer; schema has no field for full numbers.
 */

export type EmploymentStatus = 'active' | 'on_leave' | 'inactive'
export type EmployeeAccountType = 'checking' | 'savings'

export interface VendorEmployee {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  title: string
  department: string
  status: EmploymentStatus
  startDate: string
  email: string
  phone: string
  address: string
  emergencyContactName?: string
  emergencyContactRelationship?: string
  emergencyContactPhone?: string
  managerName?: string
  avatarColor: string
  // Bank fields persist on the record regardless of toggle state — the
  // toggle gates VISIBILITY, not data. A vendor who turns bank OFF then
  // back ON sees their prior data intact.
  bankAccountHolder?: string
  bankName?: string
  bankAccountLast4?: string
  bankRoutingLast4?: string
  bankAccountType?: EmployeeAccountType
  notes?: string
  createdAt: string
  updatedAt: string
}

export type VendorEmployeeInput = Omit<VendorEmployee, 'id' | 'createdAt' | 'updatedAt'>

// Seed — per-demo-vendor crew. v-1/v-2/v-3 match the DEMO_VENDOR_UUID
// mock-id keys used by useVendorScope so apex-demo/shield-demo/
// paradise-demo logins see populated data on first load.
const SEED_EMPLOYEES: Record<string, VendorEmployee[]> = {
  'v-1': [
    {
      id: 'apex-emp-1',
      employeeCode: 'AX-001',
      firstName: 'Miguel',
      lastName: 'Reyes',
      title: 'Lead Roofer',
      department: 'Installation',
      status: 'active',
      startDate: '2024-03-15',
      email: 'miguel@apexroof.com',
      phone: '(305) 555-2001',
      address: '850 NW 37th Ave, Miami, FL 33125',
      emergencyContactName: 'Ana Reyes',
      emergencyContactRelationship: 'Spouse',
      emergencyContactPhone: '(305) 555-2002',
      managerName: 'Carlos Mendez',
      avatarColor: '#f59e0b',
      bankAccountHolder: 'Miguel Reyes',
      bankName: 'Wells Fargo',
      bankAccountLast4: '7788',
      bankRoutingLast4: '9901',
      bankAccountType: 'checking',
      createdAt: '2024-03-15T09:00:00Z',
      updatedAt: '2024-03-15T09:00:00Z',
    },
    {
      id: 'apex-emp-2',
      employeeCode: 'AX-002',
      firstName: 'David',
      lastName: 'Chen',
      title: 'Solar Installer',
      department: 'Installation',
      status: 'active',
      startDate: '2024-08-02',
      email: 'david@apexroof.com',
      phone: '(305) 555-2003',
      address: '1200 Coral Way, Miami, FL 33145',
      managerName: 'Carlos Mendez',
      avatarColor: '#3b82f6',
      createdAt: '2024-08-02T09:00:00Z',
      updatedAt: '2024-08-02T09:00:00Z',
    },
  ],
  'v-2': [
    {
      id: 'shield-emp-1',
      employeeCode: 'SH-001',
      firstName: 'Luis',
      lastName: 'Ramirez',
      title: 'Senior Installer',
      department: 'Field Operations',
      status: 'active',
      startDate: '2023-11-10',
      email: 'luis@shieldwindows.com',
      phone: '(786) 555-3001',
      address: '450 SW 8th St, Miami, FL 33130',
      emergencyContactName: 'Carmen Ramirez',
      emergencyContactRelationship: 'Mother',
      emergencyContactPhone: '(786) 555-3002',
      managerName: 'Tony Rivera',
      avatarColor: '#10b981',
      bankAccountHolder: 'Luis Ramirez',
      bankName: 'Chase',
      bankAccountLast4: '2233',
      bankRoutingLast4: '4455',
      bankAccountType: 'checking',
      createdAt: '2023-11-10T09:00:00Z',
      updatedAt: '2023-11-10T09:00:00Z',
    },
  ],
  'v-3': [
    {
      id: 'paradise-emp-1',
      employeeCode: 'PP-001',
      firstName: 'Sofia',
      lastName: 'Gutierrez',
      title: 'Pool Construction Supervisor',
      department: 'Construction',
      status: 'active',
      startDate: '2024-01-20',
      email: 'sofia@paradisepools.com',
      phone: '(305) 555-4001',
      address: '600 Brickell Ave, Miami, FL 33131',
      emergencyContactName: 'Pedro Gutierrez',
      emergencyContactRelationship: 'Spouse',
      emergencyContactPhone: '(305) 555-4002',
      managerName: 'Ana Martinez',
      avatarColor: '#06b6d4',
      bankAccountHolder: 'Sofia Gutierrez',
      bankName: 'Bank of America',
      bankAccountLast4: '8899',
      bankRoutingLast4: '1122',
      bankAccountType: 'checking',
      createdAt: '2024-01-20T09:00:00Z',
      updatedAt: '2024-01-20T09:00:00Z',
    },
  ],
}

// Seed bankEnabled=true for demo vendors so the seeded crew's bank data
// is visible immediately. Fresh-signup vendors default to false (no
// entry → treated as OFF per getBankEnabled fallback).
const SEED_BANK_ENABLED: Record<string, boolean> = {
  'v-1': true,
  'v-2': true,
  'v-3': true,
}

interface VendorEmployeesState {
  employeesByVendor: Record<string, VendorEmployee[]>
  bankEnabledByVendor: Record<string, boolean>
  addEmployee: (vendorId: string, input: VendorEmployeeInput) => void
  updateEmployee: (vendorId: string, id: string, patch: Partial<VendorEmployeeInput>) => void
  deactivateEmployee: (vendorId: string, id: string) => void
  reactivateEmployee: (vendorId: string, id: string) => void
  removeEmployee: (vendorId: string, id: string) => void
  setBankEnabled: (vendorId: string, enabled: boolean) => void
}

export const useVendorEmployeesStore = create<VendorEmployeesState>()(
  persist(
    (set) => ({
      employeesByVendor: SEED_EMPLOYEES,
      bankEnabledByVendor: SEED_BANK_ENABLED,

      addEmployee: (vendorId, input) =>
        set((state) => {
          const now = new Date().toISOString()
          const next: VendorEmployee = {
            ...input,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          }
          const prior = state.employeesByVendor[vendorId] ?? []
          return {
            employeesByVendor: {
              ...state.employeesByVendor,
              [vendorId]: [...prior, next],
            },
          }
        }),

      updateEmployee: (vendorId, id, patch) =>
        set((state) => {
          const prior = state.employeesByVendor[vendorId] ?? []
          return {
            employeesByVendor: {
              ...state.employeesByVendor,
              [vendorId]: prior.map((e) =>
                e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
              ),
            },
          }
        }),

      deactivateEmployee: (vendorId, id) =>
        set((state) => {
          const prior = state.employeesByVendor[vendorId] ?? []
          return {
            employeesByVendor: {
              ...state.employeesByVendor,
              [vendorId]: prior.map((e) =>
                e.id === id ? { ...e, status: 'inactive', updatedAt: new Date().toISOString() } : e,
              ),
            },
          }
        }),

      reactivateEmployee: (vendorId, id) =>
        set((state) => {
          const prior = state.employeesByVendor[vendorId] ?? []
          return {
            employeesByVendor: {
              ...state.employeesByVendor,
              [vendorId]: prior.map((e) =>
                e.id === id ? { ...e, status: 'active', updatedAt: new Date().toISOString() } : e,
              ),
            },
          }
        }),

      removeEmployee: (vendorId, id) =>
        set((state) => {
          const prior = state.employeesByVendor[vendorId] ?? []
          return {
            employeesByVendor: {
              ...state.employeesByVendor,
              [vendorId]: prior.filter((e) => e.id !== id),
            },
          }
        }),

      setBankEnabled: (vendorId, enabled) =>
        set((state) => ({
          bankEnabledByVendor: {
            ...state.bankEnabledByVendor,
            [vendorId]: enabled,
          },
        })),
    }),
    { name: 'buildconnect-vendor-employees' },
  ),
)

export const EMPLOYEE_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: 'Active',
  on_leave: 'On Leave',
  inactive: 'Inactive',
}
