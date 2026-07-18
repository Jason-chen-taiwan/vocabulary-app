import type { SessionUser } from '@/lib/auth/session'
import type { LearningRepository } from '@/lib/learning/repository'
import type { SchedulerService } from '@/lib/learning/scheduler'
import type { EventBus } from '@/lib/events/bus'
import type { ReviewReward, SessionReward } from '@/lib/gamification/types'
import type { QueueEntry } from '@/lib/sync/types'
import { judgeAnswer } from '@/lib/learning/judge'
import { submitAnswer, finishSession } from '@/lib/learning/submit'

const MAX_ENTRIES = 500
const CLAMP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface SyncDeps {
  learning: LearningRepository
  scheduler: SchedulerService
  bus: EventBus
  getWordCore(wordId: string): Promise<{ id: string; headword: string; definitionZh: string } | null>
  applyReview(input: { userId: string; correct: boolean; mastered: boolean; now: Date }): Promise<ReviewReward>
  applySessionFinish(input: { userId: string; reviewed: number; correct: number; now: Date }): Promise<SessionReward>
}

export interface SyncEntryResult { uuid: string; status: 'applied' | 'duplicate' | 'error' }
export interface SyncReward {
  xp: number; coins: number; level: number | null; badges: string[]
  applied: number; correct: number; perfect: boolean
}

const EMPTY_REWARD: SyncReward = { xp: 0, coins: 0, level: null, badges: [], applied: 0, correct: 0, perfect: false }

// 手寫驗證（比照 push handler 模式，零新依賴）。壞形狀一律整包拒收。
export function parseEntries(raw: unknown): QueueEntry[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ENTRIES) return null
  const out: QueueEntry[] = []
  for (const e of raw) {
    const x = e as Record<string, unknown>
    if (typeof x?.uuid !== 'string' || typeof x?.wordId !== 'string' || typeof x?.userAnswer !== 'string') return null
    if (x.questionType !== 'mc' && x.questionType !== 'cloze' && x.questionType !== 'typing') return null
    if (typeof x.answeredAt !== 'string' || Number.isNaN(Date.parse(x.answeredAt))) return null
    out.push({ uuid: x.uuid, wordId: x.wordId, questionType: x.questionType, userAnswer: x.userAnswer, answeredAt: x.answeredAt })
  }
  return out
}

// 客端時鐘不可信：壓進 [now-7d, now] 窗口。只能降風險不能防偽（spec 已知限制）。
export function clampAnsweredAt(atMs: number, nowMs: number): Date {
  return new Date(Math.min(Math.max(atMs, nowMs - CLAMP_WINDOW_MS), nowMs))
}

export async function handleSync(
  user: SessionUser | null,
  body: { entries?: unknown; session?: { finishedAt?: unknown } },
  deps: SyncDeps,
  now: Date,
): Promise<{ ok: boolean; results: SyncEntryResult[]; reward: SyncReward }> {
  if (!user) return { ok: false, results: [], reward: EMPTY_REWARD }
  const entries = parseEntries(body?.entries)
  if (!entries) return { ok: false, results: [], reward: EMPTY_REWARD }

  const existing = new Set(await deps.learning.listClientRefs(user.id, entries.map((e) => e.uuid)))
  const sorted = [...entries].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))

  const results: SyncEntryResult[] = []
  const reward: SyncReward = { ...EMPTY_REWARD, badges: [] }
  const seenInBatch = new Set<string>()

  for (const e of sorted) {
    if (existing.has(e.uuid) || seenInBatch.has(e.uuid)) {
      results.push({ uuid: e.uuid, status: 'duplicate' })
      continue
    }
    seenInBatch.add(e.uuid)
    try {
      const word = await deps.getWordCore(e.wordId)
      if (!word) {
        results.push({ uuid: e.uuid, status: 'error' })
        continue
      }
      // 後端權威：重判對錯，不信任前端
      const correct = judgeAnswer(word, e.questionType, e.userAnswer)
      const at = clampAnsweredAt(Date.parse(e.answeredAt), now.getTime())
      const { mastered } = await submitAnswer(
        { userId: user.id, wordId: e.wordId, correct, now: at, clientRef: e.uuid },
        { learning: deps.learning, scheduler: deps.scheduler, bus: deps.bus },
      )
      results.push({ uuid: e.uuid, status: 'applied' })
      reward.applied++
      if (correct) reward.correct++
      try {
        // FSRS 用作答時間重放；獎勵一律以 server 當下時間入帳，避免回填時間倒退/刷 streak
        const r = await deps.applyReview({ userId: user.id, correct, mastered, now })
        reward.xp += r.xpGained
        reward.coins += r.coinsGained
        if (r.leveledUpTo !== null) reward.level = r.leveledUpTo
        reward.badges.push(...r.newBadges)
      } catch { /* 獎勵失敗不阻斷同步（與線上 action 同策略） */ }
    } catch {
      // 單筆失敗（DB 抖動、clientRef 併發撞唯一鍵等）不可拖垮整批：該筆標記 error，其餘照常
      results.push({ uuid: e.uuid, status: 'error' })
    }
  }

  const finishedAt = body?.session?.finishedAt
  if (typeof finishedAt === 'string' && !Number.isNaN(Date.parse(finishedAt)) && reward.applied > 0) {
    // reviewed/correct 以 server 重判結果重算，不信前端數字
    await finishSession({ userId: user.id, reviewed: reward.applied, correct: reward.correct, now }, { bus: deps.bus })
    try {
      const s = await deps.applySessionFinish({ userId: user.id, reviewed: reward.applied, correct: reward.correct, now })
      reward.perfect = s.perfect
      reward.badges.push(...s.newBadges)
    } catch { /* 同上 */ }
  }

  return { ok: true, results, reward }
}
