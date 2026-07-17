'use client'
import { useEffect, useRef, useState } from 'react'
import { openKV } from '@/lib/sync/idb'
import { syncNow } from '@/lib/sync/client'

// 掛在 layout：mount 時與 online 事件時嘗試同步離線佇列，成功顯示入帳 toast。
export function SyncOnReconnect() {
  const running = useRef(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      if (running.current || !navigator.onLine) return
      running.current = true
      try {
        const res = await syncNow(openKV())
        if (res && res.synced > 0) {
          setToast(`離線複習 ${res.synced} 題已入帳 +${res.xp} XP${res.coins > 0 ? ` +${res.coins} 🪙` : ''}`)
          setTimeout(() => setToast(null), 6000)
        }
      } catch { /* 靜默：下次再試 */ }
      running.current = false
    }
    void run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [])

  if (!toast) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      {toast}
    </div>
  )
}
