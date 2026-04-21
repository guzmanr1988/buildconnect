import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * Employees store — admin HR surface per ship #199 (Rodolfo-direct
 * 2026-04-21 pivot #17). Persists employee identity, contact,
 * emergency contact, and bank-for-payments details. Mock-side for v1
 * until Tranche-2 wires a real HRIS; banked PAN-never principle
 * applied to bank fields (only last4 + routing-last4 + holder + bank
 * name retained, never full account / routing numbers).
 */

export type EmploymentStatus = 'active' | 'on_leave' | 'inactive'

export type EmployeeAccountType = 'checking' | 'savings'

export interface Employee {
  id: string
  // Human-visible employee code (e.g. "E-1042") used on the list table;
  // distinct from the internal id (uuid) used for keyed operations.
  employeeCode: string
  firstName: string
  lastName: string
  title: string
  department: string
  status: EmploymentStatus
  startDate: string // ISO yyyy-mm-dd
  email: string
  phone: string
  address: string
  emergencyContactName?: string
  emergencyContactRelationship?: string
  emergencyContactPhone?: string
  managerName?: string
  avatarColor: string
  // Bank for payments — PAN-never storage. Only the non-sensitive tail
  // of each field is kept; real integration swaps these for a
  // payroll-processor token (ADP / Gusto / similar).
  bankAccountHolder?: string
  bankName?: string
  bankAccountLast4?: string
  bankRoutingLast4?: string
  bankAccountType?: EmployeeAccountType
  // Free-text notes for the admin; shows in the detail view only.
  notes?: string
  createdAt: string
  updatedAt: string
}

export type EmployeeInput = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>

// Seed — 3 realistic entries so the surface has content on first load.
// mock-as-test-harness directive: flows close the loop on mock side as
// if real.
const SEED: Employee[] = [
  {
    id: 'emp-seed-1',
    employeeCode: 'E-1001',
    firstName: 'Jonathan',
    lastName: 'Bode',
    title: 'Chief Executive Officer',
    department: 'Executive',
    status: 'active',
    startDate: '2025-01-15',
    email: 'jon@buildc.net',
    phone: '(305) 555-0100',
    address: '100 Biscayne Blvd, Miami, FL 33132',
    emergencyContactName: 'Sarah Bode',
    emergencyContactRelationship: 'Spouse',
    emergencyContactPhone: '(305) 555-0101',
    managerName: '—',
    avatarColor: '#4f46e5',
    bankAccountHolder: 'Jonathan Bode',
    bankName: 'Chase',
    bankAccountLast4: '4242',
    bankRoutingLast4: '5678',
    bankAccountType: 'checking',
    createdAt: '2025-01-15T09:00:00Z',
    updatedAt: '2025-01-15T09:00:00Z',
  },
  {
    id: 'emp-seed-2',
    employeeCode: 'E-1042',
    firstName: 'Rodolfo',
    lastName: 'Guzman',
    title: 'Founder & Product',
    department: 'Executive',
    status: 'active',
    startDate: '2025-02-01',
    email: 'rodolfo@buildc.net',
    phone: '(305) 555-0102',
    address: '200 Coral Way, Miami, FL 33145',
    emergencyContactName: 'Lucia Guzman',
    emergencyContactRelationship: 'Spouse',
    emergencyContactPhone: '(305) 555-0103',
    managerName: '—',
    avatarColor: '#10b981',
    bankAccountHolder: 'Rodolfo Guzman',
    bankName: 'Bank of America',
    bankAccountLast4: '9876',
    bankRoutingLast4: '1234',
    bankAccountType: 'checking',
    createdAt: '2025-02-01T09:00:00Z',
    updatedAt: '2025-02-01T09:00:00Z',
  },
  {
    id: 'emp-seed-3',
    employeeCode: 'E-1103',
    firstName: 'Maria',
    lastName: 'Torres',
    title: 'Operations Manager',
    department: 'Operations',
    status: 'active',
    startDate: '2025-06-10',
    email: 'maria@buildc.net',
    phone: '(786) 555-0104',
    address: '300 Brickell Ave, Miami, FL 33131',
    emergencyContactName: 'Carlos Torres',
    emergencyContactRelationship: 'Father',
    emergencyContactPhone: '(786) 555-0105',
    managerName: 'Rodolfo Guzman',
    avatarColor: '#f59e0b',
    bankAccountHolder: 'Maria Torres',
    bankName: 'Wells Fargo',
    bankAccountLast4: '3344',
    bankRoutingLast4: '5566',
    bankAccountType: 'checking',
    createdAt: '2025-06-10T09:00:00Z',
    updatedAt: '2025-06-10T09:00:00Z',
  },
]

interface EmployeesState {
  employees: Employee[]
  addEmployee: (input: EmployeeInput) => void
  updateEmployee: (id: string, patch: Partial<EmployeeInput>) => void
  // Deactivate flips status to 'inactive' without removing. Hard-remove
  // via removeEmployee for when the admin really wants the record gone
  // (e.g. accidental duplicate). Deactivate is the default flow via the
  // detail dialog to preserve audit history.
  deactivateEmployee: (id: string) => void
  reactivateEmployee: (id: string) => void
  removeEmployee: (id: string) => void
}

export const useEmployeesStore = create<EmployeesState>()(
  persist(
    (set) => ({
      employees: SEED,

      addEmployee: (input) =>
        set((state) => {
          const now = new Date().toISOString()
          const next: Employee = {
            ...input,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          }
          return { employees: [...state.employees, next] }
        }),

      updateEmployee: (id, patch) =>
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
          ),
        })),

      deactivateEmployee: (id) =>
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === id ? { ...e, status: 'inactive', updatedAt: new Date().toISOString() } : e,
          ),
        })),

      reactivateEmployee: (id) =>
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === id ? { ...e, status: 'active', updatedAt: new Date().toISOString() } : e,
          ),
        })),

      removeEmployee: (id) =>
        set((state) => ({
          employees: state.employees.filter((e) => e.id !== id),
        })),
    }),
    { name: 'buildconnect-employees' },
  ),
)

// Display labels for the status enum.
export const EMPLOYEE_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: 'Active',
  on_leave: 'On Leave',
  inactive: 'Inactive',
}
