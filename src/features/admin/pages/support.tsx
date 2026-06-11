// Wave-18 #3 — Platform Support v1 admin inbox.
//
// Left list pane (w-72) + right detail pane. Filter pills All/Open/Answered/
// Closed (default Open). Reply box inserts support_messages row with
// sender_role='admin' — trg_support_admin_reply_status flips open→answered
// automatically. Status controls (Mark Answered / Close / Reopen) mutate
// support_threads.status directly via admin RLS update policy.

import { useMemo, useRef, useState, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { LifeBuoy, Send, MessageSquare, ArchiveRestore, CheckCheck, Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminSupport } from '@/lib/hooks/use-admin-support'
import { useHomeownerLeadsForAdmin } from '@/lib/hooks/use-homeowner-leads-for-admin'
import type { SupportStatus } from '@/lib/hooks/use-homeowner-support-thread'
import { cn } from '@/lib/utils'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
} satisfies Variants

type FilterKey = 'all' | 'open' | 'answered' | 'closed'

const FILTER_ORDER: FilterKey[] = ['all', 'open', 'answered', 'closed']
const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'All',
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed',
}

const STATUS_BADGE: Record<SupportStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
  answered: { label: 'Answered', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200' },
  closed: { label: 'Closed', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200' },
}

function initialsFrom(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d}d`
  const mo = Math.floor(d / 30)
  return `${mo}mo`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function accountAgeDays(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
}

export default function AdminSupportPage() {
  const adminProfile = useAuthStore((s) => s.profile)
  const { threads, messagesByThread, counts, loading, demoMode, reply, updateStatus } = useAdminSupport(
    adminProfile?.id,
  )
  const [filter, setFilter] = useState<FilterKey>('open')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const filteredThreads = useMemo(() => {
    if (filter === 'all') return threads
    return threads.filter((t) => t.status === filter)
  }, [threads, filter])

  useEffect(() => {
    if (activeId && filteredThreads.some((t) => t.id === activeId)) return
    if (filteredThreads.length > 0) setActiveId(filteredThreads[0].id)
    else setActiveId(null)
  }, [filteredThreads, activeId])

  const activeThread = useMemo(
    () => (activeId ? threads.find((t) => t.id === activeId) ?? null : null),
    [activeId, threads],
  )
  const activeMessages = useMemo(
    () => (activeId ? messagesByThread[activeId] ?? [] : []),
    [activeId, messagesByThread],
  )

  // Homeowner lead-count strip (admin SELECT-all on leads RLS — mig 010).
  const leadCount = useHomeownerLeadsForAdmin(activeThread?.homeowner_id ?? null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeMessages.length, activeId])

  const onSend = async () => {
    if (!activeId || !replyText.trim() || sending) return
    // kratos widen 1781113476902 — pass the caller's actual role so the
    // denormalized sender_role audit column records admin_employee replies
    // correctly. Default to 'admin' on the unlikely null/unknown branch.
    const senderRole: 'admin' | 'admin_employee' =
      adminProfile?.role === 'admin_employee' ? 'admin_employee' : 'admin'
    setSending(true)
    setErrorMsg(null)
    const r = await reply(activeId, replyText, senderRole)
    setSending(false)
    if (!r.ok) {
      setErrorMsg(r.error)
      return
    }
    setReplyText('')
  }

  const onStatus = async (next: SupportStatus) => {
    if (!activeId) return
    setErrorMsg(null)
    const r = await updateStatus(activeId, next)
    if (!r.ok) setErrorMsg(r.error)
  }

  if (demoMode) {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
        <PageHeader title="Support" description="Homeowner ↔ admin support inbox" />
        <Card className="rounded-xl shadow-sm p-8 text-center">
          <LifeBuoy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Support inbox is real-mode only. Disable demo mode to view threads.</p>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
      <PageHeader title="Support" description="Homeowner support threads — reply to open conversations" />

      <div className="grid grid-cols-1 lg:grid-cols-[288px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* List pane */}
        <Card className="rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_ORDER.map((key) => {
                const active = filter === key
                const count = counts[key]
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    data-testid="admin-support-status-filter-pill"
                    data-status={key}
                    data-active={active ? 'true' : 'false'}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    <span>{FILTER_LABEL[key]}</span>
                    <span
                      className={cn(
                        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                        active ? 'bg-primary-foreground/20' : 'bg-background/60',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" data-testid="admin-support-thread-list">
            {loading && filteredThreads.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Loading threads…</p>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <LifeBuoy className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No {filter !== 'all' ? filter : ''} threads</p>
              </div>
            ) : (
              filteredThreads.map((t) => {
                const msgs = messagesByThread[t.id] ?? []
                const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null
                const preview = lastMsg ? lastMsg.content.slice(0, 40) : t.subject ?? 'No messages yet'
                const homeownerName = t.homeowner?.name ?? t.homeowner?.email ?? 'Unknown'
                const isActive = activeId === t.id
                const badge = STATUS_BADGE[t.status]
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    data-testid="admin-support-thread-item"
                    data-thread-id={t.id}
                    data-status={t.status}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 text-left border-b transition-colors hover:bg-muted/50',
                      isActive && 'bg-primary/5 border-l-2 border-l-primary',
                    )}
                  >
                    <AvatarInitials initials={initialsFrom(homeownerName)} color="#2f6cf0" size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{homeownerName}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{relativeAge(t.last_activity_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
                      <span
                        data-testid="admin-support-thread-status-badge"
                        data-status={t.status}
                        className={cn('mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', badge.cls)}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </Card>

        {/* Detail pane */}
        <Card
          className="rounded-xl shadow-sm flex flex-col overflow-hidden"
          data-testid="admin-support-detail-pane"
        >
          {activeThread ? (
            <>
              <div className="flex items-start gap-3 p-4 border-b bg-muted/30">
                <AvatarInitials
                  initials={initialsFrom(activeThread.homeowner?.name ?? activeThread.homeowner?.email)}
                  color="#2f6cf0"
                  size="md"
                />
                <div className="flex-1 min-w-0" data-testid="admin-support-homeowner-context">
                  <p className="text-sm font-semibold truncate">
                    {activeThread.homeowner?.name ?? activeThread.homeowner?.email ?? 'Unknown homeowner'}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {activeThread.homeowner?.email && (
                      <span className="truncate">{activeThread.homeowner.email}</span>
                    )}
                    {accountAgeDays(activeThread.homeowner?.created_at) !== null && (
                      <span>· Account {accountAgeDays(activeThread.homeowner?.created_at)}d old</span>
                    )}
                    <span>· {leadCount ?? 0} lead{leadCount === 1 ? '' : 's'}</span>
                  </div>
                  {activeThread.subject && (
                    <p className="mt-1 text-xs italic text-muted-foreground truncate">
                      Subject: {activeThread.subject}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {activeThread.status === 'open' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatus('answered')}
                      data-testid="admin-support-mark-answered-btn"
                    >
                      <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark Answered
                    </Button>
                  )}
                  {(activeThread.status === 'open' || activeThread.status === 'answered') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatus('closed')}
                      data-testid="admin-support-close-btn"
                    >
                      <Lock className="h-3.5 w-3.5 mr-1" /> Close
                    </Button>
                  )}
                  {activeThread.status === 'closed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatus('open')}
                      data-testid="admin-support-reopen-btn"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Reopen
                    </Button>
                  )}
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                  </div>
                ) : (
                  activeMessages.map((msg) => {
                    const isAdmin = msg.sender_role === 'admin' || msg.sender_role === 'admin_employee'
                    return (
                      <div
                        key={msg.id}
                        data-testid="admin-support-message-bubble"
                        data-sender-role={msg.sender_role}
                        className={cn('flex', isAdmin ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl px-4 py-2.5',
                            isAdmin
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-muted rounded-bl-md',
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <p
                            className={cn(
                              'text-[10px] mt-1',
                              isAdmin ? 'text-primary-foreground/60' : 'text-muted-foreground',
                            )}
                          >
                            {fmtTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="p-3 border-t bg-background">
                {errorMsg && (
                  <p className="mb-2 text-xs text-destructive" role="alert">
                    {errorMsg}
                  </p>
                )}
                <div className="flex gap-2">
                  <Textarea
                    placeholder={activeThread.status === 'closed' ? 'Reopen this thread to reply…' : 'Type a reply…'}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        onSend()
                      }
                    }}
                    rows={1}
                    disabled={activeThread.status === 'closed'}
                    data-testid="admin-support-reply-textarea"
                    className="resize-none min-h-[40px] max-h-[120px]"
                  />
                  <Button
                    size="icon"
                    disabled={!replyText.trim() || sending || activeThread.status === 'closed'}
                    onClick={onSend}
                    data-testid="admin-support-reply-send-btn"
                    className="shrink-0 h-10 w-10"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <LifeBuoy className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a thread to view messages</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
