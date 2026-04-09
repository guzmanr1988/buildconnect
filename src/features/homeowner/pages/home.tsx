import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Mail, Phone, Palette } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS } from '@/lib/mock-data'
import { SERVICE_CATALOG } from '@/lib/constants'
import { ServiceCard } from '../components/service-card'

export function HomeownerHome() {
  const profile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const navigate = useNavigate()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const services = SERVICE_CATALOG.filter((s) => !s.phase2)

  return (
    <div className="flex flex-col gap-6">
      {/* Profile banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/80 p-6 text-white shadow-lg"
      >
        <div className="flex items-center gap-4">
          <AvatarInitials
            initials={profile.initials}
            color="rgba(255,255,255,0.2)"
            size="lg"
            className="border-2 border-white/30"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold font-heading truncate">
              {profile.name}
            </h1>
            <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:gap-4">
              <span className="flex items-center gap-1.5 text-sm text-white/80">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{profile.address}</span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5 text-sm text-white/80">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {profile.email}
              </span>
              <span className="hidden sm:flex items-center gap-1.5 text-sm text-white/80">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {profile.phone}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Section heading */}
      <div>
        <h2 className="text-lg font-semibold font-heading text-foreground">
          Choose a Service
        </h2>
        <p className="text-sm text-muted-foreground">
          Select a service to configure and find the perfect contractor.
        </p>
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, i) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <ServiceCard
              service={service}
              isExpanded={expandedId === service.id}
              onToggle={() =>
                setExpandedId(expandedId === service.id ? null : service.id)
              }
            />
          </motion.div>
        ))}
      </div>

      {/* Phase 2 services - muted */}
      {SERVICE_CATALOG.filter((s) => s.phase2).length > 0 && (
        <>
          <div className="mt-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Coming Soon
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_CATALOG.filter((s) => s.phase2).map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                isExpanded={false}
                onToggle={() => {}}
              />
            ))}
          </div>
        </>
      )}

      {/* 3D Design Lab CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="overflow-hidden rounded-xl bg-gradient-to-r from-primary/90 via-primary to-primary/80 p-6 text-white shadow-lg"
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Palette className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-heading">3D Design Lab</h3>
              <p className="text-sm text-white/80">
                Visualize your project in 3D before committing
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/home/design-lab')}
            className="bg-white text-primary hover:bg-white/90 font-medium shadow-md min-h-[44px] px-6"
          >
            Open Design Lab
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
