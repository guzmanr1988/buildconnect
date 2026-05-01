import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  FileCheck2, Plus, Pencil, Trash2, Search, Paperclip,
  Building2, PenLine, Download, Upload, RotateCcw, ChevronDown, ChevronUp,
  Briefcase, User, ChevronsUpDown,
} from 'lucide-react'
import SignaturePad from 'signature_pad'
import { PDFDocument } from 'pdf-lib'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { useVendorScope, useResolvedVendor } from '@/lib/vendor-scope'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useEffectiveMockLeads } from '@/lib/mock-data-effective'
import { useVendorHomeowners } from '@/lib/hooks/use-vendor-homeowners'
import {
  useVendorPermitsStore,
  PERMIT_STATUS_LABELS,
  PERMIT_TYPE_OPTIONS,
  type VendorPermit,
  type PermitStatus,
  type LinkedPermitEntity,
} from '@/stores/vendor-permits-store'
import { matchesSearch } from '@/lib/search-match'

// ─── Animation ───────────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: 'easeOut' },
  }),
} satisfies Variants

// ─── Tracker status styles ────────────────────────────────────────────────────

const STATUS_STYLE: Record<PermitStatus, string> = {
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  expired: 'bg-muted text-muted-foreground',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Permit Forms data ────────────────────────────────────────────────────────

type FormTypeKey = 'city-permit' | 'notice-of-commencement'

interface CityOption {
  key: string
  label: string
  pdfPath: string
  portalUrl: string
}

const CITY_OPTIONS: CityOption[] = [
  { key: 'miami',           label: 'City of Miami',           pdfPath: '/permits/city-permit/miami.pdf',           portalUrl: 'https://www.miamigov.com/Government/Departments/Building' },
  { key: 'miami-dade',      label: 'Miami-Dade County',       pdfPath: '/permits/city-permit/miami-dade.pdf',      portalUrl: 'https://www.miamidade.gov/permits/building-permits.asp' },
  { key: 'fort-lauderdale', label: 'Fort Lauderdale (Broward)', pdfPath: '/permits/city-permit/fort-lauderdale.pdf', portalUrl: 'https://www.broward.org/Building/Pages/PermitApplications.aspx' },
  { key: 'west-palm-beach', label: 'West Palm Beach',         pdfPath: '/permits/city-permit/west-palm-beach.pdf', portalUrl: 'https://www.wpb.org/government/development-services/building-division/permits' },
  { key: 'doral',           label: 'Doral',                   pdfPath: '/permits/city-permit/doral.pdf',           portalUrl: 'https://www.cityofdoral.com/government/departments/building' },
  { key: 'cutler-bay',      label: 'Cutler Bay',              pdfPath: '/permits/city-permit/cutler-bay.pdf',      portalUrl: 'https://www.cutlerbay-fl.gov/departments/building' },
  { key: 'homestead',       label: 'Homestead',               pdfPath: '/permits/city-permit/homestead.pdf',       portalUrl: 'https://www.cityofhomestead.com/139/Building-Division' },
]

// NOC: FL 713 text is statewide-uniform; recording is per county clerk.
// Miami-Dade Clerk form covers Miami, Miami-Dade, Doral, Cutler Bay, Homestead, Fort Lauderdale, WPB.
// Monroe County has its own clerk form.
interface NocJurisdiction {
  key: string
  label: string
  pdfPath: string
  downloadName: string
}

const NOC_JURISDICTIONS: NocJurisdiction[] = [
  { key: 'miami',           label: 'City of Miami',           pdfPath: '/permits/notice-of-commencement/miami-dade.pdf',   downloadName: 'noc-miami-signed.pdf' },
  { key: 'miami-dade',      label: 'Miami-Dade County',       pdfPath: '/permits/notice-of-commencement/miami-dade.pdf',   downloadName: 'noc-miami-dade-signed.pdf' },
  { key: 'fort-lauderdale', label: 'Fort Lauderdale',         pdfPath: '/permits/notice-of-commencement/miami-dade.pdf',   downloadName: 'noc-fort-lauderdale-signed.pdf' },
  { key: 'west-palm-beach', label: 'West Palm Beach',         pdfPath: '/permits/notice-of-commencement/miami-dade.pdf',   downloadName: 'noc-west-palm-beach-signed.pdf' },
  { key: 'doral',           label: 'Doral',                   pdfPath: '/permits/notice-of-commencement/miami-dade.pdf',   downloadName: 'noc-doral-signed.pdf' },
  { key: 'cutler-bay',      label: 'Cutler Bay',              pdfPath: '/permits/notice-of-commencement/miami-dade.pdf',   downloadName: 'noc-cutler-bay-signed.pdf' },
  { key: 'homestead',       label: 'Homestead',               pdfPath: '/permits/notice-of-commencement/miami-dade.pdf',   downloadName: 'noc-homestead-signed.pdf' },
  { key: 'monroe-county',   label: 'Monroe County',           pdfPath: '/permits/notice-of-commencement/monroe-county.pdf', downloadName: 'noc-monroe-county-signed.pdf' },
]

interface PermitManifest {
  available: Record<string, boolean>
}

function usePermitAvailability() {
  const [avail, setAvail] = useState<Record<string, boolean>>({})

  const reload = useCallback(() => {
    fetch('/permits/manifest.json', { cache: 'no-cache' })
      .then((r) => r.json() as Promise<PermitManifest>)
      .then((data) => setAvail(data.available ?? {}))
      .catch(() => setAvail({}))
  }, [])

  useEffect(() => { reload() }, [reload])

  return avail
}

// ─── Signature + PDF dialog ───────────────────────────────────────────────────

interface SignTarget {
  label: string
  pdfPath: string
  portalUrl: string
  downloadName: string
}

function SignatureCaptureDialog({
  open,
  onClose,
  target,
}: {
  open: boolean
  onClose: () => void
  target: SignTarget | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!open) {
      padRef.current?.off()
      padRef.current = null
      return
    }
    const timer = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
      padRef.current = new SignaturePad(canvas, {
        backgroundColor: 'rgba(255,255,255,0)',
        penColor: '#111827',
        minWidth: 1,
        maxWidth: 3,
      })
    }, 120)
    return () => clearTimeout(timer)
  }, [open])

  const handleDownloadSigned = async () => {
    if (!target) return
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error('Draw your signature first.')
      return
    }
    setProcessing(true)
    try {
      const sigDataUrl = padRef.current.toDataURL('image/png')
      const res = await fetch(target.pdfPath)
      if (!res.ok) {
        toast('PDF not loaded yet — opening the official portal.', { duration: 5000 })
        window.open(target.portalUrl, '_blank')
        return
      }
      const pdfBytes = await res.arrayBuffer()
      const pdfDoc = await PDFDocument.load(pdfBytes)
      const sigBytes = await fetch(sigDataUrl).then((r) => r.arrayBuffer())
      const sigImage = await pdfDoc.embedPng(sigBytes)
      const page = pdfDoc.getPages()[0]
      const { width } = page.getSize()
      const dims = sigImage.scale(0.45)
      page.drawImage(sigImage, { x: width - dims.width - 50, y: 90, width: dims.width, height: dims.height })
      const signed = await pdfDoc.save()
      const blob = new Blob([signed as unknown as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = target.downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Signed form downloaded.')
    } catch {
      toast.error('Could not process PDF. Try downloading from the portal.')
    } finally {
      setProcessing(false)
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    toast.success(`"${file.name}" ready — attach it to a permit record in the Tracker below.`)
    e.target.value = ''
  }

  if (!target) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{target.label}</DialogTitle>
          <DialogDescription>
            Draw your signature, then download the signed form.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Signature pad */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Signature</Label>
              <button
                onClick={() => padRef.current?.clear()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Clear
              </button>
            </div>
            <div className="rounded-lg border border-dashed border-border bg-muted/20 overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full"
                style={{ height: 140, touchAction: 'none', cursor: 'crosshair' }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Draw with mouse or touch</p>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={() => window.open(target.pdfPath, '_blank')}>
              <Download className="h-3.5 w-3.5" />
              Download Blank
            </Button>
          </div>

          <Button className="w-full gap-1.5" onClick={handleDownloadSigned} disabled={processing}>
            <PenLine className="h-4 w-4" />
            {processing ? 'Processing…' : 'Download Signed Form'}
          </Button>

          {/* Upload signed copy */}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Have a signed copy already? Upload and attach it to a permit record in the Tracker.
            </p>
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => uploadRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Upload Signed Copy
            </Button>
            <input ref={uploadRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleUpload} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Permit Forms Section ─────────────────────────────────────────────────────

function PermitFormsSection() {
  const avail = usePermitAvailability()
  const [formType, setFormType] = useState<FormTypeKey>('city-permit')
  const [selectedCity, setSelectedCity] = useState<string>(CITY_OPTIONS[0].key)
  const [selectedNocKey, setSelectedNocKey] = useState<string>(NOC_JURISDICTIONS[0].key)
  const [sigOpen, setSigOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const city = CITY_OPTIONS.find((c) => c.key === selectedCity) ?? CITY_OPTIONS[0]
  const nocJurisdiction = NOC_JURISDICTIONS.find((j) => j.key === selectedNocKey) ?? NOC_JURISDICTIONS[0]

  const signTarget: SignTarget = formType === 'city-permit'
    ? {
        label: `${city.label} — Building Permit`,
        pdfPath: city.pdfPath,
        portalUrl: city.portalUrl,
        downloadName: `city-permit-${city.key}-signed.pdf`,
      }
    : {
        label: `Notice of Commencement — ${nocJurisdiction.label}`,
        pdfPath: nocJurisdiction.pdfPath,
        portalUrl: 'https://www.miami-dadeclerk.com/official-records',
        downloadName: nocJurisdiction.downloadName,
      }

  const pdfAvailKey = formType === 'city-permit'
    ? `city-permit/${selectedCity}`
    : nocJurisdiction.pdfPath.replace('/permits/', '').replace('.pdf', '')
  const pdfAvailable = avail[pdfAvailKey] ?? false

  return (
    <Card className="rounded-xl shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2.5">
          <Building2 className="h-4 w-4 text-primary" />
          <div>
            <div className="font-semibold text-sm">Permit Forms</div>
            <div className="text-[11px] text-muted-foreground">
              South Florida permit applications — sign in-app and attach to projects
            </div>
          </div>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <CardContent className="px-5 pb-5 pt-0">
          <div className="max-w-xl space-y-5">
            {/* Form type selector */}
            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'city-permit' as const, label: 'City Permit' },
                    { key: 'notice-of-commencement' as const, label: 'Notice of Commencement' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFormType(key)}
                    className={cn(
                      'rounded-lg border px-4 py-3 text-sm font-medium text-left transition-colors',
                      formType === key
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* City dropdown (city permit only) */}
            {formType === 'city-permit' && (
              <div>
                <Label className="mb-1.5 block">Jurisdiction</Label>
                <Select value={selectedCity} onValueChange={(v) => setSelectedCity(v ?? selectedCity)}>
                  <SelectTrigger className="w-[280px]">
                    <span className="flex-1 text-left text-sm truncate">{city.label}</span>
                  </SelectTrigger>
                  <SelectContent className="min-w-[280px]" align="start">
                    {CITY_OPTIONS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* NOC jurisdiction dropdown */}
            {formType === 'notice-of-commencement' && (
              <div className="space-y-3">
                <div>
                  <Label className="mb-1.5 block">Recording Jurisdiction</Label>
                  <Select value={selectedNocKey} onValueChange={(v) => setSelectedNocKey(v ?? selectedNocKey)}>
                    <SelectTrigger className="w-[280px]">
                      <span className="flex-1 text-left text-sm truncate">{nocJurisdiction.label}</span>
                    </SelectTrigger>
                    <SelectContent className="min-w-[280px]" align="start">
                      {NOC_JURISDICTIONS.map((j) => (
                        <SelectItem key={j.key} value={j.key}>{j.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  FL Statute 713 — required for all jobs over $5,000. Filed with the county clerk before work begins.
                </p>
              </div>
            )}

            {/* PDF status + actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!pdfAvailable && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  Official PDF pending — placeholder active
                </span>
              )}
              <Button size="sm" className="gap-1.5" onClick={() => setSigOpen(true)}>
                <PenLine className="h-3.5 w-3.5" />
                Sign &amp; Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(signTarget.pdfPath, '_blank')}
              >
                <Download className="h-3.5 w-3.5" />
                Download Blank
              </Button>
            </div>
          </div>
        </CardContent>
      )}

      <SignatureCaptureDialog
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        target={signTarget}
      />
    </Card>
  )
}

// ─── Linked-entity combobox ───────────────────────────────────────────────────

interface LinkedEntityOption {
  type: 'project' | 'homeowner'
  id: string
  name: string
}

function LinkedEntityCombobox({
  value,
  entityType,
  projects,
  homeowners,
  onSelect,
}: {
  value: string
  entityType: 'project' | 'homeowner' | ''
  projects: LinkedEntityOption[]
  homeowners: LinkedEntityOption[]
  onSelect: (opt: LinkedEntityOption) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-8 px-2.5"
        >
          <span className="flex items-center gap-1.5 truncate min-w-0">
            {entityType === 'project' && <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            {entityType === 'homeowner' && <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className={cn('truncate text-sm', !value && 'text-muted-foreground')}>
              {value || 'Select a project or homeowner…'}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects and homeowners…" />
          <CommandList>
            <CommandEmpty>No matches — type a homeowner or project name.</CommandEmpty>
            {projects.length > 0 && (
              <CommandGroup heading="Projects">
                {projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => { onSelect(p); setOpen(false) }}
                  >
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {projects.length > 0 && homeowners.length > 0 && <CommandSeparator />}
            {homeowners.length > 0 && (
              <CommandGroup heading="Homeowners">
                {homeowners.map((h) => (
                  <CommandItem
                    key={h.id}
                    value={h.name}
                    onSelect={() => { onSelect(h); setOpen(false) }}
                  >
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{h.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────

const BLANK_FORM = {
  projectName: '',
  leadId: '',
  linkedEntityType: '' as 'project' | 'homeowner' | '',
  permitType: '',
  permitNumber: '',
  status: 'pending' as PermitStatus,
  issueDate: '',
  expirationDate: '',
  jurisdiction: '',
  notes: '',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VendorPermitsPage() {
  const { vendorId } = useVendorScope()
  const vendor = useResolvedVendor()
  const profile = useAuthStore((s) => s.profile)
  const accountRepIdByLead = useProjectsStore((s) => s.accountRepIdByLead)
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const mockLeads = useEffectiveMockLeads()
  const vendorHomeowners = useVendorHomeowners()
  const { permits, addPermit, updatePermit, deletePermit } = useVendorPermitsStore()

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<VendorPermit | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VendorPermit | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<typeof BLANK_FORM>(BLANK_FORM)
  const [statusFilter, setStatusFilter] = useState<PermitStatus | 'all'>('all')

  const isRep = profile?.role === 'account_rep'

  const projectOptions = useMemo<LinkedEntityOption[]>(() => {
    const seen = new Set<string>()
    const opts: LinkedEntityOption[] = []
    mockLeads
      .filter((l) => {
        if (l.vendor_id !== vendorId) return false
        if (isRep && profile?.id) return accountRepIdByLead[l.id] === profile.id
        return true
      })
      .forEach((l) => {
        if (seen.has(l.id)) return
        seen.add(l.id)
        opts.push({ type: 'project', id: l.id, name: l.project })
      })
    if (vendor) {
      sentProjects
        .filter((sp) => {
          if (sp.contractor?.vendor_id) { if (sp.contractor.vendor_id !== vendor.id) return false }
          else if (sp.contractor?.company !== vendor.company) return false
          if (isRep && profile?.id) {
            const lid = `L-${sp.id.slice(0, 4).toUpperCase()}`
            return accountRepIdByLead[lid] === profile.id
          }
          return true
        })
        .forEach((sp) => {
          const lid = `L-${sp.id.slice(0, 4).toUpperCase()}`
          if (seen.has(lid)) return
          seen.add(lid)
          const name = sp.item?.serviceName
            ? `${sp.item.serviceName} — ${sp.homeowner?.name ?? ''}`
            : (sp.homeowner?.name ?? 'Unknown Project')
          opts.push({ type: 'project', id: lid, name })
        })
    }
    return opts
  }, [vendorId, vendor, mockLeads, sentProjects, isRep, profile?.id, accountRepIdByLead])

  const homeownerOptions = useMemo<LinkedEntityOption[]>(() =>
    vendorHomeowners.map((h) => ({ type: 'homeowner' as const, id: h.id, name: h.name })),
    [vendorHomeowners],
  )

  const vendorPermits = useMemo(() => {
    let list = permits.filter((p) => p.vendorId === vendorId)
    if (isRep && profile?.id) {
      list = list.filter((p) => {
        if (!p.leadId) return false
        return accountRepIdByLead[p.leadId] === profile.id
      })
    }
    return list
  }, [permits, vendorId, isRep, profile?.id, accountRepIdByLead])

  const filtered = useMemo(() => {
    let list = vendorPermits
    if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter)
    if (search.trim()) {
      list = list.filter((p) =>
        matchesSearch({
          query: search,
          fields: [p.projectName, p.permitType, p.permitNumber, p.jurisdiction, p.notes ?? ''],
        }),
      )
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [vendorPermits, statusFilter, search])

  const openAdd = () => {
    setEditTarget(null)
    setForm(BLANK_FORM)
    setDialogOpen(true)
  }

  const openEdit = (permit: VendorPermit) => {
    setEditTarget(permit)
    setForm({
      projectName: permit.projectName,
      leadId: permit.leadId ?? '',
      linkedEntityType: permit.linkedEntity?.type ?? '',
      permitType: permit.permitType,
      permitNumber: permit.permitNumber,
      status: permit.status,
      issueDate: permit.issueDate ?? '',
      expirationDate: permit.expirationDate ?? '',
      jurisdiction: permit.jurisdiction,
      notes: permit.notes ?? '',
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!form.projectName.trim() || !form.permitType || !form.permitNumber.trim() || !form.jurisdiction.trim()) {
      toast.error('Fill in project name, permit type, permit number, and jurisdiction.')
      return
    }
    const linkedEntity: LinkedPermitEntity | undefined =
      form.linkedEntityType && form.leadId && form.projectName
        ? { type: form.linkedEntityType as 'project' | 'homeowner', id: form.leadId.trim(), name: form.projectName.trim() }
        : undefined
    const payload = {
      vendorId,
      projectName: form.projectName.trim(),
      leadId: form.leadId.trim() || undefined,
      linkedEntity,
      permitType: form.permitType,
      permitNumber: form.permitNumber.trim(),
      status: form.status,
      issueDate: form.issueDate || undefined,
      expirationDate: form.expirationDate || undefined,
      jurisdiction: form.jurisdiction.trim(),
      notes: form.notes.trim() || undefined,
    }
    if (editTarget) {
      updatePermit(editTarget.id, payload)
      toast.success('Permit updated.')
    } else {
      addPermit(payload)
      toast.success('Permit added.')
    }
    setDialogOpen(false)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deletePermit(deleteTarget.id)
    toast.success('Permit removed.')
    setDeleteOpen(false)
    setDeleteTarget(null)
  }

  const counts = useMemo(() => ({
    all: vendorPermits.length,
    approved: vendorPermits.filter((p) => p.status === 'approved').length,
    pending: vendorPermits.filter((p) => p.status === 'pending').length,
    expired: vendorPermits.filter((p) => p.status === 'expired').length,
    rejected: vendorPermits.filter((p) => p.status === 'rejected').length,
  }), [vendorPermits])

  return (
    <div className="space-y-6">
      <PageHeader title="Project Permits" description="City permit forms and tracker for your active projects">
        {!isRep && (
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add Permit
          </Button>
        )}
      </PageHeader>

      {/* ── Permit Forms (vendor + rep — tracker write is rep-blocked, forms are not) ── */}
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <PermitFormsSection />
      </motion.div>

      {/* ── Permit Tracker ── */}
      <motion.div custom={isRep ? 0 : 1} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm overflow-hidden">
          <CardHeader className="px-5 py-4 border-b">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-primary" />
              Permit Tracker
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-4 space-y-4">
            {/* Status chips */}
            <div className="flex flex-wrap gap-2">
              {(['all', 'approved', 'pending', 'expired', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border',
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-transparent hover:bg-muted/80',
                  )}
                >
                  {s === 'all' ? 'All' : PERMIT_STATUS_LABELS[s]}
                  <span className="ml-1.5 opacity-70">{counts[s]}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            {vendorPermits.length > 0 && (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search project, permit #, jurisdiction…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}

            {/* Table or empty state */}
            {vendorPermits.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="No permits tracked yet"
                description="Add a permit to start tracking approvals and deadlines."
                action={!isRep ? { label: 'Add Permit', onClick: openAdd } : undefined}
              />
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No permits match your filter.</p>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold pl-5">Linked To</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Permit #</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Issued</TableHead>
                      <TableHead className="font-semibold">Expires</TableHead>
                      <TableHead className="font-semibold">Jurisdiction</TableHead>
                      <TableHead className="font-semibold">Docs</TableHead>
                      {!isRep && <TableHead className="w-20 pr-5" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((permit) => (
                      <TableRow key={permit.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium max-w-[140px] pl-5">
                          <div className="truncate flex items-center gap-1">
                            {permit.linkedEntity?.type === 'project' && <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />}
                            {permit.linkedEntity?.type === 'homeowner' && <User className="h-3 w-3 text-muted-foreground shrink-0" />}
                            {permit.projectName}
                          </div>
                          {permit.notes && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{permit.notes}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{permit.permitType}</TableCell>
                        <TableCell className="font-mono text-xs">{permit.permitNumber}</TableCell>
                        <TableCell>
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            STATUS_STYLE[permit.status],
                          )}>
                            {PERMIT_STATUS_LABELS[permit.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(permit.issueDate)}</TableCell>
                        <TableCell className={cn(
                          'text-sm whitespace-nowrap',
                          permit.status === 'expired' ? 'text-destructive' : 'text-muted-foreground',
                        )}>
                          {fmtDate(permit.expirationDate)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px]">
                          <span className="truncate block">{permit.jurisdiction}</span>
                        </TableCell>
                        <TableCell>
                          <button
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => toast('Document upload coming soon — Tranche-2.')}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {permit.documentNames?.length
                              ? <span>{permit.documentNames.length}</span>
                              : <span className="opacity-50">0</span>}
                          </button>
                        </TableCell>
                        {!isRep && (
                          <TableCell className="pr-5">
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1 rounded hover:bg-muted transition-colors"
                                onClick={() => openEdit(permit)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              <button
                                className="p-1 rounded hover:bg-muted transition-colors"
                                onClick={() => { setDeleteTarget(permit); setDeleteOpen(true) }}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{editTarget ? 'Edit Permit' : 'Add Permit'}</DialogTitle>
            <DialogDescription>Fill in the permit details for your project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="mb-1.5 block">Project / Homeowner <span className="text-destructive">*</span></Label>
                <LinkedEntityCombobox
                  value={form.projectName}
                  entityType={form.linkedEntityType}
                  projects={projectOptions}
                  homeowners={homeownerOptions}
                  onSelect={(opt) => setForm((f): typeof BLANK_FORM => ({
                    ...f,
                    projectName: opt.name,
                    leadId: opt.id,
                    linkedEntityType: opt.type,
                  }))}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Permit Type <span className="text-destructive">*</span></Label>
                <Select value={form.permitType} onValueChange={(v) => setForm((f): typeof BLANK_FORM => ({ ...f, permitType: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {PERMIT_TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">Permit Number <span className="text-destructive">*</span></Label>
                <Input
                  value={form.permitNumber}
                  onChange={(e) => setForm((f): typeof BLANK_FORM => ({ ...f, permitNumber: e.target.value }))}
                  placeholder="e.g. MDC-2026-B-01234"
                />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Jurisdiction <span className="text-destructive">*</span></Label>
                <Input
                  value={form.jurisdiction}
                  onChange={(e) => setForm((f): typeof BLANK_FORM => ({ ...f, jurisdiction: e.target.value }))}
                  placeholder="e.g. Miami-Dade County"
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f): typeof BLANK_FORM => ({ ...f, status: v as PermitStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERMIT_STATUS_LABELS) as PermitStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{PERMIT_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">Issue Date</Label>
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm((f): typeof BLANK_FORM => ({ ...f, issueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Expiration Date</Label>
                <Input
                  type="date"
                  value={form.expirationDate}
                  onChange={(e) => setForm((f): typeof BLANK_FORM => ({ ...f, expirationDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Attach Documents</Label>
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => toast('Document upload coming in Tranche-2.')}>
                  <Paperclip className="h-4 w-4" />
                  Upload (coming soon)
                </Button>
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5 block">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f): typeof BLANK_FORM => ({ ...f, notes: e.target.value }))}
                  placeholder="Inspector notes, submission tracking, etc."
                  rows={3}
                  maxLength={400}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editTarget ? 'Save Changes' : 'Add Permit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Remove Permit?</DialogTitle>
            <DialogDescription>
              This removes permit <span className="font-mono font-semibold">{deleteTarget?.permitNumber}</span> for <strong>{deleteTarget?.projectName}</strong> — the record will be gone permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Keep It</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Remove Permit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
