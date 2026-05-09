import { useAuthStore } from '@/stores/auth-store'

// PR #197 — homeowner ID upload entrypoint. Reads a File (image or PDF) into
// a base64 dataURL and writes it to profile.id_document_url via the existing
// updateProfile path (handles both real-auth Supabase upsert and QA persona
// in-memory-only). Tranche-3 will swap the base64 dataURL for a Supabase
// Storage upload + signed URL — same callsite + same return shape.
//
// Returns the dataURL on success so callers can render the thumb immediately
// without waiting on the next profile fetch.
export async function uploadIdDocument(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  await useAuthStore.getState().updateProfile({ id_document_url: dataUrl })
  return dataUrl
}

export async function clearIdDocument(): Promise<void> {
  await useAuthStore.getState().updateProfile({ id_document_url: undefined })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('FileReader returned non-string'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}
