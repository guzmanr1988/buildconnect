import type { ReactNode } from 'react'

// Mock catalog of homeowner-facing tutorial videos. Per ship #170
// (task_1776721610245_395) — fills the /home/tutorials page with
// browsable content behind a working player dialog. Each entry is
// service-tagged so service-detail pages can deep-link via
// ?service=<id>. videoUrl is optional — entries without a URL render
// the "releasing soon" placeholder in the dialog so the loop closes on
// mock data per the keep-mocks-as-test-harness directive. When real
// Cloudflare Stream / YouTube URLs are produced, swap videoUrl in
// place — no consumer changes needed.

export interface Tutorial {
  id: string
  title: string
  description: string
  duration: string // human-readable, e.g. "2:45"
  serviceId: string // matches SERVICE_CATALOG id (roofing, pool, ...)
  topics: string[] // chip-style tags rendered on the card
  transcript: ReactNode | string // shown in dialog below the player
  videoUrl?: string
}

export const TUTORIALS: Tutorial[] = [
  // Roofing
  {
    id: 'roof-inspection-what-to-expect',
    title: 'What to expect from a roof inspection',
    description:
      'A walkthrough of the inspector visit: what they climb, photograph, and measure — and how long each step typically takes.',
    duration: '3:12',
    serviceId: 'roofing',
    topics: ['Inspection', 'Site visit', 'Pre-quote'],
    transcript:
      'The inspector arrives with a ladder, drone, and moisture meter. Expect a 30–45 minute visit: exterior perimeter survey, attic-side look at decking and ventilation, flashing + penetration check, and a final report summarizing remaining life, identified failures, and recommended scope.',
  },
  {
    id: 'roof-material-choice',
    title: 'Asphalt, metal, or tile — which material fits your home',
    description:
      'Cost, longevity, and insurance-rating differences for the three most common South Florida roof systems.',
    duration: '4:28',
    serviceId: 'roofing',
    topics: ['Materials', 'Budget', 'Longevity'],
    transcript:
      'Asphalt: lowest upfront cost, 20–25 yr life, easy to repair. Metal: 2–3x cost, 40–70 yr life, best wind rating, reflects heat. Tile: highest cost, 50+ yr life, classic South FL look but heavier structural load and fragile walking surface.',
  },

  // Windows & Doors
  {
    id: 'windows-how-to-measure',
    title: 'How to measure your windows and doors',
    description:
      'Get accurate width, height, and depth numbers so your quote reflects the real replacement scope.',
    duration: '2:45',
    serviceId: 'windows_doors',
    topics: ['Measuring', 'Quote prep', 'DIY'],
    transcript:
      'Measure inside the window frame, not the glass: width at top + middle + bottom, take the smallest. Height on both sides + center, take the smallest. Depth from inside trim to outside trim. Doors: add 1" to height for threshold clearance. Photograph each opening with the tape visible.',
  },
  {
    id: 'windows-impact-vs-shutters',
    title: 'Impact windows vs. hurricane shutters',
    description:
      'Upfront cost, insurance discount, daily usability, and how each option handles a Cat-4 event.',
    duration: '3:55',
    serviceId: 'windows_doors',
    topics: ['Hurricane', 'Insurance', 'Comparison'],
    transcript:
      'Impact windows: $15k–$40k range per home, 25–40% wind-mit insurance discount, always on — no deploy step. Shutters: $4k–$12k, similar discount, require pre-storm deployment. Impact glass also reduces UV + outside noise year-round; shutters do not.',
  },

  // Pool & Oasis
  {
    id: 'pool-sizing-your-backyard',
    title: 'Sizing a pool for your backyard',
    description:
      'Setback rules, equipment clearance, and how to walk the yard before picking a shape and footprint.',
    duration: '5:10',
    serviceId: 'pool',
    topics: ['Sizing', 'Permitting', 'Layout'],
    transcript:
      'Most municipalities in South FL require 5–10 ft setback from property lines and 5 ft from the house. Add 3 ft equipment pad clearance. Walk the yard with a tape: mark buildable box, subtract setbacks, then design pool inside that box.',
  },
  {
    id: 'pool-finish-options',
    title: 'Plaster, pebble, or tile — pool finishes explained',
    description:
      'Feel underfoot, longevity, staining behavior, and cost per square foot for each interior finish.',
    duration: '3:40',
    serviceId: 'pool',
    topics: ['Finishes', 'Maintenance', 'Budget'],
    transcript:
      'Plaster: smoothest, lowest cost, 7–10 yr resurface cycle. Pebble: textured grip, 15–20 yr life, more forgiving of staining. All-tile: premium look, 25+ yr life, highest installation cost and most demanding waterline maintenance.',
  },

  // Bathroom
  {
    id: 'bath-scope-planning',
    title: 'Planning a bathroom remodel scope',
    description:
      'Which decisions lock first (tile, vanity, tub/shower), and how each choice cascades into later trades.',
    duration: '4:05',
    serviceId: 'bathroom',
    topics: ['Planning', 'Scope', 'Sequencing'],
    transcript:
      'Lock the fixture layout first — vanity width, shower footprint, toilet position — since plumbing rough-in follows. Tile selection gates the curb + niche dimensions. Electrical + venting come last. Expect 3–5 weeks end-to-end for a mid-scope remodel.',
  },

  // Kitchen
  {
    id: 'kitchen-layout-fundamentals',
    title: 'Kitchen layout fundamentals — the work triangle',
    description:
      'Sink, stove, and fridge positioning for comfortable daily use regardless of kitchen size.',
    duration: '3:25',
    serviceId: 'kitchen',
    topics: ['Layout', 'Ergonomics', 'Workflow'],
    transcript:
      'The three primary work points — sink, cooktop, fridge — form a triangle. Each leg between 4 and 9 ft, total perimeter 13–26 ft. Avoid traffic paths cutting the triangle. In small kitchens, a single-wall or galley layout wins over forcing a triangle that does not fit.',
  },

  // Driveways
  {
    id: 'driveway-concrete-vs-pavers',
    title: 'Concrete vs. pavers for your driveway',
    description:
      'Initial cost, repairability, drainage, and long-term weather behavior in South Florida.',
    duration: '3:18',
    serviceId: 'driveways',
    topics: ['Materials', 'Drainage', 'Repairs'],
    transcript:
      'Poured concrete: lowest upfront, but cracks are hard to invisibly repair and the whole slab ages together. Pavers: 30–50% more upfront, individual unit replacement is trivial, and joints drain better in heavy rain. Pavers typically win on 15+ year horizon.',
  },

  // Pergolas
  {
    id: 'pergola-shade-coverage',
    title: 'Picking a pergola for real shade',
    description:
      'Louvered, fabric-canopy, or slatted wood — how much shade each delivers at different sun angles.',
    duration: '2:58',
    serviceId: 'pergolas',
    topics: ['Shade', 'Materials', 'Design'],
    transcript:
      'Slatted wood: 40–60% shade fixed. Fabric canopy: 80–95% when deployed, retractable. Louvered aluminum: 0–100% adjustable + rain-tight at full close. Louvered wins for daily usability; slatted wood wins on material warmth; canopy wins on budget.',
  },

  // Air Conditioning
  {
    id: 'ac-sizing-tonnage',
    title: 'Sizing an AC system — tonnage explained',
    description:
      'Why bigger is not better, and how square footage plus insulation quality drive the right size.',
    duration: '3:02',
    serviceId: 'air_conditioning',
    topics: ['Sizing', 'Efficiency', 'Comfort'],
    transcript:
      'One ton cools roughly 400–600 sq ft in South FL depending on insulation + ceiling height + sun exposure. Oversized systems short-cycle: they hit temp fast, never run long enough to dehumidify, leaving the house cool but clammy. A Manual J calc beats rule-of-thumb sizing.',
  },

  // General
  {
    id: 'general-financing-basics',
    title: 'Financing your project — the basics',
    description:
      'How financed quotes differ from cash quotes, common loan shapes, and what to ask your contractor.',
    duration: '4:12',
    serviceId: 'general',
    topics: ['Financing', 'Budgeting', 'Quotes'],
    transcript:
      'Contractor-arranged financing is usually a third-party lender with a fixed APR and 60–180 month term. Cash quotes run ~3–7% less because no financing fee is embedded. Ask for both numbers side-by-side and confirm any prepayment penalty in writing.',
  },
  {
    id: 'general-permit-process',
    title: 'Permits — who pulls them and why it matters',
    description:
      'Why the permit is on the contractor, what inspections happen when, and how it protects you at resale.',
    duration: '3:30',
    serviceId: 'general',
    topics: ['Permits', 'Compliance', 'Resale'],
    transcript:
      'Licensed contractors pull the permit in their name — it is their license on the line. Typical inspections: rough (framing, electrical, plumbing), then final. Unpermitted work surfaces at resale during a 4-point inspection and can cost more to retroactively permit than the original work.',
  },
]

// Return tutorials filtered by service, with "general" tutorials always
// appended so the service-specific view still has broadly-useful content.
export function getTutorialsForService(serviceId: string | null | undefined): Tutorial[] {
  if (!serviceId || serviceId === 'all') return TUTORIALS
  const specific = TUTORIALS.filter((t) => t.serviceId === serviceId)
  const general = TUTORIALS.filter((t) => t.serviceId === 'general')
  return [...specific, ...general]
}

// Human-readable service label → used by the tutorials filter bar + card
// badge. Kept here (and not looked up from SERVICE_CATALOG) because the
// tutorials page also renders a "general" bucket that is not a service.
export const TUTORIAL_SERVICE_LABELS: Record<string, string> = {
  roofing: 'Roofing',
  windows_doors: 'Windows & Doors',
  pool: 'Pool',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  driveways: 'Driveways',
  pergolas: 'Pergolas',
  air_conditioning: 'Air Conditioning',
  general: 'General',
}
