import { useState, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bug as BugIcon,
  Plus,
  AlertTriangle,
  AlertCircle,
  Info,
  Calendar,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import type { Bug, BugPriority, BugStatus } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
} satisfies Variants

const PRIORITY_CONFIG: Record<BugPriority, { label: string; icon: React.ElementType; className: string }> = {
  high: {
    label: 'High',
    icon: AlertTriangle,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  medium: {
    label: 'Medium',
    icon: AlertCircle,
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  low: {
    label: 'Low',
    icon: Info,
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
}

const STATUS_CONFIG: Record<BugStatus, { label: string; className: string }> = {
  open: {
    label: 'Open',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
}

export default function BugsPage() {
  // Supabase-wired per Rod-direct ship-now 2026-05-21. reporter_id = auth.uid()
  // satisfies RLS migration 010 "Any role can submit bugs" WITH CHECK clause.
  const sessionUserId = useAuthStore((s) => s.session?.user?.id ?? null)
  const [bugs, setBugs] = useState<Bug[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState<BugPriority>('medium')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('bugs')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) {
        toast.error(`Load bugs failed: ${error.message}`)
        setBugs([])
      } else {
        setBugs((data ?? []) as Bug[])
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async () => {
    const description = newDescription.trim()
    if (!description) return
    if (!sessionUserId) {
      toast.error('Not signed in — cannot submit bug')
      return
    }
    setSubmitting(true)
    const { data, error } = await supabase
      .from('bugs')
      .insert({
        reporter_id: sessionUserId,
        description,
        priority: newPriority,
      })
      .select('*')
      .single()
    setSubmitting(false)
    if (error || !data) {
      toast.error(`Submit bug failed: ${error?.message ?? 'unknown_error'}`)
      return
    }
    setBugs((prev) => [data as Bug, ...prev])
    setNewDescription('')
    setNewPriority('medium')
    toast.success('Bug reported')
  }

  const handleStatusChange = async (bugId: string, newStatus: BugStatus) => {
    const prevBugs = bugs
    setBugs((prev) => prev.map((b) => (b.id === bugId ? { ...b, status: newStatus } : b)))
    const { error } = await supabase
      .from('bugs')
      .update({ status: newStatus })
      .eq('id', bugId)
    if (error) {
      setBugs(prevBugs)
      toast.error(`Status update failed: ${error.message}`)
    }
  }

  const openCount = bugs.filter((b) => b.status === 'open').length
  const inProgressCount = bugs.filter((b) => b.status === 'in_progress').length
  const resolvedCount = bugs.filter((b) => b.status === 'resolved').length

  return (
    <div className="space-y-6">
      <PageHeader title="Bug Tracker" description="Report and manage platform issues">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-sm font-medium text-red-800 dark:text-red-400" data-testid="admin-bugs-open-count">
            {openCount} Open
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-400" data-testid="admin-bugs-in-progress-count">
            {inProgressCount} In Progress
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-400" data-testid="admin-bugs-resolved-count">
            {resolvedCount} Resolved
          </span>
        </div>
      </PageHeader>

      {/* Submit Bug Form */}
      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Report a Bug
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe the bug in detail..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="min-h-20"
                  data-testid="admin-bugs-description-input"
                />
              </div>
              <div className="sm:w-48 space-y-2">
                <Label>Priority</Label>
                <Select
                  value={newPriority}
                  onValueChange={(val) => setNewPriority(val as BugPriority)}
                >
                  <SelectTrigger className="w-full" data-testid="admin-bugs-priority-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !newDescription.trim() || !sessionUserId}
                  className="w-full gap-2 mt-2"
                  data-testid="admin-bugs-submit"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BugIcon className="h-4 w-4" />}
                  Submit Bug
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Bug List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground" data-testid="admin-bugs-loading">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading bugs…
        </div>
      ) : bugs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="admin-bugs-empty">
            <BugIcon className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <div className="text-sm">No bugs reported yet. Submit one above to get started.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bugs.map((bug, i) => {
            const priority = PRIORITY_CONFIG[bug.priority]
            const PriorityIcon = priority.icon
            return (
              <motion.div key={bug.id} custom={i + 1} variants={fadeUp} initial="hidden" animate="visible">
                <Card className="rounded-xl shadow-sm hover:shadow-md transition" data-testid="admin-bugs-row" data-bug-id={bug.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      {/* Priority Icon */}
                      <div
                        className={cn(
                          'rounded-lg p-2.5 shrink-0',
                          bug.priority === 'high'
                            ? 'bg-red-100 dark:bg-red-900/30'
                            : bug.priority === 'medium'
                            ? 'bg-amber-100 dark:bg-amber-900/30'
                            : 'bg-blue-100 dark:bg-blue-900/30'
                        )}
                      >
                        <PriorityIcon
                          className={cn(
                            'h-5 w-5',
                            bug.priority === 'high'
                              ? 'text-red-600 dark:text-red-400'
                              : bug.priority === 'medium'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-blue-600 dark:text-blue-400'
                          )}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">{bug.description}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          {/* Priority Badge */}
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              priority.className
                            )}
                          >
                            {priority.label}
                          </span>

                          {/* Date */}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(bug.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>

                          {/* Bug ID */}
                          <span className="text-xs text-muted-foreground font-mono">{bug.id}</span>
                        </div>
                      </div>

                      {/* Status Selector */}
                      <div className="shrink-0 sm:w-40">
                        <Select
                          value={bug.status}
                          onValueChange={(val) => handleStatusChange(bug.id, val as BugStatus)}
                        >
                          <SelectTrigger className="w-full" data-testid="admin-bugs-status-select" data-bug-id={bug.id}>
                            <SelectValue>
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                  STATUS_CONFIG[bug.status].className
                                )}
                              >
                                {STATUS_CONFIG[bug.status].label}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
