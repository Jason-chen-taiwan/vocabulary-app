import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listPassages, getPassageBySlug, toPassagePayload } from '@/lib/reading/static'
import { getWordById } from '@/lib/content/static'
import { PassageReader } from '@/components/passage-reader'

export function generateStaticParams() {
  return listPassages().map((p) => ({ slug: p.slug }))
}

export default async function ReadPassagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const passage = getPassageBySlug(slug)
  if (!passage) notFound()

  // glossary 裡標了 wordId 的字，帶出精修字庫的釋義與例句（查得到才帶）。
  const curatedWords = Object.values(passage.glossary)
    .map((e) => (e.wordId ? getWordById(e.wordId) : null))
    .filter((w) => w !== null)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/read" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 文章列表</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">{passage.title}</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-600">
        {passage.titleZh ? `${passage.titleZh} · ` : ''}{passage.wordCount} 字 · 點單字看釋義
      </p>
      <PassageReader passage={toPassagePayload(passage)} curatedWords={curatedWords} />
      <p className="mt-6 text-xs text-neutral-600">出處：{passage.source}</p>
    </main>
  )
}
