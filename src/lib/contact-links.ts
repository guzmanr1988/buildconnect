export function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/\D/g, '')}`
}
