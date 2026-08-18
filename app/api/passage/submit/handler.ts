import type { SessionUser } from '@/lib/auth/session'
import type { EventBus } from '@/lib/events/bus'
import type { PassageReward } from '@/lib/gamification/types'
import type { PassageData } from '@/lib/reading/types'

export interface PassageSubmitDeps {
  getPassageBySlug(slug: string): Promise<PassageData | null>
  saveResult(
    userId: string, passageId: string,
    data: { correctCount: number; totalCount: number; readSeconds: number | null },
  ): Promise<{ firstCompletion: boolean }>
  bus: EventBus
  applyPassageFinish(input: { userId: string; correctCount: number; now: Date }): Promise<PassageReward>
}

export interface PassageSubmitResult {
  ok: boolean
  results: { correct: boolean; answer: number }[]
  correctCount: number
  totalCount: number
  firstCompletion: boolean
  reward: PassageReward | null
}

const EMPTY: PassageSubmitResult = { ok: false, results: [], correctCount: 0, totalCount: 0, firstCompletion: false, reward: null }

// 閱讀計時純統計顯示；仍 clamp 擋髒資料
export function clampReadSeconds(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.min(3600, Math.max(10, Math.floor(raw)))
}

// 手寫驗證（比照 sync handler）：壞形狀整包拒收
function parseAnswers(raw: unknown, count: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== count) return null
  const out: number[] = []
  for (const a of raw) {
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 0 || a > 3) return null
    out.push(a)
  }
  return out
}

export async function handlePassageSubmit(
  user: SessionUser | null,
  body: unknown,
  deps: PassageSubmitDeps,
  now: Date,
): Promise<PassageSubmitResult> {
  if (!user) return EMPTY
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.slug !== 'string') return EMPTY
  const passage = await deps.getPassageBySlug(b.slug)
  if (!passage) return EMPTY
  const answers = parseAnswers(b.answers, passage.questions.length)
  if (answers === null) return EMPTY

  // server 權威判分：不信任前端的對錯
  const results = passage.questions.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer }))
  const correctCount = results.filter((r) => r.correct).length
  const totalCount = passage.questions.length

  const { firstCompletion } = await deps.saveResult(user.id, passage.id, {
    correctCount, totalCount, readSeconds: clampReadSeconds(b.readSeconds),
  })

  let reward: PassageReward | null = null
  if (firstCompletion) {
    await deps.bus.publish({ type: 'PassageFinished', userId: user.id, passageId: passage.id, correctCount, totalCount, at: now })
    try {
      reward = await deps.applyPassageFinish({ userId: user.id, correctCount, now })
    } catch { /* 遊戲化失敗不阻斷作答結果 */ }
  }
  return { ok: true, results, correctCount, totalCount, firstCompletion, reward }
}
