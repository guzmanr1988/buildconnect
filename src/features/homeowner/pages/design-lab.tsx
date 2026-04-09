import { Palette, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { SERVICE_CATALOG } from '@/lib/constants'

export function DesignLabPage() {
  const services = SERVICE_CATALOG.filter((s) => !s.phase2)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground">
              3D Design Lab
            </h1>
            <p className="text-sm text-muted-foreground">
              Explore and configure services for your project.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Service Accordion */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <CardContent>
            <Accordion>
              {services.map((service) => (
                <AccordionItem key={service.id} value={service.id}>
                  <AccordionTrigger className="py-4">
                    <div className="flex items-center gap-3">
                      <Settings className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-heading font-medium text-foreground">
                        {service.name}
                      </span>
                      {service.badge && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${service.badgeColor}`}
                        >
                          {service.badge}
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-4 pb-2">
                      <p className="text-sm text-muted-foreground">
                        {service.description}
                      </p>

                      {/* Features */}
                      <div className="flex flex-wrap gap-1.5">
                        {service.features.map((feature) => (
                          <Badge key={feature} variant="secondary" className="text-[10px]">
                            {feature}
                          </Badge>
                        ))}
                      </div>

                      {/* Placeholder design area */}
                      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-10">
                        <div className="text-center">
                          <Palette className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                          <p className="text-sm font-medium text-muted-foreground">
                            Configure your {service.name.toLowerCase()} design
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground/60">
                            3D visualization coming soon
                          </p>
                        </div>
                      </div>

                      {/* Option groups summary */}
                      {service.optionGroups.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Configuration Options
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {service.optionGroups.map((group) => (
                              <div
                                key={group.id}
                                className="rounded-lg border border-border bg-card px-3 py-2"
                              >
                                <p className="text-xs font-medium text-foreground">
                                  {group.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {group.options.length} options
                                  {group.required ? ' (required)' : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </motion.div>

      {/* Summary strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card className="bg-muted/50">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground font-heading">
                  {services.length} Services Available
                </p>
                <p className="text-xs text-muted-foreground">
                  Configure each service to build your complete project plan.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {SERVICE_CATALOG.filter((s) => s.phase2).length} coming soon
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
