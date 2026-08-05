import { motion, type Variants } from 'framer-motion'
import { Settings2, UsersRound, CreditCard, Home, HandCoins } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/page-header'
import { useVendorSettingsStore } from '@/stores/vendor-settings-store'
import { useAuthStore } from '@/stores/auth-store'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

export default function VendorSettingsPage() {
  const usersTabEnabled = useVendorSettingsStore((s) => s.usersTabEnabled)
  const setUsersTabEnabled = useVendorSettingsStore((s) => s.setUsersTabEnabled)
  const financingEnabled = useVendorSettingsStore((s) => s.financingEnabled)
  const setFinancingEnabled = useVendorSettingsStore((s) => s.setFinancingEnabled)
  // financingAvailable is the DB-persisted, homeowner-facing opt-in that drives
  // the "Financing Available" badge on vendor-compare. Distinct from
  // financingEnabled above, which is a client-only Zustand toggle controlling
  // the vendor-side Financing sidebar tab visibility (task_1784926281856_457).
  const financingAvailable = useAuthStore((s) => !!s.profile?.financing_available)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const handleFinancingAvailableChange = (v: boolean) => {
    void updateProfile({ financing_available: v }).catch((err) => {
      toast.error('Could not save Financing Available preference')
      console.error('[vendor-settings] financing_available update failed', err)
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your vendor portal preferences" />

      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Navigation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <UsersRound className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <Label htmlFor="users-tab-toggle" className="text-sm font-medium cursor-pointer">
                    Users tab
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Show or hide the Users section in the sidebar navigation.
                  </p>
                </div>
              </div>
              <Switch
                id="users-tab-toggle"
                checked={usersTabEnabled}
                onCheckedChange={setUsersTabEnabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <Label
                    htmlFor="financing-tab-toggle"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Financing
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Show the Financing tab and let homeowners apply through your selected partners.
                  </p>
                </div>
              </div>
              <Switch
                id="financing-tab-toggle"
                checked={financingEnabled}
                onCheckedChange={setFinancingEnabled}
                data-testid="vendor-settings-financing-toggle"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="h-4 w-4 text-muted-foreground" />
              Homeowner-facing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <HandCoins className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <Label
                    htmlFor="financing-available-toggle"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Offer financing to homeowners
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Show a "Financing Available" badge on your card in homeowner search results.
                  </p>
                </div>
              </div>
              <Switch
                id="financing-available-toggle"
                checked={financingAvailable}
                onCheckedChange={handleFinancingAvailableChange}
                data-testid="vendor-settings-financing-available-toggle"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
