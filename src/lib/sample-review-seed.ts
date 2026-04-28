import { useProjectsStore, type SentProject } from '@/stores/projects-store'
import { useVendorHomeownerDocsStore } from '@/stores/vendor-homeowner-documents-store'
import { PRICE_LINE_ITEM_PRESETS } from '@/lib/price-line-item-presets'

// Ship #315 — one-time seed for /admin/reviews queue per Rodolfo
// "im not seen a contract to review sample". Writes a sample sold-
// active sentProject + matching contract document so the queue is
// populated for first-time admin testing. Idempotent via localStorage
// flag — re-runs do not stack duplicates.
//
// Per banked mock-data-as-test-harness: sample data lives alongside
// real data; admin Approve/Flag actions persist via existing store
// actions just like real entries. Tranche-2 will phase out the seed
// when real Sold Active deals start coming through with contracts.

const SEED_FLAG_KEY = 'buildconnect-reviews-sample-seeded'
const SAMPLE_PROJECT_ID = 'sample-review-1'
const SAMPLE_HOMEOWNER_EMAIL = 'maria@email.com'
const SAMPLE_VENDOR_ID = 'v-1'

// Tiny placeholder PDF (valid minimal PDF) — readable as a doc when
// opened in new tab; admin sees a real contract-shaped artifact rather
// than a broken file. Kept deliberately small to minimize localStorage
// footprint per the existing TODO in vendor-homeowner-documents-store.
const SAMPLE_CONTRACT_PDF_DATAURL = 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nDPQM1Qo5ypUMABCBSDFAUAVNS5LCWcvLkMzc0sLCxMzczsLBwsLczMjMxMTRzMzAxMjC0MzcwsLAwsTI3MzCwsLcwsTU3MAJ24LWAplbmRzdHJlYW0KZW5kb2JqCjMgMCBvYmoKMTA0CmVuZG9iago0IDAgb2JqCjw8L1R5cGUvUGFnZS9QYXJlbnQgNSAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDYgMCBSPj4+Pi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgMiAwIFI+PgplbmRvYmoKNSAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKNiAwIG9iago8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2EvRW5jb2RpbmcvV2luQW5zaUVuY29kaW5nPj4KZW5kb2JqCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDUgMCBSPj4KZW5kb2JqCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDQ4OCA2NTUzNSBmIAowMDAwMDAwMDM3IDAwMDAwIG4gCjAwMDAwMDAyMTUgMDAwMDAgbiAKMDAwMDAwMDIzMyAwMDAwMCBuIAowMDAwMDAwMzMzIDAwMDAwIG4gCjAwMDAwMDAzODEgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgo1MzAKJSVFT0YK'

export function maybeSeedSampleReview(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(SEED_FLAG_KEY)) return
  } catch {
    return
  }

  const projectsStore = useProjectsStore.getState()
  const docsStore = useVendorHomeownerDocsStore.getState()

  // Skip if a sample with this id already lives in store (defense
  // against partial-seed states where flag was cleared but data
  // persisted). Idempotent across edge cases.
  if (projectsStore.sentProjects.some((p) => p.id === SAMPLE_PROJECT_ID)) {
    try { localStorage.setItem(SEED_FLAG_KEY, '1') } catch {}
    return
  }

  const now = new Date()
  const soldAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago

  const sampleProject: SentProject = {
    id: SAMPLE_PROJECT_ID,
    item: {
      id: 'sample-roofing-1',
      serviceId: 'roofing',
      serviceName: 'Full Roof Replacement - Architectural Shingle',
      selections: { roofing_type: ['architectural'], permit: ['permit'] },
      addedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    status: 'sold',
    contractor: {
      vendor_id: SAMPLE_VENDOR_ID,
      name: 'Apex Roofing & Solar',
      company: 'Apex Roofing & Solar',
      rating: 4.9,
    },
    booking: { date: '2026-04-10', time: '10:00 AM' },
    homeowner: {
      name: 'Maria Rodriguez',
      email: SAMPLE_HOMEOWNER_EMAIL,
      phone: '(305) 555-0101',
      address: '1234 Coral Way, Miami, FL 33145',
    },
    homeowner_id: 'ho-1',
    sentAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    soldAt,
    saleAmount: 18500,
    confirmedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    // Ship #337 — preset Pricing Breakdown snapshot per #336.
    // Ship #343 Phase A — appended EXTRA $ auto-adjustment line so
    // sample fixture matches markSold injection semantics for a sold
    // project where saleAmount (18500) > sum(roofing-preset-originals)
    // (14950) → delta 3550. Demo-visibility per banked
    // mock-data-as-test-harness.
    priceLineItems: [
      ...PRICE_LINE_ITEM_PRESETS.roofing.map((p) => ({ ...p })),
      {
        id: 'auto-extra-sample-review',
        label: 'EXTRA $',
        amount: 3550,
        originalAmount: 0,
        source: 'auto_sold_adjustment' as const,
      },
    ],
  }

  useProjectsStore.setState((state) => ({
    sentProjects: [...state.sentProjects, sampleProject],
  }))

  docsStore.addDoc({
    vendor_id: SAMPLE_VENDOR_ID,
    homeowner_email: SAMPLE_HOMEOWNER_EMAIL,
    category: 'contract',
    filename: 'Sample-Contract-Apex-Roofing.pdf',
    dataUrl: SAMPLE_CONTRACT_PDF_DATAURL,
  })

  try { localStorage.setItem(SEED_FLAG_KEY, '1') } catch {}
}
