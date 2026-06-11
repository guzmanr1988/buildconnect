// Phase 1 Admin Financing surface — task_1779054206392_927
//
// Wires to AS-SHIPPED schema (migrations 047 + 048 + 049 + 050 + 051):
//   - lenders (32 rows: 15 contractor_pos / 12 personal_loans / 5 solar_hi_specialty)
//   - feature_flags (key='financing_enabled' master + 3 per-category keys
//     'financing_category_<category>' upserted on first toggle)
//   - admin-create-approval Edge Fn (already deployed; called from Set
//     Approval dialog)
//
// 3-axis toggle model (per Rod scope):
//   1. Master:   feature_flags.financing_enabled  (off = all financing UI dark)
//   2. Category: feature_flags.financing_category_<category>  (per-bucket gate)
//   3. Per-lender: lenders.active  (one row per partner)
//
// Friction fixes folded in per apollo ref §5 (F1-F8):
//   F1 — inline shadcn Switch on every lender row (most-tapped action)
//   F2 — leading Checkbox column + sticky bottom action bar when ≥1 selected
//   F3 — multi-axis filter: Category Select + Status Select + search + Clear
//   F4 — useMobile() conditional: ≥768px Table / <768px stacked Card-per-row
//   F5 — CSV import dialog: paste OR upload, preview, confirm
//   F6 — inline help text under every form Label
//   F7 — Clear filters affordance always when any filter ≠ default
//   F8 — extended 4-refinement type-confirm: master OFF + delete-lender +
//        per-lender approval-set ≥ $50k envelope (named-target, earned-by-
//        typing, steer-to-cancel, verb-matched-cancel)
//
// Test-id taxonomy (apollo walker pre-baked):
//   admin-financing-master-toggle
//   admin-financing-category-toggle  + data-category="<category>"
//   admin-financing-lender-row       + data-target-lender-id="<id>"
//   admin-financing-lender-toggle    + data-target-lender-id="<id>"
//   admin-financing-bulk-checkbox    + data-target-lender-id="<id>"
//   admin-financing-add-lender-dialog
//   admin-financing-edit-lender-dialog
//   admin-financing-csv-import-dialog
//   admin-financing-master-off-confirm-dialog
//   admin-financing-delete-lender-confirm-dialog
//   admin-financing-tab-lenders / admin-financing-tab-approvals / admin-financing-tab-audit
//   admin-financing-clear-filters
//
// Mutations: lenders + feature_flags writes use supabase-js direct (admin JWT
// + RLS write-admin policies per migration 048). admin-create-approval calls
// go through Edge Fn (service_role-only writes for financing_applications +
// financing_approvals + customer_financing_profile per migration 047 RLS).
//
// Tabs scope (this PR):
//   - Lenders  — fully wired (master + category + per-lender + CRUD + CSV + bulk)
//   - Approvals — placeholder (T+1 PR wires live query + Set Approval dialog)
//   - Audit    — placeholder (T+1 PR wires live audit_log query + filter)

import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Upload,
  X as XIcon,
  Loader2,
  Building2,
  Wallet,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useMobile } from '@/hooks/use-mobile'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { matchesSearch } from '@/lib/search-match'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LenderCategory = 'contractor_pos' | 'personal_loans' | 'solar_hi_specialty' | 'pace' | 'credit_unions'

type Lender = {
  id: string
  name: string
  category: LenderCategory
  contact_email: string | null
  notes: string | null
  apply_url: string | null
  apply_instructions: string | null
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type FeatureFlag = { key: string; enabled: boolean }

type StatusFilter = 'all' | 'active' | 'inactive'
type CategoryFilter = LenderCategory | 'all'

const CATEGORY_LABELS: Record<LenderCategory, string> = {
  contractor_pos: 'Contractor POS',
  personal_loans: 'Personal Loans',
  solar_hi_specialty: 'Solar & HI Specialty',
  pace: 'PACE Financing',
  credit_unions: 'Credit Unions',
}

const CATEGORY_KEYS: Record<LenderCategory, string> = {
  contractor_pos: 'financing_category_contractor_pos',
  personal_loans: 'financing_category_personal_loans',
  solar_hi_specialty: 'financing_category_solar_hi_specialty',
  pace: 'financing_category_pace',
  credit_unions: 'financing_category_credit_unions',
}

const MASTER_KEY = 'financing_enabled'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

function categoryBadge(category: LenderCategory) {
  const map: Record<LenderCategory, string> = {
    contractor_pos: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    personal_loans: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
    solar_hi_specialty: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    pace: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    credit_unions: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', map[category])}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

function statusBadge(active: boolean) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Inactive
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Credit Unions tab (static, no migration)                           */
/* ------------------------------------------------------------------ */

type CUCounty = 'miami-dade' | 'broward' | 'palm-beach' | 'statewide'

type CreditUnion = {
  id: string
  name: string
  shortName: string
  counties: CUCounty[]
  products: string[]
  applyUrl: string
  specialty?: string
  specialtyNote?: string
  active: boolean
}

const COUNTY_LABELS: Record<CUCounty, string> = {
  'miami-dade': 'Miami-Dade',
  broward: 'Broward',
  'palm-beach': 'Palm Beach',
  statewide: 'Statewide',
}

function countyBadgeClass(county: string) {
  return (
    ({
      'miami-dade': 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400',
      broward: 'border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-400',
      'palm-beach': 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400',
      statewide: 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400',
    } as Record<string, string>)[county] ?? ''
  )
}

const CREDIT_UNIONS: CreditUnion[] = [
  {
    id: 'dcfcu',
    name: 'Dade County Federal Credit Union',
    shortName: 'DCFCU',
    counties: ['miami-dade'],
    products: ['Home Equity', 'Personal Loans', 'Auto'],
    applyUrl: 'https://www.dcfcu.org/',
    active: true,
  },
  {
    id: 'pfcu',
    name: 'Power Financial Credit Union',
    shortName: 'PFCU',
    counties: ['miami-dade', 'broward'],
    products: ['Home Equity', 'HELOC', 'Personal Loans'],
    applyUrl: 'https://www.powerfi.org/',
    active: true,
  },
  {
    id: 'we-florida',
    name: 'We Florida Financial',
    shortName: 'We Florida',
    counties: ['broward', 'palm-beach'],
    products: ['Home Improvement', 'HELOC', 'Personal Loans'],
    applyUrl: 'https://www.wefloridafinancial.com/',
    active: true,
  },
  {
    id: 'tropical',
    name: 'Tropical Financial Credit Union',
    shortName: 'Tropical FCU',
    counties: ['miami-dade', 'broward'],
    products: ['Home Equity', 'Personal Loans'],
    applyUrl: 'https://www.tropicalfcu.com/',
    active: true,
  },
  {
    id: 'brightstar',
    name: 'BrightStar Credit Union',
    shortName: 'BrightStar',
    counties: ['broward'],
    products: ['Home Equity', 'HELOC', 'Personal Loans'],
    applyUrl: 'https://www.bscu.org/',
    active: true,
  },
  {
    id: 'sccu',
    name: 'Space Coast Credit Union',
    shortName: 'SCCU',
    counties: ['statewide'],
    products: ['Home Equity', 'HELOC', 'Personal Loans'],
    applyUrl: 'https://www.sccu.com/',
    active: true,
  },
  {
    id: 'ucu',
    name: 'University Credit Union',
    shortName: 'UCU Miami',
    counties: ['miami-dade'],
    products: ['Personal Loans', 'Auto'],
    applyUrl: 'https://www.ucumiami.org/',
    active: true,
  },
  {
    id: 'sfefcu',
    name: 'South Florida Educational Federal Credit Union',
    shortName: 'SFEFCU',
    counties: ['miami-dade'],
    products: ['Home Equity', 'Personal Loans'],
    applyUrl: 'https://www.sfefcu.org/',
    active: true,
  },
  {
    id: 'jetstream',
    name: 'JetStream Federal Credit Union',
    shortName: 'JetStream FCU',
    counties: ['miami-dade'],
    products: ['Home Help Loan', 'Personal Loans'],
    applyUrl: 'https://www.jsfcu.org/',
    specialty: 'Contractor-Paid',
    specialtyNote:
      'Home Help Loan funds go direct to the contractor — strongest alignment with BuildConnect vendor flow. Miami-Dade only.',
    active: true,
  },
  {
    id: 'ithink',
    name: 'iTHINK Financial',
    shortName: 'iTHINK',
    counties: ['broward', 'palm-beach'],
    products: ['Home Equity', 'HELOC', 'Personal Loans'],
    applyUrl: 'https://www.ithinkfi.org/',
    specialtyNote:
      'Does not serve Miami-Dade — only surface to homeowners in Broward or Palm Beach.',
    active: true,
  },
  {
    id: 'velocity',
    name: 'Velocity Community Credit Union',
    shortName: 'Velocity Community',
    counties: ['palm-beach'],
    products: ['Home Equity', 'Personal Loans'],
    applyUrl: 'https://www.velocitycommunity.org/',
    active: true,
  },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminFinancingPage() {
  const isMobile = useMobile()

  /* ---- Data state ---- */
  const [lenders, setLenders] = useState<Lender[]>([])
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  /* ---- Tabs ---- */
  const [tab, setTab] = useState<'lenders' | 'approvals' | 'audit' | 'credit-unions'>('lenders')

  /* ---- Credit Unions tab state (static, no DB) ---- */
  const [creditUnions, setCreditUnions] = useState<CreditUnion[]>(CREDIT_UNIONS)
  const [cuCountyFilter, setCuCountyFilter] = useState<string>('all')
  const [cuSearch, setCuSearch] = useState('')

  /* ---- Filter state ---- */
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  /* ---- Bulk-select state (F2) ---- */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  /* ---- Add / Edit dialog state ---- */
  const [addOpen, setAddOpen] = useState(false)
  const [editLender, setEditLender] = useState<Lender | null>(null)
  const [newLender, setNewLender] = useState<{
    name: string
    category: LenderCategory
    contact_email: string
    notes: string
    apply_url: string
    apply_instructions: string
    sort_order: number
  }>({
    name: '',
    category: 'contractor_pos',
    contact_email: '',
    notes: '',
    apply_url: '',
    apply_instructions: '',
    sort_order: 0,
  })

  /* ---- CSV import (F5) ---- */
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvSubmitting, setCsvSubmitting] = useState(false)

  /* ---- 4-refinement confirm state (F8) ---- */
  const [masterOffConfirmOpen, setMasterOffConfirmOpen] = useState(false)
  const [masterOffTyped, setMasterOffTyped] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Lender | null>(null)
  const [deleteTyped, setDeleteTyped] = useState('')

  /* ---- Fetch lenders + feature_flags ---- */
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: lendersData, error: lendersErr }, { data: flagsData, error: flagsErr }] =
        await Promise.all([
          supabase
            .from('lenders')
            .select('*')
            .is('deleted_at', null)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
          supabase.from('feature_flags').select('key, enabled'),
        ])
      if (cancelled) return
      if (lendersErr) {
        toast.error(`Load lenders failed: ${lendersErr.message}`)
      }
      if (flagsErr) {
        toast.error(`Load flags failed: ${flagsErr.message}`)
      }
      setLenders((lendersData ?? []) as Lender[])
      const flagMap: Record<string, boolean> = {}
      for (const f of (flagsData ?? []) as FeatureFlag[]) flagMap[f.key] = f.enabled
      setFlags(flagMap)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  /* ---- Derived ---- */
  const masterOn = flags[MASTER_KEY] === true

  const filtered = useMemo(() => {
    let list = lenders
    if (categoryFilter !== 'all') {
      list = list.filter((l) => l.category === categoryFilter)
    }
    if (statusFilter !== 'all') {
      list = list.filter((l) => (statusFilter === 'active' ? l.active : !l.active))
    }
    if (search.trim()) {
      list = list.filter((l) =>
        matchesSearch({
          query: search,
          fields: [l.name, l.category, l.contact_email ?? '', l.notes ?? '', l.apply_instructions ?? ''],
          ids: [l.id],
        }),
      )
    }
    return list
  }, [lenders, search, categoryFilter, statusFilter])

  const filtersActive = search.trim() !== '' || categoryFilter !== 'all' || statusFilter !== 'all'

  const counts = useMemo(() => {
    const byCat: Record<LenderCategory, number> = {
      contractor_pos: 0,
      personal_loans: 0,
      solar_hi_specialty: 0,
      pace: 0,
      credit_unions: 0,
    }
    let active = 0
    for (const l of lenders) {
      byCat[l.category] += 1
      if (l.active) active += 1
    }
    return { total: lenders.length, active, inactive: lenders.length - active, byCat }
  }, [lenders])

  /* ---- Credit Unions tab gate (pin-25) — driven by Category Gates toggle.
     Default ON when flag row missing (matches gate-card render). When OFF,
     hide TabsTrigger + TabsContent + redirect active tab to 'lenders'. */
  const cuTabEnabled = flags[CATEGORY_KEYS.credit_unions] !== false

  /* ---- Credit Unions derived ---- */
  const filteredCUs = useMemo(
    () =>
      creditUnions.filter((cu) => {
        const matchCounty =
          cuCountyFilter === 'all' || cu.counties.includes(cuCountyFilter as CUCounty)
        const matchSearch =
          !cuSearch.trim() || cu.name.toLowerCase().includes(cuSearch.toLowerCase())
        return matchCounty && matchSearch
      }),
    [creditUnions, cuCountyFilter, cuSearch],
  )

  function toggleCU(id: string, active: boolean) {
    setCreditUnions((prev) => prev.map((cu) => (cu.id === id ? { ...cu, active } : cu)))
  }

  /* ---- Mutations ---- */
  // Master + category toggles UPSERT a feature_flags row. Both the master row
  // and each category row use the same shape (key text PK + enabled bool).
  async function setFlag(key: string, enabled: boolean) {
    const { error } = await supabase
      .from('feature_flags')
      .upsert({ key, enabled }, { onConflict: 'key' })
    if (error) {
      toast.error(`Flag update failed: ${error.message}`)
      return false
    }
    setFlags((prev) => ({ ...prev, [key]: enabled }))
    return true
  }

  async function handleMasterToggle(next: boolean) {
    if (next === false) {
      // Master OFF is destructive — gate behind 4-refinement type-confirm
      setMasterOffTyped('')
      setMasterOffConfirmOpen(true)
      return
    }
    const ok = await setFlag(MASTER_KEY, true)
    if (ok) toast.success('Financing master switch ON')
  }

  async function confirmMasterOff() {
    if (masterOffTyped.trim().toUpperCase() !== 'OFF') {
      toast.error('Type OFF to confirm')
      return
    }
    const ok = await setFlag(MASTER_KEY, false)
    if (ok) {
      toast.success('Financing master switch OFF — all financing UI hidden')
      setMasterOffConfirmOpen(false)
    }
  }

  async function handleCategoryToggle(category: LenderCategory, next: boolean) {
    const ok = await setFlag(CATEGORY_KEYS[category], next)
    if (ok) toast.success(`${CATEGORY_LABELS[category]} ${next ? 'enabled' : 'disabled'}`)
  }

  async function handleLenderToggle(id: string, next: boolean) {
    const { error } = await supabase.from('lenders').update({ active: next }).eq('id', id)
    if (error) {
      toast.error(`Lender update failed: ${error.message}`)
      return
    }
    setLenders((prev) => prev.map((l) => (l.id === id ? { ...l, active: next } : l)))
    toast.success(`Lender ${next ? 'activated' : 'deactivated'}`)
  }

  async function handleBulkSetActive(next: boolean) {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('lenders').update({ active: next }).in('id', ids)
    if (error) {
      toast.error(`Bulk update failed: ${error.message}`)
      return
    }
    setLenders((prev) => prev.map((l) => (selectedIds.has(l.id) ? { ...l, active: next } : l)))
    toast.success(`${ids.length} lenders ${next ? 'activated' : 'deactivated'}`)
    setSelectedIds(new Set())
  }

  async function handleBulkSetCategory(category: LenderCategory) {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('lenders').update({ category }).in('id', ids)
    if (error) {
      toast.error(`Bulk category update failed: ${error.message}`)
      return
    }
    setLenders((prev) =>
      prev.map((l) => (selectedIds.has(l.id) ? { ...l, category } : l)),
    )
    toast.success(`${ids.length} lenders moved to ${CATEGORY_LABELS[category]}`)
    setSelectedIds(new Set())
  }

  async function handleAddLender() {
    const name = newLender.name.trim()
    if (!name) {
      toast.error('Name is required')
      return
    }
    const { data, error } = await supabase
      .from('lenders')
      .insert({
        name,
        category: newLender.category,
        contact_email: newLender.contact_email.trim() || null,
        notes: newLender.notes.trim() || null,
        apply_url: newLender.apply_url.trim() || null,
        apply_instructions: newLender.apply_instructions.trim() || null,
        sort_order: newLender.sort_order,
        active: true,
      })
      .select('*')
      .single()
    if (error || !data) {
      toast.error(`Add lender failed: ${error?.message ?? 'unknown_error'}`)
      return
    }
    setLenders((prev) => [...prev, data as Lender])
    toast.success(`${name} added`)
    setAddOpen(false)
    setNewLender({ name: '', category: 'contractor_pos', contact_email: '', notes: '', apply_url: '', apply_instructions: '', sort_order: 0 })
  }

  async function handleEditLender() {
    if (!editLender) return
    const name = editLender.name.trim()
    if (!name) {
      toast.error('Name is required')
      return
    }
    const { error } = await supabase
      .from('lenders')
      .update({
        name,
        category: editLender.category,
        contact_email: editLender.contact_email,
        notes: editLender.notes,
        apply_url: editLender.apply_url,
        apply_instructions: editLender.apply_instructions,
        sort_order: editLender.sort_order,
      })
      .eq('id', editLender.id)
    if (error) {
      toast.error(`Edit lender failed: ${error.message}`)
      return
    }
    setLenders((prev) => prev.map((l) => (l.id === editLender.id ? { ...editLender, name } : l)))
    toast.success(`${name} updated`)
    setEditLender(null)
  }

  async function confirmDeleteLender() {
    if (!deleteTarget) return
    if (deleteTyped.trim() !== deleteTarget.name) {
      toast.error('Typed name does not match')
      return
    }
    const { error } = await supabase
      .from('lenders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)
    if (error) {
      toast.error(`Delete lender failed: ${error.message}`)
      return
    }
    setLenders((prev) => prev.filter((l) => l.id !== deleteTarget.id))
    toast.success(`${deleteTarget.name} removed`)
    setDeleteTarget(null)
    setDeleteTyped('')
  }

  // CSV import (F5) — naive split parser; expects header row
  // `name,category,contact_email,notes,apply_url,apply_instructions,sort_order`.
  // Category column accepts the exact enum value or the human label (case-insensitive).
  async function handleCsvImport() {
    if (csvSubmitting) return
    const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) {
      toast.error('CSV needs a header row + at least 1 data row')
      return
    }
    const header = lines[0].split(',').map((c) => c.trim().toLowerCase())
    const nameIdx = header.indexOf('name')
    const catIdx = header.indexOf('category')
    if (nameIdx < 0 || catIdx < 0) {
      toast.error('CSV must include name + category columns')
      return
    }
    const emailIdx = header.indexOf('contact_email')
    const notesIdx = header.indexOf('notes')
    const applyUrlIdx = header.indexOf('apply_url')
    const applyInstructionsIdx = header.indexOf('apply_instructions')
    const sortIdx = header.indexOf('sort_order')

    function normCategory(s: string): LenderCategory | null {
      const v = s.trim().toLowerCase()
      if (v === 'contractor_pos' || v === 'contractor pos') return 'contractor_pos'
      if (v === 'personal_loans' || v === 'personal loans') return 'personal_loans'
      if (v === 'solar_hi_specialty' || v === 'solar & hi specialty' || v === 'solar hi specialty')
        return 'solar_hi_specialty'
      if (v === 'pace' || v === 'pace financing') return 'pace'
      return null
    }

    const rows: Array<Omit<Lender, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>> = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim())
      const name = cells[nameIdx] ?? ''
      const cat = normCategory(cells[catIdx] ?? '')
      if (!name || !cat) {
        toast.error(`Row ${i + 1}: invalid name or category`)
        return
      }
      rows.push({
        name,
        category: cat,
        contact_email: emailIdx >= 0 ? cells[emailIdx] ?? null : null,
        notes: notesIdx >= 0 ? cells[notesIdx] ?? null : null,
        apply_url: applyUrlIdx >= 0 ? (cells[applyUrlIdx] || null) : null,
        apply_instructions: applyInstructionsIdx >= 0 ? (cells[applyInstructionsIdx] || null) : null,
        sort_order: sortIdx >= 0 ? Number(cells[sortIdx] ?? 0) || 0 : 0,
        active: true,
      })
    }

    setCsvSubmitting(true)
    try {
      const { data, error } = await supabase.from('lenders').insert(rows).select('*')
      if (error) {
        toast.error(`CSV import failed: ${error.message}`)
        return
      }
      setLenders((prev) => [...prev, ...((data ?? []) as Lender[])])
      toast.success(`Imported ${rows.length} lenders`)
      setCsvOpen(false)
      setCsvText('')
    } finally {
      setCsvSubmitting(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setCategoryFilter('all')
    setStatusFilter('all')
  }

  /* ---- Selection helpers ---- */
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const allFilteredIds = filtered.map((l) => l.id)
    const allSelected = allFilteredIds.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(allFilteredIds))
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Financing"
        description="Manage lenders, category gates, and the master financing toggle."
      >
        <Button onClick={() => setCsvOpen(true)} size="sm" variant="outline" data-testid="admin-financing-csv-import-trigger">
          <Upload className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
        <Button onClick={() => setAddOpen(true)} size="sm" data-testid="admin-financing-add-lender-trigger">
          <Plus className="mr-2 h-4 w-4" />
          Add Lender
        </Button>
      </PageHeader>

      {/* AXIS 1 + 2 — Master + Category toggles */}
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm">
          <CardContent className="space-y-4 p-6">
            {/* Master toggle */}
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">Master Financing Switch</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Off hides the financing card on every homeowner, vendor, and admin surface. Use to fully dark the feature.
                </p>
              </div>
              <Switch
                checked={masterOn}
                onCheckedChange={handleMasterToggle}
                data-testid="admin-financing-master-toggle"
                aria-label="Master financing switch"
              />
            </div>

            {/* Category toggles */}
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Category Gates</Label>
              <p className="text-xs text-muted-foreground">
                Disable a category to hide its lenders from homeowner financing applications without removing the partner records.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(Object.keys(CATEGORY_LABELS) as LenderCategory[]).map((cat) => {
                const flagKey = CATEGORY_KEYS[cat]
                const checked = flags[flagKey] !== false // default ON when row missing
                // Credit Unions live in a separate CREDIT_UNIONS dataset; count
                // off creditUnions[] so the card reflects partners on this tab,
                // not the lenders[] DB count (which is 0 for this category).
                const count = cat === 'credit_unions' ? creditUnions.length : counts.byCat[cat]
                const noun = cat === 'credit_unions' ? 'partner' : 'lender'
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{CATEGORY_LABELS[cat]}</div>
                      <div className="text-xs text-muted-foreground">
                        {count} {noun}{count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(next) => handleCategoryToggle(cat, next)}
                      data-testid="admin-financing-category-toggle"
                      data-category={cat}
                      aria-label={`${CATEGORY_LABELS[cat]} category toggle`}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs: Lenders / Approvals / Audit / Credit Unions (gated) */}
      <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
        <Tabs
          value={cuTabEnabled || tab !== 'credit-unions' ? tab : 'lenders'}
          onValueChange={(v) => setTab(v as typeof tab)}
        >
          <TabsList>
            <TabsTrigger value="lenders" data-testid="admin-financing-tab-lenders">
              Lenders
              <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] rounded-full px-1.5 text-[10px]">
                {counts.total}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="approvals" data-testid="admin-financing-tab-approvals">
              Approvals
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="admin-financing-tab-audit">
              Audit Log
            </TabsTrigger>
            {cuTabEnabled && (
              <TabsTrigger value="credit-unions" data-testid="admin-financing-tab-credit-unions">
                <Building2 className="h-4 w-4" />
                Credit Unions
              </TabsTrigger>
            )}
          </TabsList>

          {/* ---------------------------------------------------- */}
          {/*  LENDERS TAB                                          */}
          {/* ---------------------------------------------------- */}
          <TabsContent value="lenders" className="space-y-4">
            {/* Filter row (F3 + F7) */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search lenders by name, category, email, or notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="admin-financing-search"
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={categoryFilter}
                    onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
                  >
                    <SelectTrigger className="w-48" data-testid="admin-financing-filter-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      <SelectItem value="contractor_pos">{CATEGORY_LABELS.contractor_pos}</SelectItem>
                      <SelectItem value="personal_loans">{CATEGORY_LABELS.personal_loans}</SelectItem>
                      <SelectItem value="solar_hi_specialty">{CATEGORY_LABELS.solar_hi_specialty}</SelectItem>
                      <SelectItem value="pace">{CATEGORY_LABELS.pace}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                    <SelectTrigger className="w-40" data-testid="admin-financing-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active only</SelectItem>
                      <SelectItem value="inactive">Inactive only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {filtersActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    data-testid="admin-financing-clear-filters"
                    className="gap-1"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {/* Result summary */}
            <div className="text-xs text-muted-foreground">
              Showing {filtered.length} of {counts.total} lenders · {counts.active} active · {counts.inactive} inactive
            </div>

            {/* Lenders table or mobile cards (F4) */}
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading lenders…
              </div>
            ) : isMobile ? (
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">No lenders match the current filters.</CardContent>
                  </Card>
                ) : (
                  filtered.map((lender) => (
                    <Card
                      key={lender.id}
                      data-testid="admin-financing-lender-row"
                      data-target-lender-id={lender.id}
                      onClick={() => setEditLender({ ...lender })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setEditLender({ ...lender })
                        }
                      }}
                      aria-label={`Edit ${lender.name}`}
                      className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(lender.id)}
                                  onCheckedChange={() => toggleSelect(lender.id)}
                                  data-testid="admin-financing-bulk-checkbox"
                                  data-target-lender-id={lender.id}
                                  aria-label={`Select ${lender.name}`}
                                />
                              </span>
                              <span className="font-medium">{lender.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {categoryBadge(lender.category)}
                              {statusBadge(lender.active)}
                            </div>
                            {lender.contact_email && (
                              <div className="text-xs text-muted-foreground">{lender.contact_email}</div>
                            )}
                          </div>
                          <span onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={lender.active}
                              onCheckedChange={(next) => handleLenderToggle(lender.id, next)}
                              data-testid="admin-financing-lender-toggle"
                              data-target-lender-id={lender.id}
                              aria-label={`Toggle ${lender.name}`}
                            />
                          </span>
                        </div>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditLender({ ...lender })
                            }}
                            aria-label={`Edit ${lender.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTyped('')
                              setDeleteTarget(lender)
                            }}
                            aria-label={`Delete ${lender.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              <Card className="rounded-xl shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))
                              }
                              onCheckedChange={toggleSelectAll}
                              aria-label="Select all filtered lenders"
                            />
                          </TableHead>
                          <TableHead className="font-semibold">Name</TableHead>
                          <TableHead className="font-semibold">Category</TableHead>
                          <TableHead className="font-semibold">Contact</TableHead>
                          <TableHead className="font-semibold">Sort</TableHead>
                          <TableHead className="font-semibold">Active</TableHead>
                          <TableHead className="font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                              No lenders match the current filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filtered.map((lender) => (
                            <TableRow
                              key={lender.id}
                              data-testid="admin-financing-lender-row"
                              data-target-lender-id={lender.id}
                              onClick={() => setEditLender({ ...lender })}
                              onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setEditLender({ ...lender })
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-label={`Edit ${lender.name}`}
                              className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(lender.id)}
                                  onCheckedChange={() => toggleSelect(lender.id)}
                                  data-testid="admin-financing-bulk-checkbox"
                                  data-target-lender-id={lender.id}
                                  aria-label={`Select ${lender.name}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                <div>{lender.name}</div>
                                {lender.notes && (
                                  <div className="text-xs text-muted-foreground font-normal">{lender.notes}</div>
                                )}
                              </TableCell>
                              <TableCell>{categoryBadge(lender.category)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {lender.contact_email ?? '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{lender.sort_order}</TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Switch
                                  checked={lender.active}
                                  onCheckedChange={(next) => handleLenderToggle(lender.id, next)}
                                  data-testid="admin-financing-lender-toggle"
                                  data-target-lender-id={lender.id}
                                  aria-label={`Toggle ${lender.name}`}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditLender({ ...lender })
                                    }}
                                    title="Edit"
                                    aria-label={`Edit ${lender.name}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDeleteTyped('')
                                      setDeleteTarget(lender)
                                    }}
                                    title="Delete"
                                    aria-label={`Delete ${lender.name}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---------------------------------------------------- */}
          {/*  APPROVALS TAB — placeholder (T+1 PR)                 */}
          {/* ---------------------------------------------------- */}
          <TabsContent value="approvals">
            <Card>
              <CardContent className="space-y-3 py-12 text-center text-muted-foreground">
                <Building2 className="mx-auto h-10 w-10 opacity-50" />
                <div className="text-sm">
                  Approvals tab wires in the next ship. Edge Fn{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">admin-create-approval</code> is already deployed; this surface will render the live query + Set Approval dialog with the 4-refinement type-confirm on $50k envelopes.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------- */}
          {/*  AUDIT TAB — placeholder (T+1 PR)                     */}
          {/* ---------------------------------------------------- */}
          <TabsContent value="audit">
            <Card>
              <CardContent className="space-y-3 py-12 text-center text-muted-foreground">
                <ShieldAlert className="mx-auto h-10 w-10 opacity-50" />
                <div className="text-sm">
                  Audit Log tab wires in the next ship. Reads <code className="rounded bg-muted px-1 py-0.5 text-xs">audit_log</code> filtered to action=<code className="rounded bg-muted px-1 py-0.5 text-xs">admin_create_approval</code> (and the rest of the financing actions added in migration 051).
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------- */}
          {/*  CREDIT UNIONS TAB — static, no DB                    */}
          {/* ---------------------------------------------------- */}
          {cuTabEnabled && (
          <TabsContent value="credit-unions" className="space-y-4">
            {/* Header row: title + county filter + search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold font-heading">South Florida Credit Unions</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Member-owned financing partners serving Miami-Dade, Broward, and Palm Beach.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={cuCountyFilter} onValueChange={(v) => setCuCountyFilter(v ?? 'all')}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="All counties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All counties</SelectItem>
                    <SelectItem value="miami-dade">Miami-Dade</SelectItem>
                    <SelectItem value="broward">Broward</SelectItem>
                    <SelectItem value="palm-beach">Palm Beach</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={cuSearch}
                    onChange={(e) => setCuSearch(e.target.value)}
                    placeholder="Search..."
                    className="h-8 pl-8 text-xs w-36"
                    data-testid="admin-financing-cu-search"
                  />
                </div>
              </div>
            </div>

            {/* Specialty callout — JetStream Home Help Loan */}
            <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex gap-3 items-start">
              <div className="mt-0.5 h-5 w-5 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
                <Wallet className="h-3 w-3 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  JetStream FCU — Home Help Loan
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  Contractor-paid home repair financing. Funds go direct to contractor — the strongest CU product for BuildConnect vendor alignment. Miami-Dade only.
                </p>
              </div>
            </div>

            {/* Card grid — container-query responsive (sidebar-offset doctrine) */}
            <div className="@container">
              <div className="grid grid-cols-1 @[768px]:grid-cols-2 gap-3">
                {filteredCUs.map((cu, i) => (
                  <motion.div key={cu.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                    <Card
                      data-testid="admin-financing-cu-card"
                      data-cu-id={cu.id}
                      data-cu-active={cu.active ? 'true' : 'false'}
                      className={cn(
                        'rounded-xl border border-border bg-card',
                        '[box-shadow:inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]',
                        'dark:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.25)]',
                        'transition-all',
                        !cu.active && 'opacity-60',
                      )}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header row: name + active toggle */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground font-heading">{cu.name}</p>
                            {cu.specialty && (
                              <Badge className="mt-1 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                                {cu.specialty}
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={cu.active}
                            onCheckedChange={(v) => toggleCU(cu.id, v)}
                            data-testid="admin-financing-cu-toggle"
                            data-cu-id={cu.id}
                            className="shrink-0 mt-0.5"
                          />
                        </div>

                        {/* County badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {cu.counties.map((c) => (
                            <Badge key={c} variant="outline" className={cn('text-[10px]', countyBadgeClass(c))}>
                              {COUNTY_LABELS[c]}
                            </Badge>
                          ))}
                        </div>

                        {/* Product chips */}
                        <div className="flex flex-wrap gap-1.5">
                          {cu.products.map((p) => (
                            <span
                              key={p}
                              className="text-[11px] rounded-full bg-muted/70 px-2.5 py-0.5 text-muted-foreground"
                            >
                              {p}
                            </span>
                          ))}
                        </div>

                        {/* Apply link */}
                        <a
                          href={cu.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          data-testid="admin-financing-cu-link"
                          data-cu-id={cu.id}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {cu.applyUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>

                        {/* Specialty note if present */}
                        {cu.specialtyNote && (
                          <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-2 mt-1">
                            {cu.specialtyNote}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* iTHINK warning note */}
            <div className="rounded-lg border border-border/50 bg-muted/40 px-3 py-2.5 flex gap-2 items-start">
              <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                iTHINK Financial does not serve Miami-Dade — only display to homeowners in Broward or Palm Beach.
              </p>
            </div>
          </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* Sticky bulk-action bar (F2) — visible only when selection non-empty */}
      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 shadow-lg">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => handleBulkSetActive(true)} data-testid="admin-financing-bulk-activate">
                Activate
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkSetActive(false)} data-testid="admin-financing-bulk-deactivate">
                Deactivate
              </Button>
              <Select
                onValueChange={(v) => handleBulkSetCategory(v as LenderCategory)}
              >
                <SelectTrigger className="w-48" data-testid="admin-financing-bulk-category">
                  <SelectValue placeholder="Move to category…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractor_pos">{CATEGORY_LABELS.contractor_pos}</SelectItem>
                  <SelectItem value="personal_loans">{CATEGORY_LABELS.personal_loans}</SelectItem>
                  <SelectItem value="solar_hi_specialty">{CATEGORY_LABELS.solar_hi_specialty}</SelectItem>
                  <SelectItem value="pace">{CATEGORY_LABELS.pace}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Dialogs                                                       */}
      {/* ============================================================ */}

      {/* Add Lender */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent data-testid="admin-financing-add-lender-dialog">
          <DialogHeader>
            <DialogTitle>Add Lender</DialogTitle>
            <DialogDescription>Register a new financing partner. Lenders default to Active.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="add-lender-name">Name</Label>
              <Input
                id="add-lender-name"
                value={newLender.name}
                onChange={(e) => setNewLender({ ...newLender, name: e.target.value })}
                placeholder="GoodLeap, Acorn, Hearth…"
              />
              <p className="text-xs text-muted-foreground">Used in homeowner-facing dropdowns and the Set Approval dialog. Must be unique.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-lender-category">Category</Label>
              <Select
                value={newLender.category}
                onValueChange={(v) => setNewLender({ ...newLender, category: v as LenderCategory })}
              >
                <SelectTrigger id="add-lender-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractor_pos">{CATEGORY_LABELS.contractor_pos}</SelectItem>
                  <SelectItem value="personal_loans">{CATEGORY_LABELS.personal_loans}</SelectItem>
                  <SelectItem value="solar_hi_specialty">{CATEGORY_LABELS.solar_hi_specialty}</SelectItem>
                  <SelectItem value="pace">{CATEGORY_LABELS.pace}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Contractor POS = lender pays merchant fee. Personal Loans = direct-to-consumer. Solar & HI Specialty = solar or home improvement specialty partners. PACE Financing = repaid via property tax assessment (Property Assessed Clean Energy).</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-lender-email">Contact email (optional)</Label>
              <Input
                id="add-lender-email"
                type="email"
                value={newLender.contact_email}
                onChange={(e) => setNewLender({ ...newLender, contact_email: e.target.value })}
                placeholder="partner-ops@lender.com"
              />
              <p className="text-xs text-muted-foreground">Used when admin needs to reach the partner about a specific approval.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-lender-notes">Notes (optional)</Label>
              <Textarea
                id="add-lender-notes"
                value={newLender.notes}
                onChange={(e) => setNewLender({ ...newLender, notes: e.target.value })}
                placeholder="APR range, fee structure, anything operator should know…"
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-lender-apply-url">Apply URL (optional)</Label>
              <Input
                id="add-lender-apply-url"
                type="url"
                pattern="https://.*"
                value={newLender.apply_url}
                onChange={(e) => setNewLender({ ...newLender, apply_url: e.target.value })}
                placeholder="https://lender.com/apply"
              />
              <p className="text-xs text-muted-foreground">HTTPS only; empty for manual-referral lenders.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-lender-apply-instructions">Apply instructions (optional)</Label>
              <Textarea
                id="add-lender-apply-instructions"
                value={newLender.apply_instructions}
                onChange={(e) => setNewLender({ ...newLender, apply_instructions: e.target.value })}
                placeholder="e.g. Provide your contractor: BuildConnect Network · Vendor ID: VND-XXXX"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Shown to homeowner on the lender card; supports multi-line.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-lender-sort">Sort order</Label>
              <Input
                id="add-lender-sort"
                type="number"
                value={newLender.sort_order}
                onChange={(e) => setNewLender({ ...newLender, sort_order: Number(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">Lower numbers surface first in homeowner dropdowns. Rod-direct partners use 0-5; researched partners use 100+.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLender}>Add Lender</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lender */}
      <Dialog open={editLender !== null} onOpenChange={(open) => !open && setEditLender(null)}>
        <DialogContent data-testid="admin-financing-edit-lender-dialog">
          <DialogHeader>
            <DialogTitle>Edit Lender</DialogTitle>
            <DialogDescription>Update partner details. Soft-delete is via the trash icon on the row.</DialogDescription>
          </DialogHeader>
          {editLender && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-lender-name">Name</Label>
                <Input
                  id="edit-lender-name"
                  value={editLender.name}
                  onChange={(e) => setEditLender({ ...editLender, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lender-category">Category</Label>
                <Select
                  value={editLender.category}
                  onValueChange={(v) => setEditLender({ ...editLender, category: v as LenderCategory })}
                >
                  <SelectTrigger id="edit-lender-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contractor_pos">{CATEGORY_LABELS.contractor_pos}</SelectItem>
                    <SelectItem value="personal_loans">{CATEGORY_LABELS.personal_loans}</SelectItem>
                    <SelectItem value="solar_hi_specialty">{CATEGORY_LABELS.solar_hi_specialty}</SelectItem>
                    <SelectItem value="pace">{CATEGORY_LABELS.pace}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lender-email">Contact email</Label>
                <Input
                  id="edit-lender-email"
                  type="email"
                  value={editLender.contact_email ?? ''}
                  onChange={(e) => setEditLender({ ...editLender, contact_email: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lender-notes">Notes</Label>
                <Textarea
                  id="edit-lender-notes"
                  value={editLender.notes ?? ''}
                  onChange={(e) => setEditLender({ ...editLender, notes: e.target.value || null })}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lender-apply-url">Apply URL</Label>
                <Input
                  id="edit-lender-apply-url"
                  type="url"
                  pattern="https://.*"
                  value={editLender.apply_url ?? ''}
                  onChange={(e) => setEditLender({ ...editLender, apply_url: e.target.value || null })}
                  placeholder="https://lender.com/apply"
                />
                <p className="text-xs text-muted-foreground">HTTPS only; empty for manual-referral lenders.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lender-apply-instructions">Apply instructions</Label>
                <Textarea
                  id="edit-lender-apply-instructions"
                  value={editLender.apply_instructions ?? ''}
                  onChange={(e) => setEditLender({ ...editLender, apply_instructions: e.target.value || null })}
                  placeholder="e.g. Provide your contractor: BuildConnect Network · Vendor ID: VND-XXXX"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Shown to homeowner on the lender card; supports multi-line.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lender-sort">Sort order</Label>
                <Input
                  id="edit-lender-sort"
                  type="number"
                  value={editLender.sort_order}
                  onChange={(e) => setEditLender({ ...editLender, sort_order: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLender(null)}>Cancel</Button>
            <Button onClick={handleEditLender}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import (F5) */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="sm:max-w-2xl" data-testid="admin-financing-csv-import-dialog">
          <DialogHeader>
            <DialogTitle>Import lenders from CSV</DialogTitle>
            <DialogDescription>
              Header row required: <code className="rounded bg-muted px-1 py-0.5 text-xs">name,category,contact_email,notes,apply_url,apply_instructions,sort_order</code>. Category accepts the enum value (contractor_pos / personal_loans / solar_hi_specialty / pace) or the human label. apply_url + apply_instructions are optional; leave empty for manual-referral lenders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'name,category,contact_email,notes,apply_url,apply_instructions,sort_order\nNewLender,personal_loans,partner@example.com,Notes here,https://lender.com/apply,Provide contractor: BuildConnect Network,100'}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Paste the CSV body above. All imported lenders default to Active. Duplicates are blocked by the database unique-name index (lower-case match).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>Cancel</Button>
            <Button onClick={handleCsvImport} disabled={csvSubmitting}>
              {csvSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Master OFF — 4-refinement type-confirm (F8) */}
      <Dialog
        open={masterOffConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setMasterOffTyped('')
          setMasterOffConfirmOpen(open)
        }}
      >
        <DialogContent data-testid="admin-financing-master-off-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-destructive">Disable financing globally?</DialogTitle>
            <DialogDescription>
              This hides the financing card from every homeowner, vendor, and admin surface immediately. In-flight approvals stay banked in the database but are not surfaced in the UI until you flip the master switch back on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="master-off-typed">Type <span className="font-mono font-semibold">OFF</span> to confirm</Label>
            <Input
              id="master-off-typed"
              value={masterOffTyped}
              onChange={(e) => setMasterOffTyped(e.target.value)}
              autoComplete="off"
              data-testid="admin-financing-master-off-confirm-typed"
            />
          </div>
          <DialogFooter>
            <Button variant="default" onClick={() => setMasterOffConfirmOpen(false)}>Keep financing ON</Button>
            <Button
              variant="destructive"
              onClick={confirmMasterOff}
              disabled={masterOffTyped.trim().toUpperCase() !== 'OFF'}
              data-testid="admin-financing-master-off-confirm-fire"
            >
              Disable financing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Lender — 4-refinement type-confirm (F8) */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteTyped('')
          }
        }}
      >
        <DialogContent data-testid="admin-financing-delete-lender-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-destructive">Remove lender?</DialogTitle>
            <DialogDescription>
              Soft-deletes the lender (preserves audit trail). The partner stops appearing in homeowner-facing dropdowns and the Set Approval dialog immediately. You can re-add via Add Lender if needed.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-2">
              <Label htmlFor="delete-lender-typed">
                Type <span className="font-mono font-semibold">{deleteTarget.name}</span> to confirm
              </Label>
              <Input
                id="delete-lender-typed"
                value={deleteTyped}
                onChange={(e) => setDeleteTyped(e.target.value)}
                autoComplete="off"
                data-testid="admin-financing-delete-lender-confirm-typed"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="default"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteTyped('')
              }}
            >
              Keep {deleteTarget?.name ?? 'lender'}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteLender}
              disabled={!deleteTarget || deleteTyped.trim() !== deleteTarget.name}
              data-testid="admin-financing-delete-lender-confirm-fire"
            >
              Remove lender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
