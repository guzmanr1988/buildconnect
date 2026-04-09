import { motion } from 'framer-motion'
import {
  Building2, User, Phone, Mail, MapPin, Star, Clock, MessageSquare,
  BadgeCheck, CreditCard, Pencil, LogOut, Shield,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { MOCK_VENDORS } from '@/lib/mock-data'
import { SERVICE_CATALOG } from '@/lib/constants'
import { cn } from '@/lib/utils'

const VENDOR_ID = 'v-1'

export default function VendorProfile() {
  const vendor = MOCK_VENDORS.find((v) => v.id === VENDOR_ID)!

  const serviceNames = vendor.service_categories
    .map((cat) => SERVICE_CATALOG.find((s) => s.id === cat)?.name || cat)

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Profile" description="Manage your company information">
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
        </Button>
      </PageHeader>

      {/* Company Info Card */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <AvatarInitials initials={vendor.initials} color={vendor.avatar_color} size="lg" />
              <div className="flex-1 min-w-0 space-y-4 w-full">
                {/* Company Name & Badges */}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold font-heading">{vendor.company}</h2>
                    {vendor.verified && (
                      <Badge className="bg-primary/10 text-primary border-0 text-xs">
                        <BadgeCheck className="h-3.5 w-3.5 mr-1" /> Verified
                      </Badge>
                    )}
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs capitalize">
                      {vendor.status}
                    </Badge>
                  </div>
                  {vendor.financing_available && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      <CreditCard className="h-3 w-3 mr-1" /> Financing Available
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Contact Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <User className="h-4 w-4 shrink-0" />
                    <span>{vendor.name}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{vendor.phone}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{vendor.email}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{vendor.address}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Service Categories */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Service Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {serviceNames.map((name) => (
                <Badge
                  key={name}
                  variant="secondary"
                  className="text-sm px-3 py-1.5"
                >
                  {name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Performance Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Rating */}
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-3">
                  <Star className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-heading">{vendor.rating}</p>
                  <p className="text-xs text-muted-foreground">Average Rating</p>
                </div>
              </div>
              {/* Reviews */}
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-heading">{vendor.total_reviews}</p>
                  <p className="text-xs text-muted-foreground">Total Reviews</p>
                </div>
              </div>
              {/* Response Time */}
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-emerald-100 dark:bg-emerald-900/30 p-3">
                  <Clock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-heading">{vendor.response_time}</p>
                  <p className="text-xs text-muted-foreground">Avg Response Time</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Rating Stars Visual */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Review Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {[5, 4, 3, 2, 1].map((stars) => {
                // Simulated distribution for display
                const pcts: Record<number, number> = { 5: 72, 4: 18, 3: 7, 2: 2, 1: 1 }
                const pct = pcts[stars]
                return (
                  <div key={stars} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-6 text-right">{stars}</span>
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account Actions */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Account</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Member since {new Date(vendor.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <Button variant="destructive" size="sm">
                <LogOut className="h-3.5 w-3.5 mr-1.5" /> Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
