import { RATING_TO_INT } from './types'
import { grade } from './grading'
import type { SchedulerService } from './scheduler'
import type { LearningRepository } from './repository'
import type { EventBus } from '@/lib/events/bus'

export async function submitAnswer(
  input: { userId: string; wordId: string; correct: boolean; now: Date },
  deps: { learning: LearningRepository; scheduler: SchedulerService; bus: EventBus },
): Promise<{ mastered: boolean }> {
  const { userId, wordId, correct, now } = input
  const existing = await deps.learning.getCard(userId, wordId)
  const before = existing?.state ?? deps.scheduler.newCard(now)
  const prevStreak = existing?.consecutiveCorrect ?? 0

  const { rating, nextStreak, mastered } = grade(correct, prevStreak)
  const next = deps.scheduler.review(before, rating, now)

  const cardId = await deps.learning.saveCard(userId, wordId, next, {
    consecutiveCorrect: nextStreak, mastered, exists: existing !== null,
  })
  await deps.learning.createReviewLog({
    userCardId: cardId,
    rating: RATING_TO_INT[rating],
    state: next.state,
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsedDays,
    lastElapsedDays: before.elapsedDays,
    scheduledDays: next.scheduledDays,
  })
  await deps.bus.publish({ type: 'ReviewCompleted', userId, wordId, rating, correct, mastered, at: now })
  return { mastered }
}

export async function finishSession(
  input: { userId: string; reviewed: number; correct: number; now: Date },
  deps: { bus: EventBus },
): Promise<void> {
  await deps.bus.publish({ type: 'SessionFinished', userId: input.userId, reviewed: input.reviewed, correct: input.correct, at: input.now })
}
