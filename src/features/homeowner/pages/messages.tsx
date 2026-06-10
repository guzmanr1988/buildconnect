import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, FileText, ArrowLeft, SquarePen, Search, Check, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS, MOCK_HOMEOWNERS } from '@/lib/mock-data'
import { useEffectiveLeads } from '@/lib/hooks/use-effective-leads'
import { useLeadConversation } from '@/lib/hooks/use-lead-conversation'
import { useMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const quickReplies = ['Sounds good!', "I'll confirm shortly", 'Can you send details?', "What's the timeline?"]

const PLATFORM_RECIPIENT = {
  id: 'platform',
  company: 'BuildConnect',
  initials: 'BC',
  avatar_color: '#2f6cf0',
  subtitle: 'Support & announcements',
}

export function HomeownerMessagesPage() {
  // Wave-9 9a — real-mode reads the homeowner's real leads + real messages
  // via useEffectiveLeads + useLeadConversation. ?demo=1 falls back to mock
  // through the same hooks (demoDataHidden flag still honored inside).
  // MOCK_HOMEOWNERS[0] kept as no-auth profile fallback (identity-shim).
  const profile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const isMobile = useMobile()
  const userLeads = useEffectiveLeads('homeowner', profile.id)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [showTyping, setShowTyping] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeSearch, setComposeSearch] = useState('')
  const [composeSelected, setComposeSelected] = useState<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const { messages: leadMessages, sendMessage: sendMsg } = useLeadConversation(
    selectedLeadId || null,
    profile.id,
  )
  const selectedLead = userLeads.find((l) => l.id === selectedLeadId)
  // Wave-9 9b — vendor display resolves from MOCK_VENDORS (demo path) OR
  // from the frozen contractor.company snapshot carried on the LeadThread
  // (real-mode where vendor_id is a real auth.uid with no MOCK_VENDORS row).
  const isPlatformSelected = selectedLeadId === 'platform'
  const mockVendor = MOCK_VENDORS.find((v) => v.id === selectedLead?.vendor_id)
  const vendorDisplay = selectedLeadId && !isPlatformSelected
    ? {
        company: mockVendor?.company || selectedLead?.contractor_company || 'Contractor',
        initials: mockVendor?.initials || selectedLead?.contractor_initials || '?',
        avatar_color: mockVendor?.avatar_color || selectedLead?.contractor_avatar_color || '#64748b',
      }
    : null

  const contractorRecipients = userLeads.map((lead) => {
    const v = MOCK_VENDORS.find((vn) => vn.id === lead.vendor_id)
    return {
      id: lead.id,
      company: v?.company || lead.contractor_company || 'Contractor',
      initials: v?.initials || lead.contractor_initials || '?',
      avatar_color: v?.avatar_color || lead.contractor_avatar_color || '#64748b',
      subtitle: lead.project,
    }
  })
  const allRecipients = [PLATFORM_RECIPIENT, ...contractorRecipients]
  const filteredRecipients = composeSearch.trim()
    ? allRecipients.filter((r) => r.company.toLowerCase().includes(composeSearch.toLowerCase()))
    : allRecipients

  // Desktop default-select first lead once leads arrive.
  useEffect(() => {
    if (isMobile) return
    if (!selectedLeadId && userLeads.length > 0) {
      setSelectedLeadId(userLeads[0].id)
    }
  }, [isMobile, selectedLeadId, userLeads])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [leadMessages.length, showTyping])

  const sendMessage = async (content: string) => {
    if (!content.trim()) return
    await sendMsg(content)
    setNewMessage('')
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
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium font-heading text-foreground">Conversations</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setComposeOpen(true)}
                aria-label="New conversation"
                data-compose-trigger="true"
              >
                <SquarePen className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {userLeads.map((lead) => {
                const v = MOCK_VENDORS.find((vn) => vn.id === lead.vendor_id)
                const initials = v?.initials || lead.contractor_initials || '?'
                const color = v?.avatar_color || lead.contractor_avatar_color || '#64748b'
                const company = v?.company || lead.contractor_company || 'Contractor'
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
                    <AvatarInitials initials={initials} color={color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate text-foreground">{company}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.project}
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
            {selectedLeadId && vendorDisplay ? (
              <>
                {/* Chat Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  {isMobile && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setSelectedLeadId('')}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <AvatarInitials initials={vendorDisplay.initials} color={vendorDisplay.avatar_color} size="sm" />
                  <div>
                    <p className="font-semibold text-sm text-foreground">{vendorDisplay.company}</p>
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
              <>
                {isPlatformSelected && (
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    {isMobile && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setSelectedLeadId('')}>
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <AvatarInitials initials="BC" color="#2f6cf0" size="sm" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">BuildConnect</p>
                      <p className="text-xs text-muted-foreground">Support & announcements</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-1 items-center justify-center p-8">
                  <div className="text-center max-w-xs">
                    {isPlatformSelected ? (
                      <>
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <MessageSquare className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">BuildConnect Support</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Your message will be reviewed by our team. We will reply shortly.
                        </p>
                      </>
                    ) : (
                      <>
                        <Send className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                          Select a conversation to start messaging
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={composeOpen}
        onOpenChange={(open) => {
          setComposeOpen(open)
          if (!open) {
            setComposeSearch('')
            setComposeSelected([])
          }
        }}
      >
        <DialogContent className="sm:max-w-md" data-compose-dialog="true">
          <DialogHeader>
            <DialogTitle className="font-heading">New Conversation</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={composeSearch}
              onChange={(e) => setComposeSearch(e.target.value)}
              placeholder="Search by company name..."
              className="pl-9"
              data-compose-search="true"
              autoFocus
            />
          </div>

          <ScrollArea className="max-h-64">
            <div className="flex flex-col gap-1 pr-2">
              {filteredRecipients.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No contacts found</p>
              ) : (
                filteredRecipients.map((r) => {
                  const selected = composeSelected.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      data-compose-recipient={r.id}
                      data-compose-selected={selected ? 'true' : 'false'}
                      onClick={() =>
                        setComposeSelected((prev) =>
                          prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]
                        )
                      }
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors w-full',
                        selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/60'
                      )}
                    >
                      <AvatarInitials initials={r.initials} color={r.avatar_color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.company}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setComposeOpen(false)
                setComposeSearch('')
                setComposeSelected([])
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={composeSelected.length === 0}
              data-compose-start="true"
              onClick={() => {
                if (composeSelected.length === 0) return
                const first = composeSelected[0]
                setSelectedLeadId(first)
                setComposeOpen(false)
                setComposeSearch('')
                setComposeSelected([])
              }}
            >
              Start Conversation{composeSelected.length > 1 ? ` (${composeSelected.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
