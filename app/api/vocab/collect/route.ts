import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { PassageRepository } from '@/lib/reading/repository'
import { handleCollect } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const passages = new PassageRepository()
  const content = new ContentRepository()
  const learning = new LearningRepository()
  const res = await handleCollect(user, body, {
    getPassageBySlug: (slug) => passages.getPassageBySlug(slug),
    ensureNotebookBook: () => content.ensureNotebookBook(),
    upsertNotebookWord: (bookId, data) => content.upsertNotebookWord(bookId, data),
    getCard: (userId, wordId) => learning.getCard(userId, wordId),
    saveCard: (userId, wordId, state, progress) => learning.saveCard(userId, wordId, state, progress),
    scheduler,
  }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
