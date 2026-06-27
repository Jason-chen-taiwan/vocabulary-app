import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { buildSession } from '@/lib/learning/session'
import { ReviewSession, type ReviewCard } from '@/components/review-session'

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const content = new ContentRepository()
  const book = await content.getWordBookBySlug(slug)
  if (!book) notFound()

  const items = await buildSession(
    { userId: user.id, wordBookId: book.id, now: new Date(), newLimit: 20, dueLimit: 100 },
    { learning: new LearningRepository() },
  )

  const cards: ReviewCard[] = []
  for (const item of items) {
    const word = await content.getWordWithExamples(item.wordId)
    if (word) cards.push({ mode: item.mode, isNew: item.isNew, word })
  }

  if (cards.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{book.name}</h1>
        <p className="mt-4 text-gray-400">今天沒有待複習的單字了 🎉</p>
        <Link href={`/books/${slug}`} className="mt-6 inline-block text-sm text-gray-400 hover:underline">← 回單字書</Link>
      </main>
    )
  }
  return <ReviewSession bookName={book.name} bookSlug={slug} cards={cards} />
}
