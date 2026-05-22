import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DollarSign, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useFeatureFlag } from '@/lib/financing/hooks/use-feature-flag'
import { listDrawRequestsForHomeowner, type DrawRequestRow } from '@/lib/api/financing'

function formatCents(c: number): string {
  return `$${Math.round(c / 100).toLocaleString('en-US')}`
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function HomeownerPendingDrawsSection() {
  const enabled = useFeatureFlag('financing_enabled')
  const profile = useAuthStore((s) => s.profile)
  const [draws, setDraws] = useState<DrawRequestRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled || !profile) {
      setLoaded(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const rows = await listDrawRequestsForHomeowner(profile.id, 'sms_pending')
        if (!cancelled) setDraws(rows)
      } catch {
        // tolerate missing draw_requests table during scaffold phase
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, profile])

  if (!enabled || !loaded || draws.length === 0) return null

  return (
    <Card
      className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40"
      data-testid="homeowner-pending-draws-section"
      data-financing-pending-draws
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          {draws.length === 1 ? 'Milestone draw awaiting your approval' : 'Milestone draws awaiting your approval'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {draws.map((d) => (
          <Button
            key={d.id}
            asChild
            variant="outline"
            className="w-full justify-between bg-card"
            data-testid={`homeowner-pending-draw-row-${d.id}`}
          >
            <Link to={`/home/draws/${d.id}/approve${d.sms_token ? `?token=${d.sms_token}` : ''}`}>
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-semibold">{formatCents(d.amount_cents)}</span>
                <span className="text-[10px] text-muted-foreground">Requested {timeAgo(d.created_at)}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}

export default HomeownerPendingDrawsSection
