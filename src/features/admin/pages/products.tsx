import { useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Package,
  Layers,
  ListChecks,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { PageHeader } from '@/components/shared/page-header'
import { useCatalogStore } from '@/stores/catalog-store'
import type { ServiceConfig, OptionGroup, ServiceCategory } from '@/types'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Dialogs                                                           */
/* ------------------------------------------------------------------ */

type ServiceFormData = {
  id: string
  name: string
  tagline: string
  description: string
  badge: string
  badgeColor: string
  phase2: boolean
  features: string
  statLabel: string
  statValue: string
}

const emptyServiceForm: ServiceFormData = {
  id: '',
  name: '',
  tagline: '',
  description: '',
  badge: '',
  badgeColor: '',
  phase2: false,
  features: '',
  statLabel: '',
  statValue: '',
}

function serviceToForm(s: ServiceConfig): ServiceFormData {
  return {
    id: s.id,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    badge: s.badge ?? '',
    badgeColor: s.badgeColor ?? '',
    phase2: s.phase2 ?? false,
    features: s.features.join(', '),
    statLabel: s.stat.label,
    statValue: s.stat.value,
  }
}

type GroupFormData = {
  id: string
  label: string
  required: boolean
  type: 'single' | 'multi'
}

const emptyGroupForm: GroupFormData = { id: '', label: '', required: true, type: 'single' }

type OptionFormData = { id: string; label: string; description: string }
const emptyOptionForm: OptionFormData = { id: '', label: '', description: '' }

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function ProductsAdminPage() {
  const {
    services,
    addService,
    updateService,
    removeService,
    addOptionGroup,
    updateOptionGroup,
    removeOptionGroup,
    addOption,
    removeOption,
    addSubGroup,
    removeSubGroup,
    addSubOption,
    removeSubOption,
    hydrateFromServer,
  } = useCatalogStore()

  // Trigger server hydration on mount so admin sees fresh data from Supabase,
  // not just whatever's cached in localStorage. SWR pattern: bundled/cached
  // state renders immediately; server fetch overwrites in the background.
  useEffect(() => {
    hydrateFromServer()
  }, [hydrateFromServer])

  // --- Service dialog ---
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceConfig | null>(null)
  const [serviceForm, setServiceForm] = useState<ServiceFormData>(emptyServiceForm)

  // --- Group dialog ---
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupContext, setGroupContext] = useState<string>('') // serviceId
  const [editingGroup, setEditingGroup] = useState<OptionGroup | null>(null)
  const [groupForm, setGroupForm] = useState<GroupFormData>(emptyGroupForm)

  // --- Option dialog ---
  const [optionDialogOpen, setOptionDialogOpen] = useState(false)
  const [optionContext, setOptionContext] = useState<{ serviceId: string; groupId: string }>({
    serviceId: '',
    groupId: '',
  })
  const [optionForm, setOptionForm] = useState<OptionFormData>(emptyOptionForm)

  // --- Sub-group collapse state ---
  const [openSubGroups, setOpenSubGroups] = useState<Set<string>>(new Set())
  const toggleSubGroup = (key: string) => {
    setOpenSubGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // --- Sub-group dialog ---
  const [subGroupDialogOpen, setSubGroupDialogOpen] = useState(false)
  const [subGroupContext, setSubGroupContext] = useState<{ serviceId: string; groupId: string; optionId: string }>({
    serviceId: '',
    groupId: '',
    optionId: '',
  })
  const [subGroupForm, setSubGroupForm] = useState<GroupFormData>(emptyGroupForm)

  // --- Sub-option dialog ---
  const [subOptionDialogOpen, setSubOptionDialogOpen] = useState(false)
  const [subOptionContext, setSubOptionContext] = useState<{
    serviceId: string
    groupId: string
    optionId: string
    subGroupId: string
  }>({ serviceId: '', groupId: '', optionId: '', subGroupId: '' })
  const [subOptionForm, setSubOptionForm] = useState<OptionFormData>(emptyOptionForm)

  // --- Delete confirm ---
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'service' | 'group' | 'option'
    label: string
    onConfirm: () => void
  } | null>(null)

  /* ---------- Service handlers ---------- */

  function openAddService() {
    setEditingService(null)
    setServiceForm(emptyServiceForm)
    setServiceDialogOpen(true)
  }

  function openEditService(s: ServiceConfig) {
    setEditingService(s)
    setServiceForm(serviceToForm(s))
    setServiceDialogOpen(true)
  }

  async function handleSaveService() {
    const features = serviceForm.features
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)

    try {
      if (editingService) {
        await updateService(editingService.id, {
          name: serviceForm.name,
          tagline: serviceForm.tagline,
          description: serviceForm.description,
          badge: serviceForm.badge || undefined,
          badgeColor: serviceForm.badgeColor || undefined,
          phase2: serviceForm.phase2 || undefined,
          features,
          stat: { label: serviceForm.statLabel, value: serviceForm.statValue },
        })
      } else {
        const newService: ServiceConfig = {
          id: serviceForm.id as ServiceCategory,
          name: serviceForm.name,
          tagline: serviceForm.tagline,
          description: serviceForm.description,
          badge: serviceForm.badge || undefined,
          badgeColor: serviceForm.badgeColor || undefined,
          phase2: serviceForm.phase2 || undefined,
          features,
          stat: { label: serviceForm.statLabel, value: serviceForm.statValue },
          optionGroups: [],
        }
        await addService(newService)
      }
      setServiceDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  function confirmDeleteService(s: ServiceConfig) {
    setDeleteTarget({
      type: 'service',
      label: s.name,
      onConfirm: async () => {
        try {
          await removeService(s.id)
          setDeleteDialogOpen(false)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Delete failed')
        }
      },
    })
    setDeleteDialogOpen(true)
  }

  /* ---------- Group handlers ---------- */

  function openAddGroup(serviceId: string) {
    setGroupContext(serviceId)
    setEditingGroup(null)
    setGroupForm(emptyGroupForm)
    setGroupDialogOpen(true)
  }

  function openEditGroup(serviceId: string, group: OptionGroup) {
    setGroupContext(serviceId)
    setEditingGroup(group)
    setGroupForm({ id: group.id, label: group.label, required: group.required, type: group.type })
    setGroupDialogOpen(true)
  }

  async function handleSaveGroup() {
    try {
      if (editingGroup) {
        await updateOptionGroup(groupContext, editingGroup.id, {
          label: groupForm.label,
          required: groupForm.required,
          type: groupForm.type,
        })
      } else {
        const newGroup: OptionGroup = {
          id: groupForm.id,
          label: groupForm.label,
          required: groupForm.required,
          type: groupForm.type,
          options: [],
        }
        await addOptionGroup(groupContext, newGroup)
      }
      setGroupDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  function confirmDeleteGroup(serviceId: string, group: OptionGroup) {
    setDeleteTarget({
      type: 'group',
      label: group.label,
      onConfirm: async () => {
        try {
          await removeOptionGroup(serviceId, group.id)
          setDeleteDialogOpen(false)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Delete failed')
        }
      },
    })
    setDeleteDialogOpen(true)
  }

  /* ---------- Option handlers ---------- */

  function openAddOption(serviceId: string, groupId: string) {
    setOptionContext({ serviceId, groupId })
    setOptionForm(emptyOptionForm)
    setOptionDialogOpen(true)
  }

  function confirmDeleteOption(serviceId: string, groupId: string, opt: { id: string; label: string }) {
    setDeleteTarget({
      type: 'option',
      label: opt.label,
      onConfirm: async () => {
        try {
          await removeOption(serviceId, groupId, opt.id)
          setDeleteDialogOpen(false)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Delete failed')
        }
      },
    })
    setDeleteDialogOpen(true)
  }

  async function handleSaveOption() {
    try {
      await addOption(optionContext.serviceId, optionContext.groupId, {
        id: optionForm.id,
        label: optionForm.label,
        description: optionForm.description || undefined,
      })
      setOptionDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  /* ---------- Sub-group handlers ---------- */

  function openAddSubGroup(serviceId: string, groupId: string, optionId: string) {
    setSubGroupContext({ serviceId, groupId, optionId })
    setSubGroupForm(emptyGroupForm)
    setSubGroupDialogOpen(true)
  }

  async function handleSaveSubGroup() {
    const newSubGroup: OptionGroup = {
      id: subGroupForm.id,
      label: subGroupForm.label,
      required: subGroupForm.required,
      type: subGroupForm.type,
      options: [],
    }
    try {
      await addSubGroup(
        subGroupContext.serviceId,
        subGroupContext.groupId,
        subGroupContext.optionId,
        newSubGroup
      )
      setSubGroupDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  function confirmDeleteSubGroup(
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroup: OptionGroup
  ) {
    setDeleteTarget({
      type: 'group',
      label: subGroup.label,
      onConfirm: async () => {
        try {
          await removeSubGroup(serviceId, groupId, optionId, subGroup.id)
          setDeleteDialogOpen(false)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Delete failed')
        }
      },
    })
    setDeleteDialogOpen(true)
  }

  /* ---------- Sub-option handlers ---------- */

  function openAddSubOption(serviceId: string, groupId: string, optionId: string, subGroupId: string) {
    setSubOptionContext({ serviceId, groupId, optionId, subGroupId })
    setSubOptionForm(emptyOptionForm)
    setSubOptionDialogOpen(true)
  }

  async function handleSaveSubOption() {
    try {
      await addSubOption(
        subOptionContext.serviceId,
        subOptionContext.groupId,
        subOptionContext.optionId,
        subOptionContext.subGroupId,
        {
          id: subOptionForm.id,
          label: subOptionForm.label,
          description: subOptionForm.description || undefined,
        }
      )
      setSubOptionDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  function confirmDeleteSubOption(
    serviceId: string,
    groupId: string,
    optionId: string,
    subGroupId: string,
    subOpt: { id: string; label: string }
  ) {
    setDeleteTarget({
      type: 'option',
      label: subOpt.label,
      onConfirm: async () => {
        try {
          await removeSubOption(serviceId, groupId, optionId, subGroupId, subOpt.id)
          setDeleteDialogOpen(false)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Delete failed')
        }
      },
    })
    setDeleteDialogOpen(true)
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6">
      <PageHeader title="Product Catalog" description="Manage services, option groups, and options">
        <Button onClick={openAddService} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Service
        </Button>
      </PageHeader>

      {/* Services list */}
      <Accordion type="multiple" className="space-y-4">
        {services.map((service, idx) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.3 }}
          >
            <AccordionItem value={service.id} className="border-0">
              <Card className="rounded-xl shadow-sm hover:shadow-md transition overflow-hidden">
                <CardHeader className="pb-0">
                  <div className="flex items-start justify-between gap-1 sm:gap-2">
                    <AccordionTrigger className="hover:no-underline py-0 flex-1 min-w-0 [&[data-state=open]>svg]:hidden">
                      <div className="flex flex-col items-stretch gap-1 sm:gap-1.5 min-w-0 flex-1">
                        {/* Row 1: icon + title/tagline */}
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full">
                          <Package className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                          <div className="text-left min-w-0 flex-1">
                            <CardTitle className="text-sm sm:text-base truncate">{service.name}</CardTitle>
                            <p className="text-[11px] sm:text-xs text-muted-foreground font-normal mt-0.5 line-clamp-2 sm:line-clamp-none">
                              {service.tagline}
                            </p>
                          </div>
                        </div>
                        {/* Row 2: badges — on their own line so horizontal header row stays compact and action buttons don't clip on narrow widths */}
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 pl-6 sm:pl-8">
                          {service.badge && (
                            <Badge variant="secondary" className={cn('text-[10px] sm:text-xs whitespace-nowrap', service.badgeColor)}>
                              {service.badge}
                            </Badge>
                          )}
                          {service.phase2 && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs whitespace-nowrap">
                              Phase 2
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] sm:text-xs whitespace-nowrap">
                            {service.optionGroups.length} group{service.optionGroups.length !== 1 && 's'}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditService(service)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => confirmDeleteService(service)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <AccordionContent>
                  <CardContent className="pt-4 space-y-4">
                    {/* Service details — tagline is shown in header, not duplicated here. Expanded body shows features + stat only. */}
                    <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                      <div className="flex flex-wrap gap-2">
                        {service.features.map((f) => (
                          <Badge key={f} variant="secondary" className="text-xs">
                            {f}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground pt-1">
                        {service.stat.label}: <span className="font-medium text-foreground">{service.stat.value}</span>
                      </p>
                    </div>

                    {/* Option Groups */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <Layers className="h-4 w-4 text-muted-foreground" />
                          Option Groups
                        </h4>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openAddGroup(service.id)}>
                          <Plus className="h-3 w-3" />
                          Add Group
                        </Button>
                      </div>

                      {service.optionGroups.length === 0 && (
                        <p className="text-sm text-muted-foreground italic pl-6">No option groups yet.</p>
                      )}

                      {service.optionGroups.map((group) => (
                        <Card key={group.id} className="rounded-lg border-dashed">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{group.label}</span>
                                <Badge variant="outline" className="text-xs">
                                  {group.type}
                                </Badge>
                                {group.required && (
                                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                    Required
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditGroup(service.id, group)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => confirmDeleteGroup(service.id, group)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {/* Options within group */}
                            <div className="pl-6 space-y-1">
                              {group.options.map((opt) => (
                                <div key={opt.id} className="space-y-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-2 text-base hover:bg-muted/50 transition-colors group/opt">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                                      <span>{opt.label}</span>
                                      {opt.description && (
                                        <span className="text-sm text-muted-foreground hidden sm:inline">
                                          -- {opt.description}
                                        </span>
                                      )}
                                      {opt.subGroups && opt.subGroups.length > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          {opt.subGroups.length} sub-menu{opt.subGroups.length !== 1 && 's'}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs gap-0.5 sm:opacity-0 sm:group-hover/opt:opacity-100 transition-opacity"
                                        onClick={() => openAddSubGroup(service.id, group.id, opt.id)}
                                      >
                                        <Plus className="h-2.5 w-2.5" />
                                        Sub-Menu
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover/opt:opacity-100 text-destructive hover:text-destructive transition-opacity"
                                        onClick={() => confirmDeleteOption(service.id, group.id, opt)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Sub-groups nested under this option */}
                                  {opt.subGroups && opt.subGroups.length > 0 && (
                                    <div className="ml-2 sm:ml-6 border-l-2 border-primary/20 pl-3 sm:pl-4 space-y-2 py-1">
                                      {opt.subGroups.map((subGroup) => (
                                        <div key={subGroup.id} className="space-y-1">
                                          <div className="flex items-center justify-between">
                                            <button
                                              type="button"
                                              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                              onClick={() => toggleSubGroup(`${service.id}-${group.id}-${opt.id}-${subGroup.id}`)}
                                            >
                                              <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition-transform', openSubGroups.has(`${service.id}-${group.id}-${opt.id}-${subGroup.id}`) && 'rotate-90')} />
                                              <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                                              <span className="text-sm font-medium">{subGroup.label}</span>
                                              <Badge variant="outline" className="text-[11px]">
                                                {subGroup.options.length} items
                                              </Badge>
                                              {subGroup.required && (
                                                <Badge variant="secondary" className="text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                                  Required
                                                </Badge>
                                              )}
                                            </button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 text-destructive hover:text-destructive"
                                              onClick={() => confirmDeleteSubGroup(service.id, group.id, opt.id, subGroup)}
                                            >
                                              <Trash2 className="h-2.5 w-2.5" />
                                            </Button>
                                          </div>

                                          {/* Sub-options within sub-group */}
                                          {openSubGroups.has(`${service.id}-${group.id}-${opt.id}-${subGroup.id}`) && <div className="pl-5 space-y-0.5">
                                            {subGroup.options.map((subOpt) => (
                                              <div
                                                key={subOpt.id}
                                                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors group/subopt"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                                                  <span>{subOpt.label}</span>
                                                  {subOpt.description && (
                                                    <span className="text-xs text-muted-foreground hidden sm:inline">
                                                      -- {subOpt.description}
                                                    </span>
                                                  )}
                                                </div>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-6 w-6 sm:opacity-0 sm:group-hover/subopt:opacity-100 text-destructive hover:text-destructive transition-opacity"
                                                  onClick={() => confirmDeleteSubOption(service.id, group.id, opt.id, subGroup.id, subOpt)}
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 text-xs gap-0.5 text-muted-foreground"
                                              onClick={() => openAddSubOption(service.id, group.id, opt.id, subGroup.id)}
                                            >
                                              <Plus className="h-2.5 w-2.5" />
                                              Add Item
                                            </Button>
                                          </div>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1 text-muted-foreground mt-1"
                                onClick={() => openAddOption(service.id, group.id)}
                              >
                                <Plus className="h-3 w-3" />
                                Add Option
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </AccordionContent>
              </Card>
            </AccordionItem>
          </motion.div>
        ))}
      </Accordion>

      {/* ---- Service Dialog ---- */}
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Edit Service' : 'Add Service'}</DialogTitle>
            <DialogDescription>
              {editingService ? 'Update the service details below.' : 'Fill in the details to create a new service.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingService && (
              <div className="space-y-1.5">
                <Label htmlFor="svc-id">Service ID (snake_case)</Label>
                <Input
                  id="svc-id"
                  placeholder="e.g. solar_panels"
                  value={serviceForm.id}
                  onChange={(e) => setServiceForm((f) => ({ ...f, id: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="svc-name">Name</Label>
              <Input
                id="svc-name"
                placeholder="Solar Panels"
                value={serviceForm.name}
                onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-tagline">Tagline</Label>
              <Input
                id="svc-tagline"
                placeholder="Harness the power of the sun"
                value={serviceForm.tagline}
                onChange={(e) => setServiceForm((f) => ({ ...f, tagline: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-desc">Description</Label>
              <Input
                id="svc-desc"
                placeholder="Detailed description..."
                value={serviceForm.description}
                onChange={(e) => setServiceForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-badge">Badge (optional)</Label>
                <Input
                  id="svc-badge"
                  placeholder="Popular"
                  value={serviceForm.badge}
                  onChange={(e) => setServiceForm((f) => ({ ...f, badge: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-badge-color">Badge Color Classes</Label>
                <Input
                  id="svc-badge-color"
                  placeholder="bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  value={serviceForm.badgeColor}
                  onChange={(e) => setServiceForm((f) => ({ ...f, badgeColor: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-features">Features (comma-separated)</Label>
              <Input
                id="svc-features"
                placeholder="Hurricane-Rated, Energy Efficient, 25-Year Warranty"
                value={serviceForm.features}
                onChange={(e) => setServiceForm((f) => ({ ...f, features: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-stat-label">Stat Label</Label>
                <Input
                  id="svc-stat-label"
                  placeholder="Projects Completed"
                  value={serviceForm.statLabel}
                  onChange={(e) => setServiceForm((f) => ({ ...f, statLabel: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-stat-value">Stat Value</Label>
                <Input
                  id="svc-stat-value"
                  placeholder="2,847"
                  value={serviceForm.statValue}
                  onChange={(e) => setServiceForm((f) => ({ ...f, statValue: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="svc-phase2"
                checked={serviceForm.phase2}
                onCheckedChange={(v) => setServiceForm((f) => ({ ...f, phase2: !!v }))}
              />
              <Label htmlFor="svc-phase2" className="text-sm font-normal">Phase 2 (coming soon)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveService} disabled={!serviceForm.name || (!editingService && !serviceForm.id)}>
              {editingService ? 'Save Changes' : 'Create Service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Group Dialog ---- */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Option Group' : 'Add Option Group'}</DialogTitle>
            <DialogDescription>
              {editingGroup ? 'Update the group details.' : 'Create a new option group for this service.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingGroup && (
              <div className="space-y-1.5">
                <Label htmlFor="grp-id">Group ID (snake_case)</Label>
                <Input
                  id="grp-id"
                  placeholder="e.g. panel_type"
                  value={groupForm.id}
                  onChange={(e) => setGroupForm((f) => ({ ...f, id: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="grp-label">Label</Label>
              <Input
                id="grp-label"
                placeholder="Panel Type"
                value={groupForm.label}
                onChange={(e) => setGroupForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Selection Type</Label>
              <Select value={groupForm.type} onValueChange={(v) => setGroupForm((f) => ({ ...f, type: v as 'single' | 'multi' }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Select</SelectItem>
                  <SelectItem value="multi">Multi Select</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="grp-required"
                checked={groupForm.required}
                onCheckedChange={(v) => setGroupForm((f) => ({ ...f, required: !!v }))}
              />
              <Label htmlFor="grp-required" className="text-sm font-normal">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveGroup} disabled={!groupForm.label || (!editingGroup && !groupForm.id)}>
              {editingGroup ? 'Save Changes' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Option Dialog ---- */}
      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Option</DialogTitle>
            <DialogDescription>Add a new option to this group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="opt-id">Option ID (snake_case)</Label>
              <Input
                id="opt-id"
                placeholder="e.g. monocrystalline"
                value={optionForm.id}
                onChange={(e) => setOptionForm((f) => ({ ...f, id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-label">Label</Label>
              <Input
                id="opt-label"
                placeholder="Monocrystalline"
                value={optionForm.label}
                onChange={(e) => setOptionForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-desc">Description (optional)</Label>
              <Input
                id="opt-desc"
                placeholder="Most efficient panel type"
                value={optionForm.description}
                onChange={(e) => setOptionForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveOption} disabled={!optionForm.id || !optionForm.label}>
              Add Option
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Sub-Group Dialog ---- */}
      <Dialog open={subGroupDialogOpen} onOpenChange={setSubGroupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Sub-Menu</DialogTitle>
            <DialogDescription>Create a new sub-menu group under this option.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="subgrp-id">Sub-Menu ID (snake_case)</Label>
              <Input
                id="subgrp-id"
                placeholder="e.g. color_options"
                value={subGroupForm.id}
                onChange={(e) => setSubGroupForm((f) => ({ ...f, id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subgrp-label">Label</Label>
              <Input
                id="subgrp-label"
                placeholder="Color Options"
                value={subGroupForm.label}
                onChange={(e) => setSubGroupForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Selection Type</Label>
              <Select
                value={subGroupForm.type}
                onValueChange={(v) => setSubGroupForm((f) => ({ ...f, type: v as 'single' | 'multi' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Select</SelectItem>
                  <SelectItem value="multi">Multi Select</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="subgrp-required"
                checked={subGroupForm.required}
                onCheckedChange={(v) => setSubGroupForm((f) => ({ ...f, required: !!v }))}
              />
              <Label htmlFor="subgrp-required" className="text-sm font-normal">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubGroup} disabled={!subGroupForm.id || !subGroupForm.label}>
              Create Sub-Menu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Sub-Option Dialog ---- */}
      <Dialog open={subOptionDialogOpen} onOpenChange={setSubOptionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Sub-Option</DialogTitle>
            <DialogDescription>Add a new item to this sub-menu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="subopt-id">Option ID (snake_case)</Label>
              <Input
                id="subopt-id"
                placeholder="e.g. matte_black"
                value={subOptionForm.id}
                onChange={(e) => setSubOptionForm((f) => ({ ...f, id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subopt-label">Label</Label>
              <Input
                id="subopt-label"
                placeholder="Matte Black"
                value={subOptionForm.label}
                onChange={(e) => setSubOptionForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subopt-desc">Description (optional)</Label>
              <Input
                id="subopt-desc"
                placeholder="Premium finish option"
                value={subOptionForm.description}
                onChange={(e) => setSubOptionForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubOptionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubOption} disabled={!subOptionForm.id || !subOptionForm.label}>
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Confirmation Dialog ---- */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.label}</span>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget?.onConfirm()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
