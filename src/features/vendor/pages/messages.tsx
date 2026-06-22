import { useState, useRef, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Send, FileText, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { EmptyState } from '@/components/shared/empty-state'
import { useEffectiveLeads } from '@/lib/hooks/use-effective-leads'
import { useLeadConversation } from '@/lib/hooks/use-lead-conversation'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { deriveInitials } from '@/lib/initials'

// Wave-18 #3 — Mock-scope vendor key (legacy identity-shim) retained as the
// real-mode fallback when no auth profile is resolved. The admin-thread tab
// (useAdminMessagesStore + hardcoded SEED) was retired in wave-18 #3; vendor
// ↔ admin chat now lives on the lead-scoped messages table (admin sees it
// via the Live Conversations feed on /admin/messages).
const VENDOR_ID = 'v-1'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const QUICK_REPLIES = [
  "I'll confirm shortly",
  'Site visit confirmed',
  'Let me prepare a quote',
]

export default function VendorMessages() {
  const profile = useAuthStore((s) => s.profile)
  const vendorIdentity = profile?.id ?? VENDOR_ID

  const threadLeads = useEffectiveLeads('vendor', vendorIdentity)

  const [activeThread, setActiveThread] = useState<string>('')
  const activeLead = threadLeads.find((l) => l.id === activeThread) || null
  const [input, setInput] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteItems, setQuoteItems] = useState([{ name: '', price: '' }])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-select first lead once threads arrive.
  useEffect(() => {
    if (!activeThread && threadLeads.length > 0) {
      setActiveThread(threadLeads[0].id)
    }
  }, [activeThread, threadLeads])

  const { messages: activeMessages, sendMessage: sendLeadMessage } = useLeadConversation(
    activeLead?.id || null,
    vendorIdentity,
  )

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeMessages.length, activeThread])

  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    if (!activeLead) return
    await sendLeadMessage(text.trim())
    setInput('')
  }

  const sendQuote = async () => {
    if (!activeLead) return
    const validItems = quoteItems.filter((i) => i.name.trim() && i.price.trim())
    if (validItems.length === 0) return

    const items = validItems.map((i) => ({ name: i.name, price: parseFloat(i.price) || 0 }))
    const total = items.reduce((s, i) => s + i.price, 0)

    await sendLeadMessage('', { message_type: 'quote', quote_data: { items, total } })
    setQuoteOpen(false)
    setQuoteItems([{ name: '', price: '' }])
  }

  const addQuoteLine = () => {
    setQuoteItems((prev) => [...prev, { name: '', price: '' }])
  }

  const updateQuoteLine = (index: number, field: 'name' | 'price', value: string) => {
    setQuoteItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const isVendorMsg = (msg: { sender_id: string }) => msg.sender_id === vendorIdentity

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  } satisfies Variants

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Messages" description="Chat with homeowners about their projects" />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[600px]">
        {/* Thread List */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-1">
              {threadLeads.length > 0 && (
                <div className="px-3 pt-2 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Homeowners</p>
                </div>
              )}
              {threadLeads.map((lead) => {
                const isActive = activeThread === lead.id
                return (
                  <button
                    key={lead.id}
                    onClick={() => setActiveThread(lead.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-muted/80',
                      isActive && 'bg-muted'
                    )}
                  >
                    <AvatarInitials
                      initials={deriveInitials(lead.homeowner_name)}
                      color="#64748b"
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{lead.homeowner_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{lead.project}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="rounded-xl shadow-sm flex flex-col">
          {activeLead ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 p-4 border-b">
                <AvatarInitials
                  initials={deriveInitials(activeLead.homeowner_name)}
                  color="#64748b"
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{activeLead.homeowner_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{activeLead.project}</p>
                </div>
                <Badge variant="outline" className="ml-auto text-xs shrink-0">{activeLead.id}</Badge>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0" style={{ maxHeight: '420px' }}>
                {activeMessages.map((msg, idx) => {
                  const fromVendor = isVendorMsg(msg)
                  const lastSentIdx = activeMessages.reduce((acc, m, i) => isVendorMsg(m) ? i : acc, -1)
                  const isLastSent = fromVendor && idx === lastSentIdx
                  return (
                    <div key={msg.id} className={cn('flex flex-col', fromVendor ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'max-w-[75%] rounded-[20px] px-4 py-2.5',
                          fromVendor
                            ? 'bg-[#007AFF] text-white rounded-br-[4px]'
                            : 'bg-gray-100 dark:bg-[#3A3A3C] text-foreground rounded-bl-[4px]'
                        )}
                      >
                        {msg.message_type === 'quote' && msg.quote_data ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 mb-2">
                              <FileText className="h-3.5 w-3.5" />
                              <span className="text-xs font-semibold uppercase tracking-wider">Quote</span>
                            </div>
                            <div className={cn('rounded-lg p-3 space-y-1.5 text-sm', fromVendor ? 'bg-white/10' : 'bg-background')}>
                              {msg.quote_data.items.map((item, i) => (
                                <div key={i} className="flex justify-between gap-4">
                                  <span className="truncate">{item.name}</span>
                                  <span className="font-semibold shrink-0">{fmt(item.price)}</span>
                                </div>
                              ))}
                              <Separator className={fromVendor ? 'bg-white/20' : ''} />
                              <div className="flex justify-between font-bold">
                                <span>Total</span>
                                <span>{fmt(msg.quote_data.total)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[17px] leading-snug">{msg.content}</p>
                        )}
                      </div>
                      <p className={cn('text-[11px] mt-0.5 text-muted-foreground px-1', fromVendor ? 'text-right' : 'text-left')}>
                        {isLastSent ? 'Delivered' : fmtTime(msg.created_at)}
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Quick Replies */}
              <div className="px-4 py-2 border-t flex gap-2 overflow-x-auto">
                {QUICK_REPLIES.map((text) => (
                  <Button
                    key={text}
                    variant="outline"
                    size="sm"
                    className="text-xs whitespace-nowrap shrink-0"
                    onClick={() => sendMessage(text)}
                  >
                    {text}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs whitespace-nowrap shrink-0"
                  onClick={() => setQuoteOpen(true)}
                >
                  <FileText className="h-3 w-3 mr-1" /> Send Quote
                </Button>
              </div>

              {/* Input */}
              <div className="p-4 border-t">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    sendMessage(input)
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 text-[17px]"
                    aria-label="Type a message"
                  />
                  <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send message">
                    <Send className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                description="Choose a thread from the left to start messaging."
              />
            </div>
          )}
        </Card>
      </div>

      {/* Quote Composer Dialog */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Compose Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {quoteItems.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px] gap-2">
                <Input
                  value={item.name}
                  onChange={(e) => updateQuoteLine(i, 'name', e.target.value)}
                  placeholder="Line item name"
                />
                <Input
                  type="number"
                  value={item.price}
                  onChange={(e) => updateQuoteLine(i, 'price', e.target.value)}
                  placeholder="$ Price"
                  step="0.01"
                  min="0"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addQuoteLine} className="w-full">
              + Add Line Item
            </Button>
            {quoteItems.some((i) => i.name && i.price) && (
              <div className="flex justify-between items-center px-1 pt-2 border-t">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="text-lg font-bold font-heading">
                  {fmt(quoteItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0))}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteOpen(false)}>Cancel</Button>
            <Button onClick={sendQuote} disabled={!quoteItems.some((i) => i.name.trim() && i.price.trim())}>
              <Send className="h-4 w-4 mr-1" /> Send Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
