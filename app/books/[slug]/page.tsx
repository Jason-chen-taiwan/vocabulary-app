import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listWordBooks, getBookBySlug, listWordsByBook } from '@/lib/content/static'
import { BookClient } from './book-client'

export function generateStaticParams() {
  return listWordBooks().map((b) => ({ slug: b.slug }))
}

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const book = getBookBySlug(slug)
  if (!book) notFound()
  const words = listWordsByBook(slug)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/books" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 所有單字書</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">{book.name}</h1>

      <Link
        href={`/learn/${slug}`}
        className="mt-4 flex items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white transition hover:bg-primary-600"
      >
        開始複習
      </Link>

      <BookClient words={words} />
    </main>
  )
}
