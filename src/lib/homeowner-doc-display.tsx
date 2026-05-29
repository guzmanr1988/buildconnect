import {
  FileText,
  ShieldCheck,
  ClipboardCheck,
  PenLine,
  Ruler,
  ScrollText,
  FileSignature,
  Calculator,
  Image as ImageIcon,
  FileQuestion,
} from 'lucide-react'
import type {
  HomeownerDoc,
  HomeownerDocType,
} from '@/stores/homeowner-documents-store'

export const DOC_TYPE_ORDER: HomeownerDocType[] = [
  'license',
  'permit',
  'sketch',
  'measurement',
  'agreement',
  'contract',
  'quote',
  'photo',
  'other',
]

export const DOC_TYPE_LABEL: Record<HomeownerDocType, string> = {
  license: 'License',
  permit: 'Permit',
  sketch: 'Sketch',
  measurement: 'Measurement',
  agreement: 'Agreement',
  contract: 'Contract',
  quote: 'Quote',
  photo: 'Photo',
  other: 'Other',
}

export const DOC_TYPE_ICON: Record<HomeownerDocType, typeof FileText> = {
  license: ShieldCheck,
  permit: ClipboardCheck,
  sketch: PenLine,
  measurement: Ruler,
  agreement: ScrollText,
  contract: FileSignature,
  quote: Calculator,
  photo: ImageIcon,
  other: FileQuestion,
}

export function formatDocDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function friendlyDocTitle(doc: HomeownerDoc): string {
  const stamp = formatDocDate(doc.createdAt)
  if (doc.docType) {
    return `${DOC_TYPE_LABEL[doc.docType]} — ${stamp}`
  }
  return doc.filename
}

// Bidirectional attribution chip. Vendor side renders this same helper
// so the labels stay byte-identical with the homeowner page; the chip
// reads from doc.uploadedBy (RLS-gated source-of-truth column).
export function uploaderChip(doc: HomeownerDoc): string | null {
  if (doc.uploadedBy === 'vendor') return 'Uploaded by contractor'
  if (doc.uploadedBy === 'homeowner') return 'Uploaded by you'
  return null
}

// Vendor-perspective variant: from the vendor's POV, "you" = vendor and
// "contractor" doesn't make sense as a label for the homeowner. Used by
// the vendor-side panel only.
export function uploaderChipForVendor(doc: HomeownerDoc): string | null {
  if (doc.uploadedBy === 'vendor') return 'Uploaded by you'
  if (doc.uploadedBy === 'homeowner') return 'Uploaded by homeowner'
  return null
}
