import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

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

// Demo vendors stay in-memory — no Supabase row for mock IDs.
const DEMO_VENDOR_IDS = new Set(['v-1', 'v-2', 'v-3'])

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
    {
      id: 'apex-emp-3',
      employeeCode: 'AX-003',
      firstName: 'Ricardo',
      lastName: 'Torres',
      title: 'Roofing Apprentice',
      department: 'Installation',
      status: 'active',
      startDate: '2025-02-17',
      email: 'ricardo@apexroof.com',
      phone: '(305) 555-2004',
      address: '2340 NW 7th St, Miami, FL 33125',
      emergencyContactName: 'Elena Torres',
      emergencyContactRelationship: 'Mother',
      emergencyContactPhone: '(305) 555-2005',
      managerName: 'Miguel Reyes',
      avatarColor: '#8b5cf6',
      createdAt: '2025-02-17T09:00:00Z',
      updatedAt: '2025-02-17T09:00:00Z',
    },
    {
      id: 'apex-emp-4',
      employeeCode: 'AX-004',
      firstName: 'Mike',
      lastName: 'Johnson',
      title: 'Senior Roofing Foreman',
      department: 'Installation',
      status: 'active',
      startDate: '2023-06-12',
      email: 'mike@apexroof.com',
      phone: '(305) 555-2006',
      address: '780 SW 22nd Ave, Miami, FL 33135',
      emergencyContactName: 'Laura Johnson',
      emergencyContactRelationship: 'Spouse',
      emergencyContactPhone: '(305) 555-2007',
      managerName: 'Carlos Mendez',
      avatarColor: '#0ea5e9',
      createdAt: '2023-06-12T09:00:00Z',
      updatedAt: '2023-06-12T09:00:00Z',
    },
    {
      id: 'apex-emp-5',
      employeeCode: 'AX-005',
      firstName: 'Sarah',
      lastName: 'Martinez',
      title: 'Solar Project Manager',
      department: 'Installation',
      status: 'active',
      startDate: '2024-02-05',
      email: 'sarah@apexroof.com',
      phone: '(305) 555-2008',
      address: '1440 NE 8th St, Miami, FL 33132',
      managerName: 'Carlos Mendez',
      avatarColor: '#ec4899',
      createdAt: '2024-02-05T09:00:00Z',
      updatedAt: '2024-02-05T09:00:00Z',
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
    {
      id: 'shield-emp-2',
      employeeCode: 'SH-002',
      firstName: 'Rafael',
      lastName: 'Cortez',
      title: 'Impact Window Installer',
      department: 'Field Operations',
      status: 'active',
      startDate: '2024-05-22',
      email: 'rafael@shieldwindows.com',
      phone: '(786) 555-3003',
      address: '1820 W Flagler St, Miami, FL 33135',
      emergencyContactName: 'Lucia Cortez',
      emergencyContactRelationship: 'Spouse',
      emergencyContactPhone: '(786) 555-3004',
      managerName: 'Tony Rivera',
      avatarColor: '#ec4899',
      bankAccountHolder: 'Rafael Cortez',
      bankName: 'Truist',
      bankAccountLast4: '6677',
      bankRoutingLast4: '8899',
      bankAccountType: 'checking',
      createdAt: '2024-05-22T09:00:00Z',
      updatedAt: '2024-05-22T09:00:00Z',
    },
    {
      id: 'shield-emp-3',
      employeeCode: 'SH-003',
      firstName: 'Marco',
      lastName: 'Alvarez',
      title: 'Field Estimator',
      department: 'Estimating',
      status: 'on_leave',
      startDate: '2025-01-08',
      email: 'marco@shieldwindows.com',
      phone: '(786) 555-3005',
      address: '7210 SW 24th St, Miami, FL 33155',
      managerName: 'Tony Rivera',
      avatarColor: '#f97316',
      createdAt: '2025-01-08T09:00:00Z',
      updatedAt: '2025-01-08T09:00:00Z',
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
    {
      id: 'paradise-emp-2',
      employeeCode: 'PP-002',
      firstName: 'Diego',
      lastName: 'Morales',
      title: 'Pool Technician',
      department: 'Maintenance',
      status: 'active',
      startDate: '2024-06-11',
      email: 'diego@paradisepools.com',
      phone: '(305) 555-4003',
      address: '2150 NE 123rd St, North Miami, FL 33181',
      emergencyContactName: 'Rosa Morales',
      emergencyContactRelationship: 'Sister',
      emergencyContactPhone: '(305) 555-4004',
      managerName: 'Sofia Gutierrez',
      avatarColor: '#84cc16',
      bankAccountHolder: 'Diego Morales',
      bankName: 'Wells Fargo',
      bankAccountLast4: '3344',
      bankRoutingLast4: '5566',
      bankAccountType: 'savings',
      createdAt: '2024-06-11T09:00:00Z',
      updatedAt: '2024-06-11T09:00:00Z',
    },
    {
      id: 'paradise-emp-3',
      employeeCode: 'PP-003',
      firstName: 'Valeria',
      lastName: 'Santos',
      title: 'Tile Specialist',
      department: 'Finishing',
      status: 'active',
      startDate: '2024-09-30',
      email: 'valeria@paradisepools.com',
      phone: '(305) 555-4005',
      address: '3480 Main Highway, Coconut Grove, FL 33133',
      managerName: 'Sofia Gutierrez',
      avatarColor: '#6366f1',
      createdAt: '2024-09-30T09:00:00Z',
      updatedAt: '2024-09-30T09:00:00Z',
    },
  ],
}

const SEED_BANK_ENABLED: Record<string, boolean> = {
  'v-1': true,
  'v-2': true,
  'v-3': true,
}

function rowToEmployee(row: Record<string, unknown>): VendorEmployee {
  return {
    id: row.id as string,
    employeeCode: row.employee_code as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    title: row.title as string,
    department: row.department as string,
    status: row.status as EmploymentStatus,
    startDate: row.start_date as string,
    email: row.email as string,
    phone: row.phone as string,
    address: row.address as string,
    emergencyContactName: row.emergency_contact_name as string | undefined,
    emergencyContactRelationship: row.emergency_contact_relationship as string | undefined,
    emergencyContactPhone: row.emergency_contact_phone as string | undefined,
    managerName: row.manager_name as string | undefined,
    avatarColor: row.avatar_color as string,
    bankAccountHolder: row.bank_account_holder as string | undefined,
    bankName: row.bank_name as string | undefined,
    bankAccountLast4: row.bank_account_last4 as string | undefined,
    bankRoutingLast4: row.bank_routing_last4 as string | undefined,
    bankAccountType: row.bank_account_type as EmployeeAccountType | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function employeeToRow(vendorId: string, input: VendorEmployeeInput) {
  return {
    vendor_id: vendorId,
    employee_code: input.employeeCode,
    first_name: input.firstName,
    last_name: input.lastName,
    title: input.title,
    department: input.department,
    status: input.status,
    start_date: input.startDate || null,
    email: input.email,
    phone: input.phone,
    address: input.address,
    emergency_contact_name: input.emergencyContactName ?? null,
    emergency_contact_relationship: input.emergencyContactRelationship ?? null,
    emergency_contact_phone: input.emergencyContactPhone ?? null,
    manager_name: input.managerName ?? null,
    avatar_color: input.avatarColor,
    bank_account_holder: input.bankAccountHolder ?? null,
    bank_name: input.bankName ?? null,
    bank_account_last4: input.bankAccountLast4 ?? null,
    bank_routing_last4: input.bankRoutingLast4 ?? null,
    bank_account_type: input.bankAccountType ?? null,
    notes: input.notes ?? null,
  }
}

interface VendorEmployeesState {
  employeesByVendor: Record<string, VendorEmployee[]>
  bankEnabledByVendor: Record<string, boolean>
  hydratedVendors: Set<string>
  hydrateVendor: (vendorId: string) => Promise<void>
  hydrateAdmin: (vendorId: string) => Promise<void>
  addEmployee: (vendorId: string, input: VendorEmployeeInput) => Promise<void>
  updateEmployee: (vendorId: string, id: string, patch: Partial<VendorEmployeeInput>) => Promise<void>
  deactivateEmployee: (vendorId: string, id: string) => Promise<void>
  reactivateEmployee: (vendorId: string, id: string) => Promise<void>
  removeEmployee: (vendorId: string, id: string) => Promise<void>
  setBankEnabled: (vendorId: string, enabled: boolean) => void
}

export const useVendorEmployeesStore = create<VendorEmployeesState>()((set, get) => ({
  employeesByVendor: SEED_EMPLOYEES,
  bankEnabledByVendor: SEED_BANK_ENABLED,
  hydratedVendors: new Set(),

  hydrateVendor: async (vendorId) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) return
    if (get().hydratedVendors.has(vendorId)) return
    const { data } = await supabase
      .from('vendor_employees')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: true })
    if (data) {
      set((state) => ({
        employeesByVendor: { ...state.employeesByVendor, [vendorId]: data.map(rowToEmployee) },
        hydratedVendors: new Set([...state.hydratedVendors, vendorId]),
      }))
    }
  },

  hydrateAdmin: async (vendorId) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) return
    if (get().hydratedVendors.has(vendorId)) return
    const { data } = await supabase
      .from('vendor_employees')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: true })
    if (data) {
      set((state) => ({
        employeesByVendor: { ...state.employeesByVendor, [vendorId]: data.map(rowToEmployee) },
        hydratedVendors: new Set([...state.hydratedVendors, vendorId]),
      }))
    }
  },

  addEmployee: async (vendorId, input) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) {
      const now = new Date().toISOString()
      const next: VendorEmployee = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      set((state) => ({
        employeesByVendor: {
          ...state.employeesByVendor,
          [vendorId]: [...(state.employeesByVendor[vendorId] ?? []), next],
        },
      }))
      return
    }
    const { data, error } = await supabase
      .from('vendor_employees')
      .insert(employeeToRow(vendorId, input))
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      employeesByVendor: {
        ...state.employeesByVendor,
        [vendorId]: [...(state.employeesByVendor[vendorId] ?? []), rowToEmployee(data)],
      },
    }))
  },

  updateEmployee: async (vendorId, id, patch) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) {
      set((state) => ({
        employeesByVendor: {
          ...state.employeesByVendor,
          [vendorId]: (state.employeesByVendor[vendorId] ?? []).map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
          ),
        },
      }))
      return
    }
    const current = (get().employeesByVendor[vendorId] ?? []).find((e) => e.id === id)
    if (!current) return
    const merged: VendorEmployeeInput = { ...current, ...patch }
    const { data, error } = await supabase
      .from('vendor_employees')
      .update({ ...employeeToRow(vendorId, merged), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      employeesByVendor: {
        ...state.employeesByVendor,
        [vendorId]: (state.employeesByVendor[vendorId] ?? []).map((e) => e.id === id ? rowToEmployee(data) : e),
      },
    }))
  },

  deactivateEmployee: async (vendorId, id) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) {
      set((state) => ({
        employeesByVendor: {
          ...state.employeesByVendor,
          [vendorId]: (state.employeesByVendor[vendorId] ?? []).map((e) =>
            e.id === id ? { ...e, status: 'inactive', updatedAt: new Date().toISOString() } : e,
          ),
        },
      }))
      return
    }
    const { data, error } = await supabase
      .from('vendor_employees')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      employeesByVendor: {
        ...state.employeesByVendor,
        [vendorId]: (state.employeesByVendor[vendorId] ?? []).map((e) => e.id === id ? rowToEmployee(data) : e),
      },
    }))
  },

  reactivateEmployee: async (vendorId, id) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) {
      set((state) => ({
        employeesByVendor: {
          ...state.employeesByVendor,
          [vendorId]: (state.employeesByVendor[vendorId] ?? []).map((e) =>
            e.id === id ? { ...e, status: 'active', updatedAt: new Date().toISOString() } : e,
          ),
        },
      }))
      return
    }
    const { data, error } = await supabase
      .from('vendor_employees')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    set((state) => ({
      employeesByVendor: {
        ...state.employeesByVendor,
        [vendorId]: (state.employeesByVendor[vendorId] ?? []).map((e) => e.id === id ? rowToEmployee(data) : e),
      },
    }))
  },

  removeEmployee: async (vendorId, id) => {
    if (DEMO_VENDOR_IDS.has(vendorId)) {
      set((state) => ({
        employeesByVendor: {
          ...state.employeesByVendor,
          [vendorId]: (state.employeesByVendor[vendorId] ?? []).filter((e) => e.id !== id),
        },
      }))
      return
    }
    const { error } = await supabase.from('vendor_employees').delete().eq('id', id)
    if (error) throw error
    set((state) => ({
      employeesByVendor: {
        ...state.employeesByVendor,
        [vendorId]: (state.employeesByVendor[vendorId] ?? []).filter((e) => e.id !== id),
      },
    }))
  },

  setBankEnabled: (vendorId, enabled) =>
    set((state) => ({
      bankEnabledByVendor: { ...state.bankEnabledByVendor, [vendorId]: enabled },
    })),
}))

export const EMPLOYEE_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: 'Active',
  on_leave: 'On Leave',
  inactive: 'Inactive',
}
