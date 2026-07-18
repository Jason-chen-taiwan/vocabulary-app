import { shouldCache } from './sw-strategy.js'

const CACHE = 'vocab-v2'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (e) => {
  // /offline 是 client component，離線 hydrate 需要它的 _next/static chunks；
  // install 時一併快取，讓沒在線上訪問過 /offline 的裝置也能離線用
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const res = await fetch(OFFLINE_URL).catch(() => null)
      if (res && res.ok) {
        await cache.put(OFFLINE_URL, res.clone())
        const html = await res.text()
        const assetUrls = [...new Set(html.match(/\/_next\/static\/[^"'\\\s)>]+/g) || [])]
        await Promise.all(assetUrls.map((u) => cache.add(u).catch(() => {})))
      }
      self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // 離線導航 fallback：任何頁面導航失敗都給快取的 /offline 殼
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.open(CACHE).then((c) => c.match(OFFLINE_URL)).then((r) => r ?? Response.error())
      )
    )
    return
  }
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !shouldCache(url.pathname)) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const res = await fetch(event.request)
      await cache.put(event.request, res.clone())
      return res
    })
  )
})

self.addEventListener('push', (event) => {
  let data = { title: '該背單字了 🦊', body: '今天還沒達標，來 5 分鐘', url: '/learn' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (_e) {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/learn'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
