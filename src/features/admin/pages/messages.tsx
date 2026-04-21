import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import { MessageSquare, Send, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { useAdminMessagesStore } from '@/stores/admin-messages-store'
import { useRefetchOnFocus } from '@/lib/hooks/use-refetch-on-focus'
import { matchesSearch } from '@/lib/search-match'
import { cn } from '@/lib/utils'
import type { Vendor } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
} satisfies Variants

export default function AdminMessagesPage() {
  const [searchParams] = useSearchParams()
  const vendorParam = searchParams.get('vendor')
  const initialVendor = vendorParam ? MOCK_VENDORS.find((v) => v.id === vendorParam) || MOCK_VENDORS[0] : MOCK_VENDORS[0]
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(initialVendor)
  const [messageText, setMessageText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const allMessages = useAdminMessagesStore((s) => s.messages)
  const addMessage = useAdminMessagesStore((s) => s.addMessage)

  // Cross-tab rehydrate so messages sent from vendor/homeowner surface on
  // admin tab-back. Phase 2c admin-SoT per kratos msg 1776725610193.
  const rehydrateMessages = useCallback(() => useAdminMessagesStore.persist.rehydrate(), [])
  useRefetchOnFocus(rehydrateMessages)

  const filteredVendors = useMemo(() => {
    if (!searchQuery.trim()) return MOCK_VENDORS
    return MOCK_VENDORS.filter((v) =>
      matchesSearch({
        query: searchQuery,
        fields: [v.company, v.name, v.email, v.address],
        phones: [v.phone],
        ids: [v.id],
      }),
    )
  }, [searchQuery])

  const currentMessages = useMemo(
    () => selectedVendor ? allMessages.filter((m) => m.vendorId === selectedVendor.id).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : [],
    [allMessages, selectedVendor]
  )

  const getLastMessage = (vendorId: string) => {
    const msgs = allMessages.filter((m) => m.vendorId === vendorId)
    if (msgs.length === 0) return null
    return msgs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
  }

  const getUnreadCount = (vendorId: string) => {
    const msgs = allMessages.filter((m) => m.vendorId === vendorId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    if (msgs.length === 0) return 0
    let count = 0
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!msgs[i].isAdmin) count++
      else break
    }
    return count
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [currentMessages.length, selectedVendor])

  const sendMessage = () => {
    if (!messageText.trim() || !selectedVendor) return
    addMessage({
      vendorId: selectedVendor.id,
      senderId: 'admin-1',
      senderName: 'Admin',
      content: messageText.trim(),
      isAdmin: true,
    })
    setMessageText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="space-y-6">
      <PageHeader title="Messages" description="Conversations with vendors" />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Vendor List */}
        <Card className="rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search company, name, email, phone, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredVendors.map((vendor) => {
              const lastMsg = getLastMessage(vendor.id)
              const unread = getUnreadCount(vendor.id)
              const isSelected = selectedVendor?.id === vendor.id
              return (
                <button
                  key={vendor.id}
                  onClick={() => setSelectedVendor(vendor)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 text-left border-b transition-colors hover:bg-muted/50',
                    isSelected && 'bg-primary/5 border-l-2 border-l-primary'
                  )}
                >
                  <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold truncate">{vendor.company}</p>
                      {unread > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shrink-0">
                          {unread}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{vendor.name}</p>
                    {lastMsg && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {lastMsg.isAdmin ? 'You: ' : ''}{lastMsg.content}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Chat Area */}
        <Card className="rounded-xl shadow-sm flex flex-col overflow-hidden">
          {selectedVendor ? (
            <>
              <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
                <AvatarInitials initials={selectedVendor.initials} color={selectedVendor.avatar_color} size="sm" />
                <div>
                  <p className="text-sm font-semibold">{selectedVendor.company}</p>
                  <p className="text-xs text-muted-foreground">{selectedVendor.name} · {selectedVendor.phone}</p>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {currentMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                    <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Send a message to start the conversation</p>
                  </div>
                ) : (
                  currentMessages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.isAdmin ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[75%] rounded-2xl px-4 py-2.5',
                          msg.isAdmin
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted rounded-bl-md'
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn(
                          'text-[10px] mt-1',
                          msg.isAdmin ? 'text-primary-foreground/60' : 'text-muted-foreground'
                        )}>
                          {fmtTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t bg-background">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="resize-none min-h-[40px] max-h-[120px]"
                  />
                  <Button
                    size="icon"
                    disabled={!messageText.trim()}
                    onClick={sendMessage}
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
                <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a vendor to view messages</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
