import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings, Percent, DollarSign, CalendarDays, Wrench, Eye, Layers,
  Banknote, Save, CheckCircle, Bell, Shield, Clock, MapPin, Building2,
  Mail, Phone, Key, Lock, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import { MOCK_SETTINGS } from '@/lib/mock-data'
import type { AppSettings } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({ ...MOCK_SETTINGS })
  const [saved, setSaved] = useState(false)

  // Extended settings state
  const [ext, setExt] = useState({
    companyName: 'BuildConnect',
    contactEmail: 'admin@buildconnect.com',
    supportPhone: '(305) 555-9999',
    serviceArea: 'Miami-Dade, Broward, Palm Beach',
    defaultCommission: 15,
    minPayoutThreshold: 100,
    leadExpiryHours: 48,
    vendorResponseLimit: 24,
    commissionReminderFreq: 'weekly',
    sessionTimeout: 30,
    twoFactorEnabled: false,
    minPasswordLength: 8,
    requireSpecialChars: true,
    notifyNewLeads: true,
    notifyCommissionDue: true,
    notifyVendorSignup: true,
    notifySMS: false,
    notifyEmail: true,
    stripeEnabled: false,
    stripeKey: '',
    mapsApiKey: '',
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const toggles: { key: keyof AppSettings; label: string; description: string; icon: React.ElementType }[] = [
    { key: 'maintenance_mode', label: 'Maintenance Mode', description: 'Take the platform offline for maintenance', icon: Wrench },
    { key: 'ar_mode', label: 'AR Mode', description: 'Enable augmented reality visualization features', icon: Eye },
    { key: 'phase2_enabled', label: 'Phase 2 Features', description: 'Kitchen, bathroom remodel services', icon: Layers },
    { key: 'financing_enabled', label: 'Financing Options', description: 'Allow vendors to offer financing to homeowners', icon: Banknote },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure platform behavior, revenue model, and feature flags" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Branding & Company Info */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Company Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Company Name
                </Label>
                <Input aria-label="Company Name" value={ext.companyName} onChange={(e) => setExt((p) => ({ ...p, companyName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Contact Email
                </Label>
                <Input aria-label="Contact Email" type="email" value={ext.contactEmail} onChange={(e) => setExt((p) => ({ ...p, contactEmail: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  Support Phone
                </Label>
                <Input aria-label="Support Phone" value={ext.supportPhone} onChange={(e) => setExt((p) => ({ ...p, supportPhone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Service Area / Coverage
                </Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. Miami-Dade, Broward, Palm Beach"
                  value={ext.serviceArea}
                  onChange={(e) => setExt((p) => ({ ...p, serviceArea: e.target.value }))}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Counties or zip codes where BuildConnect operates</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Revenue Configuration */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Revenue Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                  Default Commission % (new vendors)
                </Label>
                <Input
                  aria-label="Default Commission percent for new vendors"
                  type="number" min={1} max={50}
                  value={ext.defaultCommission}
                  onChange={(e) => setExt((p) => ({ ...p, defaultCommission: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Applied automatically when adding a new vendor</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Subscription Fee $/mo
                </Label>
                <Input
                  aria-label="Subscription Fee dollars per month"
                  type="number" min={0}
                  value={settings.subscription_fee}
                  onChange={(e) => setSettings((p) => ({ ...p, subscription_fee: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Minimum Payout Threshold
                </Label>
                <Input
                  aria-label="Minimum Payout Threshold"
                  type="number" min={0}
                  value={ext.minPayoutThreshold}
                  onChange={(e) => setExt((p) => ({ ...p, minPayoutThreshold: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Don't process payouts below this amount</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  Payout Day (1-28)
                </Label>
                <Input
                  aria-label="Payout Day of the month (1 to 28)"
                  type="number" min={1} max={28}
                  value={settings.payout_day}
                  onChange={(e) => setSettings((p) => ({ ...p, payout_day: Number(e.target.value) }))}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Lead Management */}
        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Lead Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Lead Expiry Time (hours)</Label>
                <Input
                  aria-label="Lead Expiry Time in hours"
                  type="number" min={1} max={168}
                  value={ext.leadExpiryHours}
                  onChange={(e) => setExt((p) => ({ ...p, leadExpiryHours: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Auto-decline leads if vendor doesn't respond within this time</p>
              </div>
              <div className="space-y-2">
                <Label>Vendor Response Time Limit (hours)</Label>
                <Input
                  aria-label="Vendor Response Time Limit in hours"
                  type="number" min={1} max={72}
                  value={ext.vendorResponseLimit}
                  onChange={(e) => setExt((p) => ({ ...p, vendorResponseLimit: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Flag vendors who exceed this response time</p>
              </div>
              <div className="space-y-2">
                <Label>Commission Reminder Frequency</Label>
                <Select value={ext.commissionReminderFreq} onValueChange={(val) => setExt((p) => ({ ...p, commissionReminderFreq: val }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">How often to remind vendors about unpaid commissions</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications */}
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channels</p>
                {[
                  { key: 'notifyEmail' as const, label: 'Email Notifications', desc: 'Receive alerts via email' },
                  { key: 'notifySMS' as const, label: 'SMS Notifications', desc: 'Receive alerts via text message' },
                ].map((n) => (
                  <div key={n.key} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-xs text-muted-foreground">{n.desc}</p>
                    </div>
                    <Switch aria-label={n.label} checked={ext[n.key]} onCheckedChange={(val) => setExt((p) => ({ ...p, [n.key]: val }))} />
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alert Types</p>
                {[
                  { key: 'notifyNewLeads' as const, label: 'New Leads', desc: 'Alert when a new lead is submitted' },
                  { key: 'notifyCommissionDue' as const, label: 'Commission Due', desc: 'Alert when commission is pending' },
                  { key: 'notifyVendorSignup' as const, label: 'Vendor Sign-ups', desc: 'Alert when a new vendor registers' },
                ].map((n) => (
                  <div key={n.key} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-xs text-muted-foreground">{n.desc}</p>
                    </div>
                    <Switch aria-label={n.label} checked={ext[n.key]} onCheckedChange={(val) => setExt((p) => ({ ...p, [n.key]: val }))} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Two-Factor Authentication</p>
                  <p className="text-xs text-muted-foreground">Require 2FA for all admin accounts</p>
                </div>
                <Switch aria-label="Two-Factor Authentication" checked={ext.twoFactorEnabled} onCheckedChange={(val) => setExt((p) => ({ ...p, twoFactorEnabled: val }))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Session Timeout (minutes)
                </Label>
                <Input
                  aria-label="Session Timeout in minutes"
                  type="number" min={5} max={480}
                  value={ext.sessionTimeout}
                  onChange={(e) => setExt((p) => ({ ...p, sessionTimeout: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Auto-logout after this period of inactivity</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Minimum Password Length
                </Label>
                <Input
                  aria-label="Minimum Password Length"
                  type="number" min={6} max={32}
                  value={ext.minPasswordLength}
                  onChange={(e) => setExt((p) => ({ ...p, minPasswordLength: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Require Special Characters</p>
                  <p className="text-xs text-muted-foreground">Passwords must include !@#$%^&*</p>
                </div>
                <Switch aria-label="Require Special Characters in passwords" checked={ext.requireSpecialChars} onCheckedChange={(val) => setExt((p) => ({ ...p, requireSpecialChars: val }))} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Integrations */}
        <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                Integrations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Stripe Payment Gateway</p>
                  <p className="text-xs text-muted-foreground">Enable Stripe for payment processing</p>
                </div>
                <Switch aria-label="Stripe Payment Gateway" checked={ext.stripeEnabled} onCheckedChange={(val) => setExt((p) => ({ ...p, stripeEnabled: val }))} />
              </div>
              {ext.stripeEnabled && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                    Stripe API Key
                  </Label>
                  <Input
                    aria-label="Stripe API Key"
                    type="password"
                    placeholder="sk_live_..."
                    value={ext.stripeKey}
                    onChange={(e) => setExt((p) => ({ ...p, stripeKey: e.target.value }))}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  Google Maps API Key
                </Label>
                <Input
                  aria-label="Google Maps API Key"
                  type="password"
                  placeholder="AIza..."
                  value={ext.mapsApiKey}
                  onChange={(e) => setExt((p) => ({ ...p, mapsApiKey: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Used for address verification and service area mapping</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Feature Flags */}
      <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              Feature Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {toggles.map((t) => {
                const IconComp = t.icon
                return (
                  <div key={t.key} className="flex items-start justify-between gap-4 rounded-lg border border-border/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-muted p-2 mt-0.5">
                        <IconComp className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                    </div>
                    <Switch
                      aria-label={t.label}
                      checked={settings[t.key] as boolean}
                      onCheckedChange={(val: boolean) => setSettings((prev) => ({ ...prev, [t.key]: val }))}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save Button */}
      <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible">
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="gap-2 px-6" size="lg">
            <Save className="h-4 w-4" />
            Save All Settings
          </Button>
          {saved && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"
            >
              <CheckCircle className="h-4 w-4" />
              All settings saved successfully
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
