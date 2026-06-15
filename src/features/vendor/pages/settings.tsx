import { motion, type Variants } from 'framer-motion'
import { Settings2, UsersRound, CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/page-header'
import { useVendorSettingsStore } from '@/stores/vendor-settings-store'

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
    </div>
  )
}
