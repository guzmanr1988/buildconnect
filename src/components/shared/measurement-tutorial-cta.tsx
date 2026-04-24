import { Video, PlayCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Ship #253 — per-service measurement tutorial CTA. Appears on every
// homeowner service-configure page (src/features/homeowner/pages/
// service-detail.tsx) above the option-group picker so the homeowner
// sees the help-link BEFORE getting stuck on measurements. Placeholder
// onClick toasts "coming soon" — real video URLs wire in when content
// is produced.

function getServiceMeasurementPhrase(serviceId: string): string {
  switch (serviceId) {
    case 'roofing': return 'your roof'
    case 'windows_doors': return 'your windows and doors'
    case 'pool': return 'your pool space'
    case 'driveways': return 'your driveway'
    case 'pergolas': return 'your pergola'
    case 'air_conditioning': return 'your air conditioning'
    case 'kitchen': return 'your kitchen'
    case 'bathroom': return 'your bathroom'
    case 'wall_paneling': return 'your wall space'
    case 'garage': return 'your garage'
    case 'house_painting': return 'your painting area'
    default: return 'your project'
  }
}

export function MeasurementTutorialCTA({ serviceId, className }: { serviceId: string; className?: string }) {
  const phrase = getServiceMeasurementPhrase(serviceId)
  return (
    <Card
      className={cn(
        'rounded-xl border-sky-200 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/20',
        className,
      )}
    >
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
          <Video className="h-5 w-5 text-sky-700 dark:text-sky-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
            Need help measuring {phrase}?
          </p>
          <p className="text-xs text-sky-800/80 dark:text-sky-200/80 mt-0.5">
            Watch the step-by-step tutorial.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5 border-sky-300 bg-white/60 text-sky-800 hover:bg-white dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100"
          onClick={() => {
            // Ship #253 placeholder — real video URLs wire in when content
            // is produced. Toast-only so the UI shape is correct; swap
            // onClick target later without restructuring.
            toast('Tutorial video coming soon', {
              description: 'Real content lands once we wire the video library.',
            })
          }}
        >
          <PlayCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Watch tutorial</span>
          <span className="sm:hidden">Watch</span>
        </Button>
      </CardContent>
    </Card>
  )
}
