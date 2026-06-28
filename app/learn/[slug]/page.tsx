import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { buildSession } from '@/lib/learning/session'
import { buildQuestion, sample } from '@/lib/learning/question'
import { ReviewSession, type ReviewItem } from '@/components/review-session'
import { GamificationBar } from '@/components/gamification-bar'

const NEW_LIMIT = 20
const DUE_LIMIT = 100
const SPOT_CHECK_LIMIT = 3

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const content = new ContentRepository()
  const book = await content.getWordBookBySlug(slug)
  if (!book) notFound()

  const items = await buildSession(
    { userId: user.id, wordBookId: book.id, now: new Date(), newLimit: NEW_LIMIT, dueLimit: DUE_LIMIT, spotCheckLimit: SPOT_CHECK_LIMIT },
    { learning: new LearningRepository() },
  )

  const words = await content.listWordsWithExamplesByIds(items.map((i) => i.wordId))
  const byId = new Map(words.map((w) => [w.id, w]))
  const needsMc = items.some((i) => i.questionType === 'mc')
  const allDefs = needsMc ? (await content.listWordsByBook(book.id)).map((w) => w.definitionZh) : []

  const reviewItems: ReviewItem[] = []
  for (const item of items) {
    const word = byId.get(item.wordId)
    if (!word) continue
    const distractors = item.questionType === 'mc'
      ? sample([...new Set(allDefs)].filter((d) => d !== word.definitionZh), 3)
      : []
    reviewItems.push({ question: buildQuestion(word, item.questionType, distractors), isSpotCheck: item.isSpotCheck })
  }

  if (reviewItems.length === 0) {
    return (
      <>
        <GamificationBar />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-extrabold text-neutral-900">{book.name}</h1>
          <p className="mt-4 text-neutral-600">今天沒有待複習的單字了 🎉</p>
          <Link href={`/books/${slug}`} className="mt-6 inline-block text-sm font-semibold text-primary-600 hover:underline">← 回單字書</Link>
        </main>
      </>
    )
  }
  return <ReviewSession bookName={book.name} bookSlug={slug} items={reviewItems} />
}
