import type { SessionUser } from '@/lib/auth/session'
import { buildReviewItems, SESSION_LIMITS, type ReviewContentDeps } from '@/lib/learning/review-items'
import type { LearningRepository } from '@/lib/learning/repository'
import type { OfflinePack } from '@/lib/sync/types'

export async function handleOfflinePack(
  user: SessionUser | null,
  deps: { learning: LearningRepository; content: ReviewContentDeps },
  now: Date,
): Promise<{ ok: boolean; packs: OfflinePack[] }> {
  if (!user) return { ok: false, packs: [] }
  const books = await deps.learning.listStartedBooks(user.id)
  const packs: OfflinePack[] = []
  for (const book of books) {
    const items = await buildReviewItems({ userId: user.id, book, now, ...SESSION_LIMITS }, deps)
    if (items.length > 0) packs.push({ slug: book.slug, name: book.name, items })
  }
  return { ok: true, packs }
}
