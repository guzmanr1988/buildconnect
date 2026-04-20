import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Phone, Mail, LogOut, Sun, Moon, Plus, Pencil, Trash2, Home as HomeIcon, Check, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AvatarInitials } from '@/components/shared/avatar-initials'
import { useAuthStore } from '@/stores/auth-store'
import { MOCK_HOMEOWNERS } from '@/lib/mock-data'
import type { SecondaryAddress } from '@/types'

type AddressFormData = Omit<SecondaryAddress, 'id'>
const emptyAddressForm: AddressFormData = { label: '', street: '', city: '', state: '', zip: '' }

export function HomeownerProfilePage() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const logout = useAuthStore((s) => s.logout)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const profile = useAuthStore((s) => s.profile) ?? MOCK_HOMEOWNERS[0]
  const additionalAddresses = profile.additional_addresses ?? []

  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [addressForm, setAddressForm] = useState<AddressFormData>(emptyAddressForm)
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null)

  // Profile self-edit (ship Phase B per kratos msg 1776719583850). Edit button
  // toggles form-mode on the primary profile card; save commits name/phone/
  // address via updateProfile (zustand-persist auto-syncs localStorage).
  // Email stays read-only (auth identity, changing requires re-auth flow).
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: profile.name,
    phone: profile.phone,
    address: profile.address,
  })

  const openProfileEdit = () => {
    setProfileForm({ name: profile.name, phone: profile.phone, address: profile.address })
    setProfileEditing(true)
  }

  const cancelProfileEdit = () => {
    setProfileEditing(false)
  }

  const saveProfileEdit = () => {
    const trimmed = {
      name: profileForm.name.trim(),
      phone: profileForm.phone.trim(),
      address: profileForm.address.trim(),
    }
    if (!trimmed.name || !trimmed.phone || !trimmed.address) {
      toast.error('Name, phone, and address are required')
      return
    }
    updateProfile(trimmed)
    setProfileEditing(false)
    toast.success('Profile updated')
  }

  const openAddAddress = () => {
    setEditingAddressId(null)
    setAddressForm(emptyAddressForm)
    setAddressDialogOpen(true)
  }

  const openEditAddress = (addr: SecondaryAddress) => {
    setEditingAddressId(addr.id)
    setAddressForm({ label: addr.label, street: addr.street, city: addr.city, state: addr.state ?? '', zip: addr.zip })
    setAddressDialogOpen(true)
  }

  const handleSaveAddress = () => {
    const trimmed = {
      label: addressForm.label.trim(),
      street: addressForm.street.trim(),
      city: addressForm.city.trim(),
      state: addressForm.state?.trim() || undefined,
      zip: addressForm.zip.trim(),
    }
    if (!trimmed.label || !trimmed.street || !trimmed.city || !trimmed.zip) {
      toast.error('Label, street, city, and zip are required')
      return
    }
    const next: SecondaryAddress[] = editingAddressId
      ? additionalAddresses.map((a) => (a.id === editingAddressId ? { id: a.id, ...trimmed } : a))
      : [...additionalAddresses, { id: crypto.randomUUID(), ...trimmed }]
    updateProfile({ additional_addresses: next })
    setAddressDialogOpen(false)
    toast.success(editingAddressId ? 'Address updated' : 'Address added')
  }

  const confirmDeleteAddress = (id: string) => setDeleteAddressId(id)
  const handleDeleteAddress = () => {
    if (!deleteAddressId) return
    updateProfile({ additional_addresses: additionalAddresses.filter((a) => a.id !== deleteAddressId) })
    setDeleteAddressId(null)
    toast.success('Address removed')
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold font-heading text-foreground">Profile</h1>

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="mb-6 flex flex-col items-center text-center">
              <AvatarInitials
                initials={profile.initials}
                color={profile.avatar_color}
                size="lg"
                className="mb-3"
              />
              <h2 className="text-xl font-bold font-heading text-foreground">
                {profile.name}
              </h2>
              <p className="text-sm capitalize text-muted-foreground">
                {profile.role}
              </p>
            </div>

            {profileEditing ? (
              <div className="flex flex-col gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name" className="text-xs">Name</Label>
                  <Input
                    id="profile-name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-email" className="text-xs">Email <span className="text-muted-foreground font-normal">(read-only)</span></Label>
                  <Input
                    id="profile-email"
                    value={profile.email}
                    disabled
                    className="h-9 bg-muted/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-phone" className="text-xs">Phone</Label>
                  <Input
                    id="profile-phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-address" className="text-xs">Address</Label>
                  <Input
                    id="profile-address"
                    value={profileForm.address}
                    onChange={(e) => setProfileForm((f) => ({ ...f, address: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 gap-1.5" onClick={saveProfileEdit}>
                    <Check className="h-3.5 w-3.5" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={cancelProfileEdit}>
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-foreground">{profile.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-foreground">{profile.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-foreground">{profile.address}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full gap-1.5"
                  onClick={openProfileEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Profile
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Additional Properties — secondary addresses the homeowner can target
          from any service configurator (Phase B1: UI + zustand; B3 adds Supabase). */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-heading">Additional Properties</CardTitle>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openAddAddress}>
              <Plus className="h-3.5 w-3.5" />
              Add Property
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            {additionalAddresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No additional properties yet. Add a second address here to target projects at other buildings you own.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {additionalAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="flex items-start justify-between gap-3 rounded-lg border bg-card/50 p-3"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <HomeIcon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{addr.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {addr.street}, {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.zip}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditAddress(addr)}
                        aria-label={`Edit ${addr.label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => confirmDeleteAddress(addr.id)}
                        aria-label={`Delete ${addr.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Day/Night Mode */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base font-heading">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon className="h-5 w-5 text-primary" />
                ) : (
                  <Sun className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <Label className="font-medium text-foreground">Dark Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Switch between day and night theme
                  </p>
                </div>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(checked: boolean) =>
                  setTheme(checked ? 'dark' : 'light')
                }
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Button
          variant="destructive"
          size="lg"
          className="w-full gap-2 h-11 text-sm font-medium"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </motion.div>

      {/* Add/Edit Address Dialog */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAddressId ? 'Edit Property' : 'Add Property'}</DialogTitle>
            <DialogDescription>
              {editingAddressId ? 'Update the property details.' : 'Add a property you want contractors to service.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="addr-label">Label</Label>
              <Input
                id="addr-label"
                placeholder="e.g. Guest House"
                value={addressForm.label}
                onChange={(e) => setAddressForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-street">Street</Label>
              <Input
                id="addr-street"
                placeholder="123 Main St"
                value={addressForm.street}
                onChange={(e) => setAddressForm((f) => ({ ...f, street: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="addr-city">City</Label>
                <Input
                  id="addr-city"
                  placeholder="Miami"
                  value={addressForm.city}
                  onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-state">State</Label>
                <Input
                  id="addr-state"
                  placeholder="FL"
                  value={addressForm.state ?? ''}
                  onChange={(e) => setAddressForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-zip">Zip</Label>
              <Input
                id="addr-zip"
                placeholder="33101"
                value={addressForm.zip}
                onChange={(e) => setAddressForm((f) => ({ ...f, zip: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddressDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAddress}>
              {editingAddressId ? 'Save Changes' : 'Add Property'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteAddressId} onOpenChange={(open) => !open && setDeleteAddressId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Property?</DialogTitle>
            <DialogDescription>
              This will remove the property from your list. You can add it again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAddressId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAddress}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
