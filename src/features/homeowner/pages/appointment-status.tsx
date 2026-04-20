import { Link, useParams } from 'react-router-dom'
import { Calendar, MapPin, Phone, Mail, DollarSign, Clock, FileText, Shield, ChevronLeft, UserCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { MOCK_LEADS, MOCK_VENDORS } from '@/lib/mock-data'
import { useProjectsStore } from '@/stores/projects-store'
import { cn } from '@/lib/utils'
import type { LeadStatus } from '@/types'

const statusTimeline: Record<string, { label: string; time: string; status: LeadStatus }[]> = {
  'L-0001': [
    { label: 'Lead submitted', time: 'Apr 7, 2:22 PM', status: 'pending' },
    { label: 'Vendor confirmed visit', time: 'Apr 7, 4:10 PM', status: 'confirmed' },
  ],
  'L-0002': [
    { label: 'Lead submitted', time: 'Apr 8, 9:45 AM', status: 'pending' },
  ],
  'L-0004': [
    { label: 'Lead submitted', time: 'Apr 5, 11:30 AM', status: 'pending' },
    { label: 'Visit confirmed', time: 'Apr 5, 2:00 PM', status: 'confirmed' },
    { label: 'Vendor requested reschedule', time: 'Apr 6, 9:00 AM', status: 'rescheduled' },
  ],
}

const statusPulse: Record<string, string> = {
  pending: 'bg-amber-500 animate-pulse',
  confirmed: 'bg-emerald-500',
  rejected: 'bg-red-500',
  rescheduled: 'bg-blue-500',
  completed: 'bg-slate-500',
}

export function AppointmentStatusPage() {
  const { id } = useParams<{ id: string }>()
  const lead = MOCK_LEADS.find((l) => l.id === id) ?? MOCK_LEADS[0]
  const vendor = MOCK_VENDORS.find((v) => v.id === lead.vendor_id)
  const timeline = statusTimeline[lead.id] ?? [
    { label: 'Lead submitted', time: 'Recently', status: 'pending' as LeadStatus },
  ]
  // Assigned rep (Phase C): vendor picks at Confirm, homeowner sees here.
  const assignedRepByLead = useProjectsStore((s) => s.assignedRepByLead)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const assignedRep =
    assignedRepByLead[lead.id] ??
    sentProjects.find((p) => `L-${p.id.slice(0, 4).toUpperCase()}` === lead.id)?.assignedRep

  function formatSlot(slot: string) {
    const d = new Date(slot)
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="self-start -ml-2 h-9 gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <Link to="/home">
          <ChevronLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Appointment Status
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lead {lead.id} — {lead.project}
        </p>
      </div>

      {/* Status header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('h-3 w-3 rounded-full', statusPulse[lead.status])} />
              <StatusBadge status={lead.status} className="text-sm" />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {formatSlot(lead.slot)}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Status Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-1.5 bottom-1.5 w-0.5 bg-border" />

                <div className="flex flex-col gap-5">
                  {timeline.map((event, i) => (
                    <div key={i} className="relative flex items-start gap-3">
                      <div
                        className={cn(
                          'absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background',
                          statusPulse[event.status]
                        )}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {event.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{event.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Project Details — project-scoped fields (Project / Price / Vendor)
            plus the Project Pack section. Split from Homeowner Info per Rod's
            directive (kratos msg 1776650664847) so each card reads as one
            coherent unit instead of 7 mixed fields. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Project Details
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <DetailRow icon={FileText} label="Project" value={lead.project} />
              <DetailRow
                icon={DollarSign}
                label="Price"
                value={`$${lead.value.toLocaleString()}`}
              />
              {vendor && (
                <DetailRow
                  icon={FileText}
                  label="Vendor"
                  value={vendor.company}
                />
              )}

              {/* Pack items — scoped to the project, belongs here. */}
              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Project Pack
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(lead.pack_items).map(([, items]) =>
                    items.map((item) => (
                      <Badge key={item} variant="secondary" className="text-[10px]">
                        {item.replace(/_/g, ' ')}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Representative — only shown once the vendor has assigned one.
            Sits between Project Details and Homeowner Info — vendor-contact
            info reads as a bridge between project-scoped and homeowner-scoped. */}
        {assignedRep && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Representative
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-base font-semibold text-foreground">{assignedRep.name}</p>
                {assignedRep.role && (
                  <p className="text-sm text-muted-foreground">{assignedRep.role}</p>
                )}
                {assignedRep.phone && (
                  <DetailRow icon={Phone} label="Phone" value={assignedRep.phone} />
                )}
                {assignedRep.email && (
                  <DetailRow icon={Mail} label="Email" value={assignedRep.email} />
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Homeowner Info — homeowner-scoped contact fields only. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.22 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Homeowner Info
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <DetailRow icon={MapPin} label="Address" value={lead.address} />
              <DetailRow icon={Phone} label="Phone" value={lead.phone} />
              <DetailRow icon={Mail} label="Email" value={lead.email} />
              <DetailRow
                icon={Shield}
                label="Building Permit"
                value={lead.permit_choice ? 'Yes' : 'No'}
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    </div>
  )
}
