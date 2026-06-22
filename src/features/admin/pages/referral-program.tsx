// Admin Referral Program — task_1781574212916_604
//
// Tables (stripe-connect-preview, migration 072 by hephaestus):
//   platform_settings (id smallint PK=1, ..., default_referral_bonus_cents int) — singleton
//   referral_bonus_overrides (referrer_id uuid PK, bonus_cents int, reason text, set_by uuid, set_at timestamptz)
//   referral_payouts (id uuid, referrer_id, referee_id, bonus_cents, status, paid_at, created_at)
//   profiles (id, full_name, email)            — referrer lookup
//
// Open-Q defaults (comment each for Rod flip at review):
//   Payout delivery: ACH — TODO: swap to Stripe payout trigger when billing is live
//   Admin gate: admin role only — TODO: flip to 'admin_employee' if broader access needed
//   Per-project trigger: bonus fires per completed referred project — TODO: confirm with Rod
//   Custom amount: preset tiers + free-entry field both available
//
// Payout status flow (v1 = manual admin mark-paid):
//   pending → admin clicks "Mark as Paid" → status='paid', paid_at=now()
//   TODO: wire auto-ACH payout when Stripe Connect payouts are configured

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Gift, Users, Clock, CheckCircle2, Search, ChevronUp, Loader2, Pencil, DollarSign } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

// --- Preset bonus tiers (TODO: Rod can adjust these values at review) ---
const PRESET_CENTS = [25000, 50000, 100000, 200000, 300000] as const
const PRESET_LABELS: Record<number, string> = {
  25000: '$250',
  50000: '$500',
  100000: '$1,000',
  200000: '$2,000',
  300000: '$3,000',
}
const DEFAULT_BONUS_CENTS = 50000

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

type Profile = { id: string; full_name: string | null; email: string | null }

type BonusOverride = {
  referrer_id: string
  bonus_cents: number
  set_at: string
}

type Payout = {
  id: string
  referrer_id: string
  referee_id: string
  bonus_cents: number
  status: 'pending' | 'paid'
  paid_at: string | null
  created_at: string
}

type ReferrerRow = {
  profile: Profile
  override: BonusOverride | null
  payouts: Payout[]
}

type PayoutTone = 'pending' | 'paid' | 'none'

function PayoutBadge({ tone, label }: { tone: PayoutTone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'pending' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        tone === 'paid' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
        tone === 'none' && 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

function KpiCard({
  icon: Icon,
  iconBg,
  value,
  label,
}: {
  icon: typeof Gift
  iconBg: string
  value: string
  label: string
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 flex items-center gap-4" data-testid="admin-referral-stats">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconBg)}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-xl font-bold font-heading text-foreground leading-tight">{value}</p>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function AdminReferralProgramPage() {
  const [defaultBonusCents, setDefaultBonusCents] = useState(DEFAULT_BONUS_CENTS)
  const [pendingDefault, setPendingDefault] = useState<number | null>(null)
  const [customDefaultStr, setCustomDefaultStr] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)

  const [referrers, setReferrers] = useState<ReferrerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Edit panel state per referrer
  const [editOverrideCents, setEditOverrideCents] = useState<number | null>(null)
  const [editCustomStr, setEditCustomStr] = useState('')
  const [editUseCustom, setEditUseCustom] = useState(false)
  const [savingOverride, setSavingOverride] = useState(false)
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      // Load platform_settings singleton for default bonus (migration 072 adds default_referral_bonus_cents)
      const { data: settingsData } = await supabase
        .from('platform_settings')
        .select('default_referral_bonus_cents')
        .eq('id', 1)
        .maybeSingle()
      if (!cancelled && settingsData?.default_referral_bonus_cents) {
        setDefaultBonusCents(settingsData.default_referral_bonus_cents)
      }

      // Load all overrides + payouts + profiles in parallel
      const [overridesRes, payoutsRes] = await Promise.all([
        supabase.from('referral_bonus_overrides').select('referrer_id, bonus_cents, set_at'),
        supabase.from('referral_payouts').select('id, referrer_id, referee_id, bonus_cents, status, paid_at, created_at'),
      ])
      if (cancelled) return

      const overrides = (overridesRes.data ?? []) as BonusOverride[]
      const payouts = (payoutsRes.data ?? []) as Payout[]

      // Collect all unique referrer IDs
      const allReferrerIds = Array.from(
        new Set([...overrides.map((o) => o.referrer_id), ...payouts.map((p) => p.referrer_id)])
      )

      let profiles: Profile[] = []
      if (allReferrerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allReferrerIds)
        profiles = (profilesData ?? []) as Profile[]
      }

      if (cancelled) return

      const overrideByReferrer = new Map<string, BonusOverride>()
      for (const o of overrides) overrideByReferrer.set(o.referrer_id, o)

      const payoutsByReferrer = new Map<string, Payout[]>()
      for (const p of payouts) {
        const arr = payoutsByReferrer.get(p.referrer_id) ?? []
        arr.push(p)
        payoutsByReferrer.set(p.referrer_id, arr)
      }

      const rows: ReferrerRow[] = profiles.map((profile) => ({
        profile,
        override: overrideByReferrer.get(profile.id) ?? null,
        payouts: payoutsByReferrer.get(profile.id) ?? [],
      }))

      setReferrers(rows)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return referrers
    return referrers.filter(
      (r) =>
        r.profile.full_name?.toLowerCase().includes(q) ||
        r.profile.email?.toLowerCase().includes(q)
    )
  }, [referrers, search])

  // KPI derivations
  const totalReferrers = referrers.length
  const pendingPayoutsCents = referrers.flatMap((r) => r.payouts).filter((p) => p.status === 'pending').reduce((s, p) => s + p.bonus_cents, 0)
  const paidLifetimeCents = referrers.flatMap((r) => r.payouts).filter((p) => p.status === 'paid').reduce((s, p) => s + p.bonus_cents, 0)

  async function handleSaveDefault() {
    const target = pendingDefault ?? defaultBonusCents
    if (editUseCustom) {
      const parsed = parseInt(customDefaultStr.replace(/[^0-9]/g, ''), 10)
      if (isNaN(parsed) || parsed <= 0) { toast.error('Enter a valid dollar amount'); return }
    }
    setSavingDefault(true)
    const valueCents = editUseCustom
      ? parseInt(customDefaultStr.replace(/[^0-9]/g, ''), 10) * 100
      : target
    const { error } = await supabase
      .from('platform_settings')
      .update({ default_referral_bonus_cents: valueCents })
      .eq('id', 1)
    setSavingDefault(false)
    if (error) { toast.error(`Save failed: ${error.message}`); return }
    setDefaultBonusCents(valueCents)
    setPendingDefault(null)
    setCustomDefaultStr('')
    toast.success(`Default bonus updated to ${formatCents(valueCents)}`)
  }

  function openEditPanel(referrerId: string) {
    const row = referrers.find((r) => r.profile.id === referrerId)
    if (!row) return
    setExpandedId(referrerId)
    const existing = row.override?.bonus_cents ?? null
    if (existing && !PRESET_CENTS.includes(existing as typeof PRESET_CENTS[number])) {
      setEditUseCustom(true)
      setEditCustomStr(String(existing / 100))
      setEditOverrideCents(existing)
    } else {
      setEditUseCustom(false)
      setEditCustomStr('')
      setEditOverrideCents(existing)
    }
  }

  async function handleSaveOverride(referrerId: string) {
    let bonusCents: number
    if (editUseCustom) {
      const parsed = parseInt(editCustomStr.replace(/[^0-9]/g, ''), 10)
      if (isNaN(parsed) || parsed <= 0) { toast.error('Enter a valid amount'); return }
      bonusCents = parsed * 100
    } else {
      if (!editOverrideCents) { toast.error('Select a bonus amount'); return }
      bonusCents = editOverrideCents
    }
    setSavingOverride(true)
    const { error } = await supabase
      .from('referral_bonus_overrides')
      .upsert({ referrer_id: referrerId, bonus_cents: bonusCents }, { onConflict: 'referrer_id' })
    setSavingOverride(false)
    if (error) { toast.error(`Save failed: ${error.message}`); return }
    const newOverride: BonusOverride = { referrer_id: referrerId, bonus_cents: bonusCents, set_at: new Date().toISOString() }
    setReferrers((prev) => prev.map((r) => r.profile.id === referrerId ? { ...r, override: newOverride } : r))
    toast.success(`Override saved: ${formatCents(bonusCents)}`)
    setExpandedId(null)
  }

  async function handleRemoveOverride(referrerId: string) {
    setSavingOverride(true)
    const { error } = await supabase
      .from('referral_bonus_overrides')
      .delete()
      .eq('referrer_id', referrerId)
    setSavingOverride(false)
    if (error) { toast.error(`Remove failed: ${error.message}`); return }
    setReferrers((prev) => prev.map((r) => r.profile.id === referrerId ? { ...r, override: null } : r))
    toast.success('Override removed — referrer reverts to default bonus')
    setExpandedId(null)
  }

  async function handleMarkPaid(payoutId: string, referrerId: string) {
    setMarkingPaid(payoutId)
    // TODO: ACH payout trigger — call Stripe payouts API here when billing is live
    const { error } = await supabase
      .from('referral_payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', payoutId)
    setMarkingPaid(null)
    if (error) { toast.error(`Update failed: ${error.message}`); return }
    setReferrers((prev) =>
      prev.map((r) => {
        if (r.profile.id !== referrerId) return r
        return {
          ...r,
          payouts: r.payouts.map((p) =>
            p.id === payoutId ? { ...p, status: 'paid' as const, paid_at: new Date().toISOString() } : p
          ),
        }
      })
    )
    toast.success('Payout marked as paid')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referral Program"
        description="Manage referral bonuses and track payouts."
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard icon={Users} iconBg="bg-primary/10 text-primary" value={String(totalReferrers)} label="Total referrers" />
        <KpiCard icon={Clock} iconBg="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" value={formatCents(pendingPayoutsCents)} label="Pending payouts" />
        <KpiCard icon={CheckCircle2} iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" value={formatCents(paidLifetimeCents)} label="Paid out (lifetime)" />
      </div>

      {/* Global default bonus */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Global default</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            This bonus applies to all referrers unless overridden individually.
            {/* TODO: flip per-project vs per-signup trigger in handleMarkPaid above */}
            {' '}Bonus fires once per completed project by a referred homeowner.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-[12px] font-medium text-foreground">Bonus amount</label>
            <select
              value={editUseCustom ? 'custom' : String(pendingDefault ?? defaultBonusCents)}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setEditUseCustom(true)
                } else {
                  setEditUseCustom(false)
                  setPendingDefault(Number(e.target.value))
                }
              }}
              className="rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              data-testid="admin-referral-default-select"
            >
              {PRESET_CENTS.map((c) => (
                <option key={c} value={String(c)}>
                  {PRESET_LABELS[c]}{c === DEFAULT_BONUS_CENTS ? ' (default)' : ''}
                </option>
              ))}
              <option value="custom">Custom amount…</option>
            </select>
          </div>
          {editUseCustom && (
            <div className="space-y-1">
              <label className="block text-[12px] font-medium text-foreground">Custom amount ($)</label>
              <input
                type="number"
                min="1"
                value={customDefaultStr}
                onChange={(e) => setCustomDefaultStr(e.target.value)}
                placeholder="e.g. 750"
                className="w-32 rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveDefault}
            disabled={savingDefault}
            data-testid="admin-referral-save-default"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {savingDefault ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save default
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Current default: <span className="font-semibold text-foreground">{formatCents(defaultBonusCents)}</span> per completed project
        </p>
      </div>

      {/* Per-referrer table */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search referrers…"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
            data-testid="admin-referral-search"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px] text-muted-foreground">
              {search ? 'No referrers match your search.' : 'No referrers yet. Payouts will appear here once referral invitations convert.'}
            </p>
          </div>
        ) : (
          <div data-testid="admin-referral-table">
            {filtered.map((row, i) => {
              const isExpanded = expandedId === row.profile.id
              const effectiveCents = row.override?.bonus_cents ?? defaultBonusCents
              const pendingPayouts = row.payouts.filter((p) => p.status === 'pending')
              const paidPayouts = row.payouts.filter((p) => p.status === 'paid')
              const totalEarned = row.payouts.reduce((s, p) => s + p.bonus_cents, 0)

              let payoutTone: PayoutTone = 'none'
              let payoutLabel = 'No payouts yet'
              if (pendingPayouts.length > 0 && paidPayouts.length === 0) {
                payoutTone = 'pending'
                payoutLabel = `${pendingPayouts.length} pending · ${formatCents(pendingPayouts.reduce((s, p) => s + p.bonus_cents, 0))}`
              } else if (pendingPayouts.length === 0 && paidPayouts.length > 0) {
                payoutTone = 'paid'
                payoutLabel = 'All paid'
              } else if (pendingPayouts.length > 0 && paidPayouts.length > 0) {
                payoutTone = 'pending'
                payoutLabel = `${pendingPayouts.length} pending`
              }

              return (
                <div
                  key={row.profile.id}
                  className={cn('border-b border-border/40 last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-muted/20')}
                  data-testid="admin-referral-row"
                  data-referrer-id={row.profile.id}
                >
                  {/* Table row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">
                        {row.profile.full_name ?? 'Unknown'}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{row.profile.email ?? '—'}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      <span className="text-[13px] font-medium text-foreground w-20 text-right">
                        {formatCents(effectiveCents)}
                      </span>
                      {row.override ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium w-20 justify-center">
                          Override
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground w-20 text-center">—</span>
                      )}
                      <span className="text-[13px] text-foreground w-24 text-right">{row.payouts.length}</span>
                      <span className="text-[13px] font-medium text-foreground w-24 text-right">{formatCents(totalEarned)}</span>
                      <div className="w-36 flex justify-end">
                        <PayoutBadge tone={payoutTone} label={payoutLabel} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isExpanded) { setExpandedId(null) } else { openEditPanel(row.profile.id) }
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                      aria-label="Edit referrer"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Mobile payout badge row */}
                  <div className="sm:hidden flex items-center justify-between px-4 pb-2 gap-2">
                    <span className="text-[12px] text-muted-foreground">{formatCents(effectiveCents)} bonus</span>
                    <PayoutBadge tone={payoutTone} label={payoutLabel} />
                  </div>

                  {/* Inline edit panel */}
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                      data-testid="admin-referral-edit-panel"
                      data-referrer-id={row.profile.id}
                    >
                      <div className="border-t border-border/40 bg-muted/10 px-4 py-4 space-y-5">
                        {/* Bonus override */}
                        <div className="space-y-3">
                          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">Custom bonus amount</p>
                          <div className="flex flex-wrap items-end gap-3">
                            <select
                              value={editUseCustom ? 'custom' : String(editOverrideCents ?? defaultBonusCents)}
                              onChange={(e) => {
                                if (e.target.value === 'custom') {
                                  setEditUseCustom(true)
                                } else {
                                  setEditUseCustom(false)
                                  setEditOverrideCents(Number(e.target.value))
                                }
                              }}
                              className="rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <option value={String(defaultBonusCents)}>Use default ({formatCents(defaultBonusCents)})</option>
                              {PRESET_CENTS.filter((c) => c !== defaultBonusCents).map((c) => (
                                <option key={c} value={String(c)}>{PRESET_LABELS[c]}</option>
                              ))}
                              <option value="custom">Custom amount…</option>
                            </select>
                            {editUseCustom && (
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                                <input
                                  type="number"
                                  min="1"
                                  value={editCustomStr}
                                  onChange={(e) => setEditCustomStr(e.target.value)}
                                  placeholder="e.g. 750"
                                  className="w-24 rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveOverride(row.profile.id)}
                              disabled={savingOverride}
                              data-testid="admin-referral-save-override"
                              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                            >
                              {savingOverride && <Loader2 className="h-3 w-3 animate-spin" />}
                              Save override
                            </button>
                            {row.override && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOverride(row.profile.id)}
                                disabled={savingOverride}
                                data-testid="admin-referral-remove-override"
                                className="inline-flex items-center rounded-full border px-4 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-60 transition-colors"
                              >
                                Remove override
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Payout list */}
                        {row.payouts.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">Payouts</p>
                            <div className="space-y-1.5">
                              {row.payouts.map((p) => (
                                <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
                                  <div>
                                    <p className="text-[13px] font-medium text-foreground">{formatCents(p.bonus_cents)}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                      {p.paid_at ? ` · Paid ${new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <PayoutBadge tone={p.status} label={p.status === 'paid' ? 'Paid' : 'Pending'} />
                                    {p.status === 'pending' && (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkPaid(p.id, row.profile.id)}
                                        disabled={markingPaid === p.id}
                                        data-testid="admin-referral-mark-paid"
                                        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                                      >
                                        {markingPaid === p.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                        Mark paid
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
