import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, ArrowLeft, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/use-document-title'

export function NotFoundPage() {
  const navigate = useNavigate()
  useDocumentTitle('Page not found')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md text-center"
      >
        {/* Branded logo */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
          <Building2 className="h-7 w-7 text-primary-foreground" aria-hidden="true" />
        </div>

        {/* Status */}
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase mb-3">
          Error 404
        </p>
        <h1 className="text-4xl font-bold font-heading text-foreground mb-3">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          We couldn't find the page you were looking for. It may have moved, or the link may be incorrect.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="outline"
            size="lg"
            className="gap-2 w-full sm:w-auto"
            onClick={() => navigate(-1)}
            aria-label="Go back to the previous page"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go back
          </Button>
          <Button
            size="lg"
            className="gap-2 w-full sm:w-auto"
            onClick={() => navigate('/', { replace: true })}
            aria-label="Back to home"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Button>
        </div>

        {/* Subtle brand tag */}
        <p className="mt-10 text-xs text-muted-foreground/70">
          BuildConnect
        </p>
      </motion.div>
    </div>
  )
}
