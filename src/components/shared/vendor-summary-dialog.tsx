import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, DollarSign, Handshake, Calendar, ArrowUpRight, Pencil } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { MOCK_VENDORS, MOCK_CLOSED_SALES } from '@/lib/mock-data'
import { DEMO_VENDOR_UUID_BY_MOCK_ID } from '@/lib/demo-vendor-ids'
import type { ClosedSale } from '@/types'

// Ship #155 per kratos msg 1776749994465. Shared VendorSummaryDialog for
// /admin/revenue row clicks. Self-contained data resolution from vendorId —
// aggregates closedSales + sentProjects-sold for that vendor and renders
// GMV / commission / deal-count / last-6-months mini-chart / top projects /
// last-activity + edit-commission shortcut to /admin/vendors.

interface VendorSummaryDialogProps {
  open: boolean
  onClose: () => void
  vendorId: string | null
  closedSales: ClosedSale[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function VendorSummaryDialog({ open, onClose, vendorId, closedSales }: VendorSummaryDialogProps) {
  const navigate = useNavigate()
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const vendorCommissionOverrides = useAdminModerationStore((s) => s.vendorCommissionOverrides)

  const vendor = useMemo(
    () => (vendorId ? MOCK_VENDORS.find((v) => v.id === vendorId) : null),
    [vendorId],
  )

  const stats = useMemo(() => {
    if (!vendor) return null
    const uuid = DEMO_VENDOR_UUID_BY_MOCK_ID[vendor.id]
    const vendorClosedSales = uuid ? closedSales.filter((c) => c.vendor_id === uuid) : []
    const vendorMockClosed = MOCK_CLOSED_SALES.filter((c) => c.vendor_id === vendor.id)
    const vendorSentProjectsSold = sentProjects.filter(
      (p) => p.status === 'sold' && p.saleAmount && p.saleAmount > 0 && p.contractor?.company === vendor.company,
    )

    const effectivePct = vendorCommissionOverrides[vendor.id] ?? vendor.commission_pct

    const supabaseGmv = vendorClosedSales.reduce((s, c) => s + c.sale_amount, 0)
    const supabaseComm = vendorClosedSales.reduce((s, c) => s + c.commission, 0)
    const mockGmv = vendorMockClosed.reduce((s, c) => s + c.sale_amount, 0) +
      vendorSentProjectsSold.reduce((s, p) => s + (p.saleAmount ?? 0), 0)
    const mockComm = vendorMockClosed.reduce((s, c) => s + c.commission, 0) +
      vendorSentProjectsSold.reduce((s, p) => s + Math.round((p.saleAmount ?? 0) * (effectivePct / 100)), 0)

    const totalGMV = supabaseGmv + mockGmv
    const totalCommission = supabaseComm + mockComm
    const totalDeals = vendorClosedSales.length + vendorMockClosed.length + vendorSentProjectsSold.length

    // Top projects — sort by sale amount, mix all sources
    type TopProject = { id: string; project: string; customer: string; amount: number; date: string }
    const topProjects: TopProject[] = [
      ...vendorClosedSales.map((c) => ({ id: c.id, project: c.project, customer: c.homeowner_name, amount: c.sale_amount, date: c.closed_at })),
      ...vendorMockClosed.map((c) => ({ id: c.id, project: c.project, customer: c.homeowner_name, amount: c.sale_amount, date: c.closed_at })),
      ...vendorSentProjectsSold.map((p) => ({ id: p.id, project: p.item.serviceName, customer: p.homeowner?.name ?? 'Customer', amount: p.saleAmount ?? 0, date: p.soldAt ?? p.sentAt })),
    ].sort((a, b) => b.amount - a.amount).slice(0, 5)

    const lastActivityIso = [
      ...vendorClosedSales.map((c) => c.closed_at),
      ...vendorMockClosed.map((c) => c.closed_at),
      ...vendorSentProjectsSold.map((p) => p.soldAt ?? p.sentAt),
    ].sort().reverse()[0]

    // Per-month mini-chart (last 6 months) — aggregate commission per month
    const monthlyData: { month: string; commission: number; gmv: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const inRange = (iso: string) => {
        const t = new Date(iso).getTime()
        return t >= d.getTime() && t < end.getTime()
      }
      const monthCommission = [
        ...vendorClosedSales.filter((c) => inRange(c.closed_at)).map((c) => c.commission),
        ...vendorMockClosed.filter((c) => inRange(c.closed_at)).map((c) => c.commission),
        ...vendorSentProjectsSold.filter((p) => p.soldAt && inRange(p.soldAt)).map((p) => Math.round((p.saleAmount ?? 0) * (effectivePct / 100))),
      ].reduce((s, v) => s + v, 0)
      const monthGmv = [
        ...vendorClosedSales.filter((c) => inRange(c.closed_at)).map((c) => c.sale_amount),
        ...vendorMockClosed.filter((c) => inRange(c.closed_at)).map((c) => c.sale_amount),
        ...vendorSentProjectsSold.filter((p) => p.soldAt && inRange(p.soldAt)).map((p) => p.saleAmount ?? 0),
      ].reduce((s, v) => s + v, 0)
      monthlyData.push({
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        commission: monthCommission,
        gmv: monthGmv,
      })
    }

    return {
      totalGMV,
      totalCommission,
      totalDeals,
      topProjects,
      lastActivity: lastActivityIso,
      monthlyData,
      effectivePct,
    }
  }, [vendor, closedSales, sentProjects, vendorCommissionOverrides])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {vendor && stats && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-3">
                <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="md" />
                <div className="flex flex-col">
                  <span className="text-base">{vendor.company}</span>
                  <span className="text-xs font-normal text-muted-foreground">{vendor.name}</span>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {/* Top KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border bg-muted/30 p-3 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total GMV</p>
                  <p className="text-lg font-bold font-heading mt-1">{fmt(stats.totalGMV)}</p>
                </div>
                <div className="rounded-xl border bg-amber-50/50 dark:bg-amber-950/20 p-3 text-center">
                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Commission</p>
                  <p className="text-lg font-bold font-heading mt-1 text-amber-700 dark:text-amber-400">{fmt(stats.totalCommission)}</p>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deals</p>
                  <p className="text-lg font-bold font-heading mt-1">{stats.totalDeals}</p>
                </div>
              </div>

              {/* Commission rate + last activity */}
              <div className="rounded-xl border p-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Commission rate</span>
                  <Badge variant="outline" className="font-semibold">{stats.effectivePct}%</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => { onClose(); navigate('/admin/vendors') }}
                >
                  <Pencil className="h-3 w-3" />
                  Edit on /admin/vendors
                </Button>
              </div>

              {/* 6-month mini-chart */}
              {stats.totalDeals > 0 && (
                <div className="rounded-xl border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last 6 Months</h4>
                    <span className="text-[10px] text-muted-foreground">Commission trend</span>
                  </div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats.monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="vendorMiniGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} className="fill-muted-foreground" />
                        <YAxis hide />
                        <Tooltip
                          formatter={(value: number, name: string) => [fmt(value), name === 'commission' ? 'Commission' : 'GMV']}
                          contentStyle={{
                            borderRadius: '0.5rem',
                            border: '1px solid hsl(var(--border))',
                            backgroundColor: 'hsl(var(--popover))',
                            color: 'hsl(var(--popover-foreground))',
                            fontSize: '11px',
                            padding: '6px 10px',
                          }}
                        />
                        <Area type="monotone" dataKey="commission" stroke="#f59e0b" strokeWidth={2} fill="url(#vendorMiniGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top projects */}
              {stats.topProjects.length > 0 && (
                <div className="rounded-xl border p-3 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Projects</h4>
                  <div className="space-y-1.5">
                    {stats.topProjects.map((proj, idx) => (
                      <div key={proj.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-[13px]">{idx + 1}. {proj.project}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{proj.customer} · {fmtDate(proj.date)}</p>
                        </div>
                        <span className="font-bold text-[13px] shrink-0">{fmt(proj.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Last activity */}
              {stats.lastActivity && (
                <div className="rounded-xl border p-3 flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Last activity:</span>
                  <span className="font-medium">{fmtDate(stats.lastActivity)}</span>
                </div>
              )}

              {/* Empty state */}
              {stats.totalDeals === 0 && (
                <div className="rounded-xl border bg-muted/20 p-6 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No closed deals yet for {vendor.company}.</p>
                </div>
              )}
            </div>
            <Button variant="outline" className="w-full mt-2" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Suppress unused-import lint warnings for icons that land conditional
void Handshake
void DollarSign
void ArrowUpRight
