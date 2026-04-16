/**
 * Geocode an address string using Nominatim (OpenStreetMap).
 * Free, no API key required. Respects 1 req/s ToS for bulk use.
 * Returns { lat, lon } or null on failure.
 */
export async function geocodeAddress(address) {
  if (!address?.trim()) return null
  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: address.trim(),
      format: 'json',
      limit: '1',
      addressdetails: '0',
    })}`
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'it,en',
        'User-Agent': 'FacHub CRM/1.0 (sales management app)',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}
