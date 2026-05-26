export function whatsappLink(number: string, message: string): string {
  // Strip non-digits, ensure +91 prefix for Indian numbers without country code
  const digits = number.replace(/\D/g, '')
  const normalised = digits.startsWith('91') ? digits : digits.length === 10 ? `91${digits}` : digits
  const encoded = encodeURIComponent(message.trim())
  return `https://wa.me/${normalised}?text=${encoded}`
}