import Link from 'next/link'
import { NotebookClient } from './notebook-client'

export default function NotebookPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/books" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 單字書</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">我的生字本 📓</h1>
      <p className="mt-1 text-sm text-neutral-600">閱讀時點選收集的單字</p>
      <NotebookClient />
    </main>
  )
}
