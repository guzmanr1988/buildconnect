import { useState, useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Send, FileText, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { EmptyState } from '@/components/shared/empty-state'
import { MOCK_MESSAGES, MOCK_LEADS, MOCK_HOMEOWNERS, MOCK_VENDORS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { Message, Lead } from '@/types'

const VENDOR_ID = 'v-1'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  const vendor = MOCK_VENDORS.find((v) => v.id === VENDOR_ID)!

  // Get all leads for this vendor that have messages
  const vendorLeads = useMemo(() => MOCK_LEADS.filter((l) => l.vendor_id === VENDOR_ID), [])
  const leadIds = useMemo(() => new Set(vendorLeads.map((l) => l.id)), [vendorLeads])
  const relevantMessages = useMemo(() => MOCK_MESSAGES.filter((m) => leadIds.has(m.lead_id)), [leadIds])

  // Group messages by lead
  const threadLeads = useMemo(() => {
    const leadIdsWithMessages = [...new Set(relevantMessages.map((m) => m.lead_id))]
    return leadIdsWithMessages
      .map((id) => vendorLeads.find((l) => l.id === id)!)
      .filter(Boolean)
  }, [relevantMessages, vendorLeads])

  const [activeLead, setActiveLead] = useState<Lead | null>(threadLeads[0] || null)
  const [messages, setMessages] = useState<Message[]>(relevantMessages)
  const [input, setInput] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteItems, setQuoteItems] = useState([{ name: '', price: '' }])
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeMessages = useMemo(
    () => (activeLead ? messages.filter((m) => m.lead_id === activeLead.id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : []),
    [messages, activeLead]
  )

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeMessages.length])

  const sendMessage = (text: string) => {
    if (!text.trim() || !activeLead) return
    const newMsg: Message = {
      id: `m-new-${Date.now()}`,
      lead_id: activeLead.id,
      sender_id: VENDOR_ID,
      content: text.trim(),
      message_type: 'text',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, newMsg])
    setInput('')
  }

  const sendQuote = () => {
    if (!activeLead) return
    const validItems = quoteItems.filter((i) => i.name.trim() && i.price.trim())
    if (validItems.length === 0) return

    const items = validItems.map((i) => ({ name: i.name, price: parseFloat(i.price) || 0 }))
    const total = items.reduce((s, i) => s + i.price, 0)

    const newMsg: Message = {
      id: `m-quote-${Date.now()}`,
      lead_id: activeLead.id,
      sender_id: VENDOR_ID,
      content: '',
      message_type: 'quote',
      quote_data: { items, total },
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, newMsg])
    setQuoteOpen(false)
    setQuoteItems([{ name: '', price: '' }])
  }

  const addQuoteLine = () => {
    setQuoteItems((prev) => [...prev, { name: '', price: '' }])
  }

  const updateQuoteLine = (index: number, field: 'name' | 'price', value: string) => {
    setQuoteItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const isVendorMsg = (msg: Message) => msg.sender_id === VENDOR_ID

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  }

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
            {threadLeads.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No conversations yet</p>
            ) : (
              <div className="space-y-1">
                {threadLeads.map((lead) => {
                  const lastMsg = messages
                    .filter((m) => m.lead_id === lead.id)
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                  const isActive = activeLead?.id === lead.id
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setActiveLead(lead)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-muted/80',
                        isActive && 'bg-muted'
                      )}
                    >
                      <AvatarInitials
                        initials={lead.homeowner_name.split(' ').map((n) => n[0]).join('')}
                        color="#64748b"
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{lead.homeowner_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lastMsg?.message_type === 'quote' ? 'Quote sent' : lastMsg?.content || 'No messages'}
                        </p>
                      </div>
                      {lastMsg && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(lastMsg.created_at)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="rounded-xl shadow-sm flex flex-col">
          {activeLead ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 p-4 border-b">
                <AvatarInitials
                  initials={activeLead.homeowner_name.split(' ').map((n) => n[0]).join('')}
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
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: '420px' }}>
                {activeMessages.map((msg) => {
                  const fromVendor = isVendorMsg(msg)
                  return (
                    <div key={msg.id} className={cn('flex', fromVendor ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-4 py-2.5',
                          fromVendor
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted rounded-bl-md'
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
                          <p className="text-sm">{msg.content}</p>
                        )}
                        <p className={cn('text-[10px] mt-1', fromVendor ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                          {fmtTime(msg.created_at)}
                        </p>
                      </div>
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
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!input.trim()}>
                    <Send className="h-4 w-4" />
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
