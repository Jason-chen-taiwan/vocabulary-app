import { notFound } from 'next/navigation'
import { listWordBooks, getBookBySlug } from '@/lib/content/static'
import { LearnClient } from './learn-client'

// 靜態匯出：每本單字書 + 'all' 混合練習各產生一頁。
export function generateStaticParams() {
  return [{ slug: 'all' }, ...listWordBooks().map((b) => ({ slug: b.slug }))]
}

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const mixed = slug === 'all'
  const book = mixed ? null : getBookBySlug(slug)
  if (!mixed && !book) notFound()
  return <LearnClient slug={slug} bookName={mixed ? '全部混合' : book!.name} />
}
