import type { BookBreakdown } from '@/lib/stats/aggregate'

// 每本書一根三態分段條：精熟（深）+ 學習中（中）從左填，剩下的淺色軌道即未開始。
export function BookProgress({ book }: { book: BookBreakdown }) {
  const denom = Math.max(1, book.total)
  const masteredPct = (book.mastered / denom) * 100
  const studiedPct = (book.studied / denom) * 100
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-semibold text-neutral-600">
        <span>{book.name}</span>
        <span>精熟 {book.mastered}・學習 {book.studied}／{book.total}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-pill bg-neutral-100">
        <div className="bg-primary-600" style={{ width: `${masteredPct}%` }} title={`精熟 ${book.mastered}`} />
        <div className="bg-primary-300" style={{ width: `${studiedPct}%` }} title={`學習中 ${book.studied}`} />
      </div>
    </div>
  )
}
