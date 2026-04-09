import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings,
  Percent,
  DollarSign,
  CalendarDays,
  Wrench,
  Eye,
  Layers,
  Banknote,
  Save,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/shared/page-header'
import { MOCK_SETTINGS } from '@/lib/mock-data'
import type { AppSettings } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({ ...MOCK_SETTINGS })
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const toggles: {
    key: keyof AppSettings
    label: string
    description: string
    icon: React.ElementType
  }[] = [
    {
      key: 'maintenance_mode',
      label: 'Maintenance Mode',
      description: 'Take the platform offline for maintenance',
      icon: Wrench,
    },
    {
      key: 'ar_mode',
      label: 'AR Mode',
      description: 'Enable augmented reality visualization features',
      icon: Eye,
    },
    {
      key: 'phase2_enabled',
      label: 'Phase 2 Features',
      description: 'Kitchen, bathroom remodel services',
      icon: Layers,
    },
    {
      key: 'financing_enabled',
      label: 'Financing Options',
      description: 'Allow vendors to offer financing to homeowners',
      icon: Banknote,
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Configure platform behavior, revenue model, and feature flags" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Configuration */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Revenue Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                  Revenue Share %
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.revenue_share_pct}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, revenue_share_pct: Number(e.target.value) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Percentage of each closed sale taken as platform commission
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Subscription Fee $/mo
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.subscription_fee}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, subscription_fee: Number(e.target.value) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Monthly subscription fee charged to each vendor
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  Commission Payout Day
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={settings.payout_day}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, payout_day: Number(e.target.value) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Day of each month when vendor payouts are processed (1-28)
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Feature Flags */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <Card className="rounded-xl shadow-sm hover:shadow-md transition h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Feature Flags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {toggles.map((t) => {
                  const IconComp = t.icon
                  return (
                    <div
                      key={t.key}
                      className="flex items-start justify-between gap-4 rounded-lg border border-border/50 p-4"
                    >
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
                        checked={settings[t.key] as boolean}
                        onCheckedChange={(val: boolean) =>
                          setSettings((prev) => ({ ...prev, [t.key]: val }))
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Save Button */}
      <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="gap-2 px-6" size="lg">
            <Save className="h-4 w-4" />
            Save Settings
          </Button>
          {saved && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle className="h-4 w-4" />
              Settings saved successfully
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
