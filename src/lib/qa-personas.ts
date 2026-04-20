import type { Profile, VendorRep } from '@/types'
import type { CartItem } from '@/stores/cart-store'
import type { SentProject, ContractorInfo, BookingInfo, HomeownerInfo, CancellationRequest } from '@/stores/projects-store'

// QA personas for 2-week launch QA sweep. Each persona has a fully-seeded
// starting state across auth + cart + projects stores so apollo (or any QA
// session) can probe a lifecycle-stage in isolation without clicking through
// the full creation flow. Gated by VITE_DEMO_MODE via QAPersonaSwitcher.
//
// Personas are labeled by lifecycle-stage, not by vendor interaction state —
// vendor-side behavior is tested separately via existing demo vendor accounts
// (apex-demo / shield-demo / paradise-demo).

type LeadStatusOverride = 'pending' | 'confirmed' | 'rejected' | 'rescheduled' | 'completed'

export interface QAPersona {
  id: 'qa-1-fresh' | 'qa-2-cart' | 'qa-3-approved' | 'qa-4-mixed-lifecycle'
  label: string
  description: string
  profile: Profile
  cart: {
    items: CartItem[]
    projectTitle?: string
    notes?: string
  }
  projects: {
    sentProjects: SentProject[]
    assignedRepByLead: Record<string, VendorRep>
    leadStatusOverrides: Record<string, LeadStatusOverride>
    cancellationRequestsByLead: Record<string, CancellationRequest>
  }
}

const contractor: ContractorInfo = {
  name: 'Demo Vendor',
  company: 'Paradise Pools Inc.',
  rating: 4.8,
}

const booking: BookingInfo = {
  date: '2026-05-15',
  time: '10:00 AM',
}

const rep: VendorRep = {
  id: 'rep-demo-1',
  name: 'Marco Alvarez',
  role: 'Senior Estimator',
}

function homeowner(p: Profile): HomeownerInfo {
  return {
    name: p.name,
    phone: p.phone,
    email: p.email,
    address: p.address,
  }
}

const PERSONA_1_FRESH: QAPersona = {
  id: 'qa-1-fresh',
  label: 'Rosa Jimenez — Fresh / Zero-state',
  description: 'Fresh account in Miami, no cart, no projects. Tests onboarding + browse + configure + first-add flow. (Renamed 2026-04-20 from Ana Martinez to avoid name-collision with paradise-demo vendor owner.)',
  profile: {
    id: 'qa-persona-1-rosa-jimenez',
    email: 'rosa.jimenez.qa@buildc.net',
    name: 'Rosa Jimenez',
    role: 'homeowner',
    phone: '305-555-0201',
    address: '1201 Brickell Ave, Miami, FL 33131',
    avatar_color: '#f472b6',
    initials: 'AM',
    status: 'active',
    created_at: '2026-04-15T00:00:00.000Z',
  },
  cart: {
    items: [],
  },
  projects: {
    sentProjects: [],
    assignedRepByLead: {},
    leadStatusOverrides: {},
    cancellationRequestsByLead: {},
  },
}

const PERSONA_2_CART: QAPersona = {
  id: 'qa-2-cart',
  label: 'Carlos Rodriguez — Cart pre-booking',
  description: 'Fort Lauderdale, 1 pool project in cart, not yet sent to vendor. Tests cart review + send-to-contractor + booking flow.',
  profile: {
    id: 'qa-persona-2-carlos-rodriguez',
    email: 'carlos.rodriguez.qa@buildc.net',
    name: 'Carlos Rodriguez',
    role: 'homeowner',
    phone: '954-555-0202',
    address: '3400 Las Olas Blvd, Fort Lauderdale, FL 33301',
    avatar_color: '#60a5fa',
    initials: 'CR',
    status: 'active',
    created_at: '2026-04-10T00:00:00.000Z',
  },
  cart: {
    items: [{
      id: 'qa2-cart-item-1',
      serviceId: 'pool',
      serviceName: 'Swimming Pool',
      selections: {
        pool_size: ['medium_25x15'],
        pool_shape: ['rectangular'],
        pool_finish: ['pebble_tec'],
      },
      addonQuantities: { ledCount: 4, laminarJets: 2 },
      address: {
        label: 'Primary',
        full: '3400 Las Olas Blvd, Fort Lauderdale, FL 33301',
      },
      addedAt: '2026-04-18T14:00:00.000Z',
    }],
    projectTitle: 'Backyard Pool Install',
    notes: 'Prefer morning site visits. Access via side gate.',
  },
  projects: {
    sentProjects: [],
    assignedRepByLead: {},
    leadStatusOverrides: {},
    cancellationRequestsByLead: {},
  },
}

const PERSONA_3_PROFILE: Profile = {
  id: 'qa-persona-3-isabel-gonzalez',
  email: 'isabel.gonzalez.qa@buildc.net',
  name: 'Isabel Gonzalez',
  role: 'homeowner',
  phone: '561-555-0203',
  address: '220 Worth Ave, West Palm Beach, FL 33480',
  avatar_color: '#34d399',
  initials: 'IG',
  status: 'active',
  created_at: '2026-03-20T00:00:00.000Z',
}

const PERSONA_3_APPROVED: QAPersona = {
  id: 'qa-3-approved',
  label: 'Isabel Gonzalez — Approved mid-lifecycle',
  description: 'West Palm Beach, 1 approved project with rep assigned. Tests Active-project render, rep-visible flow, appointment-status page.',
  profile: PERSONA_3_PROFILE,
  cart: {
    items: [],
  },
  projects: {
    sentProjects: [{
      id: 'qa3sp0001abcd',
      item: {
        id: 'qa3-item-1',
        serviceId: 'windows_doors',
        serviceName: 'Windows & Doors',
        selections: { install_windows: ['install_windows'] },
        selectionQuantities: { install_windows: 6 },
        windowSelections: [
          { id: 'ws1', size: '36x48', type: 'double_hung', frameColor: 'white', glassColor: 'clear', glassType: 'low_e', quantity: 6 },
        ],
        addedAt: '2026-04-05T00:00:00.000Z',
      } as CartItem,
      status: 'approved',
      contractor,
      booking: { date: '2026-05-08', time: '2:00 PM' },
      homeowner: homeowner(PERSONA_3_PROFILE),
      // Fresh sentAt so the 3-business-day cancellation window is still
      // open — apollo probe T1 needs this to exercise the Request-
      // Cancellation dialog flow. Prior timestamp (2026-04-05) was 11+
      // business days old → canCancel=false → button disabled → dialog
      // never opened. Msg 1776671514407.
      sentAt: '2026-04-19T15:00:00.000Z',
      assignedRep: rep,
    }],
    assignedRepByLead: { 'L-QA3S': rep },
    leadStatusOverrides: {},
    cancellationRequestsByLead: {},
  },
}

const PERSONA_4_PROFILE: Profile = {
  id: 'qa-persona-4-miguel-hernandez',
  email: 'miguel.hernandez.qa@buildc.net',
  name: 'Miguel Hernandez',
  role: 'homeowner',
  phone: '239-555-0204',
  address: '780 Fifth Ave S, Naples, FL 34102',
  avatar_color: '#f59e0b',
  initials: 'MH',
  status: 'active',
  created_at: '2026-02-01T00:00:00.000Z',
}

const PERSONA_4_MIXED: QAPersona = {
  id: 'qa-4-mixed-lifecycle',
  label: 'Miguel Hernandez — Mixed lifecycle + cancellation',
  description: 'Naples, 1 completed roof + 1 active bath + 1 pending cancellation on pool. Tests post-lifecycle Completed render, multi-project /home, cancellation-request homeowner+vendor flow.',
  profile: PERSONA_4_PROFILE,
  cart: {
    items: [],
  },
  projects: {
    sentProjects: [
      {
        id: 'roof4miguelqa',
        item: {
          id: 'qa4-item-1',
          serviceId: 'roofing',
          serviceName: 'Roofing',
          selections: { roof_material: ['shingle'], permit: ['permit'] },
          metalRoofSelection: { color: '', roofSize: '' },
          addedAt: '2026-02-10T00:00:00.000Z',
        } as CartItem,
        status: 'sold',
        contractor,
        booking: { date: '2026-03-01', time: '9:00 AM' },
        homeowner: homeowner(PERSONA_4_PROFILE),
        sentAt: '2026-02-10T10:00:00.000Z',
        soldAt: '2026-03-05T18:00:00.000Z',
        saleAmount: 18500,
        assignedRep: rep,
      },
      {
        id: 'bath4miguelqa',
        item: {
          id: 'qa4-item-2',
          serviceId: 'bathroom',
          serviceName: 'Bathroom Remodel',
          selections: { bath_scope: ['full_remodel'], financed: ['financed'] },
          addedAt: '2026-04-01T00:00:00.000Z',
        } as CartItem,
        status: 'approved',
        contractor,
        booking: { date: '2026-05-20', time: '11:00 AM' },
        homeowner: homeowner(PERSONA_4_PROFILE),
        sentAt: '2026-04-01T11:00:00.000Z',
        assignedRep: rep,
      },
      {
        id: 'pool4miguelqa',
        item: {
          id: 'qa4-item-3',
          serviceId: 'pool',
          serviceName: 'Swimming Pool',
          selections: { pool_size: ['large_30x18'], pool_shape: ['freeform'] },
          addedAt: '2026-04-12T00:00:00.000Z',
        } as CartItem,
        status: 'approved',
        contractor,
        booking,
        homeowner: homeowner(PERSONA_4_PROFILE),
        sentAt: '2026-04-12T14:00:00.000Z',
        assignedRep: rep,
      },
    ],
    assignedRepByLead: {
      'L-ROOF': rep,
      'L-BATH': rep,
      'L-POOL': rep,
    },
    leadStatusOverrides: {},
    cancellationRequestsByLead: {
      'L-POOL': {
        requestedAt: '2026-04-19T20:00:00.000Z',
        status: 'pending',
      },
    },
  },
}

export const QA_PERSONAS: QAPersona[] = [
  PERSONA_1_FRESH,
  PERSONA_2_CART,
  PERSONA_3_APPROVED,
  PERSONA_4_MIXED,
]

// Write the persona to localStorage. Callers should reload the page after so
// zustand-persist hydrates from the fresh state on next mount.
export function applyQAPersona(persona: QAPersona) {
  // Auth
  // REVERTED (kratos msg 1776717519163): ship #103 Zustand-setState-first
  // approach caused a regression — AuthBootstrap's qaPersonaActive snapshot
  // (captured at initial mount with [] deps) went stale after SPA nav, letting
  // Supabase events clobber persona state. Back to explicit localStorage
  // writes paired with window.location.href='/home' full reload — slower
  // (~1-2s) but correct. Perf optimization filed as Tranche-2 task; the
  // proper fix is to make AuthBootstrap read the flag inside its event
  // handlers rather than snapshot at mount time. Also: setState is still
  // called for in-memory freshness between localStorage write + reload, but
  // the localStorage writes are the source-of-truth for reload rehydration.
  localStorage.setItem('buildconnect-auth', JSON.stringify({
    state: {
      session: {
        access_token: `qa-fake-token-${persona.id}`,
        user: { id: persona.profile.id, email: persona.profile.email },
      },
      profile: persona.profile,
      isAuthenticated: true,
      role: persona.profile.role,
    },
    version: 0,
  }))

  localStorage.setItem('buildconnect-cart', JSON.stringify({
    state: {
      items: persona.cart.items,
      projectTitle: persona.cart.projectTitle ?? '',
      notes: persona.cart.notes ?? '',
      photos: [],
      idDocument: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    },
    version: 0,
  }))

  localStorage.setItem('buildconnect-projects', JSON.stringify({
    state: {
      sentProjects: persona.projects.sentProjects,
      assignedRepByLead: persona.projects.assignedRepByLead,
      leadStatusOverrides: persona.projects.leadStatusOverrides,
      cancellationRequestsByLead: persona.projects.cancellationRequestsByLead,
    },
    version: 0,
  }))

  localStorage.setItem('buildconnect-qa-persona-active', persona.id)
}

// Wipe QA state + clear all store keys. Used by the "Exit QA" option in the
// switcher to restore a clean unauthed browser session.
export function clearQAPersona() {
  localStorage.removeItem('buildconnect-auth')
  localStorage.removeItem('buildconnect-cart')
  localStorage.removeItem('buildconnect-projects')
  localStorage.removeItem('buildconnect-qa-persona-active')
  localStorage.removeItem('buildconnect-pending-item')
  localStorage.removeItem('buildconnect-selected-contractor')
  localStorage.removeItem('buildconnect-selected-booking')
  localStorage.removeItem('buildconnect-homeowner-info')
  localStorage.removeItem('buildconnect-id-document')
}

export function activeQAPersonaId(): string | null {
  return localStorage.getItem('buildconnect-qa-persona-active')
}
