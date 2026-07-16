import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { buildSession } from '@/lib/learning/session'
import { buildQuestion, sample } from '@/lib/learning/question'
import { ReviewSession, type ReviewItem } from '@/components/review-session'
import { GamificationBar } from '@/components/gamification-bar'
import { Mascot } from '@/components/ui/mascot'
import { ShopRepository } from '@/lib/shop/repository'

export const dynamic = 'force-dynamic'

const NEW_LIMIT = 20
const DUE_LIMIT = 100
const SPOT_CHECK_LIMIT = 3

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const content = new ContentRepository()
  // slug 'all' → mixed practice across every book; no single book context.
  const mixed = slug === 'all'
  const book = mixed ? null : await content.getWordBookBySlug(slug)
  if (!mixed && !book) notFound()
  const bookName = mixed ? '全部混合' : book!.name

  const items = await buildSession(
    { userId: user.id, wordBookId: book?.id, now: new Date(), newLimit: NEW_LIMIT, dueLimit: DUE_LIMIT, spotCheckLimit: SPOT_CHECK_LIMIT },
    { learning: new LearningRepository() },
  )

  const words = await content.listWordsWithExamplesByIds(items.map((i) => i.wordId))
  const byId = new Map(words.map((w) => [w.id, w]))
  const needsMc = items.some((i) => i.questionType === 'mc')
  const allDefs = needsMc
    ? (mixed ? await content.listAllDefinitions() : (await content.listWordsByBook(book!.id)).map((w) => w.definitionZh))
    : []

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
          <Mascot mood="cheer" size={120} className="mx-auto" />
          <h1 className="text-2xl font-extrabold text-neutral-900">{bookName}</h1>
          <p className="mt-4 text-neutral-600">今天沒有待複習的單字了 🎉</p>
          <Link href={mixed ? '/books' : `/books/${slug}`} className="mt-6 inline-block text-sm font-semibold text-primary-600 hover:underline">← 回單字書</Link>
        </main>
      </>
    )
  }
  const equipped = await new ShopRepository().getEquipped(user.id)
  return <ReviewSession bookName={bookName} bookSlug={slug} items={reviewItems} equipped={equipped} />
}
