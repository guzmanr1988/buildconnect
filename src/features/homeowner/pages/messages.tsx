import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, FileText, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_MESSAGES, MOCK_LEADS, MOCK_VENDORS, MOCK_HOMEOWNERS } from '@/lib/mock-data'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import type { Message } from '@/types'

const quickReplies = ['Sounds good!', "I'll confirm shortly", 'Can you send details?', "What's the timeline?"]

export function HomeownerMessagesPage() {
  const profile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const isMobile = useMobile()
  const userLeads = MOCK_LEADS.filter((l) => l.homeowner_id === profile.id)
  const [selectedLeadId, setSelectedLeadId] = useState(isMobile ? '' : userLeads[0]?.id || '')
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES)
  const [showTyping, setShowTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const leadMessages = messages.filter((m) => m.lead_id === selectedLeadId)
  const selectedLead = userLeads.find((l) => l.id === selectedLeadId)
  const vendor = MOCK_VENDORS.find((v) => v.id === selectedLead?.vendor_id)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [leadMessages.length, showTyping])

  const sendMessage = (content: string) => {
    if (!content.trim()) return
    const msg: Message = {
      id: `m-${Date.now()}`,
      lead_id: selectedLeadId,
      sender_id: profile.id,
      content,
      message_type: 'text',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, msg])
    setNewMessage('')

    // Simulate typing indicator
    setShowTyping(true)
    setTimeout(() => setShowTyping(false), 2000)
  }

  const showList = !isMobile || !selectedLeadId
  const showChat = !isMobile || !!selectedLeadId

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold font-heading text-foreground">Messages</h1>

      <div className="flex h-[calc(100vh-220px)] overflow-hidden rounded-xl border border-border bg-card">
        {/* Conversation List */}
        {showList && (
          <div className={cn('flex flex-col border-r border-border', isMobile ? 'w-full' : 'w-72 shrink-0')}>
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium font-heading text-foreground">Conversations</p>
            </div>
            <ScrollArea className="flex-1">
              {userLeads.map((lead) => {
                const v = MOCK_VENDORS.find((vn) => vn.id === lead.vendor_id)
                const lastMsg = messages.filter((m) => m.lead_id === lead.id).pop()
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b border-border/50 min-h-[64px]',
                      selectedLeadId === lead.id && 'bg-primary/5 border-l-2 border-l-primary'
                    )}
                  >
                    {v && <AvatarInitials initials={v.initials} color={v.avatar_color} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate text-foreground">{v?.company || 'Vendor'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lastMsg?.content || lead.project}
                      </p>
                    </div>
                  </button>
                )
              })}
            </ScrollArea>
          </div>
        )}

        {/* Chat Area */}
        {showChat && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {selectedLeadId && vendor ? (
              <>
                {/* Chat Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  {isMobile && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setSelectedLeadId('')}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="sm" />
                  <div>
                    <p className="font-semibold text-sm text-foreground">{vendor.company}</p>
                    <p className="text-xs text-muted-foreground">{selectedLead?.project}</p>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="flex flex-col gap-3">
                    {leadMessages.map((msg) => {
                      const isMe = msg.sender_id === profile.id
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn('flex', isMe ? 'justify-end' : 'justify-start')}
                        >
                          {msg.message_type === 'quote' && msg.quote_data ? (
                            <Card className="max-w-[85%] sm:max-w-[70%]">
                              <CardContent className="flex flex-col gap-2 p-3">
                                <div className="flex items-center gap-1 text-xs font-medium text-primary font-heading">
                                  <FileText className="h-3 w-3" /> Quote
                                </div>
                                {msg.quote_data.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">{item.name}</span>
                                    <span className="font-medium text-foreground">${item.price.toLocaleString()}</span>
                                  </div>
                                ))}
                                <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                                  <span className="text-foreground">Total</span>
                                  <span className="text-primary">${msg.quote_data.total.toLocaleString()}</span>
                                </div>
                              </CardContent>
                            </Card>
                          ) : (
                            <div
                              className={cn(
                                'max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm',
                                isMe
                                  ? 'bg-primary text-primary-foreground rounded-br-md'
                                  : 'bg-muted text-foreground rounded-bl-md'
                              )}
                            >
                              {msg.content}
                            </div>
                          )}
                        </motion.div>
                      )
                    })}

                    {/* Typing indicator */}
                    <AnimatePresence>
                      {showTyping && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="flex justify-start"
                        >
                          <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3 rounded-bl-md">
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="h-2 w-2 rounded-full bg-muted-foreground/50"
                                animate={{ y: [0, -4, 0] }}
                                transition={{
                                  duration: 0.6,
                                  repeat: Infinity,
                                  delay: i * 0.15,
                                }}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>

                {/* Quick Replies */}
                <div className="flex gap-2 px-4 py-2 overflow-x-auto border-t border-border/50">
                  {quickReplies.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => sendMessage(reply)}
                      className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[32px]"
                    >
                      {reply}
                    </button>
                  ))}
                </div>

                {/* Input */}
                <div className="flex items-center gap-2 p-3 border-t border-border">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage(newMessage)
                      }
                    }}
                    className="h-11 flex-1"
                  />
                  <Button size="icon-lg" onClick={() => sendMessage(newMessage)} disabled={!newMessage.trim()} className="shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="text-center">
                  <Send className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Select a conversation to start messaging
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
