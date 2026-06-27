export function shouldCache(url) {
  if (url.startsWith('/api/')) return false
  return url.startsWith('/_next/static/') || url.startsWith('/icons/')
}
