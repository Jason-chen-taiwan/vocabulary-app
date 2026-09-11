'use client'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { shortDef } from '@/lib/learning/question'
import { useProgress } from '@/lib/progress/use-progress'
import type { WordWithExamples } from '@/lib/content/types'

export function BookClient({ words }: { words: WordWithExamples[] }) {
  // 精熟狀態存在 localStorage；SSR 時 useProgress 回傳 null，畫面先當作都沒精熟。
  const p = useProgress()
  const mastered = new Set(p?.mastered ?? [])

  const count = words.filter((w) => mastered.has(w.id)).length

  return (
    <>
      <Card className="my-4 p-5">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-neutral-600">
          <span>已精熟 {count} / {words.length}</span>
        </div>
        <ProgressBar value={count} max={words.length} />
      </Card>

      <ul className="divide-y divide-neutral-200 rounded-card border border-neutral-200 bg-surface">
        {words.map((w) => (
          <li key={w.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <span className="font-bold text-neutral-900">{w.headword}</span>
              {w.partOfSpeech && <span className="ml-2 text-xs text-neutral-500">{w.partOfSpeech}</span>}
              <p className="truncate text-sm text-neutral-600">{shortDef(w.definitionZh)}</p>
            </div>
            {mastered.has(w.id) && <span className="shrink-0 text-xs font-semibold text-mastery">✓ 精熟</span>}
          </li>
        ))}
      </ul>
    </>
  )
}
