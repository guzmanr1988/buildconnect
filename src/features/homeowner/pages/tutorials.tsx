import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PlayCircle, Clock, Film } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  TUTORIALS,
  TUTORIAL_SERVICE_LABELS,
  getTutorialsForService,
  type Tutorial,
} from '@/lib/tutorials'
import { cn } from '@/lib/utils'

export function HomeownerTutorialsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const serviceFilter = searchParams.get('service') ?? 'all'
  const [selected, setSelected] = useState<Tutorial | null>(null)

  const visible = useMemo(
    () => getTutorialsForService(serviceFilter === 'all' ? null : serviceFilter),
    [serviceFilter],
  )

  // Filter chips: distinct serviceIds from the full catalog + an "All" head.
  const serviceChips = useMemo(() => {
    const ids = Array.from(new Set(TUTORIALS.map((t) => t.serviceId)))
    return [{ id: 'all', label: 'All' }, ...ids.map((id) => ({
      id,
      label: TUTORIAL_SERVICE_LABELS[id] ?? id,
    }))]
  }, [])

  const setFilter = (id: string) => {
    if (id === 'all') {
      searchParams.delete('service')
    } else {
      searchParams.set('service', id)
    }
    setSearchParams(searchParams, { replace: true })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6"
    >
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
          Video Tutorials
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Short explainers to help you plan your project — what to expect, how
          to measure, which options fit your home.
        </p>
      </div>

      {/* Service filter chips */}
      <div className="flex flex-wrap gap-2">
        {serviceChips.map((chip) => {
          const active = chip.id === serviceFilter
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Tutorial grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
          >
            <Card
              className="group h-full cursor-pointer overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => setSelected(t)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelected(t)
                }
              }}
              aria-label={`Open tutorial: ${t.title}`}
            >
              {/* Thumbnail placeholder — gradient with centered play icon.
                  Swap to a real <img thumbnail> when Stream assets land. */}
              <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5">
                <div className="absolute inset-0 opacity-[0.06]" style={{
                  backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
                  backgroundSize: '14px 14px',
                }} />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-background/90 text-primary shadow-md transition-transform group-hover:scale-110">
                  <PlayCircle className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                  <Clock className="h-3 w-3" />
                  {t.duration}
                </div>
              </div>
              <CardContent className="flex flex-col gap-2 p-4">
                <Badge variant="secondary" className="w-fit text-[10px]">
                  {TUTORIAL_SERVICE_LABELS[t.serviceId] ?? t.serviceId}
                </Badge>
                <h3 className="text-sm font-semibold text-foreground leading-snug">
                  {t.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {t.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Player dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-heading">{selected.title}</DialogTitle>
                <DialogDescription className="text-sm">
                  {selected.description}
                </DialogDescription>
              </DialogHeader>

              {/* Player surface. Real videoUrl → <video>; otherwise
                  placeholder. Styled to match the service-detail aesthetic. */}
              <div className="relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-background">
                {selected.videoUrl ? (
                  <video
                    src={selected.videoUrl}
                    controls
                    className="h-full w-full bg-black"
                    preload="metadata"
                  >
                    Your browser does not support embedded video.
                  </video>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 text-primary shadow-md">
                      <Film className="h-6 w-6" strokeWidth={1.8} />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      Video releasing soon
                    </p>
                    <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">
                      The on-camera version is in production. In the meantime,
                      the summary below covers the same material.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {selected.topics.map((topic) => (
                  <Badge key={topic} variant="outline" className="text-[10px]">
                    {topic}
                  </Badge>
                ))}
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Summary
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {selected.transcript}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3 -translate-y-px" />
                  {selected.duration}
                </p>
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
