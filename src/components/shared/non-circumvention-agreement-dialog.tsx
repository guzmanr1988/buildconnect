import { useState } from 'react'
import { LogOut, FileText, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuthStore } from '@/stores/auth-store'
import {
  AGREEMENT_DRAFT_BANNER,
  AGREEMENT_EMAIL_FOOTER,
  AGREEMENT_TEXT,
  AGREEMENT_TITLE,
  CURRENT_AGREEMENT_VERSION,
  getCurrentAgreementSnapshot,
} from '@/lib/non-circumvention-agreement'
import type { Profile } from '@/types'

// Ship #270 — Dual-mode dialog. "sign" mode is the gate-modal that
// blocks vendor portal access until signature lands. "view" mode is
// the admin audit-view rendering the FROZEN snapshot stored on a
// vendor profile at sign-time (so version-bumps don't change historical
// records). Same primitive shape as #266/#267 — shadcn Dialog.

interface SignProps {
  mode: 'sign'
  open: boolean
}

interface ViewProps {
  mode: 'view'
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
}

type Props = SignProps | ViewProps

export function NonCircumventionAgreementDialog(props: Props) {
  if (props.mode === 'sign') return <SignMode open={props.open} />
  return <ViewMode {...props} />
}

function SignMode({ open }: { open: boolean }) {
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const logout = useAuthStore((s) => s.logout)
  const profile = useAuthStore((s) => s.profile)
  const [typedName, setTypedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const canSubmit = typedName.trim().length > 0 && agreed

  const handleSubmit = () => {
    if (!canSubmit) return
    const snapshot = getCurrentAgreementSnapshot()
    updateProfile({
      noncircumvention_agreement_signed_at: new Date().toISOString(),
      noncircumvention_agreement_signed_name: typedName.trim(),
      noncircumvention_agreement_version: snapshot.version,
      noncircumvention_agreement_text_snapshot: snapshot.text,
      noncircumvention_agreement_signature_metadata: {
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        // IP capture would need a server round-trip — Phase 2 wires real.
      },
    })
    // TODO Tranche-2: replace mock with real email-send via SendGrid /
    // Mailgun / Resend integration. For Phase 1 this is toast + log
    // event only; admin sees the event in the activity feed.
    toast.success(`Agreement sent to your email at ${profile?.email ?? 'your account'}`)
    // Log via cortextos bus would be server-side; for now the toast +
    // updateProfile audit record is the visible trail. Real event
    // logging lands when the email infra wires.
    setTypedName('')
    setAgreed(false)
  }

  return (
    // Ship #270 / #271 — gate-modal: blocks vendor portal until sign-or-
    // logout. Open state controlled fully by parent (vendor-layout gate
    // condition); the no-op onOpenChange ignores ESC + backdrop dismiss
    // attempts so base-ui's internal close events can't flip it shut.
    // showCloseButton={false} hides the default X. Only Sign Out or Sign
    // Agreement exit this modal — both flip state at the parent level
    // (logout clears profile → gate condition false → modal unmounts;
    // sign updates agreement_version → gate condition false → unmounts).
    <Dialog open={open} onOpenChange={() => { /* gated — no implicit close */ }}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-4"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="font-heading">{AGREEMENT_TITLE}</DialogTitle>
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" />
                {AGREEMENT_DRAFT_BANNER}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
          {AGREEMENT_TEXT}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Type your full legal name to sign <span className="text-destructive">*</span>
            </label>
            <Input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Full legal name"
              autoComplete="off"
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-foreground">
              I have read and agree to the terms of this agreement.
            </span>
          </label>
          <p className="text-xs text-muted-foreground">{AGREEMENT_EMAIL_FOOTER}</p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto gap-2"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Sign Agreement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ViewMode({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile }) {
  const signedAt = profile.noncircumvention_agreement_signed_at
  const signedName = profile.noncircumvention_agreement_signed_name
  const version = profile.noncircumvention_agreement_version
  const snapshot = profile.noncircumvention_agreement_text_snapshot ?? AGREEMENT_TEXT
  const isCurrent = version === CURRENT_AGREEMENT_VERSION
  const fmtSignedAt = signedAt
    ? new Date(signedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="font-heading">{AGREEMENT_TITLE}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audit view — frozen at sign-time
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Signed by</span>
            <span className="col-span-2 font-medium">{signedName ?? '—'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Signed at</span>
            <span className="col-span-2 font-medium">{fmtSignedAt}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Version</span>
            <span className="col-span-2 font-mono text-xs">
              {version ?? '—'}
              {!isCurrent && version && (
                <span className="ml-2 text-[10px] text-amber-700 dark:text-amber-400">
                  (current is {CURRENT_AGREEMENT_VERSION})
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
          {snapshot}
        </div>

        <DialogFooter>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
