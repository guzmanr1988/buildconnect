import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Phone, CalendarDays, ChevronRight, ChevronDown, ChevronUp, Hammer, CheckCircle2, Clock, XCircle, Gift, X, CheckCircle, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS, MOCK_VENDORS } from '@/lib/mock-data'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useCatalogStore } from '@/stores/catalog-store'
import { useProjectsStore } from '@/stores/projects-store'
import { formatProjectTitle } from '@/lib/format-project-title'
import { supabase } from '@/lib/supabase'
import { useReferralStore } from '@/stores/referral-store'
import { ServiceCard } from '../components/service-card'
import { OnboardingTour, hasSeenOnboarding, markOnboardingSeen } from '../components/onboarding-tour'
import { FinancingCard } from '@/features/financing/components/financing-card'
import { ApprovedAmountBanner } from '@/features/financing/components/approved-amount-banner'
import { HomeownerPendingDrawsSection } from '@/features/financing/components/homeowner-pending-draws-section'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'

// Sold projects stay in ACTIVE for 30 days after soldAt, then graduate to
// COMPLETED. Time-based heuristic since sentProject has no projectCompletedAt
// flag and /home reads local zustand not Supabase closed_sales.
//
// TODO: swap to closed_sales.commission_paid check when the homeowner
// booking-insert path ships (Signal #12 transition). At that point the
// homeowner's sentProject will have a bridge to the Supabase closed_sales
// row and we can use the semantically-stronger "money flowed = project
// really done" boundary kratos approved (msg 1776615690852).
const ACTIVE_TO_COMPLETED_DAYS = 30

export function HomeownerHome() {
  // Ship #250 — effective-fixture hook honors the demoDataHidden flag.
  // MOCK_HOMEOWNERS[0] is kept as the no-auth profile fallback (default-
  // user shim, not rendered seed data) — scope of the flag is the lead
  // list, not the identity-fallback.
  const mockLeads = useEffectiveMockLeads()
  const profile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const navigate = useNavigate()

  const services = useCatalogStore((s) => s.services)
  const activeServices = services.filter((s) => s.status === 'live')

  const comingSoon = services.filter((s) => s.status === 'draft')

  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const leadStatusOverrides = useProjectsStore((s) => s.leadStatusOverrides)
  const cancellationRequestsByLead = useProjectsStore((s) => s.cancellationRequestsByLead)

  const sortByRecent = <T extends { sentAt: string }>(list: T[]) =>
    [...list].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())

  // Bucket rules (kratos msg 1776722335225 — Rodolfo revision):
  //   UPCOMING : pending (lead submitted, vendor not acted) OR approved
  //              (vendor Scheduled — confirmed but work not started yet).
  //   ACTIVE   : sold (work in progress / post-payment) within
  //              ACTIVE_TO_COMPLETED_DAYS window.
  //   COMPLETED: sold older than ACTIVE_TO_COMPLETED_DAYS.
  // Homeowner-perspective: anything where work hasn't physically started =
  // still "Upcoming". Only flip to Active when vendor marks Sold.
  const activeCutoff = Date.now() - ACTIVE_TO_COMPLETED_DAYS * 24 * 60 * 60 * 1000

  // Unified lifecycle entry shape — leadId is the URL-stable id used for
  // navigation to /home/appointments/:leadId. For sentProjects (cart-created)
  // it's L-${first4-of-uuid}. For MOCK_LEADS (static fixtures) it's the
  // fixture id directly (L-0001, L-0002, etc.).
  interface LifecycleEntry {
    leadId: string
    item: { serviceId: string; serviceName: string; selections: Record<string, string[]> }
    status: 'pending' | 'approved' | 'declined' | 'sold'
    contractor: { company: string; name: string; rating: number }
    booking: { date: string; time: string }
    sentAt: string
    soldAt?: string
  }

  // MOCK_LEADS with leadStatusOverrides mirror the vendor-side action flow.
  // Convert into LifecycleEntry so the buckets can treat them uniformly.
  const mockLifecycleStatusMap: Record<string, 'pending' | 'approved' | 'declined' | 'sold'> = {
    pending: 'pending',
    confirmed: 'approved',
    rejected: 'declined',
    completed: 'sold',
    rescheduled: 'pending',
    // Ship #171 — 'cancelled' split from 'rejected'. From the homeowner's
    // POV both outcomes land in the same "dead lead" Cancelled bucket on
    // /home (the vendor-side split is the one that matters for bookkeeping),
    // so both map to 'declined' in the LifecycleEntry status terminology.
    cancelled: 'declined',
  }
  // Gate MOCK_LEADS to the profile whose id ACTUALLY matches the fixture's
  // homeowner_id. Previously had a `|| l.homeowner_id === 'ho-1'` fallback
  // that leaked ho-1's mock leads (Apex + Elite) into every profile's /home
  // Upcoming bucket — QA personas, real signups, and the Rod P0
  // homeowner-side analog of the vendor zombie state we gated via
  // useVendorScope. Dropping the fallback: MOCK_HOMEOWNERS[0] default-profile
  // path still matches because profile.id is already 'ho-1' in that case, so
  // the fallback was redundant AND leaking.
  const mockLeadsAsEntries: LifecycleEntry[] = mockLeads
    .filter((l) => l.homeowner_id === profile.id)
    .map((l) => {
      const overrideStatus = leadStatusOverrides[l.id]
      const effectiveLeadStatus = overrideStatus ?? l.status
      const mappedStatus = mockLifecycleStatusMap[effectiveLeadStatus] ?? 'pending'
      const vendor = MOCK_VENDORS.find((v) => v.id === l.vendor_id)
      return {
        leadId: l.id,
        item: { serviceId: l.service_category, serviceName: vendor?.company || l.project, selections: l.pack_items },
        status: mappedStatus,
        contractor: { company: vendor?.company || 'Vendor', name: vendor?.name || '', rating: vendor?.rating || 0 },
        booking: { date: new Date(l.slot).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), time: new Date(l.slot).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) },
        sentAt: l.received_at,
        soldAt: undefined,
      }
    })

  const sentProjectsAsEntries: LifecycleEntry[] = sentProjects.map((p) => ({
    leadId: `L-${p.id.slice(0, 4).toUpperCase()}`,
    item: { serviceId: p.item.serviceId, serviceName: p.item.serviceName, selections: p.item.selections },
    status: p.status,
    contractor: p.contractor,
    booking: p.booking,
    sentAt: p.sentAt,
    soldAt: p.soldAt,
  }))

  // Unified lifecycle feed: sentProjects-derived first, MOCK_LEADS-derived
  // second. Dedupe by leadId defensively.
  const seenIds = new Set<string>()
  const lifecycle: LifecycleEntry[] = []
  for (const p of [...sentProjectsAsEntries, ...mockLeadsAsEntries]) {
    if (seenIds.has(p.leadId)) continue
    seenIds.add(p.leadId)
    lifecycle.push(p)
  }

  // Cancelled predicate — any lead whose LifecycleEntry status resolved to
  // 'declined' OR that carries an approved cancellation-request entry.
  // Post-#171 (task_1776662387601_014) the vendor dashboard splits
  // cancelled-by-homeowner-approval from rejected-by-vendor, but from
  // the homeowner's POV both dead-lead shapes share the /home Cancelled
  // tile — so this predicate intentionally stays union-style.
  const isCancelled = (leadId: string, status: string): boolean => {
    const cReq = cancellationRequestsByLead[leadId]
    if (cReq?.status === 'approved') return true
    if (status === 'declined') return true
    return false
  }

  const upcomingAll = sortByRecent(
    lifecycle.filter(
      (p) => (p.status === 'pending' || p.status === 'approved') && !isCancelled(p.leadId, p.status)
    )
  )
  const activeProjects = sortByRecent(
    lifecycle.filter((p) => {
      if (isCancelled(p.leadId, p.status)) return false
      if (p.status !== 'sold') return false
      if (!p.soldAt) return true
      return new Date(p.soldAt).getTime() >= activeCutoff
    })
  )

  const completedProjects = sortByRecent(
    lifecycle.filter((p) => {
      if (isCancelled(p.leadId, p.status)) return false
      if (p.status !== 'sold') return false
      if (!p.soldAt) return false
      return new Date(p.soldAt).getTime() < activeCutoff
    })
  )

  const cancelledProjects = sortByRecent(
    lifecycle.filter((p) => isCancelled(p.leadId, p.status))
  )

  // Accordion state for 2x2 fused tile-grid (ship #97 per kratos msg
  // 1776697638074). Tap any tile → drops down the project list inline
  // under the tile. One-open-at-a-time for consistency with vendor
  // dashboard 5-col accordion. null = all collapsed.
  type HomeTileId = 'upcoming' | 'active' | 'completed' | 'cancelled'
  const [openHomeTile, setOpenHomeTile] = useState<HomeTileId | null>(null)
  const toggleHomeTile = (id: HomeTileId) =>
    setOpenHomeTile((prev) => (prev === id ? null : id))

  // Onboarding tour (ship #106 Phase B per kratos msg 1776718477775).
  // Auto-open on first-ever /home visit for a homeowner; dismissible via
  // Skip/Next-through/backdrop/ESC. Nav '?' button also reopens it via
  // custom 'buildconnect:open-onboarding' window event emitted by the
  // homeowner-layout help button.
  const [referOpen, setReferOpen] = useState(false)
  const [referSent, setReferSent] = useState(false)
  const [referFields, setReferFields] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [referErrors, setReferErrors] = useState<Record<string, string>>({})

  function handleReferOpen() { setReferOpen(true); setReferSent(false); setReferErrors({}) }
  function handleReferClose() { setReferOpen(false); setReferSent(false); setReferFields({ firstName: '', lastName: '', email: '', phone: '' }); setReferErrors({}) }
  async function handleReferSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!referFields.firstName.trim()) errs.firstName = 'First name required'
    if (!referFields.lastName.trim()) errs.lastName = 'Last name required'
    if (!referFields.email.trim() && !referFields.phone.trim()) errs.contact = 'Email or phone required'
    if (Object.keys(errs).length) { setReferErrors(errs); return }

    if (!profile?.id) return

    const store = useReferralStore.getState()
    const referralId = store.addReferral(profile.id, {
      firstName: referFields.firstName,
      lastName: referFields.lastName,
      email: referFields.email,
      phone: referFields.phone,
      referrerId: profile.id,
    })

    const { data, error } = await supabase.functions.invoke('referral-invite', {
      body: {
        friendEmail: referFields.email,
        friendName: `${referFields.firstName} ${referFields.lastName}`.trim(),
        referrerName: profile.name || profile.email,
        referralId,
      },
    })

    if (error || !data?.ok) {
      store.removeReferral(profile.id, referralId)
      setReferErrors({ contact: data?.error ?? 'Could not send invite — please try again.' })
      return
    }

    setReferSent(true)
  }

  const [onboardingOpen, setOnboardingOpen] = useState(false)
  useEffect(() => {
    if (!hasSeenOnboarding()) {
      // Mark seen immediately so navigating away before dismissal doesn't reset it
      markOnboardingSeen()
      const t = setTimeout(() => setOnboardingOpen(true), 300)
      return () => clearTimeout(t)
    }
  }, [])
  useEffect(() => {
    const handler = () => setOnboardingOpen(true)
    window.addEventListener('buildconnect:open-onboarding', handler)
    return () => window.removeEventListener('buildconnect:open-onboarding', handler)
  }, [])

  const howItWorks = [
    { n: 1, t: 'Tell us about your project', d: 'Pick a service and answer a few questions about what you need.' },
    { n: 2, t: 'Get matched', d: 'We connect you with verified contractors in your area.' },
    { n: 3, t: 'Compare and chat', d: 'Review quotes and message directly with the pros.' },
    { n: 4, t: 'Book when ready', d: "We're with you through the whole project." },
  ]

  const faq = [
    { q: 'Is BuildConnect free for homeowners?', a: 'Yes — you only pay the contractor for their work.' },
    { q: 'How do you verify contractors?', a: 'We check licenses, insurance, and require past-work references before any vendor joins the platform.' },
    { q: 'What happens after I book?', a: 'The contractor reaches out directly to confirm scope, pricing, and schedule.' },
    { q: "What if I don't like the quote?", a: "No obligation — you can decline and we'll match you with another contractor." },
    { q: 'Do you work outside South Florida?', a: "Not yet — we're focused on getting it right here first." },
  ]

  return (
    <div className="flex flex-col gap-10">
      {/* Welcome section — minimal, Apple-like */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4 md:gap-6">
          <AvatarInitials
            initials={profile.initials}
            color={profile.avatar_color}
            size="lg"
            className="shadow-sm md:h-20 md:w-20 md:text-2xl"
          />
          <div>
            <p className="text-sm text-muted-foreground md:text-base">Welcome back</p>
            <h1 className="text-xl font-semibold font-heading text-foreground md:text-3xl">
              {profile.name}
            </h1>
            <div className="flex items-center gap-3 mt-0.5 md:gap-4 md:mt-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground md:text-sm md:gap-1.5">
                <MapPin className="h-3 w-3 md:h-4 md:w-4" />
                {profile.address?.split(',')[0]?.trim() || 'Address not set'}
              </span>
              <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground md:text-sm md:gap-1.5">
                <Phone className="h-3 w-3 md:h-4 md:w-4" />
                {profile.phone}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Approved-amount banner — renders only when cfp has an active approved
          envelope (status approved/terms_accepted + amount > 0 + not expired).
          Phase 1 of the financing → project bridge (Rod 2026-05-19). Sits
          above the FinancingCard so the headline affordance lands first when
          a real offer is on the table. */}
      <ApprovedAmountBanner />

      <HomeownerPendingDrawsSection />

      {/* Financing entry — renders only when feature_flags.financing_enabled
          is true (read via useFeatureFlag inside FinancingCard). Phase-2
          wave-2: surfaces last-known application status with CTA to
          /home/financing/apply (no app yet) or /home/financing/status/:id
          (has app). Default-OFF in production until Rod flips the flag. */}
      <FinancingCard />

      {/* Project status accordion — 2x2 grid of lifecycle stage tiles fused
          with detail lists (ship #97 per kratos msg 1776697638074). Each tile
          click-expands its project list inline underneath. One-open-at-a-time
          for consistency with vendor dashboard 5-col accordion pattern.
          Default: all collapsed; empty-state renders inside tile when tapped
          with no projects in that bucket. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="grid grid-cols-2 gap-3"
      >
        {([
          { id: 'upcoming' as const, label: 'Upcoming', count: upcomingAll.length, icon: Clock, iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', projects: upcomingAll, emptyText: 'No upcoming yet', subtitleFor: (p: LifecycleEntry) => `${p.contractor?.company ?? 'Pending vendor'} · ${p.status === 'approved' ? 'Scheduled' : 'Pending vendor'} · ${p.booking.date} ${p.booking.time}` },
          { id: 'active' as const, label: 'Active', count: activeProjects.length, icon: Hammer, iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', projects: activeProjects, emptyText: 'No active projects', subtitleFor: (p: LifecycleEntry) => `${p.contractor?.company ?? 'Pending vendor'} · In progress${p.soldAt ? ' · Sold ' + new Date(p.soldAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}` },
          { id: 'completed' as const, label: 'Completed', count: completedProjects.length, icon: CheckCircle2, iconBg: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300', projects: completedProjects, emptyText: 'No completed projects', subtitleFor: (p: LifecycleEntry) => `${p.contractor?.company ?? 'Pending vendor'} · Completed${p.soldAt ? ' ' + new Date(p.soldAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}` },
          { id: 'cancelled' as const, label: 'Cancelled', count: cancelledProjects.length, icon: XCircle, iconBg: 'bg-destructive/10 text-destructive', projects: cancelledProjects, emptyText: 'No cancelled projects', subtitleFor: (p: LifecycleEntry) => `${p.contractor?.company ?? 'Pending vendor'} · Cancelled` },
        ] as const).map((tile) => {
          const open = openHomeTile === tile.id
          const Icon = tile.icon
          return (
            <div
              key={tile.id}
              className={cn(
                'rounded-2xl border bg-card overflow-hidden transition-all col-span-1',
                open && 'ring-2 ring-primary/40 shadow-md col-span-2'
              )}
            >
              <button
                type="button"
                onClick={() => toggleHomeTile(tile.id)}
                className="w-full p-4 flex items-center gap-3 text-left hover:bg-muted/30"
                aria-expanded={open}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tile.iconBg)}>
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{tile.label}</p>
                  <p className="text-xl font-bold font-heading text-foreground leading-tight">{tile.count}</p>
                </div>
                {open ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="tile-content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border/40 bg-muted/10 p-3 space-y-2">
                      {tile.projects.length === 0 ? (
                        <div className="rounded-xl border border-dashed bg-card/50 px-3 py-3 text-center">
                          <p className="text-[12px] text-muted-foreground">{tile.emptyText}</p>
                        </div>
                      ) : (
                        tile.projects.map((p) => {
                          const isScheduled = tile.id === 'upcoming' && p.status === 'approved'
                          const isActiveRow = tile.id === 'active'
                          return (
                          <button
                            key={p.leadId}
                            type="button"
                            data-testid="home-tile-project"
                            data-lead-id={p.leadId}
                            data-scheduled={isScheduled ? 'true' : undefined}
                            data-active-row={isActiveRow ? 'true' : undefined}
                            onClick={() => navigate(`/home/appointments/${p.leadId}`)}
                            className={cn(
                              'group w-full flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all duration-300 hover:shadow-md hover:-translate-y-[1px]',
                              isScheduled && 'border-sky-300 bg-sky-50/40 dark:border-sky-500/40 dark:bg-sky-500/5',
                              isActiveRow && 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/40 dark:bg-emerald-500/5'
                            )}
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <CalendarDays className="h-4 w-4" strokeWidth={1.8} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold font-heading text-foreground truncate">
                                {formatProjectTitle(p.item)}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {tile.subtitleFor(p)}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
                          </button>
                          )
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </motion.div>

      {/* Section heading */}
      <div>
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-2xl sm:text-3xl font-bold font-heading text-foreground tracking-tight"
        >
          What would you like to build?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mt-2 text-[15px] text-muted-foreground"
        >
          Choose a service and we'll match you with top-rated contractors in your area.
        </motion.p>
      </div>

      {/* Concierge "Request a Rep" entry — single centered card.
          The earlier "Do it myself" sibling card was removed (Rod
          2026-06-30: "do it myself button makes no sense... it does
          nothing"). Service grid below renders unconditionally and is
          the self-serve path; this card is the concierge CTA. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35 }}
        data-testid="homeowner-start-project-split"
      >
        <button
          type="button"
          onClick={() => navigate('/home/rep-request')}
          data-testid="homeowner-start-project-rep"
          className="w-full rounded-2xl border bg-card p-4 flex items-center gap-4 text-left transition-all hover:shadow-md hover:-translate-y-[1px]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Concierge Service
            </p>
            <p className="text-[15px] font-semibold font-heading text-foreground leading-tight mt-1">
              Have a BuildConnect rep help me build my project
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              A concierge rep will visit and scope your project · $250 visit fee
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </motion.div>

      {/* Service grid — always 4 columns on desktop */}
      <div id="home-service-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {activeServices.map((service, i) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + i * 0.04 }}
          >
            <ServiceCard
              service={service}
              isExpanded={false}
              onToggle={() => navigate(`/home/service/${service.id}`)}
            />
          </motion.div>
        ))}
      </div>

      {/* Coming Soon */}
      {comingSoon.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Coming Soon
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {comingSoon.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                isExpanded={false}
                onToggle={() => {}}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* How it works — outer section-toggle, default collapsed; inner 4-step accordion preserved */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
      >
        <Accordion type="single" collapsible defaultValue={[]} className="w-full">
          <AccordionItem value="section-howitworks" className="rounded-2xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest hover:no-underline">
              How it works
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <Accordion type="single" collapsible defaultValue={[]} className="w-full border-t">
                {howItWorks.map((step) => (
                  <AccordionItem key={step.n} value={`step-${step.n}`} className="px-5">
                    <AccordionTrigger className="py-4 text-[14px]">
                      <span className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {step.n}
                        </span>
                        <span className="font-semibold font-heading text-foreground">{step.t}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-[13px] text-muted-foreground leading-relaxed pl-10">
                      {step.d}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </motion.div>

      {/* Frequently asked — outer section-toggle, default collapsed; inner per-Q accordion preserved */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <Accordion type="single" collapsible defaultValue={[]} className="w-full">
          <AccordionItem value="section-faq" className="rounded-2xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest hover:no-underline">
              Frequently asked
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <Accordion type="single" collapsible defaultValue={[]} className="w-full border-t">
                {faq.map((qa, i) => (
                  <AccordionItem key={qa.q} value={`faq-${i}`} className="px-5">
                    <AccordionTrigger className="py-4 text-[14px] font-medium text-foreground">
                      {qa.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-[13px] text-muted-foreground leading-relaxed">
                      {qa.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </motion.div>

      {/* Refer-a-Friend CTA — sits in empty space between FAQ and footer */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
        className="rounded-3xl border bg-card p-6 flex flex-col items-center text-center gap-4 shadow-[0_2px_8px_rgba(0,0,0,0.04),_0_8px_32px_rgba(0,0,0,0.07)]"
        data-testid="refer-a-friend-section"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Gift className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-[18px] font-bold font-heading text-foreground tracking-tight">
            Refer a Friend, Earn for Life
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Invite friends to BuildConnect. Every time someone you referred completes a project and buys from a contractor, you earn $500 — every project, for life.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReferOpen}
          disabled={onboardingOpen}
          data-testid="refer-a-friend-button"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-[14px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          <Gift className="h-4 w-4" strokeWidth={2} />
          Refer a Friend
        </button>
      </motion.div>

      {/* Refer-a-Friend modal */}
      <AnimatePresence>
        {referOpen && (
          <motion.div
            key="refer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) handleReferClose() }}
            data-testid="refer-modal-backdrop"
          >
            <motion.div
              key="refer-sheet"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-card shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
              data-testid="refer-modal"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
                <h3 className="text-[16px] font-bold font-heading text-foreground">Refer a Friend</h3>
                <button
                  type="button"
                  onClick={handleReferClose}
                  data-testid="refer-modal-close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5">
                {referSent ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center text-center gap-3 py-4"
                    data-testid="refer-sent-confirmation"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <CheckCircle className="h-7 w-7" strokeWidth={1.5} />
                    </div>
                    <p className="text-[16px] font-bold font-heading text-foreground">Invitation sent!</p>
                    <p className="text-[13px] text-muted-foreground">Your friend will receive an invitation to join BuildConnect.</p>
                    <button
                      type="button"
                      onClick={handleReferClose}
                      className="mt-1 rounded-full bg-primary px-6 py-2 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Done
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleReferSubmit} noValidate className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1" htmlFor="refer-first-name">
                          First name
                        </label>
                        <input
                          id="refer-first-name"
                          type="text"
                          autoComplete="given-name"
                          value={referFields.firstName}
                          onChange={(e) => setReferFields((p) => ({ ...p, firstName: e.target.value }))}
                          className={cn('w-full rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow', referErrors.firstName && 'border-destructive')}
                          placeholder="Jane"
                          data-testid="refer-first-name"
                        />
                        {referErrors.firstName && <p className="mt-1 text-[11px] text-destructive">{referErrors.firstName}</p>}
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1" htmlFor="refer-last-name">
                          Last name
                        </label>
                        <input
                          id="refer-last-name"
                          type="text"
                          autoComplete="family-name"
                          value={referFields.lastName}
                          onChange={(e) => setReferFields((p) => ({ ...p, lastName: e.target.value }))}
                          className={cn('w-full rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow', referErrors.lastName && 'border-destructive')}
                          placeholder="Smith"
                          data-testid="refer-last-name"
                        />
                        {referErrors.lastName && <p className="mt-1 text-[11px] text-destructive">{referErrors.lastName}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1" htmlFor="refer-email">
                        Email <span className="text-muted-foreground font-normal">(or phone below)</span>
                      </label>
                      <input
                        id="refer-email"
                        type="email"
                        autoComplete="email"
                        value={referFields.email}
                        onChange={(e) => setReferFields((p) => ({ ...p, email: e.target.value }))}
                        className={cn('w-full rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow', referErrors.contact && 'border-destructive')}
                        placeholder="friend@example.com"
                        data-testid="refer-email"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1" htmlFor="refer-phone">
                        Phone <span className="text-muted-foreground font-normal">(or email above)</span>
                      </label>
                      <input
                        id="refer-phone"
                        type="tel"
                        autoComplete="tel"
                        value={referFields.phone}
                        onChange={(e) => setReferFields((p) => ({ ...p, phone: e.target.value }))}
                        className={cn('w-full rounded-xl border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow', referErrors.contact && 'border-destructive')}
                        placeholder="(305) 555-0100"
                        data-testid="refer-phone"
                      />
                      {referErrors.contact && <p className="mt-1 text-[11px] text-destructive">{referErrors.contact}</p>}
                    </div>

                    <button
                      type="submit"
                      data-testid="refer-submit"
                      className="w-full rounded-full bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
                    >
                      Send Invitation
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <OnboardingTour open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  )
}
