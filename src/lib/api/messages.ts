import { supabase } from '@/lib/supabase'
import type { Message } from '@/types'

export async function getMessages(leadId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as Message[]
}

export async function sendMessage(message: Omit<Message, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('messages')
    .insert(message)
    .select()
    .single()
  if (error) throw error
  return data as Message
}

export async function getUnreadCount(userId: string) {
  // In a real app, this would track read status per user
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .neq('sender_id', userId)
  if (error) throw error
  return count ?? 0
}
