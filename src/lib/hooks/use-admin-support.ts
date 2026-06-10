// Wave-18 #3 — Platform Support v1 (admin side).
//
// Loads all support_threads + their messages for /admin/support inbox.
// Status filter applied client-side (small N expected v1; can move server-side
// in v2 with pagination). Realtime subscribe for support_messages + threads.
// Admin reply: insert support_messages row with sender_role='admin' — the
// trg_support_admin_reply_status trigger flips open→answered automatically.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import type { SupportThread, SupportMessage, SupportStatus } from '@/lib/hooks/use-homeowner-support-thread'

export type SupportThreadWithHomeowner = SupportThread & {
  homeowner?: {
    id: string
    full_name: string | null
    email: string | null
    created_at: string
  } | null
}

type SendResult = { ok: true } | { ok: false; error: string }

export function useAdminSupport(adminProfileId: string | null | undefined) {
  const demoMode = useDemoMode()
  const [threads, setThreads] = useState<SupportThreadWithHomeowner[]>([])
  const [messagesByThread, setMessagesByThread] = useState<Record<string, SupportMessage[]>>({})
  const [loading, setLoading] = useState(false)

  const loadAll = useCallback(async () => {
    if (demoMode) {
      setThreads([])
      setMessagesByThread({})
      return
    }
    setLoading(true)
    const { data: tData, error: tErr } = await supabase
      .from('support_threads')
      .select('*, homeowner:profiles!support_threads_homeowner_id_fkey(id, full_name, email, created_at)')
      .order('last_activity_at', { ascending: false })
    if (tErr) {
      console.error('[wave-18 #3 useAdminSupport] threads fetch', tErr)
      setLoading(false)
      return
    }
    const ts = (tData ?? []) as SupportThreadWithHomeowner[]
    setThreads(ts)

    if (ts.length === 0) {
      setMessagesByThread({})
      setLoading(false)
      return
    }
    const ids = ts.map((t) => t.id)
    const { data: mData, error: mErr } = await supabase
      .from('support_messages')
      .select('*')
      .in('thread_id', ids)
      .order('created_at', { ascending: true })
    if (mErr) {
      console.error('[wave-18 #3 useAdminSupport] messages fetch', mErr)
      setMessagesByThread({})
    } else {
      const map: Record<string, SupportMessage[]> = {}
      for (const m of (mData ?? []) as SupportMessage[]) {
        ;(map[m.thread_id] ??= []).push(m)
      }
      setMessagesByThread(map)
    }
    setLoading(false)
  }, [demoMode])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (demoMode) return
    const channel = supabase
      .channel(`support:admin:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        (payload) => {
          const next = payload.new as SupportMessage
          setMessagesByThread((prev) => {
            const list = prev[next.thread_id] ?? []
            if (list.some((m) => m.id === next.id)) return prev
            return { ...prev, [next.thread_id]: [...list, next] }
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_threads' },
        () => {
          loadAll()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_threads' },
        (payload) => {
          const next = payload.new as SupportThread
          setThreads((prev) =>
            prev.map((t) => (t.id === next.id ? { ...t, ...next } : t)),
          )
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [demoMode, loadAll])

  const counts = useMemo(() => {
    let open = 0
    let answered = 0
    let closed = 0
    for (const t of threads) {
      if (t.status === 'open') open += 1
      else if (t.status === 'answered') answered += 1
      else if (t.status === 'closed') closed += 1
    }
    return { all: threads.length, open, answered, closed }
  }, [threads])

  const reply = useCallback(
    async (threadId: string, content: string): Promise<SendResult> => {
      if (!adminProfileId) return { ok: false, error: 'no admin identity' }
      if (!content.trim()) return { ok: false, error: 'empty content' }
      const { error } = await supabase.from('support_messages').insert({
        thread_id: threadId,
        sender_id: adminProfileId,
        sender_role: 'admin',
        content: content.trim(),
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },
    [adminProfileId],
  )

  const updateStatus = useCallback(
    async (threadId: string, status: SupportStatus): Promise<SendResult> => {
      const { error } = await supabase
        .from('support_threads')
        .update({ status })
        .eq('id', threadId)
      if (error) return { ok: false, error: error.message }
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, status } : t)),
      )
      return { ok: true }
    },
    [],
  )

  return {
    threads,
    messagesByThread,
    counts,
    loading,
    demoMode,
    reply,
    updateStatus,
    refetch: loadAll,
  }
}
