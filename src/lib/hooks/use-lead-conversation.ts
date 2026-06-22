// Wave-9 9a — lead-scoped conversation: real-mode reads + sends + listens to
// the messages table; demo-mode reads MOCK_MESSAGES through the existing
// demoDataHidden-aware hook with a local overlay for in-session demo sends so
// the chat feels live without persisting to Supabase. Supabase realtime
// publication already includes the messages table (see migration 005).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useEffectiveMockMessages } from '@/lib/mock-data-effective'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import type { Message, QuoteData } from '@/types'

type SendOptions = {
  message_type?: 'text' | 'quote'
  quote_data?: QuoteData
}

export function useLeadConversation(
  leadId: string | null | undefined,
  senderId: string | null | undefined,
) {
  const demoMode = useDemoMode()
  const mockMessages = useEffectiveMockMessages()
  const [realMessages, setRealMessages] = useState<Message[]>([])
  const [demoOverlay, setDemoOverlay] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  // Real-mode fetch on lead change.
  useEffect(() => {
    if (demoMode || !leadId) {
      setRealMessages([])
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[wave-9-9a useLeadConversation] fetch error', error)
          setRealMessages([])
        } else {
          setRealMessages((data as Message[]) || [])
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [demoMode, leadId])

  // Realtime — insert-only subscription scoped to this lead. Channel name is
  // randomised to avoid the supabase-js v2 "subscribe-twice on same topic"
  // gotcha when tabs switch threads quickly.
  useEffect(() => {
    if (demoMode || !leadId) return
    const channel = supabase
      .channel(`messages:${leadId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const next = payload.new as Message
          setRealMessages((prev) =>
            prev.some((m) => m.id === next.id) ? prev : [...prev, next],
          )
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [demoMode, leadId])

  const messages: Message[] = useMemo(() => {
    if (!leadId) return []
    if (demoMode) {
      const base = mockMessages.filter((m) => m.lead_id === leadId)
      const overlay = demoOverlay.filter((m) => m.lead_id === leadId)
      return [...base, ...overlay].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
    }
    return realMessages
  }, [demoMode, leadId, mockMessages, demoOverlay, realMessages])

  const sendMessage = useCallback(
    async (content: string, opts?: SendOptions): Promise<Message | null> => {
      const trimmed = content.trim()
      if (!trimmed || !leadId || !senderId) return null
      const message_type = opts?.message_type ?? 'text'
      if (demoMode) {
        const msg: Message = {
          id: `m-demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          lead_id: leadId,
          sender_id: senderId,
          content: trimmed,
          message_type,
          quote_data: opts?.quote_data,
          created_at: new Date().toISOString(),
        }
        setDemoOverlay((prev) => [...prev, msg])
        return msg
      }
      const insert = {
        lead_id: leadId,
        sender_id: senderId,
        content: trimmed,
        message_type,
        quote_data: opts?.quote_data ?? null,
      }
      const { data, error } = await supabase
        .from('messages')
        .insert(insert)
        .select()
        .single()
      if (error) {
        console.error('[wave-9-9a useLeadConversation] send error', error)
        return null
      }
      const msg = data as Message
      // Optimistic local append — realtime INSERT for self-sent rows can race
      // the insert .select() promise, so de-dupe by id.
      setRealMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      return msg
    },
    [demoMode, leadId, senderId],
  )

  return { messages, sendMessage, demoMode, loading }
}
