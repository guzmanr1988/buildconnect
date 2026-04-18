import { useNavigate } from 'react-router-dom'
import { MapPin, Phone, CalendarDays, ChevronRight, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS } from '@/lib/mock-data'
import { useCatalogStore } from '@/stores/catalog-store'
import { useProjectsStore } from '@/stores/projects-store'
import { ServiceCard } from '../components/service-card'

export function HomeownerHome() {
  const profile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const navigate = useNavigate()

  const services = useCatalogStore((s) => s.services)
  const activeServices = services.filter((s) => !s.phase2)
  const comingSoon = services.filter((s) => s.phase2)

  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const upcoming = [...sentProjects]
    .filter((p) => p.status !== 'declined')
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, 3)

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
        <div className="flex items-center gap-4">
          <AvatarInitials
            initials={profile.initials}
            color={profile.avatar_color}
            size="lg"
            className="shadow-sm"
          />
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h1 className="text-xl font-semibold font-heading text-foreground">
              {profile.name}
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {profile.address?.split(',')[0]?.trim() || 'Address not set'}
              </span>
              <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                {profile.phone}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Upcoming — only renders when the homeowner has sent at least one project */}
      {upcoming.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
            Upcoming
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/home/appointments/${p.item.serviceId}`)}
                className="group flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all duration-300 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-[2px] dark:hover:shadow-black/20"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarDays className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold font-heading text-foreground truncate">
                    {p.item.serviceName}
                  </p>
                  <p className="text-[12px] text-muted-foreground truncate">
                    {p.contractor.company} · {p.booking.date} · {p.booking.time}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        </motion.div>
      )}

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

      {/* Service grid — always 4 columns on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
          <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
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

      {/* How it works — 4-step walkthrough for first-time visitors */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
      >
        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
          How it works
        </p>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorks.map((step) => (
            <div key={step.n} className="rounded-2xl border bg-card p-5">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {step.n}
              </div>
              <h3 className="text-[15px] font-semibold font-heading text-foreground leading-snug mb-1">
                {step.t}
              </h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {step.d}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Frequently asked — five common homeowner questions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
          Frequently asked
        </p>
        <div className="rounded-2xl border bg-card overflow-hidden">
          {faq.map((qa, i) => (
            <details key={qa.q} className={`group ${i < faq.length - 1 ? 'border-b border-border/50' : ''}`}>
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30 list-none [&::-webkit-details-marker]:hidden">
                <span className="text-[14px] font-medium text-foreground">{qa.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-4 text-[13px] text-muted-foreground leading-relaxed">
                {qa.a}
              </div>
            </details>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
