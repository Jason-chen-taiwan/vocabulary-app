'use client'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { useProgress } from '@/lib/progress/use-progress'
import { listNotebook } from '@/lib/progress/reading'

/** 生字本存在本機，所以獨立成 client component；沒有收集過就不佔版面。 */
export function NotebookCard() {
  const p = useProgress()
  const words = p ? listNotebook(p) : []
  if (words.length === 0) return null

  return (
    <>
      <h2 className="mt-8 mb-3 text-sm font-extrabold uppercase tracking-wide text-neutral-600">我的生字本 📓</h2>
      <Link href="/notebook">
        <Card className="p-5 transition hover:border-primary-300">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-extrabold text-neutral-900">閱讀時收集的字</span>
            <span className="shrink-0 text-xs font-semibold text-neutral-600">{words.length} 字</span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            最近收集：{words.slice(0, 3).map((w) => w.lemma).join('、')}
          </p>
        </Card>
      </Link>
    </>
  )
}
