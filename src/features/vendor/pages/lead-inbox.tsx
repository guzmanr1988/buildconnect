import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox, MapPin, Phone, Mail, Ruler, FileCheck, CreditCard,
  CalendarClock, Check, X, RotateCcw, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { EmptyState } from '@/components/shared/empty-state'
import { MOCK_LEADS, MOCK_AVAILABLE_SLOTS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'

const VENDOR_ID = 'v-1'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function LeadInbox() {
  const leads = useMemo(() => MOCK_LEADS.filter((l) => l.vendor_id === VENDOR_ID), [])
  const [selected, setSelected] = useState<Lead | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')

  const openLead = (lead: Lead) => {
    setSelected(lead)
    setSheetOpen(true)
  }

  const selectedSlot = MOCK_AVAILABLE_SLOTS.find((s) => s.date === rescheduleDate)

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Lead Inbox" description={`${leads.length} leads assigned to you`}>
        <Badge variant="secondary" className="text-xs">{leads.filter((l) => l.status === 'pending').length} pending</Badge>
      </PageHeader>

      {leads.length === 0 ? (
        <EmptyState icon={Inbox} title="No leads yet" description="New leads from homeowner requests will appear here." />
      ) : (
        <div className="grid gap-3">
          {leads.map((lead) => (
            <motion.div key={lead.id} variants={item}>
              <Card
                className="rounded-xl shadow-sm hover:shadow-md transition cursor-pointer group"
                onClick={() => openLead(lead)}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <AvatarInitials
                        initials={lead.homeowner_name.split(' ').map((n) => n[0]).join('')}
                        color="#64748b"
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                          {lead.homeowner_name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{lead.project}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="text-sm font-bold">{fmt(lead.value)}</span>
                          <StatusBadge status={lead.status} />
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">{fmtDate(lead.received_at)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{lead.id}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Lead Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="font-heading">{selected.project}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={selected.status} />
                  <span className="text-sm text-muted-foreground">{selected.id}</span>
                </div>
              </SheetHeader>

              {/* Customer Info */}
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading">Customer Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{selected.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{selected.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{selected.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Ruler className="h-4 w-4 shrink-0" />
                    <span>{selected.sq_ft.toLocaleString()} sq ft</span>
                  </div>
                </CardContent>
              </Card>

              {/* Project Pack */}
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading">Project Pack</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Permit: {selected.permit_choice ? 'Yes (vendor handles)' : 'No'}</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Service Selections</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(selected.pack_items).map(([key, values]) =>
                        values.map((v) => (
                          <Badge key={`${key}-${v}`} variant="secondary" className="text-xs capitalize">
                            {v.replace(/_/g, ' ')}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Financing: {selected.financing ? 'Requested' : 'Not needed'}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Appointment */}
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading">Appointment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{fmtDateTime(selected.slot)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Value */}
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground">Estimated Value</span>
                <span className="text-lg font-bold font-heading">{fmt(selected.value)}</span>
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex gap-2">
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" size="lg">
                  <Check className="h-4 w-4 mr-1.5" /> Confirm
                </Button>
                <Button variant="destructive" className="flex-1" size="lg">
                  <X className="h-4 w-4 mr-1.5" /> Reject
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  size="lg"
                  onClick={() => setRescheduleOpen(true)}
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Reschedule
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Reschedule Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Date</label>
              <Select value={rescheduleDate} onValueChange={(v) => { setRescheduleDate(v); setRescheduleTime('') }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a date" />
                </SelectTrigger>
                <SelectContent>
                  {MOCK_AVAILABLE_SLOTS.map((slot) => (
                    <SelectItem key={slot.date} value={slot.date}>
                      {new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {rescheduleDate && selectedSlot && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Time</label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedSlot.times.map((t) => (
                    <Button
                      key={t}
                      variant={rescheduleTime === t ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRescheduleTime(t)}
                      className="text-xs"
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button disabled={!rescheduleDate || !rescheduleTime} onClick={() => setRescheduleOpen(false)}>
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
