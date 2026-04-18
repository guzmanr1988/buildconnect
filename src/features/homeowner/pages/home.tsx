import { useNavigate } from 'react-router-dom'
import { MapPin, Phone } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS } from '@/lib/mock-data'
import { useCatalogStore } from '@/stores/catalog-store'
import { ServiceCard } from '../components/service-card'

export function HomeownerHome() {
  const profile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const navigate = useNavigate()

  const services = useCatalogStore((s) => s.services)
  const activeServices = services.filter((s) => !s.phase2)
  const comingSoon = services.filter((s) => s.phase2)

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
                {profile.address.split(',')[0]}
              </span>
              <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                {profile.phone}
              </span>
            </div>
          </div>
        </div>
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
    </div>
  )
}
