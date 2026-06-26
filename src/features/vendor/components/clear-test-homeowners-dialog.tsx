// Clear Test Homeowners — confirm dialog + destructive-action UI.
//
// UI shell staged for task_1782262789250_009. Backend (scoped DB delete +
// Storage cascade) wired by hephaestus once Rod picks fast-vs-real.
// Drop in the real `onConfirm` handler when ready; this component owns
// only presentation + confirmation gate.

import { useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ClearTestHomeownersDialogProps {
  // Injected by parent once hephaestus wires the DB call.
  // Receives `confirmed: true` so callers can distinguish dialog-confirm
  // from dialog-cancel without an extra boolean prop.
  onConfirm?: () => Promise<void>
}

const CONFIRM_WORD = 'DELETE'

export function ClearTestHomeownersDialog({ onConfirm }: ClearTestHomeownersDialogProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const canConfirm = typed === CONFIRM_WORD

  async function handleConfirm() {
    if (!canConfirm) return
    setBusy(true)
    try {
      await onConfirm?.()
    } finally {
      setBusy(false)
      setOpen(false)
      setTyped('')
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setTyped('')
    setOpen(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
          data-testid="clear-test-homeowners-trigger"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Test Homeowners
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
              <TriangleAlert className="h-4.5 w-4.5 text-destructive" />
            </span>
            <AlertDialogTitle>Clear test homeowners?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-2 text-sm">
            <span className="block">
              This will permanently delete <strong>only the test homeowners you created</strong> —
              including their projects, bookings, and documents. No other homeowner
              accounts will be affected.
            </span>
            <span className="block font-medium text-foreground">
              This action cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-2 space-y-1.5">
          <Label htmlFor="confirm-input" className="text-xs text-muted-foreground">
            Type <span className="font-mono font-bold text-destructive">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="confirm-input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            className="font-mono border-destructive/40 focus-visible:ring-destructive/30"
            autoComplete="off"
            data-testid="clear-test-homeowners-confirm-input"
          />
        </div>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canConfirm || busy}
            onClick={handleConfirm}
            data-testid="clear-test-homeowners-confirm-btn"
          >
            {busy ? 'Clearing…' : 'Delete test homeowners'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
