# 數據儀表板（P5-a）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建 `/stats` 個人學習數據儀表板——精熟進度、活躍熱力圖、正確率趨勢、到期預報，全部從既有資料聚合、原創 inline SVG/CSS 圖表、零新依賴。

**Architecture:** 新 `lib/stats` 唯讀模組：`aggregate.ts`（純函式 bucketing，全 TDD）＋ `StatsRepository`（Neon 聚合查詢，injectable db）＋ `StatsService.getDashboard`（組四塊 view model）。`/stats` server component 抓 dashboard、傳給 `components/stats/*` 純表現圖表元件。學習/遊戲化核心不動。

**Tech Stack:** Next.js App Router（server component + 少量 client 圖表）、React、TypeScript、Prisma 7 + Neon（HTTP）、Vitest。

## Global Constraints

- **模組化第一**：`lib/stats` 唯讀、不訂閱事件、不寫入、不改學習/遊戲化。對外只暴露 `StatsService`。（CLAUDE.md 第一準則）
- **前端只呈現**：所有聚合在 server 端算（repository + aggregate 純函式）；圖表元件只接收已算好的 view model，不自行查詢。（資安鐵則）
- **身分**：`userId` 由 `getCurrentUser()`（server session）取；只查該 userId 的資料。
- **判定規則**：`ReviewLog.rating === 1`（Again）為錯，`rating >= 2`（Hard/Good/Easy）為對。精熟＝`UserCard.mastered`。「新（未開始）」＝該書 Word 尚無 UserCard。
- **時區**：以日分組用使用者時區，沿用 `lib/gamification/date.ts` 的 `todayYmd(date, tz)`（Intl en-CA → `YYYY-MM-DD`）與 `daysBetween`。
- **資料存取**：一律經 repository；Neon HTTP、無交易（本功能唯讀，無寫入）。
- **成本**：無 cron、無 runtime AI、無新付費服務、**無新依賴**（圖表全自繪）。
- **參數（可調常數）**：熱力圖 12 週、正確率 30 天、到期預報 7 天。
- **TDD**：aggregate/repository/service 先寫失敗測試再實作；測試用注入 fake db/repo（比照 `lib/leaderboard/__tests__`、`lib/gamification/__tests__`）。
- **既有測試全綠**：完工時 `npx vitest run`、`npx tsc --noEmit`、`npm run build` 皆通過。

---

## File Structure

- `lib/stats/aggregate.ts` — **Create**：純函式 bucketing（day 分組、每日正確率、到期分桶、每書精熟%、狀態計數、熱力圖格子）。
- `lib/stats/__tests__/aggregate.test.ts` — **Create**。
- `lib/stats/repository.ts` — **Create**：`StatsRepository`（injectable db）+ row 型別。
- `lib/stats/__tests__/repository.test.ts` — **Create**。
- `lib/stats/service.ts` — **Create**：`StatsService.getDashboard` + `Dashboard` view-model 型別 + `statsService` 單例。
- `lib/stats/__tests__/service.test.ts` — **Create**。
- `components/stats/heatmap.tsx` — **Create**：活躍熱力圖（SVG/CSS grid）。
- `components/stats/accuracy-bars.tsx` — **Create**：正確率長條。
- `components/stats/due-bars.tsx` — **Create**：到期預報長條。
- `components/stats/state-distribution.tsx` — **Create**：FSRS 狀態分段條。
- `app/stats/page.tsx` — **Create**：server 頁組裝。
- `app/page.tsx` — **Modify**：加 `/stats` 入口連結。

---

### Task 1: aggregate 純函式

**Files:**
- Create: `lib/stats/aggregate.ts`
- Test: `lib/stats/__tests__/aggregate.test.ts`

**Interfaces:**
- Consumes: `todayYmd`, `daysBetween`（`@/lib/gamification/date`）。
- Produces:
  - `dayKey(d: Date, timezone: string): string`
  - `groupReviewsByDay(logs: { reviewedAt: Date }[], timezone: string): Map<string, number>`
  - `interface DayAccuracy { day: string; correct: number; total: number }`；`dailyAccuracy(logs: { reviewedAt: Date; rating: number }[], timezone: string): DayAccuracy[]`（依日升冪）
  - `interface DueBucket { day: string; count: number }`；`dueForecast(cards: { due: Date }[], now: Date, timezone: string, days?: number): DueBucket[]`（今日含逾期；超出視界忽略；零填）
  - `countMasteredByBook(cards: { mastered: boolean; wordBookId: string }[]): Map<string, number>`
  - `interface BookMastery { slug: string; name: string; mastered: number; total: number; pct: number }`；`masteryByBook(masteredByBookId: Map<string, number>, books: { id: string; slug: string; name: string; wordCount: number }[]): BookMastery[]`
  - `interface StateCounts { newCount: number; learning: number; review: number; mastered: number; startedTotal: number }`；`stateCounts(cards: { state: number; mastered: boolean }[], totalWords: number): StateCounts`
  - `type HeatLevel = 0 | 1 | 2 | 3`；`interface HeatCell { day: string; count: number; level: HeatLevel }`；`const HEAT_THRESHOLDS: [number, number, number]`；`heatLevel(count: number): HeatLevel`；`heatmapCells(byDay: Map<string, number>, now: Date, timezone: string, weeks?: number): HeatCell[]`（oldest→today，長度 `weeks*7`）

- [ ] **Step 1: 寫失敗測試**

`lib/stats/__tests__/aggregate.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  dayKey, groupReviewsByDay, dailyAccuracy, dueForecast,
  countMasteredByBook, masteryByBook, stateCounts,
  heatLevel, heatmapCells,
} from '@/lib/stats/aggregate'

const TZ = 'UTC'

describe('dayKey', () => {
  it('formats a date to YYYY-MM-DD in tz', () => {
    expect(dayKey(new Date('2026-07-03T10:00:00Z'), TZ)).toBe('2026-07-03')
  })
})

describe('groupReviewsByDay', () => {
  it('counts reviews per day', () => {
    const m = groupReviewsByDay([
      { reviewedAt: new Date('2026-07-03T01:00:00Z') },
      { reviewedAt: new Date('2026-07-03T20:00:00Z') },
      { reviewedAt: new Date('2026-07-04T05:00:00Z') },
    ], TZ)
    expect(m.get('2026-07-03')).toBe(2)
    expect(m.get('2026-07-04')).toBe(1)
  })
})

describe('dailyAccuracy', () => {
  it('splits correct (rating>=2) vs total per day, ascending', () => {
    const out = dailyAccuracy([
      { reviewedAt: new Date('2026-07-03T01:00:00Z'), rating: 3 },
      { reviewedAt: new Date('2026-07-03T02:00:00Z'), rating: 1 },
      { reviewedAt: new Date('2026-07-02T02:00:00Z'), rating: 4 },
    ], TZ)
    expect(out).toEqual([
      { day: '2026-07-02', correct: 1, total: 1 },
      { day: '2026-07-03', correct: 1, total: 2 },
    ])
  })
})

describe('dueForecast', () => {
  const now = new Date('2026-07-04T08:00:00Z')
  it('buckets next N days, today absorbs overdue, zero-fills', () => {
    const out = dueForecast([
      { due: new Date('2026-07-01T00:00:00Z') }, // overdue -> today
      { due: new Date('2026-07-04T23:00:00Z') }, // today
      { due: new Date('2026-07-06T10:00:00Z') }, // +2
      { due: new Date('2026-08-01T00:00:00Z') }, // beyond -> ignored
    ], now, TZ, 7)
    expect(out.length).toBe(7)
    expect(out[0]).toEqual({ day: '2026-07-04', count: 2 })
    expect(out[2]).toEqual({ day: '2026-07-06', count: 1 })
    expect(out[1]).toEqual({ day: '2026-07-05', count: 0 })
  })
})

describe('countMasteredByBook + masteryByBook', () => {
  it('counts mastered per book and computes pct', () => {
    const counts = countMasteredByBook([
      { mastered: true, wordBookId: 'b1' },
      { mastered: true, wordBookId: 'b1' },
      { mastered: false, wordBookId: 'b1' },
      { mastered: true, wordBookId: 'b2' },
    ])
    const out = masteryByBook(counts, [
      { id: 'b1', slug: 'office', name: '辦公室', wordCount: 4 },
      { id: 'b2', slug: 'finance', name: '財務', wordCount: 0 },
    ])
    expect(out[0]).toEqual({ slug: 'office', name: '辦公室', mastered: 2, total: 4, pct: 50 })
    expect(out[1]).toEqual({ slug: 'finance', name: '財務', mastered: 1, total: 0, pct: 0 })
  })
})

describe('stateCounts', () => {
  it('classifies mastered/review/learning and derives new', () => {
    const out = stateCounts([
      { state: 2, mastered: true },
      { state: 2, mastered: false },
      { state: 1, mastered: false },
      { state: 3, mastered: false },
    ], 10)
    expect(out).toEqual({ newCount: 6, learning: 2, review: 1, mastered: 1, startedTotal: 4 })
  })
})

describe('heatLevel + heatmapCells', () => {
  it('maps counts to levels', () => {
    expect(heatLevel(0)).toBe(0)
    expect(heatLevel(1)).toBe(1)
    expect(heatLevel(3)).toBe(2)
    expect(heatLevel(6)).toBe(3)
  })
  it('produces weeks*7 cells ending today, oldest first', () => {
    const now = new Date('2026-07-04T08:00:00Z')
    const byDay = new Map<string, number>([['2026-07-04', 5], ['2026-06-30', 1]])
    const cells = heatmapCells(byDay, now, TZ, 2) // 14 cells
    expect(cells.length).toBe(14)
    expect(cells[13]).toEqual({ day: '2026-07-04', count: 5, level: 2 })
    expect(cells[0].day).toBe('2026-06-21')
    expect(cells.find((c) => c.day === '2026-06-30')).toEqual({ day: '2026-06-30', count: 1, level: 1 })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/stats/__tests__/aggregate.test.ts`
Expected: FAIL（找不到模組 `@/lib/stats/aggregate`）。

- [ ] **Step 3: 實作 aggregate**

`lib/stats/aggregate.ts`：

```ts
import { todayYmd, daysBetween } from '@/lib/gamification/date'

// 任一 Date 在使用者時區的 YYYY-MM-DD（沿用 gamification 的 todayYmd）。
export function dayKey(d: Date, timezone: string): string {
  return todayYmd(d, timezone)
}

// UTC anchor of a YYYY-MM-DD, so we can step whole calendar days deterministically.
function ymdPlus(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export function groupReviewsByDay(logs: { reviewedAt: Date }[], timezone: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of logs) {
    const k = dayKey(l.reviewedAt, timezone)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export interface DayAccuracy { day: string; correct: number; total: number }
export function dailyAccuracy(logs: { reviewedAt: Date; rating: number }[], timezone: string): DayAccuracy[] {
  const byDay = new Map<string, { correct: number; total: number }>()
  for (const l of logs) {
    const k = dayKey(l.reviewedAt, timezone)
    const cur = byDay.get(k) ?? { correct: 0, total: 0 }
    cur.total += 1
    if (l.rating >= 2) cur.correct += 1
    byDay.set(k, cur)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, correct: v.correct, total: v.total }))
}

export interface DueBucket { day: string; count: number }
export function dueForecast(cards: { due: Date }[], now: Date, timezone: string, days = 7): DueBucket[] {
  const today = todayYmd(now, timezone)
  const keys = Array.from({ length: days }, (_, i) => ymdPlus(today, i))
  const counts = new Map<string, number>(keys.map((k) => [k, 0]))
  for (const c of cards) {
    const k = dayKey(c.due, timezone)
    const idx = daysBetween(today, k) // k - today，天
    if (idx <= 0) counts.set(today, (counts.get(today) ?? 0) + 1)          // 逾期或今日
    else if (idx < days) counts.set(keys[idx], (counts.get(keys[idx]) ?? 0) + 1)
    // idx >= days：超出視界，忽略
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }))
}

export function countMasteredByBook(cards: { mastered: boolean; wordBookId: string }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of cards) if (c.mastered) m.set(c.wordBookId, (m.get(c.wordBookId) ?? 0) + 1)
  return m
}

export interface BookMastery { slug: string; name: string; mastered: number; total: number; pct: number }
export function masteryByBook(
  masteredByBookId: Map<string, number>,
  books: { id: string; slug: string; name: string; wordCount: number }[],
): BookMastery[] {
  return books.map((b) => {
    const mastered = masteredByBookId.get(b.id) ?? 0
    const pct = b.wordCount > 0 ? Math.round((mastered / b.wordCount) * 100) : 0
    return { slug: b.slug, name: b.name, mastered, total: b.wordCount, pct }
  })
}

export interface StateCounts { newCount: number; learning: number; review: number; mastered: number; startedTotal: number }
export function stateCounts(cards: { state: number; mastered: boolean }[], totalWords: number): StateCounts {
  let learning = 0, review = 0, mastered = 0
  for (const c of cards) {
    if (c.mastered) { mastered += 1; continue }
    if (c.state === 2) review += 1  // FSRS Review（已畢業）
    else learning += 1              // Learning/Relearning
  }
  const startedTotal = cards.length
  return { newCount: Math.max(0, totalWords - startedTotal), learning, review, mastered, startedTotal }
}

export type HeatLevel = 0 | 1 | 2 | 3
export interface HeatCell { day: string; count: number; level: HeatLevel }
export const HEAT_THRESHOLDS: [number, number, number] = [1, 3, 6] // >=1 / >=3 / >=6
export function heatLevel(count: number): HeatLevel {
  if (count >= HEAT_THRESHOLDS[2]) return 3
  if (count >= HEAT_THRESHOLDS[1]) return 2
  if (count >= HEAT_THRESHOLDS[0]) return 1
  return 0
}
export function heatmapCells(byDay: Map<string, number>, now: Date, timezone: string, weeks = 12): HeatCell[] {
  const today = todayYmd(now, timezone)
  const total = weeks * 7
  const cells: HeatCell[] = []
  for (let i = total - 1; i >= 0; i--) {
    const day = ymdPlus(today, -i)
    const count = byDay.get(day) ?? 0
    cells.push({ day, count, level: heatLevel(count) })
  }
  return cells
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/stats/__tests__/aggregate.test.ts`
Expected: PASS（全部）。

- [ ] **Step 5: Commit**

```bash
git add lib/stats/aggregate.ts lib/stats/__tests__/aggregate.test.ts
git commit -m "feat(stats): aggregate pure functions (day/accuracy/due/mastery/state/heatmap)"
```

---

### Task 2: StatsRepository

**Files:**
- Create: `lib/stats/repository.ts`
- Test: `lib/stats/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: `getPrisma`（`@/lib/db/client`）。
- Produces:
  - `interface ReviewLogRow { reviewedAt: Date; rating: number }`
  - `interface UserCardRow { state: number; mastered: boolean; due: Date; wordBookId: string }`
  - `interface BookRow { id: string; slug: string; name: string; wordCount: number }`
  - `class StatsRepository`（`constructor(db?)`）:
    - `listReviewLogsSince(userId: string, since: Date): Promise<ReviewLogRow[]>`
    - `listUserCards(userId: string): Promise<UserCardRow[]>`
    - `listBooksWithWordCounts(): Promise<BookRow[]>`
    - `getStreak(userId: string): Promise<{ streak: number; longestStreak: number }>`

- [ ] **Step 1: 寫失敗測試**

`lib/stats/__tests__/repository.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { StatsRepository } from '@/lib/stats/repository'

function makeDb() {
  return {
    reviewLog: { findMany: vi.fn() },
    userCard: { findMany: vi.fn() },
    wordBook: { findMany: vi.fn() },
    gamificationState: { findUnique: vi.fn() },
  }
}

describe('StatsRepository', () => {
  it('listReviewLogsSince filters by user (via userCard) + since', async () => {
    const db = makeDb()
    const since = new Date('2026-06-01T00:00:00Z')
    db.reviewLog.findMany.mockResolvedValue([{ reviewedAt: new Date('2026-06-02T00:00:00Z'), rating: 3 }])
    const repo = new StatsRepository(db as any)
    const out = await repo.listReviewLogsSince('u1', since)
    expect(out).toEqual([{ reviewedAt: new Date('2026-06-02T00:00:00Z'), rating: 3 }])
    expect(db.reviewLog.findMany).toHaveBeenCalledWith({
      where: { userCard: { userId: 'u1' }, reviewedAt: { gte: since } },
      select: { reviewedAt: true, rating: true },
    })
  })

  it('listUserCards flattens word.wordBookId', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([
      { state: 2, mastered: true, due: new Date('2026-07-05T00:00:00Z'), word: { wordBookId: 'b1' } },
    ])
    const repo = new StatsRepository(db as any)
    expect(await repo.listUserCards('u1')).toEqual([
      { state: 2, mastered: true, due: new Date('2026-07-05T00:00:00Z'), wordBookId: 'b1' },
    ])
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: { state: true, mastered: true, due: true, word: { select: { wordBookId: true } } },
    })
  })

  it('listBooksWithWordCounts maps _count.words to wordCount', async () => {
    const db = makeDb()
    db.wordBook.findMany.mockResolvedValue([{ id: 'b1', slug: 'office', name: '辦公室', _count: { words: 12 } }])
    const repo = new StatsRepository(db as any)
    expect(await repo.listBooksWithWordCounts()).toEqual([{ id: 'b1', slug: 'office', name: '辦公室', wordCount: 12 }])
    expect(db.wordBook.findMany).toHaveBeenCalledWith({
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, name: true, _count: { select: { words: true } } },
    })
  })

  it('getStreak reads gamificationState, defaults 0 when no row', async () => {
    const db = makeDb()
    db.gamificationState.findUnique.mockResolvedValue(null)
    const repo = new StatsRepository(db as any)
    expect(await repo.getStreak('u1')).toEqual({ streak: 0, longestStreak: 0 })
    db.gamificationState.findUnique.mockResolvedValue({ streak: 4, longestStreak: 9 })
    expect(await repo.getStreak('u1')).toEqual({ streak: 4, longestStreak: 9 })
    expect(db.gamificationState.findUnique).toHaveBeenLastCalledWith({
      where: { userId: 'u1' }, select: { streak: true, longestStreak: true },
    })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/stats/__tests__/repository.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 實作 repository**

`lib/stats/repository.ts`：

```ts
import { getPrisma } from '@/lib/db/client'

interface StatsDb {
  reviewLog: { findMany(args: unknown): Promise<unknown[]> }
  userCard: { findMany(args: unknown): Promise<unknown[]> }
  wordBook: { findMany(args: unknown): Promise<unknown[]> }
  gamificationState: { findUnique(args: unknown): Promise<unknown | null> }
}

export interface ReviewLogRow { reviewedAt: Date; rating: number }
export interface UserCardRow { state: number; mastered: boolean; due: Date; wordBookId: string }
export interface BookRow { id: string; slug: string; name: string; wordCount: number }

export class StatsRepository {
  private readonly db: StatsDb
  constructor(db?: StatsDb) {
    this.db = db ?? (getPrisma() as unknown as StatsDb)
  }

  async listReviewLogsSince(userId: string, since: Date): Promise<ReviewLogRow[]> {
    return (await this.db.reviewLog.findMany({
      where: { userCard: { userId }, reviewedAt: { gte: since } },
      select: { reviewedAt: true, rating: true },
    })) as ReviewLogRow[]
  }

  async listUserCards(userId: string): Promise<UserCardRow[]> {
    const rows = (await this.db.userCard.findMany({
      where: { userId },
      select: { state: true, mastered: true, due: true, word: { select: { wordBookId: true } } },
    })) as { state: number; mastered: boolean; due: Date; word: { wordBookId: string } }[]
    return rows.map((r) => ({ state: r.state, mastered: r.mastered, due: r.due, wordBookId: r.word.wordBookId }))
  }

  async listBooksWithWordCounts(): Promise<BookRow[]> {
    const rows = (await this.db.wordBook.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, name: true, _count: { select: { words: true } } },
    })) as { id: string; slug: string; name: string; _count: { words: number } }[]
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, wordCount: r._count.words }))
  }

  async getStreak(userId: string): Promise<{ streak: number; longestStreak: number }> {
    const row = (await this.db.gamificationState.findUnique({
      where: { userId }, select: { streak: true, longestStreak: true },
    })) as { streak: number; longestStreak: number } | null
    return { streak: row?.streak ?? 0, longestStreak: row?.longestStreak ?? 0 }
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/stats/__tests__/repository.test.ts`
Expected: PASS（4 個測試）。

- [ ] **Step 5: Commit**

```bash
git add lib/stats/repository.ts lib/stats/__tests__/repository.test.ts
git commit -m "feat(stats): StatsRepository (review logs / user cards / books / streak)"
```

---

### Task 3: StatsService

**Files:**
- Create: `lib/stats/service.ts`
- Test: `lib/stats/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `StatsRepository`（Task 2）、aggregate 純函式與型別（Task 1）。
- Produces:
  - `interface Dashboard { progress: { states: StateCounts; totalWords: number; byBook: BookMastery[] }; activity: { cells: HeatCell[]; streak: number; longestStreak: number }; accuracy: { daily: DayAccuracy[]; overallPct: number; window: number }; dueForecast: DueBucket[] }`
  - `class StatsService`（`constructor(repo?)`）：`getDashboard(userId: string, now: Date, timezone: string): Promise<Dashboard>`
  - `const statsService: StatsService`
  - 常數：`ACCURACY_DAYS = 30`、`HEATMAP_WEEKS = 12`、`FORECAST_DAYS = 7`（module-scope）。

- [ ] **Step 1: 寫失敗測試**

`lib/stats/__tests__/service.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { StatsService } from '@/lib/stats/service'

const now = new Date('2026-07-04T08:00:00Z')
const TZ = 'UTC'

function makeRepo(over: Partial<Record<string, any>> = {}) {
  return {
    listReviewLogsSince: vi.fn().mockResolvedValue([
      { reviewedAt: new Date('2026-07-04T01:00:00Z'), rating: 3 },
      { reviewedAt: new Date('2026-07-04T02:00:00Z'), rating: 1 },
      { reviewedAt: new Date('2026-07-03T02:00:00Z'), rating: 4 },
    ]),
    listUserCards: vi.fn().mockResolvedValue([
      { state: 2, mastered: true, due: new Date('2026-07-04T23:00:00Z'), wordBookId: 'b1' },
      { state: 1, mastered: false, due: new Date('2026-07-06T00:00:00Z'), wordBookId: 'b1' },
    ]),
    listBooksWithWordCounts: vi.fn().mockResolvedValue([
      { id: 'b1', slug: 'office', name: '辦公室', wordCount: 4 },
    ]),
    getStreak: vi.fn().mockResolvedValue({ streak: 3, longestStreak: 9 }),
    ...over,
  }
}

describe('StatsService.getDashboard', () => {
  it('composes the four view models', async () => {
    const svc = new StatsService(makeRepo() as any)
    const d = await svc.getDashboard('u1', now, TZ)

    // progress
    expect(d.progress.totalWords).toBe(4)
    expect(d.progress.states).toEqual({ newCount: 2, learning: 1, review: 0, mastered: 1, startedTotal: 2 })
    expect(d.progress.byBook).toEqual([{ slug: 'office', name: '辦公室', mastered: 1, total: 4, pct: 25 }])

    // activity
    expect(d.activity.cells.length).toBe(12 * 7)
    expect(d.activity.cells[d.activity.cells.length - 1]).toMatchObject({ day: '2026-07-04', count: 2 })
    expect(d.activity.streak).toBe(3)
    expect(d.activity.longestStreak).toBe(9)

    // accuracy (window 30)
    expect(d.accuracy.window).toBe(30)
    expect(d.accuracy.overallPct).toBe(67) // 2 correct of 3
    expect(d.accuracy.daily).toEqual([
      { day: '2026-07-03', correct: 1, total: 1 },
      { day: '2026-07-04', correct: 1, total: 2 },
    ])

    // due forecast (7 buckets, today absorbs overdue)
    expect(d.dueForecast.length).toBe(7)
    expect(d.dueForecast[0]).toEqual({ day: '2026-07-04', count: 1 })
    expect(d.dueForecast[2]).toEqual({ day: '2026-07-06', count: 1 })
  })

  it('requests review logs since ~12 weeks before now', async () => {
    const repo = makeRepo()
    const svc = new StatsService(repo as any)
    await svc.getDashboard('u1', now, TZ)
    const since = repo.listReviewLogsSince.mock.calls[0][1] as Date
    const deltaDays = Math.round((now.getTime() - since.getTime()) / 86_400_000)
    expect(deltaDays).toBe(12 * 7)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/stats/__tests__/service.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 實作 service**

`lib/stats/service.ts`：

```ts
import { StatsRepository } from './repository'
import {
  groupReviewsByDay, dailyAccuracy, dueForecast, heatmapCells,
  countMasteredByBook, masteryByBook, stateCounts,
  type DayAccuracy, type DueBucket, type HeatCell, type BookMastery, type StateCounts,
} from './aggregate'

export const ACCURACY_DAYS = 30
export const HEATMAP_WEEKS = 12
export const FORECAST_DAYS = 7

export interface Dashboard {
  progress: { states: StateCounts; totalWords: number; byBook: BookMastery[] }
  activity: { cells: HeatCell[]; streak: number; longestStreak: number }
  accuracy: { daily: DayAccuracy[]; overallPct: number; window: number }
  dueForecast: DueBucket[]
}

const DAY_MS = 86_400_000

export class StatsService {
  private readonly repo: StatsRepository
  constructor(repo?: StatsRepository) {
    this.repo = repo ?? new StatsRepository()
  }

  async getDashboard(userId: string, now: Date, timezone: string): Promise<Dashboard> {
    const since = new Date(now.getTime() - HEATMAP_WEEKS * 7 * DAY_MS)
    const [logs, cards, books, streakInfo] = await Promise.all([
      this.repo.listReviewLogsSince(userId, since),
      this.repo.listUserCards(userId),
      this.repo.listBooksWithWordCounts(),
      this.repo.getStreak(userId),
    ])

    const totalWords = books.reduce((s, b) => s + b.wordCount, 0)
    const states = stateCounts(cards, totalWords)
    const byBook = masteryByBook(countMasteredByBook(cards), books)

    const cells = heatmapCells(groupReviewsByDay(logs, timezone), now, timezone, HEATMAP_WEEKS)

    const accSince = new Date(now.getTime() - ACCURACY_DAYS * DAY_MS)
    const recent = logs.filter((l) => l.reviewedAt >= accSince)
    const daily = dailyAccuracy(recent, timezone)
    const correct = recent.reduce((s, l) => s + (l.rating >= 2 ? 1 : 0), 0)
    const overallPct = recent.length > 0 ? Math.round((correct / recent.length) * 100) : 0

    return {
      progress: { states, totalWords, byBook },
      activity: { cells, streak: streakInfo.streak, longestStreak: streakInfo.longestStreak },
      accuracy: { daily, overallPct, window: ACCURACY_DAYS },
      dueForecast: dueForecast(cards, now, timezone, FORECAST_DAYS),
    }
  }
}

export const statsService = new StatsService()
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/stats/__tests__/service.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/stats/service.ts lib/stats/__tests__/service.test.ts
git commit -m "feat(stats): StatsService.getDashboard composes four view models"
```

---

### Task 4: 圖表元件（純表現）

**Files:**
- Create: `components/stats/heatmap.tsx`, `components/stats/accuracy-bars.tsx`, `components/stats/due-bars.tsx`, `components/stats/state-distribution.tsx`

**Interfaces:**
- Consumes: `HeatCell`/`DayAccuracy`/`DueBucket`/`StateCounts`（`@/lib/stats/aggregate`）、`clampPct`（`@/components/ui/progress-bar`）。
- Produces: 四個純表現元件，接收已算好的 view model，不查詢、不含業務邏輯。皆為 server-renderable（無 hooks / 無 `'use client'`）。

> 純表現、資料已被 Task 1 測過 → 本任務不加單元測試，驗證為 `tsc`+`build`（比照既有 `components/ui/*` 表現元件）。若有互動（hover tooltip）非本輪範圍。

- [ ] **Step 1: 實作 `components/stats/heatmap.tsx`**

```tsx
import type { HeatCell } from '@/lib/stats/aggregate'

const LEVEL_BG: Record<number, string> = {
  0: 'bg-primary-50',
  1: 'bg-primary-200',
  2: 'bg-primary-400',
  3: 'bg-primary-600',
}

// cells 為 oldest→today、長度 weeks*7。以 7 列（週日→週六無關，純視覺）縱向排、逐週成欄。
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid grid-flow-col gap-1"
        style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
      >
        {cells.map((c) => (
          <div
            key={c.day}
            title={`${c.day}：${c.count} 次`}
            className={`h-3 w-3 rounded-[3px] ${LEVEL_BG[c.level]}`}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 實作 `components/stats/accuracy-bars.tsx`**

```tsx
import type { DayAccuracy } from '@/lib/stats/aggregate'

// 只畫有複習的日；高度＝該日答對率 %。空資料顯示提示。
export function AccuracyBars({ daily }: { daily: DayAccuracy[] }) {
  if (daily.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-600">近 30 天還沒有複習紀錄。</p>
  }
  return (
    <div className="flex h-32 items-end gap-1 overflow-x-auto">
      {daily.map((d) => {
        const pct = Math.round((d.correct / d.total) * 100)
        return (
          <div key={d.day} className="flex min-w-[8px] flex-1 flex-col items-center gap-1" title={`${d.day}：${d.correct}/${d.total}（${pct}%）`}>
            <div className="flex h-full w-full items-end">
              <div className="w-full rounded-t-[3px] bg-primary-500" style={{ height: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: 實作 `components/stats/due-bars.tsx`**

```tsx
import type { DueBucket } from '@/lib/stats/aggregate'
import { clampPct } from '@/components/ui/progress-bar'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
function weekdayLabel(ymd: string): string {
  return WEEKDAY[new Date(`${ymd}T00:00:00Z`).getUTCDay()]
}

export function DueBars({ buckets }: { buckets: DueBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="flex h-32 items-end gap-2">
      {buckets.map((b, i) => (
        <div key={b.day} className="flex flex-1 flex-col items-center gap-1" title={`${b.day}：${b.count} 張`}>
          <span className="text-xs font-bold text-neutral-900">{b.count}</span>
          <div className="flex h-full w-full items-end">
            <div className="w-full rounded-t-[3px] bg-primary-400" style={{ height: `${clampPct(b.count, max)}%` }} />
          </div>
          <span className="text-xs text-neutral-600">{i === 0 ? '今天' : weekdayLabel(b.day)}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 實作 `components/stats/state-distribution.tsx`**

```tsx
import type { StateCounts } from '@/lib/stats/aggregate'

const SEGMENTS: { key: keyof StateCounts; label: string; bg: string }[] = [
  { key: 'mastered', label: '精熟', bg: 'bg-primary-600' },
  { key: 'review', label: '複習中', bg: 'bg-primary-400' },
  { key: 'learning', label: '學習中', bg: 'bg-primary-200' },
  { key: 'newCount', label: '未開始', bg: 'bg-neutral-200' },
]

export function StateDistribution({ states, totalWords }: { states: StateCounts; totalWords: number }) {
  const denom = Math.max(1, totalWords)
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-pill">
        {SEGMENTS.map((s) => {
          const v = states[s.key]
          if (v <= 0) return null
          return <div key={s.key} className={s.bg} style={{ width: `${(v / denom) * 100}%` }} title={`${s.label}：${v}`} />
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${s.bg}`} />{s.label} {states[s.key]}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 型別 + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功。

- [ ] **Step 6: Commit**

```bash
git add components/stats/
git commit -m "feat(stats): heatmap / accuracy / due / state-distribution chart components"
```

---

### Task 5: `/stats` 頁 + 入口

**Files:**
- Create: `app/stats/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`、`statsService.getDashboard`、四個圖表元件、`Card`、`ProgressBar`、`GamificationBar`。

> 時區暫硬編 `'Asia/Taipei'`（比照 `/leaderboard`；目前無 per-user tz UI，`User.timezone` 預設 Taipei）。啟用 per-user 時區後改。

- [ ] **Step 1: 實作 `app/stats/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { statsService } from '@/lib/stats/service'
import { GamificationBar } from '@/components/gamification-bar'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Heatmap } from '@/components/stats/heatmap'
import { AccuracyBars } from '@/components/stats/accuracy-bars'
import { DueBars } from '@/components/stats/due-bars'
import { StateDistribution } from '@/components/stats/state-distribution'

export default async function StatsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const tz = 'Asia/Taipei'
  const d = await statsService.getDashboard(user.id, new Date(), tz)

  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
        <h1 className="mt-2 mb-6 text-2xl font-extrabold text-neutral-900">學習數據</h1>

        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-extrabold text-neutral-900">學習進度</h2>
            <div className="flex gap-6">
              <div><div className="text-2xl font-extrabold text-primary-600">{d.progress.states.mastered}</div><div className="text-xs text-neutral-600">已精熟</div></div>
              <div><div className="text-2xl font-extrabold text-neutral-900">{d.progress.states.startedTotal}</div><div className="text-xs text-neutral-600">已開始</div></div>
              <div><div className="text-2xl font-extrabold text-neutral-900">{d.progress.totalWords}</div><div className="text-xs text-neutral-600">總字數</div></div>
            </div>
            <StateDistribution states={d.progress.states} totalWords={d.progress.totalWords} />
            <div className="space-y-2 pt-2">
              {d.progress.byBook.map((b) => (
                <div key={b.slug} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-neutral-600"><span>{b.name}</span><span>{b.mastered}/{b.total}（{b.pct}%）</span></div>
                  <ProgressBar value={b.mastered} max={b.total} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold text-neutral-900">活躍紀錄</h2>
              <span className="text-xs font-bold text-primary-600">🔥 {d.activity.streak} 天（最長 {d.activity.longestStreak}）</span>
            </div>
            <Heatmap cells={d.activity.cells} />
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold text-neutral-900">正確率趨勢</h2>
              <span className="text-xs font-bold text-primary-600">近 {d.accuracy.window} 天 {d.accuracy.overallPct}%</span>
            </div>
            <AccuracyBars daily={d.accuracy.daily} />
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-extrabold text-neutral-900">到期預報（7 天）</h2>
            <DueBars buckets={d.dueForecast} />
          </Card>
        </div>
      </main>
    </>
  )
}
```

- [ ] **Step 2: 首頁加入口**（`app/page.tsx`）

在既有 `<Link href="/shop" ...>前往商店 🛍️</Link>` 之後、`<SignOutButton />` 之前插入：

```tsx
        <Link href="/stats" className="text-sm font-bold text-primary-600 hover:underline">學習數據 📊</Link>
```

- [ ] **Step 3: 型別 + build + 測試**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功（輸出含 `/stats` 路由）、全綠。

- [ ] **Step 4: Commit**

```bash
git add app/stats/ app/page.tsx
git commit -m "feat(stats): /stats dashboard page + home entry"
```

---

### Task 6: 全量驗證 + 手動 e2e

**Files:** 無（驗證）

- [ ] **Step 1: 全量測試 + 型別 + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 全綠、乾淨、成功，輸出含 `/stats` 路由。

- [ ] **Step 2: 手動 e2e（dev）**

`npm run dev`，登入後（帳號需已有複習紀錄）：
- 到 `/stats`：四塊卡片皆顯示。
- 學習進度：精熟/已開始/總字數數字合理；狀態分段條與每書進度條正確。
- 活躍紀錄：熱力圖近 12 週、今日格子反映今日複習量；streak 顯示。
- 正確率趨勢：近 30 天有複習的日有長條；總體 % 合理。
- 到期預報：7 天長條、今日含逾期。
- 由首頁「學習數據 📊」入口可達。
驗證後關閉 dev server。

- [ ] **Step 3: 最終 commit（若有微調）**

```bash
git add -A && git commit -m "test(stats): verification pass"
```

---

## Self-Review

**1. Spec coverage：**
- §2 模組（lib/stats：aggregate/repository/service，唯讀、不訂閱、不改核心）→ Task 1/2/3 ✓
- §3 判定規則（rating>=2 對、mastered、new=totalWords-started、tz 用 todayYmd）→ Task 1 純函式 + 測試 ✓
- §4.1 進度/精熟（頭條、每書進度條、狀態分佈）→ Task 3 progress + Task 4 StateDistribution + Task 5 頁 ✓
- §4.2 活躍熱力圖 12 週 + streak → Task 1 heatmapCells + Task 4 Heatmap + Task 3 activity ✓
- §4.3 正確率 30 天、只畫有複習日、頭條近 30 天總體 → Task 1 dailyAccuracy + Task 3 accuracy + Task 4 AccuracyBars ✓
- §4.4 到期預報 7 天、今日含逾期 → Task 1 dueForecast + Task 4 DueBars ✓
- §5 /stats server 頁 + GamificationBar + 入口 → Task 5 ✓
- §6 純函式/repository/service 測試 → Task 1/2/3 TDD + Task 6 ✓
- §7 成本（無 cron/AI/新依賴、平行查詢）→ Task 3 Promise.all；圖表自繪 ✓
- §8 排除（XP 曲線/匯出/深色/PWA）→ 未納入 ✓
- §9 參數（12 週/30 天/7 天、路由 /stats）→ Task 3 常數 + Task 5 ✓

**2. Placeholder scan：** 無 TBD/「適當處理」；每個 code step 皆含完整程式或精確編輯。Task 4 明列「不加單元測試」理由（純表現、資料已測），非佔位。✓

**3. Type consistency：**
- aggregate 型別（`DayAccuracy`/`DueBucket`/`HeatCell`/`HeatLevel`/`BookMastery`/`StateCounts`）→ service `Dashboard`、圖表元件 props 一致。✓
- repository row 型別（`ReviewLogRow`/`UserCardRow`/`BookRow`）→ service 使用（logs/cards/books 欄位）一致；`getStreak` 回 `{streak,longestStreak}` → service `activity` 一致。✓
- `StatsService.getDashboard(userId, now, timezone)` → `/stats` 頁呼叫一致。✓
- `clampPct(value, max)`（既有）→ DueBars 使用一致。✓
- `todayYmd`/`daysBetween`（既有）→ aggregate 使用一致；`dayKey` 委派 `todayYmd`。✓
- 常數 `ACCURACY_DAYS/HEATMAP_WEEKS/FORECAST_DAYS` → service 內部與測試斷言一致（30/12/7）。✓
