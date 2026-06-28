'use server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { eventBus } from '@/lib/events/bus'
import { submitAnswer, finishSession } from '@/lib/learning/submit'
import { gamificationService } from '@/lib/gamification/service'
import type { ReviewReward, SessionReward } from '@/lib/gamification/types'

export async function submitAnswerAction(
  wordId: string,
  correct: boolean,
): Promise<{ ok: boolean; mastered: boolean; reward: ReviewReward | null }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, mastered: false, reward: null }
  const now = new Date()
  const { mastered } = await submitAnswer(
    { userId: user.id, wordId, correct, now },
    { learning: new LearningRepository(), scheduler, bus: eventBus },
  )
  let reward: ReviewReward | null = null
  try {
    reward = await gamificationService.applyReview({ userId: user.id, correct, mastered, now })
  } catch {
    // 遊戲化失敗不應擋住學習進度（卡片已存）；本次不顯示獎勵
  }
  return { ok: true, mastered, reward }
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
