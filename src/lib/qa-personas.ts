import type { Profile, VendorRep } from '@/types'
import { useCartStore, type CartItem } from '@/stores/cart-store'
import {
  useProjectsStore,
  type SentProject,
  type ContractorInfo,
  type BookingInfo,
  type HomeownerInfo,
  type CancellationRequest,
} from '@/stores/projects-store'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'

// QA personas for 2-week launch QA sweep. Each persona has a fully-seeded
// starting state across auth + cart + projects stores so apollo (or any QA
// session) can probe a lifecycle-stage in isolation without clicking through
// the full creation flow. Gated by VITE_DEMO_MODE via QAPersonaSwitcher.
//
// Personas are labeled by lifecycle-stage, not by vendor interaction state —
// vendor-side behavior is tested separately via existing demo vendor accounts
// (apex-demo / shield-demo / paradise-demo).

type LeadStatusOverride = 'pending' | 'confirmed' | 'rejected' | 'rescheduled' | 'completed' | 'cancelled'

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
  vendor_id: 'v-3',
  name: 'Demo Vendor',
  company: 'Paradise Pools FL',
  rating: 4.8,
}

// Per-service contractors for qa-4 Miguel sentProjects (ship #163 +
// ship #165 vendor_id FK per task_1776731114470_226). Each contractor
// now carries vendor_id so the contractor-scope filter + admin
// aggregations can bridge by FK instead of fragile company-name match.
const roofContractor: ContractorInfo = {
  vendor_id: 'v-1',
  name: 'Carlos Mendez',
  company: 'Apex Roofing & Solar',
  rating: 4.8,
}
const bathContractor: ContractorInfo = {
  vendor_id: 'v-2',
  name: 'Priya Sharma',
  company: 'Shield Impact Windows',
  rating: 4.6,
}
const poolContractor: ContractorInfo = {
  vendor_id: 'v-3',
  name: 'Demo Vendor',
  company: 'Paradise Pools FL',
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
    initials: 'RJ',
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
        contractor: roofContractor,
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
        contractor: bathContractor,
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
        contractor: poolContractor,
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
  // Ship #167 (task_1776717692862_738): AuthBootstrap now reads the
  // qaPersonaActive flag inside its async callbacks (not at mount), so
  // persona swaps can ride SPA nav without the Supabase-SIGNED_IN clobber
  // that reverted #103. Source-of-truth remains localStorage (so a hard
  // reload hydrates the same persona state), but we also setState() each
  // persisted store so SPA-nav consumers see fresh data immediately —
  // no window.location.href reload, ~42ms target vs ~1-2s before.
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

  // Ship #167: in-memory setState for SPA-nav freshness. Order matters —
  // flag-active write above precedes store resets below so AuthBootstrap's
  // isQaPersonaActive() check sees `true` if any callback fires mid-apply.
  useAuthStore.setState({
    session: {
      access_token: `qa-fake-token-${persona.id}`,
      user: { id: persona.profile.id, email: persona.profile.email },
    },
    profile: persona.profile,
    isAuthenticated: true,
    role: persona.profile.role,
  })
  useCartStore.setState({
    items: persona.cart.items,
    projectTitle: persona.cart.projectTitle ?? '',
    notes: persona.cart.notes ?? '',
    photos: [],
    idDocument: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  })
  useProjectsStore.setState({
    sentProjects: persona.projects.sentProjects,
    assignedRepByLead: persona.projects.assignedRepByLead,
    leadStatusOverrides: persona.projects.leadStatusOverrides,
    cancellationRequestsByLead: persona.projects.cancellationRequestsByLead,
    // Ship #166 maps — personas don't seed timestamps, reset to empty.
    leadConfirmedAtByLead: {},
    repAssignedAtByLead: {},
  })
}

// Wipe QA state + clear all store keys. Used by the "Exit QA" option in the
// switcher to restore a clean unauthed browser session, AND by the login
// flow (#210) to guarantee QA state is gone before real-auth SIGNED_IN
// fires so AuthBootstrap's isQaPersonaActive() bypass doesn't swallow the
// hydration event.
//
// Ship #210: now async. supabase.auth.signOut() is awaited so SIGNED_OUT
// drains via AuthBootstrap's listener BEFORE callers proceed — prevents
// the fire-and-forget race where a late SIGNED_OUT could clobber a
// subsequent SIGNED_IN from a new real-auth login. Existing fire-and-
// forget callers ignoring the promise still work (non-breaking signature
// change).
export async function clearQAPersona(): Promise<void> {
  localStorage.removeItem('buildconnect-auth')
  localStorage.removeItem('buildconnect-cart')
  localStorage.removeItem('buildconnect-projects')
  localStorage.removeItem('buildconnect-qa-persona-active')
  localStorage.removeItem('buildconnect-pending-item')
  localStorage.removeItem('buildconnect-selected-contractor')
  localStorage.removeItem('buildconnect-selected-booking')
  localStorage.removeItem('buildconnect-homeowner-info')
  localStorage.removeItem('buildconnect-id-document')

  // Ship #167: in-memory reset so SPA-nav Exit shows a clean unauthed
  // state without requiring window.location.href reload.
  useAuthStore.setState({
    session: null,
    profile: null,
    isAuthenticated: false,
    role: null,
  })
  useCartStore.setState({
    items: [],
    projectTitle: '',
    notes: '',
    photos: [],
    idDocument: null,
  })
  useProjectsStore.setState({
    sentProjects: [],
    assignedRepByLead: {},
    leadStatusOverrides: {},
    cancellationRequestsByLead: {},
    leadConfirmedAtByLead: {},
    repAssignedAtByLead: {},
  })

  // Ship #168 (task_1776716736651_418): fire-and-forget Supabase signOut
  // on Exit. #167 already eliminated the ~900ms full-reload by moving
  // Exit to SPA nav, which lands us well under the <300ms target. This
  // signOut closes the remaining correctness gap: without it, any
  // lingering `sb-<project>-auth-token` from a real pre-QA login stays
  // live. Once AuthBootstrap's listener sees the next TOKEN_REFRESHED
  // (or a SIGNED_IN race post-Exit), it would hydrate that session and
  // /login's useEffect would redirect the user back to /home — exactly
  // the opposite of what Exit implies. Non-blocking: nav to /login
  // continues immediately; the SIGNED_OUT event fires async and triggers
  // AuthBootstrap's clearLocalSession (idempotent after our setState
  // reset above, not a loop — see feedback_auth_listener_reentrancy).
  try {
    await supabase.auth.signOut()
  } catch (err) {
    console.error('[qa-personas] supabase signOut on Exit failed:', err)
  }
}

export function activeQAPersonaId(): string | null {
  return localStorage.getItem('buildconnect-qa-persona-active')
}
