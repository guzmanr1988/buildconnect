// My Referrals & Rewards card — homeowner profile page, sits directly below
// the Banking / Payouts square.
//
// Data sources (merged, deduped by referral id):
//   1. Supabase: referral_attributions JOIN profiles + referral_qualifying_events
//      + referral_payouts WHERE referrer_id = profile.id  (real signed-up friends)
//   2. useReferralStore: locally-persisted 'invited' entries from the home.tsx form
//      (friends who have been sent an invite but haven't signed up yet)
//
// Demo gating (LIVE-SAFE):
//   Demo/QA personas (profile.id starts with 'qa-persona-' or 'ho-1') see seeded
//   sample data. Real homeowners see empty state until real referrals flow in.
//
// Status pipeline: invited → signed_up → hired → paid
//   - invited     = sent invite via the form (local store only)
//   - signed_up   = in referral_attributions (joined Supabase)
//   - hired       = referral_qualifying_events row exists
//   - paid        = referral_payouts.status = 'paid'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Gift, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useReferralStore, type LocalReferral } from '@/stores/referral-store'

// ---- types ----

type ReferralStatus = 'invited' | 'signed_up' | 'hired' | 'paid'

type ReferralEntry = {
  id: string
  displayName: string
  contact: string
  status: ReferralStatus
  invitedAt: string | null
  paidBonusCents: number | null
  projectDescription: string | null
  paidAt: string | null
}

// ---- demo seed data (QA / demo personas ONLY) ----

const DEMO_REFERRALS: ReferralEntry[] = [
  {
    id: 'demo-ref-1',
    displayName: 'Jane Williams',
    contact: 'jane.williams@email.com',
    status: 'paid',
    invitedAt: '2026-05-01T10:00:00Z',
    paidBonusCents: 50000,
    projectDescription: "Jane's roofing project",
    paidAt: '2026-06-10T14:00:00Z',
  },
  {
    id: 'demo-ref-2',
    displayName: 'Marcus Taylor',
    contact: 'marcus.taylor@email.com',
    status: 'hired',
    invitedAt: '2026-05-10T09:00:00Z',
    paidBonusCents: null,
    projectDescription: null,
    paidAt: null,
  },
  {
    id: 'demo-ref-3',
    displayName: 'Sofia Chen',
    contact: 'sofia.chen@email.com',
    status: 'signed_up',
    invitedAt: '2026-05-20T16:00:00Z',
    paidBonusCents: null,
    projectDescription: null,
    paidAt: null,
  },
  {
    id: 'demo-ref-4',
    displayName: 'David Park',
    contact: '(305) 555-0188',
    status: 'invited',
    invitedAt: '2026-06-12T11:30:00Z',
    paidBonusCents: null,
    projectDescription: null,
    paidAt: null,
  },
]

// ---- status pill ----

const STATUS_CONFIG: Record<ReferralStatus, { label: string; className: string; dotDone: boolean }> = {
  invited: {
    label: 'Invited',
    className: 'bg-muted text-muted-foreground',
    dotDone: false,
  },
  signed_up: {
    label: 'Signed up',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
    dotDone: false,
  },
  hired: {
    label: 'Hired a contractor',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    dotDone: false,
  },
  paid: {
    label: 'Paid',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    dotDone: true,
  },
}

function StatusPill({ status }: { status: ReferralStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', cfg.className)}
      data-testid="referral-status-pill"
      data-status={status}
    >
      {cfg.dotDone
        ? <CheckCircle2 className="h-3 w-3" />
        : <Circle className="h-3 w-3" />}
      {cfg.label}
    </span>
  )
}

function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

// ---- helpers ----

function isDemoPersona(profileId: string | undefined): boolean {
  if (!profileId) return false
  return profileId.startsWith('qa-persona-') || profileId === 'ho-1'
}

function localToEntry(r: LocalReferral): ReferralEntry {
  return {
    id: r.id,
    displayName: `${r.firstName} ${r.lastName}`.trim(),
    contact: r.email || r.phone,
    status: r.status,
    invitedAt: r.invitedAt,
    paidBonusCents: null,
    projectDescription: null,
    paidAt: null,
  }
}

// ---- main component ----

export function MyReferralsCard() {
  const profile = useAuthStore((s) => s.profile)
  const localReferrals = useReferralStore((s) =>
    profile?.id ? (s.referralsByReferrer[profile.id] ?? []) : []
  )

  const [entries, setEntries] = useState<ReferralEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return }

    if (isDemoPersona(profile.id)) {
      // Demo path — seed data merged with any locally-added invites
      const localEntries = localReferrals.map(localToEntry)
      const allIds = new Set(DEMO_REFERRALS.map((d) => d.id))
      const uniqueLocal = localEntries.filter((e) => !allIds.has(e.id))
      setEntries([...DEMO_REFERRALS, ...uniqueLocal])
      setLoading(false)
      return
    }

    // Real user path — query Supabase
    let cancelled = false
    async function load() {
      setLoading(true)

      // 1. referral_attributions WHERE referrer_id = profile.id
      const { data: attrs } = await supabase
        .from('referral_attributions')
        .select('referee_id, attributed_at')
        .eq('referrer_id', profile!.id)

      if (cancelled) return

      const supabaseEntries: ReferralEntry[] = []

      if (attrs && attrs.length > 0) {
        const refereeIds = attrs.map((a) => a.referee_id as string)

        // 2. profiles for display names
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .in('id', refereeIds)

        // 3. qualifying events (hired a contractor)
        const { data: eventsData } = await supabase
          .from('referral_qualifying_events')
          .select('referee_id, occurred_at, amount_context_cents')
          .in('referee_id', refereeIds)
          .order('occurred_at', { ascending: false })

        // 4. payouts (paid)
        const { data: payoutsData } = await supabase
          .from('referral_payouts')
          .select('referee_id, bonus_cents, status, paid_at')
          .eq('referrer_id', profile!.id)
          .in('referee_id', refereeIds)

        if (cancelled) return

        type ProfileRow = { id: string; full_name: string | null; email: string | null; phone: string | null }
        type EventRow = { referee_id: string; occurred_at: string; amount_context_cents: number | null }
        type PayoutRow = { referee_id: string; bonus_cents: number; status: string; paid_at: string | null }

        const profileMap = new Map<string, ProfileRow>()
        for (const p of (profilesData ?? []) as ProfileRow[]) profileMap.set(p.id, p)

        const eventMap = new Map<string, EventRow>()
        for (const e of (eventsData ?? []) as EventRow[]) {
          if (!eventMap.has(e.referee_id)) eventMap.set(e.referee_id, e)
        }

        const payoutMap = new Map<string, PayoutRow>()
        for (const p of (payoutsData ?? []) as PayoutRow[]) payoutMap.set(p.referee_id, p)

        for (const attr of attrs) {
          const refereeId = attr.referee_id as string
          const prof = profileMap.get(refereeId)
          const event = eventMap.get(refereeId)
          const payout = payoutMap.get(refereeId)

          let status: ReferralStatus = 'signed_up'
          if (payout?.status === 'paid') status = 'paid'
          else if (event) status = 'hired'

          supabaseEntries.push({
            id: refereeId,
            displayName: prof?.full_name ?? 'Friend',
            contact: prof?.email ?? prof?.phone ?? '',
            status,
            invitedAt: attr.attributed_at as string,
            paidBonusCents: payout?.status === 'paid' ? payout.bonus_cents : null,
            projectDescription: null,
            paidAt: payout?.paid_at ?? null,
          })
        }
      }

      // Merge local 'invited' entries that aren't yet in Supabase
      const supabaseContacts = new Set(supabaseEntries.map((e) => e.contact.toLowerCase()))
      const localEntries = localReferrals
        .map(localToEntry)
        .filter((e) => !supabaseContacts.has(e.contact.toLowerCase()))

      if (!cancelled) {
        setEntries([...supabaseEntries, ...localEntries])
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [profile?.id, localReferrals.length])

  // KPI: total paid
  const paidEntries = entries.filter((e) => e.status === 'paid')
  const totalPaidCents = paidEntries.reduce((s, e) => s + (e.paidBonusCents ?? 0), 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <Card className="mb-6" data-testid="referrals-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2.5">
            <Gift className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-heading">My Referrals & Rewards</CardTitle>
          </div>
          {entries.length > 0 && !loading && (
            <span
              className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
              data-testid="referrals-total"
            >
              {totalPaidCents > 0 ? `${formatCents(totalPaidCents)} earned · ` : ''}{paidEntries.length} paid
            </span>
          )}
        </CardHeader>

        <CardContent className="pt-2">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="referrals-empty-state"
            >
              No referrals yet — refer a friend to start earning.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5" data-testid="referrals-list">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border bg-card/50 p-3 space-y-1.5"
                  data-testid="referral-row"
                  data-referral-id={entry.id}
                  data-referral-status={entry.status}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[14px] font-semibold text-foreground leading-tight">
                      {entry.displayName}
                    </p>
                    <StatusPill status={entry.status} />
                  </div>

                  <p className="text-[11px] text-muted-foreground">{entry.contact}</p>

                  {entry.status === 'paid' && entry.paidBonusCents && (
                    <p
                      className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400"
                      data-testid="referral-payout-line"
                    >
                      You earned {formatCents(entry.paidBonusCents)}
                      {entry.projectDescription ? ` from ${entry.projectDescription}` : ''}
                    </p>
                  )}
                </div>
              ))}

              {totalPaidCents > 0 && (
                <div
                  className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-3 py-2 flex items-center justify-between"
                  data-testid="referrals-earnings-summary"
                >
                  <p className="text-[12px] font-medium text-emerald-800 dark:text-emerald-300">
                    Total earned from referrals
                  </p>
                  <p
                    className="text-[14px] font-bold text-emerald-700 dark:text-emerald-400"
                    data-testid="referrals-total-amount"
                  >
                    {formatCents(totalPaidCents)}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
