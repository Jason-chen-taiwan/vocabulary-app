'use client'
import { useEffect } from 'react'
import { openKV } from '@/lib/sync/idb'
import { localYmd } from '@/lib/sync/kv'
import { getMeta, setMeta } from '@/lib/sync/meta'
import { savePacks } from '@/lib/sync/pack-store'
import type { OfflinePack } from '@/lib/sync/types'

// 掛在 layout：在線時每日一次背景預抓今日複習包存 IndexedDB（離線複習資料源）。
export function OfflinePrefetch() {
  useEffect(() => {
    async function run() {
      if (!navigator.onLine || !('indexedDB' in window)) return
      const kv = openKV()
      const ymd = localYmd(new Date())
      if ((await getMeta(kv, 'lastPrefetchYmd')) === ymd) return
      try {
        const res = await fetch('/api/offline/pack')
        if (!res.ok) return // 未登入等情況：明天再說
        const data = (await res.json()) as { ok: boolean; packs: OfflinePack[] }
        if (!data.ok) return
        await savePacks(kv, data.packs, ymd)
        await setMeta(kv, 'lastPrefetchYmd', ymd)
      } catch { /* 靜默 */ }
    }
    void run()
  }, [])
  return null
}
