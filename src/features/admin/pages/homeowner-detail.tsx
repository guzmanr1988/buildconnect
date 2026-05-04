import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Mail, FileText, CheckCircle2, AlertTriangle, ChevronRight, Ban, RotateCcw, Briefcase, Download, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { deriveInitials } from '@/lib/initials'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { HomeownerDetailHeader } from '@/components/shared/homeowner-detail-header'
import { ProjectDetailDialog } from '@/components/shared/project-detail-dialog'
import { useEffectiveMockLeads, useEffectiveMockClosedSales } from '@/lib/mock-data-effective'
import { useProjectsStore } from '@/stores/projects-store'
import { useAdminModerationStore } from '@/stores/admin-moderation-store'
import { useVendorHomeownerDocsStore, VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS } from '@/stores/vendor-homeowner-documents-store'
import { MOCK_HOMEOWNERS, MOCK_VENDORS } from '@/lib/mock-data'
import { toast } from 'sonner'

// Ship #280 — admin per-homeowner detail page mirroring #278 vendor
// homeowner-detail layout but admin god-view scope. Cross-vendor data
// sources, cross-role document visibility, admin-specific actions
// (Suspend/Reactivate). Reuses banked HomeownerDetailHeader (#280
// extraction at n=2) for the header card pattern.
//
// Sections (per kratos #280 scope, History deferred to #281):
// 1. Header card (avatar + contact + admin actions)
// 2. ALL Projects (cross-vendor: sentProjects + MOCK_LEADS + MOCK_CLOSED_SALES + CUSTOMER_PROJECTS)
// 3. Documents (homeowner-uploaded ID via sentProjects.idDocument
//    dedupe + vendor-uploaded docs via getAllDocsForHomeowner cross-
//    vendor flatten, grouped-by-vendor on display)

// Inline admin-fixture homeowner array (mirror of admin/homeowners.tsx
// HOMEOWNERS const). Per banked surface-vs-deep — extract to shared
// fixture module only at n=3+ consumers; currently 2 (admin/list +
// this detail page).
interface AdminHomeowner {
  id: string
  name: string
  email: string
  phone: string
  address: string
  avatar_color: string
  initials: string
  status: 'active' | 'pending' | 'suspended'
  created_at: string
}

const HOMEOWNERS: AdminHomeowner[] = [
  { id: 'ho-1', name: 'Maria Rodriguez', email: 'maria@email.com', phone: '(305) 555-0101', address: '1234 Coral Way, Miami, FL 33145', avatar_color: '#3b82f6', initials: 'MR', status: 'active', created_at: '2026-01-15T10:00:00Z' },
  { id: 'ho-2', name: 'James Thompson', email: 'james@email.com', phone: '(786) 555-0202', address: '5678 Kendall Dr, Miami, FL 33156', avatar_color: '#8b5cf6', initials: 'JT', status: 'active', created_at: '2026-02-03T14:30:00Z' },
  { id: 'ho-3', name: 'Sarah Chen', email: 'sarah@email.com', phone: '(954) 555-0303', address: '910 Princeton Blvd, Homestead, FL 33032', avatar_color: '#ec4899', initials: 'SC', status: 'active', created_at: '2026-02-20T09:15:00Z' },
  { id: 'ho-4', name: 'David Gonzalez', email: 'david.g@email.com', phone: '(305) 555-0404', address: '2200 Biscayne Blvd, Miami, FL 33137', avatar_color: '#f59e0b', initials: 'DG', status: 'pending', created_at: '2026-03-10T08:45:00Z' },
  { id: 'ho-5', name: 'Lisa Patel', email: 'lisa.patel@email.com', phone: '(786) 555-0505', address: '4400 Collins Ave, Miami Beach, FL 33140', avatar_color: '#10b981', initials: 'LP', status: 'suspended', created_at: '2026-01-28T11:20:00Z' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  sold: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
}

export default function AdminHomeownerDetail() {
  const navigate = useNavigate()
  const { homeownerId: rawId } = useParams<{ homeownerId: string }>()
  const homeownerEmail = rawId ? decodeURIComponent(rawId) : ''

  // Resolve homeowner from either inline HOMEOWNERS or MOCK_HOMEOWNERS
  // by email (URL key). Falls back to lookup-by-id if email not found
  // (legacy URL safety).
  const fixtureHomeowner = useMemo(
    () =>
      HOMEOWNERS.find((h) => h.email === homeownerEmail) ??
      MOCK_HOMEOWNERS.find((h) => h.email === homeownerEmail) ??
      HOMEOWNERS.find((h) => h.id === homeownerEmail),
    [homeownerEmail],
  )

  // Supabase fallback: when email not in fixtures, query profiles by email.
  // Enables admin to view detail pages for real-auth homeowners (walk-seed
  // and future signups) that aren't in the static HOMEOWNERS array.
  const [supabaseHomeowner, setSupabaseHomeowner] = useState<AdminHomeowner | null>(null)
  const [supabaseLoading, setSupabaseLoading] = useState(false)
  useEffect(() => {
    if (fixtureHomeowner || !homeownerEmail) return
    setSupabaseLoading(true)
    supabase
      .from('profiles')
      .select('id, name, email, phone, address, avatar_color, status, created_at')
      .eq('email', homeownerEmail)
      .eq('role', 'homeowner')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSupabaseHomeowner({
            id: data.id as string,
            name: (data.name as string) || homeownerEmail,
            email: data.email as string,
            phone: (data.phone as string) || '',
            address: (data.address as string) || '',
            avatar_color: (data.avatar_color as string) || '#3b82f6',
            initials: deriveInitials((data.name as string) || homeownerEmail),
            status: ((data.status as string) || 'active') as AdminHomeowner['status'],
            created_at: (data.created_at as string) || new Date().toISOString(),
          })
        }
        setSupabaseLoading(false)
      })
  }, [homeownerEmail, fixtureHomeowner])

  const resolvedHomeowner = fixtureHomeowner ?? supabaseHomeowner

  // Status overrides + actions
  const homeownerStatusOverrides = useAdminModerationStore((s) => s.homeownerStatusOverrides)
  const suspendHomeowner = useAdminModerationStore((s) => s.suspendHomeowner)
  const reactivateHomeowner = useAdminModerationStore((s) => s.reactivateHomeowner)
  const status = resolvedHomeowner
    ? homeownerStatusOverrides[resolvedHomeowner.id] ?? resolvedHomeowner.status
    : 'active'

  // Cross-vendor data sources
  const sentProjects = useProjectsStore((s) => s.sentProjects)
  const mockLeads = useEffectiveMockLeads()
  const mockClosedSales = useEffectiveMockClosedSales()
  const docsByVendorByHomeowner = useVendorHomeownerDocsStore((s) => s.docsByVendorByHomeowner)
  const hydrateAdminForHomeowner = useVendorHomeownerDocsStore((s) => s.hydrateAdminForHomeowner)
  useEffect(() => {
    if (homeownerEmail) hydrateAdminForHomeowner(homeownerEmail)
  }, [homeownerEmail, hydrateAdminForHomeowner])
  const allDocs = useMemo(() => {
    const all: ReturnType<typeof useVendorHomeownerDocsStore.getState>['getAllDocsForHomeowner'] extends (e: string) => infer R ? R : never = []
    Object.values(docsByVendorByHomeowner).forEach((vendorMap) => {
      const docs = vendorMap[homeownerEmail]
      if (docs) all.push(...docs)
    })
    return all.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
  }, [docsByVendorByHomeowner, homeownerEmail])

  // Confirm-suspend dialog
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // ALL Projects derivation (cross-vendor, sorted most-recent-first).
  const allProjects = useMemo(() => {
    if (!resolvedHomeowner) return []
    const rows: { id: string; date: string; project: string; vendor?: string; status: string; amount?: number; clickId: string | null }[] = []

    // sentProjects (cart-created) for THIS homeowner across all vendors.
    sentProjects
      .filter((sp) => sp.homeowner?.email === homeownerEmail)
      .forEach((sp) => {
        rows.push({
          id: `sp-${sp.id}`,
          date: sp.sentAt,
          project: sp.item.serviceName,
          vendor: sp.contractor?.company,
          status: sp.status,
          amount: sp.saleAmount,
          clickId: sp.id,
        })
      })

    // MOCK_LEADS bridged by email — across all vendors.
    mockLeads
      .filter((l) => l.email === homeownerEmail)
      .forEach((l) => {
        const v = MOCK_VENDORS.find((mv) => mv.id === l.vendor_id)
        rows.push({
          id: `ml-${l.id}`,
          date: l.received_at ?? l.slot ?? new Date().toISOString(),
          project: l.project,
          vendor: v?.company,
          status: l.status,
          clickId: l.id,
        })
      })

    // MOCK_CLOSED_SALES bridged via lead.email — across all vendors.
    mockClosedSales.forEach((cs) => {
      const lead = mockLeads.find((l) => l.id === cs.lead_id)
      if (!lead || lead.email !== homeownerEmail) return
      // Skip if a MOCK_LEADS row already added (same lead_id) — prefer
      // the lead row since it carries the canonical status; closed-sale
      // shows up implicitly via the sold-status on the lead row.
      const alreadyHas = rows.some((r) => r.id === `ml-${cs.lead_id}`)
      if (alreadyHas) {
        // Enrich the existing lead row with sale_amount.
        const idx = rows.findIndex((r) => r.id === `ml-${cs.lead_id}`)
        if (idx >= 0) rows[idx].amount = cs.sale_amount
        return
      }
      const v = MOCK_VENDORS.find((mv) => mv.id === cs.vendor_id)
      rows.push({
        id: `cs-${cs.id}`,
        date: cs.closed_at,
        project: cs.project,
        vendor: v?.company,
        status: 'sold',
        amount: cs.sale_amount,
        clickId: cs.lead_id, // ProjectDetailDialog dual-lookup via mockLeads.id (#279 same fix)
      })
    })

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [resolvedHomeowner, homeownerEmail, sentProjects, mockLeads, mockClosedSales])

  // Group docs by vendor for cross-vendor display.
  const docsByVendor = useMemo(() => {
    const map = new Map<string, typeof allDocs>()
    allDocs.forEach((d) => {
      const list = map.get(d.vendor_id) ?? []
      list.push(d)
      map.set(d.vendor_id, list)
    })
    return Array.from(map.entries()).map(([vendor_id, docs]) => {
      const v = MOCK_VENDORS.find((mv) => mv.id === vendor_id)
      return { vendor_id, vendorName: v?.company ?? vendor_id, docs }
    })
  }, [allDocs])

  // Homeowner-uploaded ID — first sentProject with idDocument set (one
  // per homeowner since cart-store keeps one ID per session). Mock-mode
  // bridge to homeowner-private localStorage; real-mode would query
  // Supabase Storage admin-read.
  const homeownerIdDocument = useMemo(() => {
    const sp = sentProjects.find((p) => p.homeowner?.email === homeownerEmail && p.idDocument)
    return sp?.idDocument ?? null
  }, [sentProjects, homeownerEmail])

  if (!resolvedHomeowner) {
    return (
      <div className="space-y-6">
        <Link to="/admin/homeowners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to homeowners
        </Link>
        {supabaseLoading ? (
          <p className="text-sm text-muted-foreground">Loading homeowner…</p>
        ) : (
          <EmptyState
            icon={AlertTriangle}
            title="Homeowner not found"
            description={`No homeowner with email ${homeownerEmail} in the registry.`}
          />
        )}
      </div>
    )
  }

  const handleSuspendConfirm = () => {
    if (!resolvedHomeowner) return
    suspendHomeowner(resolvedHomeowner.id)
    toast.success(`${resolvedHomeowner.name} suspended.`)
    setConfirmSuspend(false)
  }

  const handleReactivate = () => {
    if (!resolvedHomeowner) return
    reactivateHomeowner(resolvedHomeowner.id)
    toast.success(`${resolvedHomeowner.name} reactivated.`)
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/homeowners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to homeowners
      </Link>

      <PageHeader
        title={resolvedHomeowner.name}
        description={`${resolvedHomeowner.email} · status: ${status}`}
      />

      <HomeownerDetailHeader
        name={resolvedHomeowner.name}
        email={resolvedHomeowner.email}
        phone={resolvedHomeowner.phone}
        address={resolvedHomeowner.address}
        avatar_color={resolvedHomeowner.avatar_color}
        initials={resolvedHomeowner.initials}
        projectsLabel={`${allProjects.length} ${allProjects.length === 1 ? 'project' : 'projects'} across all vendors`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/admin/messages', { state: { homeownerId: resolvedHomeowner.id, homeownerName: resolvedHomeowner.name } })}>
              <MessageSquare className="h-3.5 w-3.5" />
              Message
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { window.location.href = `mailto:${resolvedHomeowner.email}` }}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </Button>
            {status === 'suspended' ? (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleReactivate}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reactivate
              </Button>
            ) : (
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setConfirmSuspend(true)}>
                <Ban className="h-3.5 w-3.5" />
                Suspend
              </Button>
            )}
          </>
        }
      />

      {/* Section 1: ALL Projects (cross-vendor) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">All Projects</h2>
          <span className="text-sm text-muted-foreground">({allProjects.length})</span>
        </div>
        {allProjects.length === 0 ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No projects yet for {resolvedHomeowner.name}.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {allProjects.map((p) => (
              <Card
                key={p.id}
                className="rounded-xl cursor-pointer hover:shadow-md transition"
                onClick={() => p.clickId && setSelectedProjectId(p.clickId)}
                data-admin-homeowner-project-row={p.id}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{p.project}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{fmtDate(p.date)}</span>
                      {p.vendor && <span>· {p.vendor}</span>}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[p.status] ?? 'bg-muted text-muted-foreground'}`}>{p.status}</span>
                    </p>
                  </div>
                  {typeof p.amount === 'number' && p.amount > 0 && (
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">{fmtCurrency(p.amount)}</p>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Documents (cross-vendor + cross-role) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Documents</h2>
        </div>

        {/* Subsection a: Homeowner-uploaded ID */}
        {homeownerIdDocument && (
          <Card className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <ShieldCheck className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">ID Document</p>
                <p className="text-[11px] text-muted-foreground">Uploaded by homeowner · cross-role visible per #267 flow</p>
              </div>
              <a
                href={homeownerIdDocument}
                download={`${resolvedHomeowner.name.replace(/\s/g, '-')}-id`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </CardContent>
          </Card>
        )}

        {/* Subsection b: Vendor-uploaded docs grouped by vendor */}
        {docsByVendor.length === 0 && !homeownerIdDocument ? (
          <Card className="rounded-xl"><CardContent className="p-5 text-sm text-muted-foreground">No documents on file for {resolvedHomeowner.name} yet.</CardContent></Card>
        ) : null}

        {docsByVendor.map((group) => (
          <div key={group.vendor_id} className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-3 flex items-center gap-2">
              <Briefcase className="h-3 w-3" />
              {group.vendorName}
            </h3>
            {group.docs.map((d) => (
              <Card key={d.id} className="rounded-xl">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{d.filename}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {d.category === 'other' && d.customLabel ? d.customLabel : VENDOR_HOMEOWNER_DOC_CATEGORY_LABELS[d.category]}
                      {' · '}
                      {fmtDate(d.uploadedAt)}
                    </p>
                  </div>
                  <a
                    href={d.dataUrl}
                    download={d.filename}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </section>

      {/* Project detail dialog (#248 dual-lookup pattern) */}
      <ProjectDetailDialog
        open={!!selectedProjectId}
        onClose={() => setSelectedProjectId(null)}
        projectId={selectedProjectId}
      />

      {/* Suspend confirm dialog */}
      <Dialog open={confirmSuspend} onOpenChange={setConfirmSuspend}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Suspend {resolvedHomeowner.name}?</DialogTitle>
            <DialogDescription>
              {resolvedHomeowner.name} will lose access to the platform until you reactivate. Their existing projects + documents stay on file for audit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setConfirmSuspend(false)}>
              Keep active
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleSuspendConfirm}>
              Suspend account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
