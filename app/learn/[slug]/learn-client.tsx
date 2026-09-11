'use client'
import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ReviewSession, type ReviewItem } from '@/components/review-session'
import { Mascot } from '@/components/ui/mascot'
import { buildQuestion, sample } from '@/lib/learning/question'
import { getWordById, listWordsByBook, listAllWords, listDefinitions } from '@/lib/content/static'
import { loadProgress, buildQueue } from '@/lib/progress/store'
import { NEW_LIMIT, DUE_LIMIT } from '@/lib/progress/config'

/**
 * 佇列必須在瀏覽器端組——進度存在 localStorage，SSR/build 時讀不到。
 * 用 lazy state initializer：第一次 render（client 上）就算好，
 * 不需要在 effect 裡 setState。SSR 時回傳 null 先渲染 loading。
 */
export function LearnClient({ slug, bookName }: { slug: string; bookName: string }) {
  const mixed = slug === 'all'
  const build = useCallback((): ReviewItem[] | null => {
    // 預渲染階段沒有 localStorage，先不組佇列。
    if (typeof window === 'undefined') return null

    const words = mixed ? listAllWords() : listWordsByBook(slug)
    const queue = buildQueue(loadProgress(), words.map((w) => w.id), new Date(), {
      newLimit: NEW_LIMIT,
      dueLimit: DUE_LIMIT,
    })

    const needsMc = queue.some((q) => q.questionType === 'mc')
    const allDefs = needsMc ? listDefinitions(mixed ? undefined : slug) : []

    const next: ReviewItem[] = []
    for (const q of queue) {
      const word = getWordById(q.wordId)
      if (!word) continue
      const distractors = q.questionType === 'mc'
        ? sample(allDefs.filter((d) => d !== word.definitionZh), 3)
        : []
      next.push({
        question: buildQuestion(word, q.questionType, distractors),
        isSpotCheck: false,
      })
    }
    return next
  }, [slug, mixed])

  const [items, setItems] = useState<ReviewItem[] | null>(build)
  const rebuild = useCallback(() => setItems(build()), [build])

  if (items === null) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-12">
        <p className="text-sm text-neutral-600">載入中…</p>
      </main>
    )
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Mascot mood="cheer" size={120} className="mx-auto" />
        <h1 className="text-2xl font-extrabold text-neutral-900">{bookName}</h1>
        <p className="mt-4 text-neutral-600">今天沒有待複習的單字了 🎉</p>
        <Link href={mixed ? '/books' : `/books/${slug}`} className="mt-6 inline-block text-sm font-semibold text-primary-600 hover:underline">← 回單字書</Link>
      </main>
    )
  }

  return <ReviewSession bookName={bookName} bookSlug={slug} items={items} onRestart={rebuild} />
}
