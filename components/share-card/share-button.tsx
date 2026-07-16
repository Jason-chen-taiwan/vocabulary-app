'use client'

import { useState } from 'react'
import { buildShareCardContent, type ShareCardStats } from './card-data'
import { drawShareCard } from './draw-card'

// 產圖 + 分享：手機走 Web Share API（LINE/IG），不支援時 fallback 下載 PNG。
// 全程前端完成，不打任何 API。
export function ShareButton({ stats }: { stats: ShareCardStats }) {
  const [busy, setBusy] = useState(false)

  async function handleShare() {
    setBusy(true)
    try {
      await document.fonts.ready // 等網頁字型就緒，避免 canvas 畫出 fallback 字型
      const mascot = await loadImage('/icon-source.svg').catch(() => null)
      const canvas = document.createElement('canvas')
      drawShareCard(canvas, buildShareCardContent(stats), mascot)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return
      const file = new File([blob], 'vocabapp-share.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'VocabApp', text: '我的 VocabApp 學習成果 🦊 0stack.org' })
          return
        } catch (err) {
          if ((err as DOMException).name === 'AbortError') return // 使用者取消，不 fallback
        }
      }
      downloadBlob(blob, 'vocabapp-share.png')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600 disabled:opacity-60"
    >
      {busy ? '產生中…' : '分享我的成績 📤'}
    </button>
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
