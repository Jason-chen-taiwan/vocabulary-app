'use client'
import { useSyncExternalStore } from 'react'
import { loadProgress, type Progress } from './store'

// 進度只存在瀏覽器。用 useSyncExternalStore 讓 SSR/預渲染拿到 null、
// client 掛載後才拿到真正的資料——比在 effect 裡 setState 乾淨，也不會 hydration 不一致。
let cache: Progress | null = null
let cacheRaw: string | null = null

function subscribe(onChange: () => void): () => void {
  // 另一個分頁改了進度時同步更新。
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

/** 同一份 JSON 要回傳同一個物件，否則 useSyncExternalStore 會判定無限變動。 */
function getSnapshot(): Progress {
  const raw = localStorage.getItem('vocab.progress.v1')
  if (raw !== cacheRaw || cache === null) {
    cacheRaw = raw
    cache = loadProgress()
  }
  return cache
}

function getServerSnapshot(): Progress | null {
  return null
}

export function useProgress(): Progress | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
