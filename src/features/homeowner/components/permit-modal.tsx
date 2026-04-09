import { useState } from 'react'
import { Shield, XCircle, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface PermitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (withPermit: boolean) => void
}

export function PermitModal({ open, onOpenChange, onSelect }: PermitModalProps) {
  const [selected, setSelected] = useState<boolean | null>(null)

  function handleSelect(withPermit: boolean) {
    setSelected(withPermit)
    setTimeout(() => {
      onSelect(withPermit)
      onOpenChange(false)
      setSelected(null)
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-lg">Building Permit Required?</DialogTitle>
          <DialogDescription>
            Does this project require a building permit from your local authority?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          {/* YES */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSelect(true)}
            className={cn(
              'relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all duration-200 min-h-[140px]',
              selected === true
                ? 'border-primary bg-primary text-primary-foreground shadow-lg scale-[1.02]'
                : 'border-border bg-card text-foreground hover:border-primary/40 hover:shadow-md'
            )}
          >
            {selected === true && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
              >
                <Check className="h-3.5 w-3.5" />
              </motion.div>
            )}
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl',
                selected === true ? 'bg-white/20' : 'bg-primary/10'
              )}
            >
              <Shield
                className={cn(
                  'h-6 w-6',
                  selected === true ? 'text-primary-foreground' : 'text-primary'
                )}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold font-heading">YES</p>
              <p
                className={cn(
                  'mt-0.5 text-[11px] leading-tight',
                  selected === true ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}
              >
                With Building Permit
              </p>
            </div>
          </motion.button>

          {/* NO */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSelect(false)}
            className={cn(
              'relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all duration-200 min-h-[140px]',
              selected === false
                ? 'border-muted-foreground bg-muted text-foreground shadow-lg scale-[1.02]'
                : 'border-border bg-card text-foreground hover:border-muted-foreground/40 hover:shadow-md'
            )}
          >
            {selected === false && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow"
              >
                <Check className="h-3.5 w-3.5" />
              </motion.div>
            )}
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl',
                selected === false ? 'bg-foreground/10' : 'bg-muted'
              )}
            >
              <XCircle
                className={cn(
                  'h-6 w-6',
                  selected === false ? 'text-foreground' : 'text-muted-foreground'
                )}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold font-heading">NO</p>
              <p
                className={cn(
                  'mt-0.5 text-[11px] leading-tight',
                  selected === false ? 'text-foreground/70' : 'text-muted-foreground'
                )}
              >
                Without Permit
              </p>
            </div>
          </motion.button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
