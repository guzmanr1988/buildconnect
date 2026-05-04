import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  User, Phone, Mail, MapPin,
  BadgeCheck, CreditCard, LogOut, MessageCircle,
  Plus, Trash2, Upload, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { useNavigate } from 'react-router-dom'
import { MOCK_VENDOR_BY_ID } from '@/lib/vendor-scope'
import { useAuthStore } from '@/stores/auth-store'
import { useVendorChangeRequestsStore } from '@/stores/vendor-change-requests-store'
import type { ContractorLicense } from '@/types'

const VENDOR_ID = 'v-1'

export default function VendorProfile() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const profile = useAuthStore((s) => s.profile)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const vendor = MOCK_VENDOR_BY_ID[VENDOR_ID]
  const createRequest = useVendorChangeRequestsStore((s) => s.createRequest)
  const hydrateVendor = useVendorChangeRequestsStore((s) => s.hydrateVendor)
  // Zustand-selector-returns-new-array-every-render = React error #185
  // infinite loop (ship #111 regression caught by apollo 1776720418731).
  // Select the stable array reference, useMemo the filter by-vendorId.
  const allRequests = useVendorChangeRequestsStore((s) => s.requests)
  const vendorIdKey = profile?.id ?? VENDOR_ID
  const myRequests = useMemo(
    () => allRequests.filter((r) => r.vendorId === vendorIdKey),
    [allRequests, vendorIdKey],
  )
  const pendingRequest = myRequests.find((r) => r.status === 'pending')

  useEffect(() => {
    hydrateVendor(vendorIdKey)
  }, [vendorIdKey, hydrateVendor])

  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [requestText, setRequestText] = useState('')

  // Contractor licenses — local draft seeded from profile, saved on explicit Save
  const [draftLicenses, setDraftLicenses] = useState<ContractorLicense[]>(
    () => profile?.contractor_licenses ?? [],
  )
  const [licensesSaving, setLicensesSaving] = useState(false)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const addLicenseRow = () => {
    setDraftLicenses((prev) => [
      ...prev,
      { id: `lic-${Date.now()}`, licenseNumber: '', addedAt: new Date().toISOString() },
    ])
  }

  const removeLicenseRow = (id: string) => {
    setDraftLicenses((prev) => prev.filter((l) => l.id !== id))
  }

  const updateLicenseNumber = (id: string, value: string) => {
    setDraftLicenses((prev) => prev.map((l) => l.id === id ? { ...l, licenseNumber: value } : l))
  }

  const handleLicenseImage = (id: string, file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setDraftLicenses((prev) => prev.map((l) => l.id === id ? { ...l, imageDataUrl: dataUrl } : l))
    }
    reader.readAsDataURL(file)
  }

  const saveLicenses = () => {
    setLicensesSaving(true)
    updateProfile({ contractor_licenses: draftLicenses })
    setLicensesSaving(false)
    toast.success('Contractor licenses saved.')
  }

  // Vendor Request Info Change flow (ship Phase C per kratos msg
  // 1776719583850). Vendors cannot self-edit — they submit a request with
  // free-text description; admin mediates approval + applies actual edits.
  // Mock-side for v1; Tranche-2 moves to Supabase-backed with RLS + audit.
  const handleSubmitRequest = async () => {
    const text = requestText.trim()
    if (!text) {
      toast.error('Describe what needs to change')
      return
    }
    try {
      await createRequest(
        profile?.id ?? VENDOR_ID,
        vendor.company,
        profile?.name ?? vendor.name,
        text,
      )
      setRequestText('')
      setRequestDialogOpen(false)
      toast.success('Request submitted. Admin will review shortly.')
    } catch {
      toast.error('Failed to submit request. Please try again.')
    }
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  } satisfies Variants
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  } satisfies Variants

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader title="Profile" description="Manage your company information">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRequestDialogOpen(true)}
          disabled={!!pendingRequest}
        >
          <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
          {pendingRequest ? 'Change requested' : 'Request Info Change'}
        </Button>
      </PageHeader>

      {pendingRequest && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/40 p-3 text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-100">Change request pending admin review</p>
          <p className="text-amber-800/80 dark:text-amber-200/80 mt-1 whitespace-pre-wrap">{pendingRequest.requestedChange}</p>
        </div>
      )}

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Request Profile Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Describe what needs to change — company name, address, phone, service categories, etc.
              Admin will review + apply the change or follow up.
            </p>
            <Textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="What info needs to change?"
              rows={4}
              className="text-sm resize-none"
              autoFocus
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRequestDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!requestText.trim()}
              onClick={handleSubmitRequest}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Company Info Card */}
      <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <AvatarUpload
                initials={(profile?.initials ?? vendor.initials) ?? ''}
                color={profile?.avatar_color ?? vendor.avatar_color}
                avatarUrl={profile?.avatar_url}
                size="lg"
                onChange={(dataUrl) => updateProfile({ avatar_url: dataUrl ?? undefined })}
              />
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

      {/* Ship #327 — Review Breakdown REMOVED per Rodolfo "review
          breakdown removed from profile" — relocated into the merged
          Performance Stats Card on /vendor/dashboard. Same pattern as
          #294 (Service Categories + Performance Stats relocated to
          dashboard) — profile keeps editable identity fields; dashboard
          owns at-a-glance metrics. */}

      {/* Contractor Licenses — vendor-identity attribute, hidden for account_rep */}
      {profile?.role !== 'account_rep' && <motion.div variants={item}>
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Contractor Licenses</CardTitle>
              <Button size="sm" variant="outline" onClick={addLicenseRow}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add License
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {draftLicenses.length === 0 && (
              <p className="text-sm text-muted-foreground">No licenses added. Click "Add License" to upload your contractor license.</p>
            )}
            {draftLicenses.map((lic) => (
              <div key={lic.id} className="flex flex-col sm:flex-row gap-3 items-start p-3 rounded-lg border bg-muted/30">
                {/* Image upload */}
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    className="h-20 w-28 rounded-md border bg-background flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition"
                    onClick={() => fileInputRefs.current[lic.id]?.click()}
                  >
                    {lic.imageDataUrl ? (
                      <img src={lic.imageDataUrl} alt="License" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <FileText className="h-6 w-6" />
                        <span className="text-[10px]">Upload</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={(el) => { fileInputRefs.current[lic.id] = el }}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleLicenseImage(lic.id, file)
                    }}
                  />
                  <button
                    className="text-[10px] text-primary flex items-center gap-0.5 hover:underline"
                    onClick={() => fileInputRefs.current[lic.id]?.click()}
                  >
                    <Upload className="h-3 w-3" />
                    {lic.imageDataUrl ? 'Replace' : 'Upload'}
                  </button>
                </div>

                {/* License number + remove */}
                <div className="flex-1 min-w-0 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">License Number</label>
                  <Input
                    value={lic.licenseNumber}
                    onChange={(e) => updateLicenseNumber(lic.id, e.target.value)}
                    placeholder="e.g. CGC1234567"
                    className="text-sm"
                  />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 mt-1"
                  onClick={() => removeLicenseRow(lic.id)}
                  aria-label="Remove license"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {draftLicenses.length > 0 && (
              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={saveLicenses} disabled={licensesSaving}>
                  Save Licenses
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>}

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
              <Button variant="destructive" size="sm" onClick={() => { logout(); navigate('/login') }}>
                <LogOut className="h-3.5 w-3.5 mr-1.5" /> Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
