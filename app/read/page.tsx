import Link from 'next/link'
import { ReadListClient } from './read-list-client'

export default function ReadListPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">沉浸閱讀 📖</h1>
      <p className="mt-1 text-neutral-600">讀文章、點生字、練 Part 7 — 收藏的字會存進生字本</p>
      <ReadListClient />
    </main>
  )
}
