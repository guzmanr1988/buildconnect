import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, Shield, Mail, Phone, MapPin, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'

export default function AdminProfile() {
  const profile = useAuthStore((s) => s.profile)
  const logout = useAuthStore((s) => s.logout)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const navigate = useNavigate()

  // Ship #209 — fallback chain for missing name. Admin Supabase accounts
  // created via the admin API may lack the `name` field that sign-up
  // metadata populates for homeowner/vendor roles. Fall through to the
  // email's user-part as a derived display name so /admin/profile shows
  // SOMETHING identifying rather than the generic literal 'Admin'.
  // Rodolfo-direct 2026-04-21 pivot #27: 'On admin profile I don't see
  // the name'.
  const derivedName = profile?.name?.trim()
    || profile?.email?.split('@')[0]
    || 'Administrator'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-2xl"
    >
      <PageHeader title="Profile" description="Admin account details">
        <Badge variant="outline" className="text-xs gap-1">
          <Shield className="h-3 w-3" />
          Administrator
        </Badge>
      </PageHeader>

      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {profile && (
              <AvatarUpload
                avatarUrl={profile.avatar_url}
                initials={profile.initials ?? ''}
                color={profile.avatar_color}
                size="lg"
                onChange={(dataUrl) => updateProfile({ avatar_url: dataUrl ?? undefined })}
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold font-heading">{derivedName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                  Active
                </Badge>
                <Badge variant="secondary" className="text-xs gap-1">
                  <Shield className="h-3 w-3" />
                  Admin
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Ship #209 — dedicated Name row so missing data surfaces
              explicitly as 'Not set' rather than hiding behind the
              header h2's derived fallback. Admin can see at a glance
              whether their profile name is stored or being inferred. */}
          <div className="flex items-center gap-3 py-2 border-b border-border/50">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{profile?.name?.trim() || 'Not set'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-2 border-b border-border/50">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{profile?.email || 'admin@buildconnect.com'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-2 border-b border-border/50">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-medium">{profile?.phone || '(305) 555-0100'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-medium">{profile?.address || 'Miami, FL'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="destructive"
        size="lg"
        className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        Log Out
      </Button>
    </motion.div>
  )
}
