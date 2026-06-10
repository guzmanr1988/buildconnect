// Wave-9 9a / wave-18 #3 — admin live-feed of real lead-scoped messages.
// RLS "Admins read all messages" allows the SELECT. Wave-18 #3 retired the
// useAdminMessagesStore Zustand send path; leadless homeowner support now
// lives on support_threads/support_messages at /admin/support, and admin↔
// vendor still rides this lead-scoped feed (no dedicated inbox v1).
// Realtime subscription mounts on the messages table with no filter so any
// insert across any lead surfaces immediately.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDemoMode } from '@/lib/hooks/use-demo-mode'
import type { Message } from '@/types'

const RECENT_LIMIT = 50

export function useAdminLiveConversations() {
  const demoMode = useDemoMode()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (demoMode) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[wave-9-9a useAdminLiveConversations] fetch error', error)
          setMessages([])
        } else {
          setMessages((data as Message[]) || [])
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [demoMode])

  useEffect(() => {
    if (demoMode) return
    const channel = supabase
      .channel(`messages:admin-live:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const next = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === next.id)) return prev
            return [next, ...prev].slice(0, RECENT_LIMIT)
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [demoMode])

  return { messages, demoMode, loading }
}
