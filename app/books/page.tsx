import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository, NOTEBOOK_SLUG } from '@/lib/content/repository'
import { GamificationBar } from '@/components/gamification-bar'
import Link from 'next/link'
import { CardLink } from '@/components/ui/card'
import { StatPill } from '@/components/ui/stat-pill'

export const dynamic = 'force-dynamic'

export default async function BooksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const repo = new ContentRepository()
  const notebookBook = await repo.ensureNotebookBook()
  const [books, notebookWords] = await Promise.all([
    repo.listWordBooks(),
    repo.listCollectedWordsByBook(notebookBook.id, user.id),
  ])
  const notebookCount = notebookWords.length
  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-extrabold text-neutral-900">單字書</h1>
        {books.length > 0 && (
          <Link
            href="/learn/all"
            className="mb-4 flex items-center justify-between gap-3 rounded-control border-2 border-primary-200 bg-primary-50 p-5 font-extrabold text-primary-700 transition hover:bg-primary-100"
          >
            <span>🔀 全部混合練習</span>
            <span className="text-sm font-semibold">跨所有單字書複習 →</span>
          </Link>
        )}
        <CardLink href={`/books/${NOTEBOOK_SLUG}`} className="mb-3 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-neutral-900">我的生字本 📓</h2>
              <p className="mt-1 text-sm text-neutral-600">閱讀時收藏的單字（{notebookCount} 字）</p>
            </div>
          </div>
        </CardLink>
        {books.length === 0 ? (
          <p className="text-neutral-600">目前還沒有單字書。</p>
        ) : (
          <ul className="space-y-3">
            {books.map((b) => (
              <li key={b.id}>
                <CardLink href={`/books/${b.slug}`} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-extrabold text-neutral-900">{b.name}</div>
                    <StatPill icon="📚" value={`${b.wordCount} 字`} />
                  </div>
                  {b.description && <div className="mt-1 text-sm text-neutral-600">{b.description}</div>}
                  {b.level && <div className="mt-1 text-xs font-semibold text-primary-600">{b.level}</div>}
                </CardLink>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
