import { RATING_TO_INT, type CardState, type Rating } from './types'
import type { SchedulerService } from './scheduler'
import type { LearningRepository } from './repository'
import type { EventBus } from '@/lib/events/bus'

export async function submitReview(
  input: { userId: string; wordId: string; rating: Rating; now: Date },
  deps: { learning: LearningRepository; scheduler: SchedulerService; bus: EventBus },
): Promise<CardState> {
  const { userId, wordId, rating, now } = input
  const existing = await deps.learning.getCard(userId, wordId)
  const before = existing ?? deps.scheduler.newCard(now)
  const next = deps.scheduler.review(before, rating, now)
  const cardId = await deps.learning.saveCard(userId, wordId, next, existing !== null)
  await deps.learning.createReviewLog({ userCardId: cardId, rating: RATING_TO_INT[rating], state: next.state, due: next.due, stability: next.stability, difficulty: next.difficulty, elapsedDays: next.elapsedDays, lastElapsedDays: before.elapsedDays, scheduledDays: next.scheduledDays })
  await deps.bus.publish({ type: 'ReviewCompleted', userId, wordId, rating, at: now })
  return next
}

export async function finishSession(
  input: { userId: string; reviewed: number; now: Date },
  deps: { bus: EventBus },
): Promise<void> {
  await deps.bus.publish({ type: 'SessionFinished', userId: input.userId, reviewed: input.reviewed, at: input.now })
}
