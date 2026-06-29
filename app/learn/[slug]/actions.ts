'use server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { ContentRepository } from '@/lib/content/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { eventBus } from '@/lib/events/bus'
import { submitAnswer, finishSession } from '@/lib/learning/submit'
import { gamificationService } from '@/lib/gamification/service'
import { checkAnswer, type QuestionType } from '@/lib/learning/question'
import type { ReviewReward, SessionReward } from '@/lib/gamification/types'

export async function submitAnswerAction(
  wordId: string,
  questionType: QuestionType,
  userAnswer: string,
): Promise<{ ok: boolean; mastered: boolean; correct: boolean; reward: ReviewReward | null }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, mastered: false, correct: false, reward: null }
  const word = await new ContentRepository().getWordCore(wordId)
  if (!word) return { ok: false, mastered: false, correct: false, reward: null }
  // 後端權威判定：不信任前端送的對錯
  const correct = questionType === 'mc'
    ? userAnswer === word.definitionZh
    : checkAnswer(userAnswer, word.headword)
  const now = new Date()
  const { mastered } = await submitAnswer(
    { userId: user.id, wordId, correct, now },
    { learning: new LearningRepository(), scheduler, bus: eventBus },
  )
  let reward: ReviewReward | null = null
  try {
    reward = await gamificationService.applyReview({ userId: user.id, correct, mastered, now })
  } catch { /* 不阻斷學習進度 */ }
  return { ok: true, mastered, correct, reward }
}

export async function finishSessionAction(
  reviewed: number,
  correct: number,
): Promise<{ ok: boolean; reward: SessionReward | null }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, reward: null }
  const now = new Date()
  await finishSession({ userId: user.id, reviewed, correct, now }, { bus: eventBus })
  let reward: SessionReward | null = null
  try {
    reward = await gamificationService.applySessionFinish({ userId: user.id, reviewed, correct, now })
  } catch {
    // 同上：不阻斷
  }
  return { ok: true, reward }
}
