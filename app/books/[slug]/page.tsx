import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'

export const dynamic = 'force-dynamic'

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const repo = new ContentRepository()
  // user + book are independent → fetch in parallel
  const [user, book] = await Promise.all([getCurrentUser(), repo.getWordBookBySlug(slug)])
  if (!user) redirect('/login')
  if (!book) notFound()
  // words + mastered ids are independent → fetch in parallel
  const [words, masteredIds] = await Promise.all([
    repo.listWordsByBook(book.id),
    new LearningRepository().listMasteredWordIds(user.id, book.id),
  ])
  const masteredSet = new Set(masteredIds)
  const masteredHere = words.filter((w) => masteredSet.has(w.id)).length

  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link href="/books" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 所有單字書</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">{book.name}</h1>

        <Card className="my-4 p-5">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-neutral-600">
            <span>已精熟 {masteredHere} / {words.length}</span>
          </div>
          <ProgressBar value={masteredHere} max={words.length} />
        </Card>

        <Link
          href={`/learn/${slug}`}
          className="mb-5 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          開始複習
        </Link>

        <ul className="space-y-2">
          {words.map((w) => (
            <li key={w.id}>
              <Link
                href={`/words/${w.id}`}
                className="flex items-center justify-between gap-3 rounded-control bg-surface px-4 py-3 shadow-[0_6px_16px_rgba(255,106,61,.08)] transition hover:-translate-y-0.5"
              >
                <span className="flex items-center gap-2 font-bold text-neutral-900">
                  {masteredSet.has(w.id) && <span title="已精熟" className="text-success">✓</span>}
                  {w.headword}
                </span>
                <span className="ml-4 truncate text-sm text-neutral-600">{w.definitionZh}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
