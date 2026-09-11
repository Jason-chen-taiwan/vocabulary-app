'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heatmap } from '@/components/stats/heatmap'
import { DueBars } from '@/components/stats/due-bars'
import { dueForecast, heatmapCells } from '@/lib/stats/aggregate'
import {
  saveProgress, exportProgress, importProgress, emptyProgress, type Progress,
} from '@/lib/progress/store'
import { useProgress } from '@/lib/progress/use-progress'
import { TIMEZONE } from '@/lib/progress/config'

export function StatsClient() {
  const stored = useProgress()
  // 匯入／清除後要立刻反映在畫面上，用本地 override 蓋過已儲存的值。
  const [override, setOverride] = useState<Progress | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const p = override ?? stored

  if (!p) {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-center text-sm text-neutral-600">載入中…</main>
  }

  const totalReviews = Object.values(p.days).reduce((n, d) => n + d.reviews, 0)
  const totalCorrect = Object.values(p.days).reduce((n, d) => n + d.correct, 0)
  const accuracy = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0
  const reviewsByDay = new Map(Object.entries(p.days).map(([k, v]) => [k, v.reviews]))
  const forecast = dueForecast(
    Object.values(p.cards).map((c) => ({ due: new Date(c.due) })),
    new Date(), TIMEZONE,
  )

  // 備份：localStorage 是唯一一份進度，清快取或換裝置就會消失，所以提供匯出/匯入。
  function download() {
    const blob = new Blob([exportProgress(p!)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vocab-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const next = importProgress(await file.text())
    if (!next) { setMsg('匯入失敗：檔案格式不正確'); return }
    saveProgress(next)
    setOverride(next)
    setMsg('匯入成功')
    if (fileRef.current) fileRef.current.value = ''
  }

  function reset() {
    // ponytail: window.confirm 就夠了，不為一個按鈕做 modal 元件
    if (!window.confirm('確定要清除所有學習進度嗎？此動作無法復原。')) return
    const fresh = emptyProgress()
    saveProgress(fresh)
    setOverride(fresh)
    setMsg('已清除進度')
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">學習數據</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="總複習次數" value={totalReviews} />
        <Stat label="正確率" value={`${accuracy}%`} />
        <Stat label="已精熟" value={p.mastered.length} />
        <Stat label="連續天數" value={p.streak} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-extrabold text-neutral-600">學習熱力圖</h2>
      <Card className="overflow-x-auto p-4"><Heatmap cells={heatmapCells(reviewsByDay, new Date(), TIMEZONE)} /></Card>

      <h2 className="mt-8 mb-3 text-sm font-extrabold text-neutral-600">未來七天待複習</h2>
      <Card className="p-4"><DueBars buckets={forecast} /></Card>

      <h2 className="mt-8 mb-3 text-sm font-extrabold text-neutral-600">備份與還原</h2>
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-neutral-600">
          進度只存在這台裝置的瀏覽器。清除瀏覽器資料或換裝置會消失，請定期匯出備份。
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={download}>匯出備份</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>匯入備份</Button>
          <input ref={fileRef} type="file" accept="application/json" onChange={onFile} className="hidden" />
          <button onClick={reset} className="text-sm font-semibold text-error hover:underline">清除進度</button>
        </div>
        {msg && <p className="text-sm font-semibold text-neutral-700">{msg}</p>}
      </Card>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex flex-col items-center gap-1 p-4">
      <div className="text-2xl font-extrabold text-primary-600">{value}</div>
      <div className="text-xs font-semibold text-neutral-600">{label}</div>
    </Card>
  )
}
