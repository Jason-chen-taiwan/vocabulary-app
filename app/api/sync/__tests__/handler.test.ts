import { describe, it, expect } from 'vitest'
import { parseEntries, clampAnsweredAt, handleSync, type SyncDeps } from '../handler'

const user = { id: 'u1', email: 'a@b.c', name: null, image: null }
const NOW = new Date('2026-07-18T12:00:00.000Z')

const entry = (uuid: string, over: Partial<{ wordId: string; questionType: string; userAnswer: string; answeredAt: string }> = {}) => ({
  uuid, wordId: 'w1', questionType: 'mc', userAnswer: '對的釋義', answeredAt: '2026-07-18T10:00:00.000Z', ...over,
})

function makeDeps() {
  const calls: { submitted: { wordId: string; correct: boolean; now: Date; clientRef?: string }[]; sessionFinish: unknown[] } = { submitted: [], sessionFinish: [] }
  const deps: SyncDeps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    learning: {
      listClientRefs: async () => [],
      getCard: async () => null,
      saveCard: async () => 'c1',
      createReviewLog: async () => {},
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scheduler: {
      newCard: () => ({ due: NOW, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, learningSteps: 0, lastReview: null }),
      review: (s: unknown) => s,
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bus: { publish: async () => {} } as any,
    getWordCore: async (id) => (id === 'missing' ? null : { id, headword: 'invoice', definitionZh: '對的釋義' }),
    applyReview: async ({ correct }) => ({ xpGained: correct ? 10 : 2, coinsGained: 0, leveledUpTo: null, dailyGoalMet: false, streak: 1, newBadges: [] }),
    applySessionFinish: async ({ reviewed, correct }) => ({ perfect: reviewed > 0 && reviewed === correct, newBadges: [] }),
  }
  // 監看 submitAnswer 實際寫入：包 learning.createReviewLog 抓 clientRef 順序
  return { deps, calls }
}

describe('parseEntries', () => {
  it('合法輸入通過', () => {
    expect(parseEntries([entry('a')])).toHaveLength(1)
  })
  it('非陣列 / 超過 500 筆 / 欄位型別錯 / 壞日期 / 壞題型 → null', () => {
    expect(parseEntries('x')).toBeNull()
    expect(parseEntries(Array.from({ length: 501 }, (_, i) => entry(String(i))))).toBeNull()
    expect(parseEntries([entry('a', { userAnswer: 5 as unknown as string })])).toBeNull()
    expect(parseEntries([entry('a', { answeredAt: 'not-a-date' })])).toBeNull()
    expect(parseEntries([entry('a', { questionType: 'essay' })])).toBeNull()
  })
})

describe('clampAnsweredAt', () => {
  const now = NOW.getTime()
  it('未來時間壓回 now；7 天前壓到下限；窗內原樣', () => {
    expect(clampAnsweredAt(now + 60_000, now).getTime()).toBe(now)
    expect(clampAnsweredAt(now - 8 * 24 * 3600_000, now).getTime()).toBe(now - 7 * 24 * 3600_000)
    expect(clampAnsweredAt(now - 3600_000, now).getTime()).toBe(now - 3600_000)
  })
})

describe('handleSync', () => {
  it('未登入 → ok:false', async () => {
    const { deps } = makeDeps()
    const res = await handleSync(null, { entries: [entry('a')] }, deps, NOW)
    expect(res.ok).toBe(false)
  })

  it('壞 payload → ok:false', async () => {
    const { deps } = makeDeps()
    const res = await handleSync(user, { entries: 'nope' }, deps, NOW)
    expect(res.ok).toBe(false)
  })

  it('重判對錯並彙總獎勵；answeredAt 亂序也按升冪重放', async () => {
    const { deps } = makeDeps()
    const order: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(deps.learning as any).createReviewLog = async (input: { clientRef?: string }) => { order.push(input.clientRef!) }
    const res = await handleSync(user, {
      entries: [
        entry('late', { answeredAt: '2026-07-18T11:00:00.000Z', userAnswer: '錯的' }),
        entry('early', { answeredAt: '2026-07-18T09:00:00.000Z' }),
      ],
    }, deps, NOW)
    expect(res.ok).toBe(true)
    expect(order).toEqual(['early', 'late'])
    expect(res.reward.applied).toBe(2)
    expect(res.reward.correct).toBe(1) // 'late' 答錯（userAnswer 不等於 definitionZh）
    expect(res.reward.xp).toBe(12) // 10 + 2
  })

  it('已入帳 uuid → duplicate、不重複寫；同批重複 uuid 只入一次', async () => {
    const { deps } = makeDeps()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(deps.learning as any).listClientRefs = async () => ['dup']
    let writes = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(deps.learning as any).createReviewLog = async () => { writes++ }
    const res = await handleSync(user, { entries: [entry('dup'), entry('fresh'), entry('fresh')] }, deps, NOW)
    expect(res.results.find((r) => r.uuid === 'dup')?.status).toBe('duplicate')
    expect(res.results.filter((r) => r.uuid === 'fresh').map((r) => r.status).sort()).toEqual(['applied', 'duplicate'])
    expect(writes).toBe(1)
  })

  it('查不到字 → 該筆 error、其餘照常', async () => {
    const { deps } = makeDeps()
    const res = await handleSync(user, { entries: [entry('bad', { wordId: 'missing' }), entry('ok')] }, deps, NOW)
    expect(res.results.find((r) => r.uuid === 'bad')?.status).toBe('error')
    expect(res.results.find((r) => r.uuid === 'ok')?.status).toBe('applied')
  })

  it('獎勵入帳一律用 server now，不用回填的 answeredAt（防回填倒退 streak/日期狀態、防刷 daily goal）', async () => {
    const { deps } = makeDeps()
    let sawNow: Date | null = null
    deps.applyReview = async ({ now: n, correct }) => {
      sawNow = n
      return { xpGained: correct ? 10 : 2, coinsGained: 0, leveledUpTo: null, dailyGoalMet: false, streak: 1, newBadges: [] }
    }
    const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * 3600_000).toISOString()
    const res = await handleSync(user, { entries: [entry('a', { answeredAt: threeDaysAgo })] }, deps, NOW)
    expect(res.ok).toBe(true)
    expect(sawNow).toEqual(NOW)
    expect(sawNow).not.toEqual(new Date(threeDaysAgo))
  })

  it('單筆 submitAnswer 拋出（DB 抖動/clientRef 撞唯一鍵）→ 該筆 error，其餘照常入帳，整體 ok:true', async () => {
    const { deps } = makeDeps()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(deps.learning as any).saveCard = async (userId: string, wordId: string) => {
      if (wordId === 'boom') throw new Error('unique violation on clientRef')
      return 'c1'
    }
    const res = await handleSync(user, {
      entries: [
        entry('before', { wordId: 'w1', answeredAt: '2026-07-18T09:00:00.000Z' }),
        entry('crash', { wordId: 'boom', answeredAt: '2026-07-18T09:30:00.000Z' }),
        entry('after', { wordId: 'w1', answeredAt: '2026-07-18T10:00:00.000Z' }),
      ],
    }, deps, NOW)
    expect(res.ok).toBe(true)
    expect(res.results.find((r) => r.uuid === 'crash')?.status).toBe('error')
    expect(res.results.find((r) => r.uuid === 'before')?.status).toBe('applied')
    expect(res.results.find((r) => r.uuid === 'after')?.status).toBe('applied')
    expect(res.reward.applied).toBe(2)
  })

  it('session.finishedAt 有給且有入帳 → applySessionFinish 用 server 重判數字', async () => {
    const { deps } = makeDeps()
    let finishInput: { reviewed: number; correct: number } | null = null
    deps.applySessionFinish = async (i) => { finishInput = i; return { perfect: false, newBadges: [] } }
    await handleSync(user, {
      entries: [entry('a'), entry('b', { userAnswer: '錯的' })],
      session: { finishedAt: '2026-07-18T11:30:00.000Z' },
    }, deps, NOW)
    expect(finishInput).toEqual(expect.objectContaining({ reviewed: 2, correct: 1 }))
  })
})
