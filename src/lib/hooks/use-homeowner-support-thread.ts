// Wave-18 #3 — Platform Support v1 (homeowner side).
//
// Loads the homeowner's open (or most-recent) support thread + messages and
// returns a sendSupportMessage handler. The handler implements the SELECT-or-
// create-with-ON-CONFLICT-23505-fallback pattern: DB unique partial index on
// support_threads(homeowner_id) WHERE status='open' enforces one-open-thread
// per homeowner; the app handles the concurrent-submit race ergonomically by
// re-SELECTing the existing thread on 23505.
//
// Realtime: subscribes to support_messages + support_threads filtered to the
// homeowner's threads (RLS-enforced — homeowner only sees own).

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'

export type SupportStatus = 'open' | 'answered' | 'closed'

export type SupportThread = {
  id: string
  homeowner_id: string
  status: SupportStatus
  subject: string | null
  last_activity_at: string
  created_at: string
}

export type SupportMessage = {
  id: string
  thread_id: string
  sender_id: string
  sender_role: 'homeowner' | 'admin' | 'vendor' | 'account_rep' | 'admin_employee'
  content: string
  created_at: string
}

type SendResult = { ok: true; thread_id: string } | { ok: false; error: string }

export function useHomeownerSupportThread(homeownerId: string | null | undefined) {
  const demoMode = useDemoMode()
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(false)

  const loadThread = useCallback(async () => {
    if (!homeownerId || demoMode) {
      setThread(null)
      setMessages([])
      return
    }
    setLoading(true)
    const { data: threads, error: tErr } = await supabase
      .from('support_threads')
      .select('*')
      .eq('homeowner_id', homeownerId)
      .order('last_activity_at', { ascending: false })
      .limit(1)
    if (tErr) {
      console.error('[wave-18 #3 useHomeownerSupportThread] threads fetch', tErr)
      setLoading(false)
      return
    }
    const latest = (threads?.[0] as SupportThread | undefined) ?? null
    setThread(latest)
    if (!latest) {
      setMessages([])
      setLoading(false)
      return
    }
    const { data: msgs, error: mErr } = await supabase
      .from('support_messages')
      .select('*')
      .eq('thread_id', latest.id)
      .order('created_at', { ascending: true })
    if (mErr) {
      console.error('[wave-18 #3 useHomeownerSupportThread] messages fetch', mErr)
    } else {
      setMessages((msgs ?? []) as SupportMessage[])
    }
    setLoading(false)
  }, [homeownerId, demoMode])

  useEffect(() => {
    loadThread()
  }, [loadThread])

  useEffect(() => {
    if (!homeownerId || demoMode) return
    const channel = supabase
      .channel(`support:homeowner:${homeownerId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        (payload) => {
          const next = payload.new as SupportMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === next.id)) return prev
            if (thread && next.thread_id !== thread.id) return prev
            return [...prev, next]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_threads' },
        (payload) => {
          const next = payload.new as SupportThread
          if (next.homeowner_id !== homeownerId) return
          setThread((prev) => (prev && prev.id === next.id ? next : prev))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [homeownerId, demoMode, thread])

  const sendSupportMessage = useCallback(
    async (content: string): Promise<SendResult> => {
      if (!homeownerId) return { ok: false, error: 'no homeowner identity' }
      if (!content.trim()) return { ok: false, error: 'empty content' }

      let openThread = thread && thread.status === 'open' ? thread : null
      if (!openThread) {
        const { data: existing } = await supabase
          .from('support_threads')
          .select('*')
          .eq('homeowner_id', homeownerId)
          .eq('status', 'open')
          .maybeSingle()
        openThread = (existing as SupportThread | null) ?? null
      }

      if (!openThread) {
        const { data: created, error: createErr } = await supabase
          .from('support_threads')
          .insert({ homeowner_id: homeownerId, status: 'open' })
          .select('*')
          .single()
        if (createErr) {
          if ((createErr as { code?: string }).code === '23505') {
            const { data: raced } = await supabase
              .from('support_threads')
              .select('*')
              .eq('homeowner_id', homeownerId)
              .eq('status', 'open')
              .maybeSingle()
            openThread = (raced as SupportThread | null) ?? null
          } else {
            return { ok: false, error: createErr.message }
          }
        } else {
          openThread = created as SupportThread
        }
      }
      if (!openThread) return { ok: false, error: 'no thread after create+race' }

      const { error: insertErr } = await supabase.from('support_messages').insert({
        thread_id: openThread.id,
        sender_id: homeownerId,
        sender_role: 'homeowner',
        content: content.trim(),
      })
      if (insertErr) return { ok: false, error: insertErr.message }

      setThread(openThread)
      return { ok: true, thread_id: openThread.id }
    },
    [homeownerId, thread],
  )

  return {
    thread,
    messages,
    loading,
    demoMode,
    sendSupportMessage,
    refetch: loadThread,
  }
}
