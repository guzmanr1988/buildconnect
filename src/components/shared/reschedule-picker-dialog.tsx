import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/*
 * Ship #191 (Rodolfo-direct 2026-04-21 pivot #12) — shared reschedule
 * picker dialog. Both homeowner Request-Reschedule + vendor Propose-
 * Reschedule flows use this component with different header copy. The
 * counter-proposal path on either side also reuses it.
 *
 * Dialog-mount-in-every-return-branch discipline: callers mount this
 * unconditionally and toggle via the `open` prop; the dialog handles
 * its own reset on open change so callers don't track local form state.
 */

export type ReschedulePickerMode = 'request' | 'counter' | 'propose'

export interface ReschedulePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Current (original) slot for the visible "currently scheduled" hint.
  currentDate?: string
  currentTime?: string
  // Mode drives header copy + primary-button label. All three use the
  // same form body (date + time + optional reason).
  mode: ReschedulePickerMode
  // Pre-fill when mode='counter' so the user can tweak the proposed slot.
  initialDate?: string
  initialTime?: string
  initialReason?: string
  // Label for the other party — used in copy like "Your vendor proposed
  // this time". Keeps this component role-agnostic so both homeowner +
  // vendor surfaces can use it.
  otherPartyLabel?: string
  onSubmit: (proposedDate: string, proposedTime: string, reason?: string) => void
  submitLabel?: string
}

const MODE_HEADER: Record<ReschedulePickerMode, { title: string; description: string }> = {
  request: {
    title: 'Request to reschedule',
    description: "Pick a new day and time. We'll let the other side know so they can confirm or suggest something else.",
  },
  propose: {
    title: 'Propose a new time',
    description: 'Suggest a different slot. The homeowner will be notified and can approve, counter, or keep the original.',
  },
  counter: {
    title: 'Counter-propose a different time',
    description: "Not quite? Pick another slot and we'll bounce it back.",
  },
}

export function ReschedulePickerDialog({
  open,
  onOpenChange,
  currentDate,
  currentTime,
  mode,
  initialDate,
  initialTime,
  initialReason,
  otherPartyLabel,
  onSubmit,
  submitLabel,
}: ReschedulePickerDialogProps) {
  const [date, setDate] = useState(initialDate ?? '')
  const [time, setTime] = useState(initialTime ?? '')
  const [reason, setReason] = useState(initialReason ?? '')

  // Reset state whenever the dialog opens fresh or mode changes.
  useEffect(() => {
    if (open) {
      setDate(initialDate ?? '')
      setTime(initialTime ?? '')
      setReason(initialReason ?? '')
    }
  }, [open, initialDate, initialTime, initialReason])

  const canSubmit = date.trim().length > 0 && time.trim().length > 0
  const header = MODE_HEADER[mode]
  const buttonLabel =
    submitLabel ?? (mode === 'counter' ? 'Send counter' : mode === 'propose' ? 'Send to homeowner' : 'Send to vendor')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{header.title}</DialogTitle>
          <DialogDescription>{header.description}</DialogDescription>
        </DialogHeader>

        {currentDate && currentTime && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-lg border bg-muted/40 p-3 text-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Currently scheduled
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {currentDate} · {currentTime}
            </p>
            {otherPartyLabel && (
              <p className="mt-1 text-xs text-muted-foreground">with {otherPartyLabel}</p>
            )}
          </motion.div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rpd-date" className="text-xs font-semibold">New date</Label>
            <Input
              id="rpd-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-reschedule-field="date"
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rpd-time" className="text-xs font-semibold">New time</Label>
            <Input
              id="rpd-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              data-reschedule-field="time"
              className="h-10 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rpd-reason" className="text-xs font-semibold">Reason (optional)</Label>
          <Textarea
            id="rpd-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Anything the other side should know — e.g. family emergency, work conflict."
            rows={3}
            className="text-sm resize-none"
            data-reschedule-field="reason"
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onSubmit(date, time, reason.trim() || undefined)
            }}
            className="w-full sm:w-auto"
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
