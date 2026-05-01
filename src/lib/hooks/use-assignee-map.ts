import { useMemo } from 'react'
import { useProjectsStore } from '@/stores/projects-store'
import { useAuthStore } from '@/stores/auth-store'
import { useVendorEmployeesStore } from '@/stores/vendor-employees-store'

export interface ResolvedAssignee {
  id: string
  name: string
  /** true when the assignee is the vendor themselves (self-assigned via the
   *  "you" option in the lead-assignment dropdown). */
  isSelf: boolean
}

/**
 * Builds a leadId → assignee lookup map from the three canonical sources:
 * 1. assignedRepByLead (VendorRep object written by assignRepByLead action)
 * 2. employeesMap roster fallback
 * 3. profile.name fallback for vendor self-assign when #1 is absent
 *
 * isSelf detection uses `vrep.role === 'Owner'` (set on self-assign in the
 * dropdown) OR `repId === profile.id` — both conditions are true for vendor
 * self-assignments; admin context only sees the role signal.
 */
export function useAssigneeMap(vendorId: string): Record<string, ResolvedAssignee> {
  const accountRepIdByLead = useProjectsStore((s) => s.accountRepIdByLead)
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const profile = useAuthStore((s) => s.profile)
  const employeesMap = useVendorEmployeesStore((s) => s.employeesByVendor)

  return useMemo(() => {
    const result: Record<string, ResolvedAssignee> = {}
    const employees = employeesMap[vendorId] ?? []

    for (const [leadId, repId] of Object.entries(accountRepIdByLead)) {
      const vrep = assignedRepByLead[leadId]
      const isSelf = repId === profile?.id || vrep?.role === 'Owner'

      if (vrep) {
        result[leadId] = { id: repId, name: vrep.name, isSelf }
        continue
      }

      const emp = employees.find((e) => e.id === repId)
      if (emp) {
        result[leadId] = { id: repId, name: `${emp.firstName} ${emp.lastName}`, isSelf }
        continue
      }

      if (isSelf && profile?.name) {
        result[leadId] = { id: repId, name: profile.name, isSelf: true }
      }
    }

    return result
  }, [accountRepIdByLead, assignedRepByLead, profile?.id, profile?.name, employeesMap, vendorId])
}
