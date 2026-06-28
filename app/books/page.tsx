import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { CardLink } from '@/components/ui/card'
import { StatPill } from '@/components/ui/stat-pill'

export default async function BooksPage() {
  if (!(await getCurrentUser())) redirect('/login')
  const books = await new ContentRepository().listWordBooks()
  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-extrabold text-neutral-900">單字書</h1>
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
