import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileText, ArrowRight, Home } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCartStore } from '@/stores/cart-store'
import { useProjectsStore } from '@/stores/projects-store'

export function BookingConfirmationPage() {
  const navigate = useNavigate()
  const removeItem = useCartStore((s) => s.removeItem)
  const sendProject = useProjectsStore((s) => s.sendProject)
  const [details, setDetails] = useState<{ service: string; vendor: string; date: string; time: string }>({
    service: 'Full Roof Replacement',
    vendor: 'Apex Roofing & Solar',
    date: 'April 14, 2026',
    time: '9:00 AM',
  })

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

        // Get ID document
        const idDoc = localStorage.getItem('buildconnect-id-document') || undefined

        // Move item from cart to sent projects
        sendProject(pendingItem, contractor, booking, homeowner, idDoc)
        removeItem(pendingItem.id)

        // Clean up
        localStorage.removeItem('buildconnect-pending-item')
        localStorage.removeItem('buildconnect-selected-contractor')
        localStorage.removeItem('buildconnect-selected-booking')
        localStorage.removeItem('buildconnect-homeowner-info')
      } catch {
        // Silently handle corrupted localStorage
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          <p className="text-sm text-foreground text-left">
            <span className="font-medium">Project Pack</span>{' '}
            <span className="text-muted-foreground">has been sent to {details.vendor} with your project details.</span>
          </p>
        </motion.div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-11 gap-2 text-sm"
            onClick={() => navigate('/home/appointments/L-0001')}
          >
            View Status
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            className="flex-1 h-11 gap-2 text-sm"
            onClick={() => navigate('/home/cart')}
          >
            <Home className="h-4 w-4" />
            View Cart
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
