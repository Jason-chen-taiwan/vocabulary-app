'use server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { eventBus } from '@/lib/events/bus'
import { submitAnswer, finishSession } from '@/lib/learning/submit'

export async function submitAnswerAction(wordId: string, correct: boolean): Promise<{ ok: boolean; mastered: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, mastered: false }
  const { mastered } = await submitAnswer(
    { userId: user.id, wordId, correct, now: new Date() },
    { learning: new LearningRepository(), scheduler, bus: eventBus },
  )
  return { ok: true, mastered }
}

export async function finishSessionAction(reviewed: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  await finishSession({ userId: user.id, reviewed, now: new Date() }, { bus: eventBus })
  return { ok: true }
}
