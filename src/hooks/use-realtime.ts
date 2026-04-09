import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type RealtimeCallback<T> = (payload: { new: T; old: T; eventType: string }) => void

export function useRealtime<T>(
  table: string,
  callback: RealtimeCallback<T>,
  filter?: string
) {
  useEffect(() => {
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter,
        },
        (payload) => {
          callback({
            new: payload.new as T,
            old: payload.old as T,
            eventType: payload.eventType,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter, callback])
}
