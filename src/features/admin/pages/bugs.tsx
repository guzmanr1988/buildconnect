import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bug as BugIcon,
  Plus,
  AlertTriangle,
  AlertCircle,
  Info,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { MOCK_BUGS } from '@/lib/mock-data'
import type { Bug, BugPriority, BugStatus } from '@/types'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

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
  const [bugs, setBugs] = useState<Bug[]>([...MOCK_BUGS])
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState<BugPriority>('medium')

  const handleSubmit = () => {
    if (!newDescription.trim()) return
    const newBug: Bug = {
      id: `bug-${Date.now()}`,
      reporter_id: 'admin-1',
      description: newDescription.trim(),
      priority: newPriority,
      status: 'open',
      created_at: new Date().toISOString(),
    }
    setBugs((prev) => [newBug, ...prev])
    setNewDescription('')
    setNewPriority('medium')
  }

  const handleStatusChange = (bugId: string, newStatus: BugStatus) => {
    setBugs((prev) =>
      prev.map((b) => (b.id === bugId ? { ...b, status: newStatus } : b))
    )
  }

  const openCount = bugs.filter((b) => b.status === 'open').length
  const inProgressCount = bugs.filter((b) => b.status === 'in_progress').length
  const resolvedCount = bugs.filter((b) => b.status === 'resolved').length

  return (
    <div className="space-y-8">
      <PageHeader title="Bug Tracker" description="Report and manage platform issues">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-sm font-medium text-red-800 dark:text-red-400">
            {openCount} Open
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-400">
            {inProgressCount} In Progress
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-400">
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
                />
              </div>
              <div className="sm:w-48 space-y-2">
                <Label>Priority</Label>
                <Select
                  value={newPriority}
                  onValueChange={(val) => setNewPriority(val as BugPriority)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleSubmit} className="w-full gap-2 mt-2">
                  <BugIcon className="h-4 w-4" />
                  Submit Bug
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Bug List */}
      <div className="space-y-4">
        {bugs.map((bug, i) => {
          const priority = PRIORITY_CONFIG[bug.priority]
          const PriorityIcon = priority.icon
          return (
            <motion.div key={bug.id} custom={i + 1} variants={fadeUp} initial="hidden" animate="visible">
              <Card className="rounded-xl shadow-sm hover:shadow-md transition">
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
                            ? 'text-amber-600 dark:text-amber-400'
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
                        <SelectTrigger className="w-full">
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
    </div>
  )
}
