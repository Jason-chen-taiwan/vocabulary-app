import Link from 'next/link'
import { listWordBooks } from '@/lib/content/static'
import { Card } from '@/components/ui/card'
import { NotebookCard } from './notebook-card'

export default function BooksPage() {
  const books = listWordBooks()
  const ielts = books.filter((b) => b.level === 'IELTS')
  const others = books.filter((b) => b.level !== 'IELTS')

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">單字書</h1>

      <Link
        href="/learn/all"
        className="mt-4 flex items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white transition hover:bg-primary-600"
      >
        全部混合練習
      </Link>

      <NotebookCard />

      <Section title="雅思 IELTS" books={ielts} />
      <Section title="多益 TOEIC" books={others} />
    </main>
  )
}

function Section({ title, books }: { title: string; books: ReturnType<typeof listWordBooks> }) {
  if (books.length === 0) return null
  return (
    <>
      <h2 className="mt-8 mb-3 text-sm font-extrabold uppercase tracking-wide text-neutral-600">{title}</h2>
      <div className="grid gap-3">
        {books.map((b) => (
          <Link key={b.slug} href={`/books/${b.slug}`}>
            <Card className="p-5 transition hover:border-primary-300">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-extrabold text-neutral-900">{b.name}</span>
                <span className="shrink-0 text-xs font-semibold text-neutral-600">{b.wordCount} 字</span>
              </div>
              {b.description && <p className="mt-1 text-sm text-neutral-600">{b.description}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
