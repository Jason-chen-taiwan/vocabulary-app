import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository, NOTEBOOK_SLUG } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { buildReviewItems, SESSION_LIMITS } from '@/lib/learning/review-items'
import { ReviewSession, type ReviewItem } from '@/components/review-session'
import { GamificationBar } from '@/components/gamification-bar'
import { Mascot } from '@/components/ui/mascot'
import { ShopRepository } from '@/lib/shop/repository'

export const dynamic = 'force-dynamic'

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const content = new ContentRepository()
  // slug 'all' → mixed practice across every book; no single book context.
  const mixed = slug === 'all'
  const book = mixed ? null : await content.getWordBookBySlug(slug)
  if (!mixed && !book) notFound()
  const bookName = mixed ? '全部混合' : book!.name

  // 生字本：字全靠「收藏當下建卡」進到期佇列，不從新字池抽（新字池已排除 notebook，此處雙重保險）。
  const limits = slug === NOTEBOOK_SLUG ? { ...SESSION_LIMITS, newLimit: 0 } : SESSION_LIMITS
  const reviewItems: ReviewItem[] = await buildReviewItems(
    { userId: user.id, book: book ? { id: book.id } : null, now: new Date(), ...limits },
    { learning: new LearningRepository(), content },
  )

  if (reviewItems.length === 0) {
    return (
      <>
        <GamificationBar />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <Mascot mood="cheer" size={120} className="mx-auto" />
          <h1 className="text-2xl font-extrabold text-neutral-900">{bookName}</h1>
          <p className="mt-4 text-neutral-600">今天沒有待複習的單字了 🎉</p>
          <Link href={mixed ? '/books' : `/books/${slug}`} className="mt-6 inline-block text-sm font-semibold text-primary-600 hover:underline">← 回單字書</Link>
        </main>
      </>
    )
  }
  const equipped = await new ShopRepository().getEquipped(user.id)
  return <ReviewSession bookName={bookName} bookSlug={slug} items={reviewItems} equipped={equipped} />
}
