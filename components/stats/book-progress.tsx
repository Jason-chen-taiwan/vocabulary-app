import type { BookBreakdown } from '@/lib/stats/aggregate'

// 每本書一根三態分段條：精熟（紫）+ 學習中（橘）從左填，剩下的灰軌道即未開始。
export function BookProgress({ book }: { book: BookBreakdown }) {
  const denom = Math.max(1, book.total)
  const masteredPct = (book.mastered / denom) * 100
  const studiedPct = (book.studied / denom) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-neutral-900">{book.name}</span>
        <span className="font-semibold">
          <span className="text-mastery">精熟 {book.mastered}</span>
          <span className="mx-1.5 text-neutral-200">·</span>
          <span className="text-primary-600">學習 {book.studied}</span>
          <span className="text-neutral-600"> / {book.total}</span>
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-pill bg-neutral-100">
        <div className="bg-mastery transition-[width] duration-500" style={{ width: `${masteredPct}%` }} title={`精熟 ${book.mastered}`} />
        <div className="bg-primary-500 transition-[width] duration-500" style={{ width: `${studiedPct}%` }} title={`學習中 ${book.studied}`} />
      </div>
    </div>
  )
}
