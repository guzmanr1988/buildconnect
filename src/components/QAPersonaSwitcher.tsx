import { useState, useEffect } from 'react'
import { UserRound, LogOut, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { QA_PERSONAS, applyQAPersona, clearQAPersona, activeQAPersonaId } from '@/lib/qa-personas'
import { router } from '@/router'

// Floating QA persona switcher. Visible only when VITE_DEMO_MODE !== 'false'.
// Lets apollo (or any QA operator) jump between 4 pre-seeded homeowner
// personas without clicking through the full account-creation + configure +
// cart + send flow. Gated off in prod by flipping VITE_DEMO_MODE to 'false'
// in the prod env.
export function QAPersonaSwitcher() {
  const demoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    setActiveId(activeQAPersonaId())
  }, [open])

  if (!demoMode) return null

  const handleSwitch = (personaId: string) => {
    const persona = QA_PERSONAS.find((p) => p.id === personaId)
    if (!persona) return
    applyQAPersona(persona)
    // SPA navigation via router instance — skips the full bundle reload that
    // window.location.href='/home' forces (~1-2s cold). Ship #103 per Rod
    // report 'demo taking long to open users' via kratos 1776716415563.
    // Target: <300ms click-to-landing.
    setOpen(false)
    setActiveId(persona.id)
    router.navigate('/home')
  }

  const handleExit = () => {
    clearQAPersona()
    setOpen(false)
    setActiveId(null)
    router.navigate('/login')
  }

  const active = activeId ? QA_PERSONAS.find((p) => p.id === activeId) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-50 gap-1.5 shadow-lg bg-background border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
          aria-label="QA Persona Switcher"
        >
          <Users className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs font-semibold">
            QA: {active ? active.label.split(' — ')[0] : 'None'}
          </span>
          <span className="sm:hidden text-xs font-semibold">QA</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[340px] p-3">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              QA Homeowner Personas
            </p>
            {active && (
              <Badge variant="secondary" className="text-[10px]">
                Active: {active.id}
              </Badge>
            )}
          </div>
          <div className="space-y-1.5">
            {QA_PERSONAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSwitch(p.id)}
                className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                  activeId === p.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <UserRound className="h-3.5 w-3.5 text-primary shrink-0" />
                  <p className="text-xs font-semibold truncate">{p.label}</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {p.description}
                </p>
              </button>
            ))}
          </div>
          <div className="pt-1 border-t border-border/60">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/5"
              onClick={handleExit}
            >
              <LogOut className="h-3.5 w-3.5" />
              Exit QA session (clear all)
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center leading-snug">
            Switching a persona reloads the app + hydrates auth + cart + projects
            stores with that persona's seed. Gated by VITE_DEMO_MODE.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
