import { useNavigate } from 'react-router-dom'
import { Video, PlayCircle } from 'lucide-react'
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
    case 'garage': return 'your remodel area'
    case 'house_painting': return 'your painting area'
    case 'blinds': return 'your blinds'
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
        <TutorialButton serviceId={serviceId} />
      </CardContent>
    </Card>
  )
}

// Standalone Watch-tutorial button. Rod voice-directive 2026-07-14 relocated
// the button out of the service-detail info card and up into the page header
// row (right of title/description) to reclaim vertical space; the info-card
// variant above still ships inside the roofing wizard modal step 2.
export function TutorialButton({ serviceId, className }: { serviceId: string; className?: string }) {
  const navigate = useNavigate()
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn(
        'shrink-0 gap-1.5 border-sky-300 bg-white/60 text-sky-800 hover:bg-white dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100',
        className,
      )}
      onClick={() => {
        navigate(`/home/tutorials?service=${serviceId}`)
      }}
    >
      <PlayCircle className="h-3.5 w-3.5" />
      Watch tutorial
    </Button>
  )
}
