import { shouldCache } from './sw-strategy.js'

const CACHE = 'vocab-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !shouldCache(url.pathname)) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const res = await fetch(event.request)
      cache.put(event.request, res.clone())
      return res
    })
  )
})
