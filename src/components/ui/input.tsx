import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // NOTE: text-base (16px) is kept across ALL breakpoints — the prior
        // `md:text-sm` override was dropping input font-size to 14px on md+
        // viewports, which triggers iOS Safari auto-zoom on input focus
        // (iPad + any iPhone landscape that hits md). 16px everywhere
        // eliminates the zoom globally at the Input primitive level.
        // Reference: kratos msg 1776576955858 (2026-04-19).
        // Ship #201 (Rodolfo-direct 2026-04-21 pivot #19): placeholder
        // contrast dropped to /40 opacity so empty fields don't read
        // as already-filled. Labels carry meaning everywhere in the
        // app; placeholders are hints, not labels. Global change
        // applied at the primitive since all forms inherit.
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
