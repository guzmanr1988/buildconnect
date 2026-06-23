// Wave-18 #3 — admin /messages simplified to Live Conversations (real-mode
// admin SELECT-all on lead-scoped messages via mig 010 RLS). The previous
// Zustand-persisted vendor-chat shell (useAdminMessagesStore + hardcoded
// SEED) is retired: it surfaced the same demo data across every browser
// regardless of login, which Rod flagged as a cross-tenant-looking bug.
//
// Homeowner ↔ admin support lives at /admin/support (wave-18 #3 inbox).
// Vendor ↔ admin chat continues via the lead-scoped messages table (visible
// in the Live Conversations feed below). v2 may surface a dedicated
// vendor-thread inbox if Rod re-prioritizes.

import { motion, type Variants } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { useAdminLiveConversations } from '@/lib/hooks/use-admin-live-conversations'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
} satisfies Variants

function LiveConversationsCard() {
  const { messages, demoMode, loading } = useAdminLiveConversations()
  if (demoMode) {
    return (
      <Card className="rounded-xl shadow-sm p-6 text-center text-sm text-muted-foreground">
        Live conversations are real-mode only.
      </Card>
    )
  }
  return (
    <Card className="rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">Live Conversations</p>
          <p className="text-xs text-muted-foreground">Real-time lead-scoped messages across the platform</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Realtime
        </span>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No real lead messages yet</p>
      ) : (
        <div className="max-h-[calc(100vh-360px)] overflow-y-auto space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              data-admin-live-msg
              className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{m.lead_id}</span>
                  <span>·</span>
                  <span>
                    {new Date(m.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-foreground truncate">
                  {m.message_type === 'quote' ? 'Quote sent' : m.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function AdminMessagesPage() {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
      <PageHeader title="Messages" description="Lead-scoped vendor ↔ homeowner conversations across the platform" />
      <LiveConversationsCard />
    </motion.div>
  )
}
