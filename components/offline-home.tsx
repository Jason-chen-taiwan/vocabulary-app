'use client'
import { useEffect, useRef, useState } from 'react'
import { openKV } from '@/lib/sync/idb'
import { localYmd, type KV } from '@/lib/sync/kv'
import { listPacks, removePack } from '@/lib/sync/pack-store'
import { enqueueAnswer } from '@/lib/sync/queue'
import { setMeta } from '@/lib/sync/meta'
import type { StoredPack } from '@/lib/sync/types'
import { checkAnswer } from '@/lib/learning/question'
import { ReviewSession, type SubmitAnswerFn, type FinishSessionFn } from '@/components/review-session'
import { Mascot } from '@/components/ui/mascot'
import { Card } from '@/components/ui/card'
import { StatPill } from '@/components/ui/stat-pill'

// 離線首頁：選一本已快取的今日單字包 → 本地離線複習。無 auth、無網路依賴，供 SW 當 navigation fallback 用。
// openKV() 只能在 useEffect 裡呼叫（碰 indexedDB 全域）：此頁 force-static，build 時會做一次 server render，
// 若在 render 期間（如 useMemo 初始化）就呼叫會在 Node 環境炸掉，讓靜態產出壞掉。
export function OfflineHome() {
  const kvRef = useRef<KV | null>(null)
  const [packs, setPacks] = useState<StoredPack[] | null>(null)
  const [active, setActive] = useState<StoredPack | null>(null)

  useEffect(() => {
    const kv = openKV()
    kvRef.current = kv
    void listPacks(kv, localYmd(new Date())).then(setPacks).catch(() => setPacks([]))
  }, [])

  if (active) {
    // 離線判分僅供 UI 即時回饋；權威判定在回線同步時由 server 重判，本地判分不上傳。
    const submit: SubmitAnswerFn = async (wordId, type, userAnswer) => {
      const kv = kvRef.current
      const q = active.items.find((i) => i.question.wordId === wordId)?.question
      const correct = q ? (type === 'mc' ? userAnswer === q.answer : checkAnswer(userAnswer, q.answer)) : false
      if (kv) await enqueueAnswer(kv, { wordId, questionType: type, userAnswer, answeredAt: new Date().toISOString() })
      return { ok: true, mastered: false, correct, reward: null }
    }
    const finish: FinishSessionFn = async () => {
      const kv = kvRef.current
      if (kv) {
        await setMeta(kv, 'pendingSessionFinishedAt', new Date().toISOString())
        await removePack(kv, active.slug) // 包已作答完，避免重複刷同一包
      }
      return { ok: true, reward: null }
    }
    return <ReviewSession bookName={active.name} bookSlug={active.slug} items={active.items} offlineMode submit={submit} finish={finish} />
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 text-center">
      <Mascot mood="hi" size={110} className="mx-auto" />
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">離線複習</h1>
      <p className="mt-1 text-sm text-neutral-600">目前沒有網路連線，可以先複習已下載的今日單字包。</p>
      {packs === null && <p className="mt-8 text-sm text-neutral-600">載入中…</p>}
      {packs !== null && packs.length === 0 && (
        <p className="mt-8 text-sm text-neutral-600">沒有可用的離線單字包——上次在線時尚未下載，回線後打開 app 會自動準備。</p>
      )}
      {packs !== null && packs.length > 0 && (
        <div className="mt-6 grid gap-3 text-left">
          {packs.map((p) => (
            <button key={p.slug} type="button" onClick={() => setActive(p)} className="w-full text-left">
              <Card className="p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(255,106,61,.18)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-extrabold text-neutral-900">{p.name}</div>
                  <StatPill icon="📝" value={`${p.items.length} 題`} />
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
