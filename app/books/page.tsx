import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { GamificationBar } from '@/components/gamification-bar'

export default async function BooksPage() {
  if (!(await getCurrentUser())) redirect('/login')
  const books = await new ContentRepository().listWordBooks()
  return (
    <>
      <GamificationBar />
      <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">單字書</h1>
      {books.length === 0 ? (
        <p className="text-gray-500">目前還沒有單字書。</p>
      ) : (
        <ul className="space-y-3">
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/books/${b.slug}`} className="block rounded-lg border border-gray-700 p-4 hover:bg-gray-900">
                <div className="font-semibold">{b.name}</div>
                {b.description && <div className="text-sm text-gray-400">{b.description}</div>}
                <div className="mt-1 text-xs text-gray-500">{b.wordCount} 個單字{b.level ? ` · ${b.level}` : ''}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
    </>
  )
}
