'use server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { eventBus } from '@/lib/events/bus'
import { submitReview, finishSession } from '@/lib/learning/submit'
import type { Rating } from '@/lib/learning/types'

export async function submitReviewAction(wordId: string, rating: Rating): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  await submitReview(
    { userId: user.id, wordId, rating, now: new Date() },
    { learning: new LearningRepository(), scheduler, bus: eventBus },
  )
  return { ok: true }
}

export async function finishSessionAction(reviewed: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  await finishSession({ userId: user.id, reviewed, now: new Date() }, { bus: eventBus })
  return { ok: true }
}
