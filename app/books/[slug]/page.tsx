import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await getCurrentUser())) redirect('/login')
  const { slug } = await params
  const repo = new ContentRepository()
  const book = await repo.getWordBookBySlug(slug)
  if (!book) notFound()
  const words = await repo.listWordsByBook(book.id)
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/books" className="text-sm text-gray-400 hover:underline">← 所有單字書</Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold">{book.name}</h1>
      <Link href={`/learn/${slug}`} className="mb-4 inline-block rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-gray-200">
        開始複習
      </Link>
      <ul className="divide-y divide-gray-800">
        {words.map((w) => (
          <li key={w.id}>
            <Link href={`/words/${w.id}`} className="flex items-baseline justify-between py-3 hover:bg-gray-900">
              <span className="font-medium">{w.headword}</span>
              <span className="ml-4 truncate text-sm text-gray-400">{w.definitionZh}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
