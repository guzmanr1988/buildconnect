import { motion } from 'framer-motion'
import { PlayCircle } from 'lucide-react'

export function HomeownerTutorialsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <PlayCircle className="h-8 w-8" strokeWidth={1.6} />
      </div>
      <h1 className="mt-6 text-2xl font-bold font-heading text-foreground tracking-tight">
        Video Tutorials
      </h1>
      <p className="mt-3 max-w-md text-[15px] text-muted-foreground leading-relaxed">
        Short explainers for every service we cover are on the way — what to expect
        from an inspection, how to measure windows and doors, what materials to
        pick, and more.
      </p>
      <p className="mt-6 text-[13px] text-muted-foreground/80 italic">
        Coming soon.
      </p>
    </motion.div>
  )
}
