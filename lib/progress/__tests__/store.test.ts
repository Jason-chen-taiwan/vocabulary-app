import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadProgress, saveProgress, recordReview, buildQueue, todayStats,
  exportProgress, importProgress, emptyProgress,
} from '../store'

// localStorage 在 vitest 的 node 環境不存在——用最小的記憶體替身。
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemStorage()
})

const TZ = 'Asia/Taipei'

describe('load/save', () => {
  it('returns empty progress when nothing stored', () => {
    expect(loadProgress().cards).toEqual({})
  })

  it('round-trips through storage', () => {
    const p = emptyProgress()
    p.streak = 3
    saveProgress(p)
    expect(loadProgress().streak).toBe(3)
  })

  it('survives corrupt stored JSON', () => {
    localStorage.setItem('vocab.progress.v1', '{not json')
    expect(loadProgress().cards).toEqual({})
  })
})

describe('recordReview', () => {
  it('schedules a new card into the future on a correct answer', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const p = emptyProgress()
    const next = recordReview(p, 'b:word', true, now, TZ)
    const card = next.cards['b:word']
    expect(card).toBeDefined()
    expect(card.streak).toBe(1)
    expect(new Date(card.due).getTime()).toBeGreaterThan(now.getTime())
  })

  it('resets streak on a wrong answer', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    let p = emptyProgress()
    p = recordReview(p, 'b:w', true, now, TZ)
    p = recordReview(p, 'b:w', true, now, TZ)
    expect(p.cards['b:w'].streak).toBe(2)
    p = recordReview(p, 'b:w', false, now, TZ)
    expect(p.cards['b:w'].streak).toBe(0)
  })

  it('marks a card mastered after five consecutive correct answers', () => {
    let p = emptyProgress()
    const now = new Date('2026-01-01T10:00:00Z')
    for (let i = 0; i < 5; i++) p = recordReview(p, 'b:w', true, now, TZ)
    expect(p.cards['b:w'].streak).toBe(5)
    expect(p.mastered).toContain('b:w')
  })

  it('counts reviews done today', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    let p = emptyProgress()
    p = recordReview(p, 'b:a', true, now, TZ)
    p = recordReview(p, 'b:b', false, now, TZ)
    expect(todayStats(p, now, TZ).reviews).toBe(2)
    expect(todayStats(p, now, TZ).correct).toBe(1)
  })
})

describe('streak', () => {
  it('starts at one on the first day of study', () => {
    const p = recordReview(emptyProgress(), 'b:a', true, new Date('2026-01-01T10:00:00Z'), TZ)
    expect(p.streak).toBe(1)
  })

  it('increments on a consecutive day', () => {
    let p = recordReview(emptyProgress(), 'b:a', true, new Date('2026-01-01T10:00:00Z'), TZ)
    p = recordReview(p, 'b:b', true, new Date('2026-01-02T10:00:00Z'), TZ)
    expect(p.streak).toBe(2)
  })

  it('does not double-count two reviews on the same day', () => {
    // 兩個時間都落在台北時區的同一天（UTC+8：01-01 10:00Z = 18:00、13:00Z = 21:00）
    let p = recordReview(emptyProgress(), 'b:a', true, new Date('2026-01-01T10:00:00Z'), TZ)
    p = recordReview(p, 'b:b', true, new Date('2026-01-01T13:00:00Z'), TZ)
    expect(p.streak).toBe(1)
  })

  it('resets to one after a missed day', () => {
    let p = recordReview(emptyProgress(), 'b:a', true, new Date('2026-01-01T10:00:00Z'), TZ)
    p = recordReview(p, 'b:b', true, new Date('2026-01-05T10:00:00Z'), TZ)
    expect(p.streak).toBe(1)
  })

  it('tracks the longest streak even after a reset', () => {
    let p = emptyProgress()
    p = recordReview(p, 'b:a', true, new Date('2026-01-01T10:00:00Z'), TZ)
    p = recordReview(p, 'b:a', true, new Date('2026-01-02T10:00:00Z'), TZ)
    p = recordReview(p, 'b:a', true, new Date('2026-01-09T10:00:00Z'), TZ)
    expect(p.streak).toBe(1)
    expect(p.longestStreak).toBe(2)
  })
})

describe('buildQueue', () => {
  const ids = ['b:1', 'b:2', 'b:3', 'b:4', 'b:5']

  it('serves unseen words when there is no history', () => {
    const q = buildQueue(emptyProgress(), ids, new Date(), { newLimit: 3, dueLimit: 10, spotCheckLimit: 0 })
    expect(q).toHaveLength(3)
    expect(q.every((i) => i.isNew)).toBe(true)
  })

  it('does not serve a card that is not yet due', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const p = recordReview(emptyProgress(), 'b:1', true, now, TZ)
    const q = buildQueue(p, ['b:1'], now, { newLimit: 10, dueLimit: 10, spotCheckLimit: 0 })
    expect(q).toHaveLength(0)
  })

  it('serves a card once it becomes due', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const p = recordReview(emptyProgress(), 'b:1', true, now, TZ)
    const later = new Date(new Date(p.cards['b:1'].due).getTime() + 1000)
    const q = buildQueue(p, ['b:1'], later, { newLimit: 10, dueLimit: 10, spotCheckLimit: 0 })
    expect(q).toHaveLength(1)
    expect(q[0].isNew).toBe(false)
  })

  it('respects the new-word limit', () => {
    const q = buildQueue(emptyProgress(), ids, new Date(), { newLimit: 2, dueLimit: 10, spotCheckLimit: 0 })
    expect(q.filter((i) => i.isNew)).toHaveLength(2)
  })

  it('mixes in a spot check of mastered words', () => {
    let p = emptyProgress()
    const now = new Date('2026-01-01T10:00:00Z')
    // 精熟一個字（連續答對 5 次）
    for (let i = 0; i < 5; i++) p = recordReview(p, 'b:1', true, now, TZ)
    expect(p.mastered).toContain('b:1')
    // 精熟的字已排到很後面，不會出現在 due；但抽考應該把它撈回來
    const q = buildQueue(p, ['b:1', 'b:2'], now, { newLimit: 0, dueLimit: 10, spotCheckLimit: 3 })
    const spot = q.filter((i) => i.isSpotCheck)
    expect(spot).toHaveLength(1)
    expect(spot[0].wordId).toBe('b:1')
    // 抽考一律用選擇題（只是喚起記憶，不為難）
    expect(spot[0].questionType).toBe('mc')
  })

  it('respects the spot-check limit', () => {
    let p = emptyProgress()
    const now = new Date('2026-01-01T10:00:00Z')
    for (const id of ['b:1', 'b:2', 'b:3', 'b:4', 'b:5']) {
      for (let i = 0; i < 5; i++) p = recordReview(p, id, true, now, TZ)
    }
    const q = buildQueue(p, ids, now, { newLimit: 0, dueLimit: 10, spotCheckLimit: 2 })
    expect(q.filter((i) => i.isSpotCheck)).toHaveLength(2)
  })

  it('does not spot-check a word that is already due in this queue', () => {
    let p = emptyProgress()
    const now = new Date('2026-01-01T10:00:00Z')
    for (let i = 0; i < 5; i++) p = recordReview(p, 'b:1', true, now, TZ)
    // 時間快轉到這張卡到期 → 它會進 due，就不該又被當成抽考重複出現
    const later = new Date(new Date(p.cards['b:1'].due).getTime() + 1000)
    const q = buildQueue(p, ['b:1'], later, { newLimit: 0, dueLimit: 10, spotCheckLimit: 3 })
    expect(q.filter((i) => i.wordId === 'b:1')).toHaveLength(1)
    expect(q[0].isSpotCheck).toBe(false)
  })

  it('only spot-checks words from the books being studied', () => {
    let p = emptyProgress()
    const now = new Date('2026-01-01T10:00:00Z')
    for (let i = 0; i < 5; i++) p = recordReview(p, 'other-book:x', true, now, TZ)
    const q = buildQueue(p, ['b:1'], now, { newLimit: 1, dueLimit: 10, spotCheckLimit: 3 })
    expect(q.filter((i) => i.isSpotCheck)).toHaveLength(0)
  })

  it('escalates question type as the streak grows', () => {
    let p = emptyProgress()
    const now = new Date('2026-01-01T10:00:00Z')
    // 一次答對 → streak 1 → 仍是選擇題
    p = recordReview(p, 'b:1', true, now, TZ)
    let due = new Date(new Date(p.cards['b:1'].due).getTime() + 1000)
    expect(buildQueue(p, ['b:1'], due, { newLimit: 0, dueLimit: 10, spotCheckLimit: 0 })[0].questionType).toBe('mc')
    // 再答對兩次 → streak 3 → 填空
    p = recordReview(p, 'b:1', true, due, TZ)
    p = recordReview(p, 'b:1', true, due, TZ)
    due = new Date(new Date(p.cards['b:1'].due).getTime() + 1000)
    expect(buildQueue(p, ['b:1'], due, { newLimit: 0, dueLimit: 10, spotCheckLimit: 0 })[0].questionType).toBe('cloze')
  })
})

describe('export/import', () => {
  it('round-trips a full progress snapshot', () => {
    let p = emptyProgress()
    p = recordReview(p, 'b:1', true, new Date('2026-01-01T10:00:00Z'), TZ)
    const json = exportProgress(p)
    const back = importProgress(json)
    expect(back).not.toBeNull()
    expect(back!.cards['b:1'].streak).toBe(1)
    expect(back!.streak).toBe(p.streak)
  })

  it('rejects malformed import data', () => {
    expect(importProgress('nonsense')).toBeNull()
    expect(importProgress('{"cards":"wrong type"}')).toBeNull()
  })
})
