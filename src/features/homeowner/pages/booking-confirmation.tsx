import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileText, ArrowRight, Home } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCartStore } from '@/stores/cart-store'
import { useProjectsStore } from '@/stores/projects-store'

type BookingDetails = { service: string; vendor: string; date: string; time: string }

export function BookingConfirmationPage() {
  const navigate = useNavigate()
  const removeItem = useCartStore((s) => s.removeItem)
  const sendProject = useProjectsStore((s) => s.sendProject)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const [details, setDetails] = useState<BookingDetails | null>(null)

  useEffect(() => {
    const pendingItemStr = localStorage.getItem('buildconnect-pending-item')
    const contractorStr = localStorage.getItem('buildconnect-selected-contractor')
    const bookingStr = localStorage.getItem('buildconnect-selected-booking')

    if (pendingItemStr && contractorStr && bookingStr) {
      try {
        const pendingItem = JSON.parse(pendingItemStr)
        const contractor = JSON.parse(contractorStr)
        const booking = JSON.parse(bookingStr)
        const homeownerStr = localStorage.getItem('buildconnect-homeowner-info')
        const homeowner = homeownerStr ? JSON.parse(homeownerStr) : undefined

        setDetails({
          service: pendingItem.serviceName,
          vendor: contractor.company,
          date: booking.date,
          time: booking.time,
        })

        const idDoc = localStorage.getItem('buildconnect-id-document') || undefined
        sendProject(pendingItem, contractor, booking, homeowner, idDoc)
        removeItem(pendingItem.id)

        localStorage.removeItem('buildconnect-pending-item')
        localStorage.removeItem('buildconnect-selected-contractor')
        localStorage.removeItem('buildconnect-selected-booking')
        localStorage.removeItem('buildconnect-homeowner-info')
        return
      } catch {
        // Fall through to store fallback on corrupted localStorage
      }
    }

    // Post-navigation refresh or deep-link — pull the most recent sent project.
    const latest = sentProjects[sentProjects.length - 1]
    if (latest) {
      setDetails({
        service: latest.item.serviceName,
        vendor: latest.contractor.company,
        date: latest.booking.date,
        time: latest.booking.time,
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!details) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Home className="h-10 w-10 text-muted-foreground/60" />
        </div>
        <h1 className="mb-2 text-2xl font-bold font-heading text-foreground">
          No booking in progress
        </h1>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Pick a service and walk through the booking flow to land back here with a confirmed appointment.
        </p>
        <Button size="lg" onClick={() => navigate('/home')} className="h-11 px-6">
          Browse services
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md text-center"
      >
        {/* Animated checkmark */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
        >
          <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        </motion.div>

        <h1 className="mb-2 text-2xl font-bold font-heading text-foreground">
          Booking Confirmed
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your site visit has been scheduled successfully.
        </p>

        {/* Summary card */}
        <Card className="mb-6 text-left">
          <CardContent className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium text-foreground">{details.service}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vendor</span>
              <span className="font-medium text-foreground">{details.vendor}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium text-foreground">{details.date}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Time</span>
              <span className="font-medium text-foreground">{details.time}</span>
            </div>
          </CardContent>
        </Card>

        {/* Project Pack notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="mb-6 flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/10 p-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          {/* Ship #211 — vocabulary bridge per Rodolfo's mental model:
              homeowner says "project", vendor nav says "Projects tab",
              Rodolfo's framing says "lead". Using all three in one
              sentence so the moment-of-lead-creation is unambiguous
              regardless of which mental model the user holds. */}
          <p className="text-sm text-foreground text-left">
            <span className="font-medium">Project Pack</span>{' '}
            <span className="text-muted-foreground">has been sent to {details.vendor} — it appears in their Projects tab as a new lead they'll review and confirm.</span>
          </p>
        </motion.div>

        {/* Actions — side-by-side, big-CTA sizing matching Add to Project elsewhere */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-12 gap-2 text-sm font-semibold rounded-xl"
            onClick={() => navigate('/home/appointments/L-0001')}
          >
            View Status
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            className="flex-1 h-12 gap-2 text-sm font-semibold rounded-xl"
            onClick={() => navigate('/home/cart')}
          >
            <Home className="h-4 w-4" />
            View Projects
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
