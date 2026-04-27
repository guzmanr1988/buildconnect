import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import { ShieldCheck, Check, Flag, FileText, ExternalLink, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { useProjectsStore } from '@/stores/projects-store'
import { useAuthStore } from '@/stores/auth-store'
import { useVendorHomeownerDocsStore } from '@/stores/vendor-homeowner-documents-store'
import type { SentProject } from '@/stores/projects-store'
import { maybeSeedSampleReview } from '@/lib/sample-review-seed'

// Ship #314 — BuildConnect contract review queue (Phase 1 per kratos
// dispatch). Surfaces all sold sentProjects with their contract docs
// + sale/contract amount match indicator + admin Approve/Flag actions.
// Lighter-confirm dialogs on both actions; required note on Flag.
// Phase 2 will add ReviewDetailDialog with horizontal-PC + four-
// refinement on Flag (when vendor-visibility + commission-pause are
// wired — discipline-precondition-check-as-time-sensitive #107).

type ReviewFilter = 'pending' | 'approved' | 'flagged' | 'all'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: 'easeOut' },
  }),
} satisfies Variants

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function reviewStatusOf(p: SentProject): 'pending' | 'approved' | 'flagged' {
  return p.reviewStatus ?? 'pending'
}

const STATUS_CONFIG: Record<'pending' | 'approved' | 'flagged', { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  flagged: { label: 'Flagged', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

export default function ReviewsPage() {
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const setReviewStatus = useProjectsStore((s) => s.setReviewStatus)
  const profile = useAuthStore((s) => s.profile)
  const docsByVendorByHomeowner = useVendorHomeownerDocsStore((s) => s.docsByVendorByHomeowner)

  const [filter, setFilter] = useState<ReviewFilter>('pending')
  const [approveTarget, setApproveTarget] = useState<SentProject | null>(null)
  const [flagTarget, setFlagTarget] = useState<SentProject | null>(null)
  const [flagNote, setFlagNote] = useState('')

  // Ship #315 — one-time sample-review seed on first /admin/reviews
  // mount per Rodolfo "im not seen a contract to review sample".
  // Idempotent via localStorage flag inside maybeSeedSampleReview().
  useEffect(() => {
    maybeSeedSampleReview()
  }, [])

  // Ship #314 — review queue surfaces all sold sentProjects regardless
  // of completedAt (admin reviews the SALE event itself, not the
  // post-completion state). Sorted oldest-pending-first by soldAt ASC
  // so admin works the priority queue from front.
  const soldProjects = useMemo(() => {
    return sentProjects
      .filter((p) => p.status === 'sold' && p.saleAmount && p.saleAmount > 0)
      .slice()
      .sort((a, b) => {
        const aDate = a.soldAt ? new Date(a.soldAt).getTime() : 0
        const bDate = b.soldAt ? new Date(b.soldAt).getTime() : 0
        return aDate - bDate
      })
  }, [sentProjects])

  const filtered = useMemo(() => {
    if (filter === 'all') return soldProjects
    return soldProjects.filter((p) => reviewStatusOf(p) === filter)
  }, [soldProjects, filter])

  const counts = useMemo(() => {
    return {
      pending: soldProjects.filter((p) => reviewStatusOf(p) === 'pending').length,
      approved: soldProjects.filter((p) => reviewStatusOf(p) === 'approved').length,
      flagged: soldProjects.filter((p) => reviewStatusOf(p) === 'flagged').length,
      all: soldProjects.length,
    }
  }, [soldProjects])

  const findContractDoc = (p: SentProject) => {
    const vendorDocs = docsByVendorByHomeowner[p.contractor.vendor_id ?? '']
    if (!vendorDocs) return null
    const homeownerEmail = p.homeowner?.email
    if (!homeownerEmail) return null
    const docs = vendorDocs[homeownerEmail]
    if (!docs) return null
    // Most-recent contract first (uploadedAt DESC)
    const contracts = docs.filter((d) => d.category === 'contract')
    if (contracts.length === 0) return null
    return contracts.slice().sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
  }

  const openContractDoc = (dataUrl: string) => {
    window.open(dataUrl, '_blank', 'noopener')
  }

  const handleApprove = () => {
    if (!approveTarget || !profile) return
    setReviewStatus(approveTarget.id, 'approved', profile.id)
    toast.success('Deal approved')
    setApproveTarget(null)
  }

  const handleFlag = () => {
    if (!flagTarget || !profile) return
    const note = flagNote.trim()
    if (!note) {
      toast.error('Please provide a reason for flagging')
      return
    }
    setReviewStatus(flagTarget.id, 'flagged', profile.id, note)
    toast.success('Deal flagged')
    setFlagTarget(null)
    setFlagNote('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="BuildConnect Reviews"
        description="Review sold-active deals against the uploaded contracts."
      >
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{counts.pending} pending</span>
        </div>
      </PageHeader>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as ReviewFilter)}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          <TabsList className="w-max sm:w-auto h-auto p-1 gap-1">
            <TabsTrigger value="pending" className="px-3 py-2 text-sm gap-1.5">
              Pending
              {counts.pending > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{counts.pending}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" className="px-3 py-2 text-sm gap-1.5">
              Approved
              {counts.approved > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{counts.approved}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="flagged" className="px-3 py-2 text-sm gap-1.5">
              Flagged
              {counts.flagged > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{counts.flagged}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="px-3 py-2 text-sm gap-1.5">
              All
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{counts.all}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={filter} className="mt-6">
          {filtered.length === 0 ? (
            <Card className="rounded-xl">
              <CardContent className="p-8 text-center">
                <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {filter === 'pending'
                    ? 'No pending reviews. Sold-active deals will appear here once vendors mark them sold.'
                    : `No ${filter} reviews to show.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p, i) => {
                const status = reviewStatusOf(p)
                const contract = findContractDoc(p)
                const sale = p.saleAmount ?? 0
                const isImage = !!contract && contract.dataUrl.startsWith('data:image/')
                const matchOk = !!contract && !!p.saleAmount // basic indicator; full match-check guaranteed at #313 dialog write-time
                return (
                  <motion.div
                    key={p.id}
                    custom={i}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                  >
                    <Card className="rounded-xl">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{p.contractor.company}</p>
                            <p className="text-sm font-bold font-heading truncate">{p.item.serviceName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.homeowner?.name ?? 'Unknown homeowner'} · {p.homeowner?.email ?? '—'}
                            </p>
                          </div>
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium shrink-0',
                            STATUS_CONFIG[status].className,
                          )}>
                            {STATUS_CONFIG[status].label}
                          </span>
                        </div>

                        <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sale Amount</span>
                            <span className="font-semibold">{fmtUSD(sale)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sold</span>
                            <span className="font-medium">{fmtDate(p.soldAt)}</span>
                          </div>
                          {p.reviewedAt && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Reviewed</span>
                              <span className="font-medium">{fmtDate(p.reviewedAt)}</span>
                            </div>
                          )}
                        </div>

                        {/* Contract preview row */}
                        <div className="rounded-lg border border-border/50 bg-background p-2.5 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contract</p>
                          {contract ? (
                            <>
                              <div className="flex items-center gap-2 min-w-0">
                                {isImage ? (
                                  <button
                                    type="button"
                                    onClick={() => openContractDoc(contract.dataUrl)}
                                    className="shrink-0 rounded-md border bg-muted overflow-hidden h-12 w-16 hover:opacity-80 transition"
                                    aria-label="Open contract preview"
                                  >
                                    <img src={contract.dataUrl} alt="Contract preview" className="h-full w-full object-cover" />
                                  </button>
                                ) : (
                                  <div className="shrink-0 rounded-md border bg-muted h-12 w-16 flex items-center justify-center">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}
                                <span className="text-xs truncate flex-1">{contract.filename}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => openContractDoc(contract.dataUrl)}
                                  aria-label="Open contract in new tab"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              {/* Match indicator — current #313 gating guarantees
                                  amount equality at write-time, so this primarily
                                  surfaces the file-presence dimension. */}
                              <div className="flex items-center gap-1.5 text-[10px]">
                                {matchOk ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span className="text-emerald-700 dark:text-emerald-400">Sale + contract match (validated at sale)</span>
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon className="h-3 w-3 text-amber-600" />
                                    <span className="text-amber-700 dark:text-amber-400">Contract missing</span>
                                  </>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No contract on file (legacy sold deal pre-#313).</p>
                          )}
                        </div>

                        {p.reviewNote && status === 'flagged' && (
                          <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-2.5 text-xs">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 mb-0.5">Flag note</p>
                            <p className="text-red-800 dark:text-red-300">{p.reviewNote}</p>
                          </div>
                        )}

                        {status === 'pending' && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                              onClick={() => setApproveTarget(p)}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20 gap-1.5"
                              onClick={() => setFlagTarget(p)}
                            >
                              <Flag className="h-3.5 w-3.5" />
                              Flag
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approve confirmation — lighter-confirm per #107 (low-stakes,
          admin-internal-only at Phase 1). */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Approve this deal?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>Marks the contract as reviewed and approved by BuildConnect.</p>
            {approveTarget && (
              <p className="text-xs">
                <span className="text-muted-foreground">Vendor:</span> <span className="font-medium text-foreground">{approveTarget.contractor.company}</span> ·{' '}
                <span className="text-muted-foreground">Amount:</span> <span className="font-medium text-foreground">{fmtUSD(approveTarget.saleAmount ?? 0)}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleApprove}>
              <Check className="h-4 w-4 mr-1.5" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flag dialog — lighter-confirm with required note at Phase 1.
          Phase 2 upgrades to four-refinement when vendor-visibility +
          commission-pause are wired (discipline-precondition-check-as-
          time-sensitive). */}
      <Dialog
        open={!!flagTarget}
        onOpenChange={(o) => {
          if (!o) {
            setFlagTarget(null)
            setFlagNote('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Flag this deal?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Captures a flag note for internal records. Vendor-visibility and commission-pause come in Phase 2.
            </p>
            {flagTarget && (
              <p className="text-xs text-muted-foreground">
                Vendor: <span className="font-medium text-foreground">{flagTarget.contractor.company}</span> ·{' '}
                Amount: <span className="font-medium text-foreground">{fmtUSD(flagTarget.saleAmount ?? 0)}</span>
              </p>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason <span className="text-destructive">*</span></label>
              <Textarea
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder="Why is this deal being flagged?"
                rows={4}
                className="text-sm"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFlagTarget(null); setFlagNote('') }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!flagNote.trim()}
              onClick={handleFlag}
            >
              <Flag className="h-4 w-4 mr-1.5" />
              Flag deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
