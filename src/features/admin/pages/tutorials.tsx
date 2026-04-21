import { useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  PlayCircle, Plus, Pencil, Trash2, Search, Eye, EyeOff, Clock, Film, Tag,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { useTutorialsStore, type TutorialInput } from '@/stores/tutorials-store'
import { TUTORIAL_SERVICE_LABELS, type Tutorial } from '@/lib/tutorials'
import { cn } from '@/lib/utils'

/*
 * Ship #24 — admin video tutorials management. Writes to the shared
 * useTutorialsStore; /home/tutorials reads the same store filtered by
 * visible !== false. Admin list shows ALL entries (visible + hidden)
 * with state badges so admin can manage both sets.
 *
 * Dual-action model: Show/Hide toggle is the 90% case (pull from
 * homeowners temporarily without data loss), Delete Permanently is the
 * 10% case (duplicates / mistakes / legal takedown) with alternative-
 * steer copy directing to Hide first. Matches the Stage-4 destructive-
 * confirm-names-the-break pattern.
 */

const CATEGORY_OPTIONS = Object.keys(TUTORIAL_SERVICE_LABELS)

function blankTutorial(): TutorialInput {
  return {
    title: '',
    description: '',
    duration: '',
    serviceId: 'general',
    topics: [],
    transcript: '',
    videoUrl: '',
    thumbnailUrl: '',
    visible: true,
  }
}

function toInput(t: Tutorial): TutorialInput {
  return {
    title: t.title,
    description: t.description,
    duration: t.duration,
    serviceId: t.serviceId,
    topics: t.topics,
    transcript: typeof t.transcript === 'string' ? t.transcript : '',
    videoUrl: t.videoUrl ?? '',
    thumbnailUrl: t.thumbnailUrl ?? '',
    visible: t.visible ?? true,
  }
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, delay: i * 0.03, ease: 'easeOut' },
  }),
} satisfies Variants

export default function AdminTutorialsPage() {
  const tutorials = useTutorialsStore((s) => s.tutorials)
  const addTutorial = useTutorialsStore((s) => s.addTutorial)
  const updateTutorial = useTutorialsStore((s) => s.updateTutorial)
  const setVisibility = useTutorialsStore((s) => s.setVisibility)
  const removeTutorial = useTutorialsStore((s) => s.removeTutorial)

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TutorialInput>(blankTutorial())
  const [topicsInput, setTopicsInput] = useState<string>('')
  const [deleteTarget, setDeleteTarget] = useState<Tutorial | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tutorials.filter((t) => {
      if (categoryFilter !== 'all' && t.serviceId !== categoryFilter) return false
      if (!q) return true
      const haystack = `${t.title} ${t.description} ${t.topics.join(' ')} ${t.serviceId}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [tutorials, query, categoryFilter])

  const visibleCount = useMemo(() => tutorials.filter((t) => t.visible !== false).length, [tutorials])

  function openAdd() {
    setEditingId(null)
    setForm(blankTutorial())
    setTopicsInput('')
    setFormOpen(true)
  }

  function openEdit(t: Tutorial) {
    setEditingId(t.id)
    setForm(toInput(t))
    setTopicsInput(t.topics.join(', '))
    setFormOpen(true)
  }

  function submitForm() {
    if (!form.title.trim()) {
      toast.error('Title is required.')
      return
    }
    if (!form.description.trim()) {
      toast.error('Description is required.')
      return
    }
    const topics = topicsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const payload: TutorialInput = { ...form, topics }
    if (editingId) {
      updateTutorial(editingId, payload)
      toast.success('Tutorial updated.')
    } else {
      addTutorial(payload)
      toast.success('Tutorial added.')
    }
    setFormOpen(false)
    setEditingId(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video Tutorials"
        description={`${tutorials.length} total · ${visibleCount} visible to homeowners`}
      >
        <Button onClick={openAdd} className="gap-1.5" data-admin-tutorial-add>
          <Plus className="h-4 w-4" />
          Add Video
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[16rem] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, or topics..."
            className="pl-9 h-10"
            data-admin-tutorial-search
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? 'all')}>
          <SelectTrigger className="h-10 w-[12rem]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_OPTIONS.map((id) => (
              <SelectItem key={id} value={id}>{TUTORIAL_SERVICE_LABELS[id]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="p-10 text-center">
            <Film className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {query.trim() || categoryFilter !== 'all'
                ? 'No tutorials match your filters.'
                : 'No tutorials in the catalog yet. Add your first video to get started.'}
            </p>
            {!query.trim() && categoryFilter === 'all' && (
              <Button onClick={openAdd} className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" />
                Add your first video
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t, i) => {
            const isVisible = t.visible !== false
            return (
              <motion.div
                key={t.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                data-admin-tutorial-row
                data-admin-tutorial-id={t.id}
              >
                <Card className={cn('rounded-xl transition', !isVisible && 'opacity-60')}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5">
                      <PlayCircle className="h-6 w-6 text-primary" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{t.title}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {TUTORIAL_SERVICE_LABELS[t.serviceId] ?? t.serviceId}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] gap-1',
                            isVisible
                              ? 'border-emerald-400/60 text-emerald-700 dark:text-emerald-400'
                              : 'border-amber-400/60 text-amber-700 dark:text-amber-400',
                          )}
                        >
                          {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {isVisible ? 'Visible' : 'Hidden'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t.duration}
                        </span>
                        {t.topics.slice(0, 3).map((topic) => (
                          <span key={topic} className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {topic}
                          </span>
                        ))}
                        {t.topics.length > 3 && (
                          <span className="text-[10px]">+{t.topics.length - 3} more</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <div className="flex items-center gap-2 px-2">
                        <Switch
                          checked={isVisible}
                          onCheckedChange={(v) => {
                            setVisibility(t.id, v)
                            toast.success(v ? 'Visible to homeowners.' : 'Hidden from homeowners.')
                          }}
                          data-admin-tutorial-visibility-switch
                          aria-label={isVisible ? 'Hide from homeowners' : 'Show to homeowners'}
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openEdit(t)} className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" data-admin-tutorial-form>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingId ? 'Edit Tutorial' : 'Add Tutorial'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update details. Changes publish immediately on the homeowner tutorials tab.'
                : 'Enter details. URL-based for now — Cloudflare Stream or YouTube links work.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 text-sm"
                placeholder="e.g. How to measure your windows"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="One or two sentences — this shows on the tutorial card."
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={form.serviceId} onValueChange={(v) => setForm({ ...form, serviceId: v ?? 'general' })}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((id) => (
                      <SelectItem key={id} value={id}>{TUTORIAL_SERVICE_LABELS[id]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Duration</Label>
                <Input
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  className="h-10 text-sm"
                  placeholder="e.g. 3:45"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Video URL</Label>
              <Input
                value={form.videoUrl ?? ''}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                className="h-10 text-sm"
                placeholder="https://... (Cloudflare Stream, YouTube, Vimeo, or direct .mp4)"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to render the "releasing soon" placeholder.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Thumbnail URL (optional)</Label>
              <Input
                value={form.thumbnailUrl ?? ''}
                onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
                className="h-10 text-sm"
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Topics (comma-separated)</Label>
              <Input
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
                className="h-10 text-sm"
                placeholder="e.g. Measuring, Quote prep, DIY"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Summary / transcript</Label>
              <Textarea
                value={typeof form.transcript === 'string' ? form.transcript : ''}
                onChange={(e) => setForm({ ...form, transcript: e.target.value })}
                rows={5}
                placeholder="Shown below the player in the homeowner dialog."
                className="text-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-semibold">Visible to homeowners</p>
                <p className="text-xs text-muted-foreground">Off hides this video on /home/tutorials without deleting.</p>
              </div>
              <Switch
                checked={form.visible ?? true}
                onCheckedChange={(v) => setForm({ ...form, visible: v })}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={submitForm} className="w-full sm:w-auto">
              {editingId ? 'Save changes' : 'Add tutorial'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Permanently Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">Delete video permanently?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  This removes <span className="font-semibold">{deleteTarget.title}</span> from your
                  catalog entirely and cannot be recovered. To temporarily pull it from homeowners,
                  use Hide instead — the data stays for when you want it back.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="w-full sm:w-auto">
              Keep video
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  removeTutorial(deleteTarget.id)
                  toast.success(`${deleteTarget.title} deleted.`)
                }
                setDeleteTarget(null)
              }}
              className="w-full sm:w-auto"
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
