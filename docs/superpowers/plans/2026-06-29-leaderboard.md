# 排行榜（P4c）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加入每週 XP 榜 + 全時 XP 總榜（分頁籤、暱稱 + opt-in），並把答案判定改為後端權威（防作弊）。

**Architecture:** 後端判定答對與否（server action 載入該字、用既有純函式比對）；`GamificationState` 加每週 XP 欄位（懶重置）；新 `lib/leaderboard` 模組唯讀查詢排名；新 `/leaderboard`、`/settings` 頁。

**Tech Stack:** Next.js 16 App Router、Prisma 7（Neon HTTP）、React 19、Vitest。

## Global Constraints

- **資安鐵則**（CLAUDE.md）：前端只呈現；影響排名/共享狀態的值一律後端權威判定，不信任前端。本輪：`correct` 由 server 依該字重新判定。
- 既有測試（127）須全綠；`tsc`+`build` 乾淨。
- 資料存取經 repository；Neon HTTP 單筆寫入、無 `$transaction`/`upsert`/`createMany`。
- 週界線＝使用者時區當週**週一**（YYYY-MM-DD）；週欄位懶重置、無 cron。
- 隱私：暱稱（預設 `User.name`、可改）+ `leaderboardOptIn`（預設 false）；榜上不顯示真名/頭像。
- 榜單長度 **Top 50** + 「你的名次」。
- 沿用既有 UI 元件（Card/StatPill、tokens）；繁中文案。

---

## File Structure

**新增**
- `lib/leaderboard/rank.ts` — 純函式 `rankFromCountAbove`、`displayNameOf`。
- `lib/leaderboard/repository.ts` — `LeaderboardRepository`（榜單/計數/本人狀態查詢）。
- `lib/leaderboard/service.ts` — `LeaderboardService.getBoard`。
- `lib/leaderboard/__tests__/*.test.ts` — rank/repository/service。
- `lib/user/settings.ts` — `getUserSettings`/`updateUserSettings`（User 暱稱 + opt-in）。
- `app/leaderboard/page.tsx` + `app/leaderboard/tabs.tsx`（client 切頁籤）。
- `app/settings/page.tsx` + `app/settings/actions.ts`。

**修改**
- `prisma/schema.prisma`（GamificationState + User 欄位）。
- `lib/gamification/types.ts`（`GamificationStateData` +weeklyXp/weekStartDate）、`lib/gamification/service.ts`（applyReview 週追蹤 + DEFAULT_STATE）。
- `lib/gamification/date.ts`（+`weekStartYmd`）。
- `lib/content/repository.ts`（+`getWordCore`）。
- `app/learn/[slug]/actions.ts`（`submitAnswerAction` 後端判定）+ `components/review-session.tsx`（送 userAnswer）。
- `components/gamification-bar.tsx` 或 `app/page.tsx`（加 /leaderboard 入口）。

---

## Task 1: Schema — 週 XP 欄位 + User 榜單欄位

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: 在 `GamificationState` model 內新增兩欄**（接在 `streakFreezes` 後）：
```prisma
  weeklyXp       Int      @default(0)
  weekStartDate  String?
```

- [ ] **Step 2: 在 `User` model 內新增兩欄**（接在 `dailyGoal` 後）：
```prisma
  displayName      String?
  leaderboardOptIn Boolean  @default(false)
```

- [ ] **Step 3: 驗證 + 套用**

Run: `npx prisma validate && npx prisma generate`
Expected: schema valid、client 產生。
Run: `npm run db:push`
Expected: 同步成功（純新增欄位）。

- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(leaderboard): schema — weekly XP fields + User displayName/leaderboardOptIn"
```

---

## Task 2: weekStartYmd + 每週 XP 追蹤

**Files:**
- Modify: `lib/gamification/date.ts`, `lib/gamification/types.ts`, `lib/gamification/service.ts`
- Test: `lib/gamification/__tests__/date.test.ts`, `lib/gamification/__tests__/service.test.ts`

**Interfaces:**
- Produces: `weekStartYmd(now: Date, timezone: string): string`（當週週一 YYYY-MM-DD）；`GamificationStateData` 多 `weeklyXp: number`、`weekStartDate: string | null`。

- [ ] **Step 1: 追加 weekStartYmd 失敗測試**（`lib/gamification/__tests__/date.test.ts`）
```ts
import { weekStartYmd } from '@/lib/gamification/date'
describe('weekStartYmd', () => {
  it('returns Monday of the week (UTC tz)', () => {
    // 2026-06-29 is a Monday
    expect(weekStartYmd(new Date('2026-06-29T10:00:00Z'), 'UTC')).toBe('2026-06-29')
    // 2026-07-01 Wed → same Monday
    expect(weekStartYmd(new Date('2026-07-01T10:00:00Z'), 'UTC')).toBe('2026-06-29')
    // 2026-06-28 Sunday → previous Monday 06-22
    expect(weekStartYmd(new Date('2026-06-28T10:00:00Z'), 'UTC')).toBe('2026-06-22')
  })
  it('respects timezone (Asia/Taipei crosses into Monday)', () => {
    // 2026-06-28T20:00Z = Mon 04:00 Taipei → that week's Monday 06-29
    expect(weekStartYmd(new Date('2026-06-28T20:00:00Z'), 'Asia/Taipei')).toBe('2026-06-29')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**
Run: `npx vitest run lib/gamification/__tests__/date.test.ts`
Expected: FAIL（weekStartYmd 未定義）。

- [ ] **Step 3: 實作 weekStartYmd**（`lib/gamification/date.ts`，加在檔尾）
```ts
// 回傳「now 在該時區當週的週一」YYYY-MM-DD。
export function weekStartYmd(now: Date, timezone: string): string {
  const today = todayYmd(now, timezone)
  const d = new Date(`${today}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun..6=Sat
  const diff = dow === 0 ? 6 : dow - 1 // 距週一的天數
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: 擴充型別 + 預設**（`lib/gamification/types.ts`：在 `streakFreezes` 後加）
```ts
  streakFreezes: number
  weeklyXp: number
  weekStartDate: string | null
```
（`lib/gamification/service.ts` 的 `DEFAULT_STATE` 加 `weeklyXp: 0, weekStartDate: null`。）

- [ ] **Step 5: applyReview 週追蹤 — 追加失敗測試**（`lib/gamification/__tests__/service.test.ts` 內 applyReview describe 追加）
```ts
  it('accumulates weeklyXp and resets on a new week', async () => {
    // now = 2026-06-29 (Mon) Asia/Taipei → weekStart 2026-06-29; prev week differs → reset then +10
    const repo = repoWith({ ...base, weeklyXp: 99, weekStartDate: '2026-06-22' })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now: new Date('2026-06-29T02:00:00Z') })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ weeklyXp: 10, weekStartDate: '2026-06-29' }), true)
  })
  it('adds to weeklyXp within the same week', async () => {
    const repo = repoWith({ ...base, weeklyXp: 40, weekStartDate: '2026-06-29' })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: false, mastered: false, now: new Date('2026-06-30T02:00:00Z') })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ weeklyXp: 42, weekStartDate: '2026-06-29' }), true)
  })
```
（注意：`repoWith`/`base` 為既有測試 helper；`base` 需含 `weeklyXp:0, weekStartDate:null` —— 在既有 `base` 物件補這兩欄。）

- [ ] **Step 6: 跑測試確認失敗**
Run: `npx vitest run lib/gamification/__tests__/service.test.ts`
Expected: FAIL（weekly 未實作）。

- [ ] **Step 7: 實作 applyReview 週追蹤**（`lib/gamification/service.ts`）
在 `const today = todayYmd(...)` 後加：
```ts
    const weekStart = weekStartYmd(now, ctx.timezone)
    const weeklyXp = (prev.weekStartDate === weekStart ? prev.weeklyXp : 0) + xpGained
```
（`xpGained` 已在下方計算——將上面這行移到 `xpGained` 之後，或直接在 `next` 物件前計算 `weeklyXp`。把 `weekStartYmd` 加入 `./date` 的 import。）
把 `next` 物件擴為：
```ts
    const next: GamificationStateData = {
      xp, level, coinBalance, streak, longestStreak, lastGoalDate, reviewsToday, lastReviewDate: today, streakFreezes,
      weeklyXp, weekStartDate: weekStart,
    }
```

- [ ] **Step 8: 跑測試確認通過 + 全量**
Run: `npx vitest run lib/gamification/__tests__/ && npx tsc --noEmit`
Expected: PASS、乾淨。（既有 service/date 測試的 state 物件若缺 weeklyXp/weekStartDate，TypeScript 視為選填？否 → 補 base。確保編譯通過。）

- [ ] **Step 9: Commit**
```bash
git add lib/gamification/date.ts lib/gamification/types.ts lib/gamification/service.ts lib/gamification/__tests__/date.test.ts lib/gamification/__tests__/service.test.ts
git commit -m "feat(leaderboard): weekly XP tracking (weekStartYmd + applyReview lazy reset)"
```

---

## Task 3: 後端權威判定答案（防作弊）

**Files:**
- Modify: `lib/content/repository.ts`, `app/learn/[slug]/actions.ts`, `components/review-session.tsx`
- Test: `lib/content/__tests__/repository.test.ts`

**Interfaces:**
- Produces: `ContentRepository.getWordCore(id: string): Promise<{ headword: string; definitionZh: string } | null>`；`submitAnswerAction(wordId: string, questionType: 'mc'|'cloze'|'typing', userAnswer: string): Promise<{ ok: boolean; mastered: boolean; correct: boolean; reward: ReviewReward | null }>`。

- [ ] **Step 1: getWordCore 失敗測試**（`lib/content/__tests__/repository.test.ts` 追加）
```ts
  it('getWordCore returns headword + definitionZh', async () => {
    const db = makeDb()
    db.word.findUnique.mockResolvedValue({ headword: 'invoice', definitionZh: '發票' })
    const repo = new ContentRepository(db as any)
    expect(await repo.getWordCore('w1')).toEqual({ headword: 'invoice', definitionZh: '發票' })
    expect(db.word.findUnique).toHaveBeenCalledWith({ where: { id: 'w1' }, select: { headword: true, definitionZh: true } })
  })
```
（`makeDb` 為既有 helper；若其 `word` 沒有 `findUnique` mock，補上 `findUnique: vi.fn()`。）

- [ ] **Step 2: 跑測試確認失敗**
Run: `npx vitest run lib/content/__tests__/repository.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作 getWordCore**（`lib/content/repository.ts`，加在 class 內）
```ts
  async getWordCore(id: string): Promise<{ headword: string; definitionZh: string } | null> {
    const row = (await this.db.word.findUnique({ where: { id }, select: { headword: true, definitionZh: true } })) as
      { headword: string; definitionZh: string } | null
    return row
  }
```

- [ ] **Step 4: 後端判定 — 改寫 `app/learn/[slug]/actions.ts` 的 `submitAnswerAction`**
```ts
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
```
（`finishSessionAction` 維持不變 —— 其數值僅供顯示/事件/非排名徽章，見 spec 盤點。）

- [ ] **Step 5: review-session 改送 userAnswer**（`components/review-session.tsx`）
`commit` 改為接收使用者作答字串、本地仍算一次只供即時顯示：
```tsx
  async function commit(userAnswer: string) {
    if (busy) return
    setBusy(true)
    const localCorrect = evaluate(userAnswer)
    setResult({ correct: localCorrect })
    if (localCorrect) setCorrectCount((n) => n + 1)
    try {
      const res = await submitAnswerAction(q.wordId, q.type, userAnswer)
      const r = res.reward
      if (r) {
        setRewards((prev) => ({
          xp: prev.xp + r.xpGained,
          coins: prev.coins + r.coinsGained,
          level: r.leveledUpTo ?? prev.level,
          badges: [...prev.badges, ...r.newBadges],
        }))
      }
    } catch { /* 讓使用者繼續 */ }
    setBusy(false)
  }
```
`onPick`/`onSubmitText` 改為傳作答字串：
```tsx
  function onPick(opt: string) { if (result) return; setPicked(opt); void commit(opt) }
  function onSubmitText(e: React.FormEvent) { e.preventDefault(); if (result || !input.trim()) return; void commit(input) }
```
（`evaluate` 保留作本地顯示判定；`correctCount` 仍以本地計，僅供結束畫面顯示/非排名徽章。）

- [ ] **Step 6: tsc + build + 既有測試**
Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、全綠（submit.test 不受影響；review-session 為 client）。

- [ ] **Step 7: Commit**
```bash
git add lib/content/repository.ts lib/content/__tests__/repository.test.ts app/learn/[slug]/actions.ts components/review-session.tsx
git commit -m "feat(security): server-authoritative answer check (submitAnswerAction re-derives correct)"
```

---

## Task 4: leaderboard 模組（rank + repository + service）

**Files:**
- Create: `lib/leaderboard/rank.ts`, `lib/leaderboard/repository.ts`, `lib/leaderboard/service.ts`, `lib/leaderboard/__tests__/leaderboard.test.ts`

**Interfaces:**
- Produces:
  - `rankFromCountAbove(countAbove: number): number`、`displayNameOf(u: { displayName?: string|null; name?: string|null }): string`
  - `LeaderboardRepository`：`topAllTime(limit)`、`topWeekly(limit, weekStart)`、`countAboveAllTime(xp)`、`countAboveWeekly(weeklyXp, weekStart)`、`getStanding(userId)`
  - `LeaderboardService.getBoard(userId, tab: 'weekly'|'allTime', now, timezone): Promise<{ entries: { rank; name; value; isMe }[]; myRank: number | null; optedIn: boolean }>`

- [ ] **Step 1: 純函式失敗測試**（`lib/leaderboard/__tests__/leaderboard.test.ts`）
```ts
import { describe, it, expect, vi } from 'vitest'
import { rankFromCountAbove, displayNameOf } from '@/lib/leaderboard/rank'
import { LeaderboardService } from '@/lib/leaderboard/service'

describe('rank helpers', () => {
  it('rank = countAbove + 1', () => { expect(rankFromCountAbove(0)).toBe(1); expect(rankFromCountAbove(7)).toBe(8) })
  it('displayNameOf prefers displayName, then name, then 匿名', () => {
    expect(displayNameOf({ displayName: '阿翔', name: 'Chen' })).toBe('阿翔')
    expect(displayNameOf({ displayName: null, name: 'Chen' })).toBe('Chen')
    expect(displayNameOf({ displayName: null, name: null })).toBe('匿名')
  })
})

function repo(over: Partial<Record<string, any>> = {}) {
  return {
    topAllTime: vi.fn().mockResolvedValue([
      { userId: 'a', xp: 300, user: { displayName: 'A', name: null } },
      { userId: 'me', xp: 100, user: { displayName: null, name: 'Me' } },
    ]),
    topWeekly: vi.fn().mockResolvedValue([{ userId: 'me', weeklyXp: 50, user: { displayName: null, name: 'Me' } }]),
    countAboveAllTime: vi.fn().mockResolvedValue(1),
    countAboveWeekly: vi.fn().mockResolvedValue(0),
    getStanding: vi.fn().mockResolvedValue({ xp: 100, weeklyXp: 50, weekStartDate: '2026-06-29', optedIn: true }),
    ...over,
  }
}
const now = new Date('2026-06-29T02:00:00Z')

describe('getBoard allTime', () => {
  it('returns entries with ranks, isMe, myRank', async () => {
    const svc = new LeaderboardService(repo() as any)
    const b = await svc.getBoard('me', 'allTime', now, 'Asia/Taipei')
    expect(b.optedIn).toBe(true)
    expect(b.entries[0]).toEqual({ rank: 1, name: 'A', value: 300, isMe: false })
    expect(b.entries[1]).toEqual({ rank: 2, name: 'Me', value: 100, isMe: true })
    expect(b.myRank).toBe(2) // countAboveAllTime 1 → rank 2
  })
})

describe('getBoard weekly', () => {
  it('uses weekly metric and current week', async () => {
    const r = repo()
    const svc = new LeaderboardService(r as any)
    const b = await svc.getBoard('me', 'weekly', now, 'Asia/Taipei')
    expect(r.topWeekly).toHaveBeenCalledWith(50, '2026-06-29')
    expect(b.entries[0]).toEqual({ rank: 1, name: 'Me', value: 50, isMe: true })
    expect(b.myRank).toBe(1)
  })
  it('myRank uses weekly=0 when standing is from a previous week', async () => {
    const r = repo({ getStanding: vi.fn().mockResolvedValue({ xp: 100, weeklyXp: 999, weekStartDate: '2026-06-22', optedIn: true }), countAboveWeekly: vi.fn().mockResolvedValue(3) })
    const svc = new LeaderboardService(r as any)
    const b = await svc.getBoard('me', 'weekly', now, 'Asia/Taipei')
    expect(r.countAboveWeekly).toHaveBeenCalledWith(0, '2026-06-29') // stale week → 0
    expect(b.myRank).toBe(4)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**
Run: `npx vitest run lib/leaderboard/__tests__/leaderboard.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 rank.ts**
```ts
export function rankFromCountAbove(countAbove: number): number {
  return countAbove + 1
}
export function displayNameOf(u: { displayName?: string | null; name?: string | null }): string {
  return u.displayName ?? u.name ?? '匿名'
}
```

- [ ] **Step 4: 實作 repository.ts**（比照 `lib/gamification/repository.ts` 注入式 db）
```ts
import { getPrisma } from '@/lib/db/client'

interface LbDb {
  gamificationState: {
    findMany(args: unknown): Promise<unknown[]>
    count(args: unknown): Promise<number>
    findUnique(args: unknown): Promise<unknown | null>
  }
}

type Row = { userId: string; user: { displayName: string | null; name: string | null } }

export class LeaderboardRepository {
  private readonly db: LbDb
  constructor(db?: LbDb) {
    this.db = db ?? (getPrisma() as unknown as LbDb)
  }
  async topAllTime(limit: number): Promise<(Row & { xp: number })[]> {
    return (await this.db.gamificationState.findMany({
      where: { user: { leaderboardOptIn: true } },
      orderBy: { xp: 'desc' }, take: limit,
      select: { userId: true, xp: true, user: { select: { displayName: true, name: true } } },
    })) as (Row & { xp: number })[]
  }
  async topWeekly(limit: number, weekStart: string): Promise<(Row & { weeklyXp: number })[]> {
    return (await this.db.gamificationState.findMany({
      where: { user: { leaderboardOptIn: true }, weekStartDate: weekStart },
      orderBy: { weeklyXp: 'desc' }, take: limit,
      select: { userId: true, weeklyXp: true, user: { select: { displayName: true, name: true } } },
    })) as (Row & { weeklyXp: number })[]
  }
  async countAboveAllTime(xp: number): Promise<number> {
    return this.db.gamificationState.count({ where: { user: { leaderboardOptIn: true }, xp: { gt: xp } } })
  }
  async countAboveWeekly(weeklyXp: number, weekStart: string): Promise<number> {
    return this.db.gamificationState.count({ where: { user: { leaderboardOptIn: true }, weekStartDate: weekStart, weeklyXp: { gt: weeklyXp } } })
  }
  async getStanding(userId: string): Promise<{ xp: number; weeklyXp: number; weekStartDate: string | null; optedIn: boolean }> {
    const row = (await this.db.gamificationState.findUnique({
      where: { userId },
      select: { xp: true, weeklyXp: true, weekStartDate: true, user: { select: { leaderboardOptIn: true } } },
    })) as { xp: number; weeklyXp: number; weekStartDate: string | null; user: { leaderboardOptIn: boolean } } | null
    if (!row) return { xp: 0, weeklyXp: 0, weekStartDate: null, optedIn: false }
    return { xp: row.xp, weeklyXp: row.weeklyXp, weekStartDate: row.weekStartDate, optedIn: row.user.leaderboardOptIn }
  }
}
```

- [ ] **Step 5: 實作 service.ts**
```ts
import { LeaderboardRepository } from './repository'
import { rankFromCountAbove, displayNameOf } from './rank'
import { weekStartYmd } from '@/lib/gamification/date'

export interface BoardEntry { rank: number; name: string; value: number; isMe: boolean }
export interface Board { entries: BoardEntry[]; myRank: number | null; optedIn: boolean }

export class LeaderboardService {
  private readonly repo: LeaderboardRepository
  constructor(repo?: LeaderboardRepository) {
    this.repo = repo ?? new LeaderboardRepository()
  }
  async getBoard(userId: string, tab: 'weekly' | 'allTime', now: Date, timezone: string): Promise<Board> {
    const standing = await this.repo.getStanding(userId)
    if (tab === 'weekly') {
      const weekStart = weekStartYmd(now, timezone)
      const top = await this.repo.topWeekly(50, weekStart)
      const myWeekly = standing.weekStartDate === weekStart ? standing.weeklyXp : 0
      const above = await this.repo.countAboveWeekly(myWeekly, weekStart)
      return {
        entries: top.map((r, i) => ({ rank: i + 1, name: displayNameOf(r.user), value: r.weeklyXp, isMe: r.userId === userId })),
        myRank: standing.optedIn ? rankFromCountAbove(above) : null,
        optedIn: standing.optedIn,
      }
    }
    const top = await this.repo.topAllTime(50)
    const above = await this.repo.countAboveAllTime(standing.xp)
    return {
      entries: top.map((r, i) => ({ rank: i + 1, name: displayNameOf(r.user), value: r.xp, isMe: r.userId === userId })),
      myRank: standing.optedIn ? rankFromCountAbove(above) : null,
      optedIn: standing.optedIn,
    }
  }
}

export const leaderboardService = new LeaderboardService()
```

- [ ] **Step 6: 跑測試確認通過**
Run: `npx vitest run lib/leaderboard/__tests__/leaderboard.test.ts`
Expected: PASS。

- [ ] **Step 7: Commit**
```bash
git add lib/leaderboard/
git commit -m "feat(leaderboard): module (rank + repository + service)"
```

---

## Task 5: 設定資料存取 + /settings 頁

**Files:**
- Create: `lib/user/settings.ts`, `app/settings/page.tsx`, `app/settings/actions.ts`

**Interfaces:**
- Produces: `getUserSettings(userId): Promise<{ displayName: string|null; leaderboardOptIn: boolean; name: string|null }>`、`updateUserSettings(userId, { displayName, leaderboardOptIn })`；`updateSettingsAction(displayName: string, leaderboardOptIn: boolean)`。

- [ ] **Step 1: 實作 `lib/user/settings.ts`**（repository 風格，唯讀+寫單筆）
```ts
import { getPrisma } from '@/lib/db/client'
interface UserDb { user: { findUnique(a: unknown): Promise<unknown | null>; update(a: unknown): Promise<unknown> } }
export class UserSettingsRepository {
  private readonly db: UserDb
  constructor(db?: UserDb) { this.db = db ?? (getPrisma() as unknown as UserDb) }
  async get(userId: string): Promise<{ displayName: string | null; leaderboardOptIn: boolean; name: string | null }> {
    const row = (await this.db.user.findUnique({ where: { id: userId }, select: { displayName: true, leaderboardOptIn: true, name: true } })) as
      { displayName: string | null; leaderboardOptIn: boolean; name: string | null } | null
    return row ?? { displayName: null, leaderboardOptIn: false, name: null }
  }
  async update(userId: string, data: { displayName: string | null; leaderboardOptIn: boolean }): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data })
  }
}
```

- [ ] **Step 2: 實作 `app/settings/actions.ts`**
```ts
'use server'
import { getCurrentUser } from '@/lib/auth/session'
import { UserSettingsRepository } from '@/lib/user/settings'

export async function updateSettingsAction(displayName: string, leaderboardOptIn: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  const trimmed = displayName.trim().slice(0, 20)
  await new UserSettingsRepository().update(user.id, { displayName: trimmed || null, leaderboardOptIn })
  return { ok: true }
}
```

- [ ] **Step 3: 實作 `app/settings/page.tsx`**（server 讀現值 + client 表單）
```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { UserSettingsRepository } from '@/lib/user/settings'
import { SettingsForm } from './form'

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const s = await new UserSettingsRepository().get(user.id)
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
      <h1 className="mt-2 mb-6 text-2xl font-extrabold text-neutral-900">設定</h1>
      <SettingsForm initialName={s.displayName ?? s.name ?? ''} initialOptIn={s.leaderboardOptIn} />
    </main>
  )
}
```
建立 `app/settings/form.tsx`（client）：
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateSettingsAction } from './actions'

export function SettingsForm({ initialName, initialOptIn }: { initialName: string; initialOptIn: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [optIn, setOptIn] = useState(initialOptIn)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  async function save() {
    setBusy(true); setSaved(false)
    try { await updateSettingsAction(name, optIn); setSaved(true); router.refresh() } catch { /* ignore */ }
    setBusy(false)
  }
  return (
    <Card className="space-y-4 p-5">
      <label className="block">
        <span className="text-sm font-semibold text-neutral-600">排行榜暱稱</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
          className="mt-1 w-full rounded-control border-2 border-primary-200 bg-surface px-3 py-2 text-neutral-900 focus:border-primary-500 focus:outline-none"
          placeholder="顯示在排行榜上的名稱" />
      </label>
      <label className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-600">出現在排行榜</span>
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="h-5 w-5 accent-primary-500" />
      </label>
      <Button onClick={save} disabled={busy} fullWidth>{busy ? '儲存中…' : '儲存'}</Button>
      {saved && <p className="text-sm text-success">已儲存</p>}
    </Card>
  )
}
```

- [ ] **Step 4: tsc + build**
Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功（`/settings` 路由產生）。

- [ ] **Step 5: Commit**
```bash
git add lib/user/ app/settings/
git commit -m "feat(leaderboard): /settings — nickname + leaderboard opt-in"
```

---

## Task 6: /leaderboard 頁（兩頁籤）+ 入口

**Files:**
- Create: `app/leaderboard/page.tsx`, `app/leaderboard/tabs.tsx`
- Modify: `app/page.tsx`（加入口連結）

**Interfaces:**
- Consumes: `leaderboardService.getBoard`（Task 4）、`Board`/`BoardEntry` 型別。

- [ ] **Step 1: 實作 `app/leaderboard/page.tsx`**（server 抓兩榜，平行）
```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { leaderboardService } from '@/lib/leaderboard/service'
import { GamificationBar } from '@/components/gamification-bar'
import { LeaderboardTabs } from './tabs'

export default async function LeaderboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const now = new Date()
  const tz = 'Asia/Taipei'
  const [weekly, allTime] = await Promise.all([
    leaderboardService.getBoard(user.id, 'weekly', now, tz),
    leaderboardService.getBoard(user.id, 'allTime', now, tz),
  ])
  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold text-neutral-900">排行榜</h1>
        {!weekly.optedIn && (
          <p className="mb-4 rounded-control bg-primary-50 p-3 text-sm text-neutral-600">
            你尚未加入排行榜。到 <Link href="/settings" className="font-bold text-primary-600 hover:underline">設定</Link> 開啟即可上榜。
          </p>
        )}
        <LeaderboardTabs weekly={weekly} allTime={allTime} />
      </main>
    </>
  )
}
```

- [ ] **Step 2: 實作 `app/leaderboard/tabs.tsx`**（client 切換 + 渲染）
```tsx
'use client'
import { useState } from 'react'
import type { Board } from '@/lib/leaderboard/service'

function Rows({ board, unit }: { board: Board; unit: string }) {
  if (board.entries.length === 0) return <p className="py-8 text-center text-neutral-600">還沒有人上榜，快去複習衝榜！</p>
  return (
    <ul className="space-y-2">
      {board.entries.map((e) => (
        <li key={e.rank}
          className={`flex items-center justify-between rounded-control px-4 py-3 ${e.isMe ? 'bg-primary-100 font-extrabold text-primary-700' : 'bg-surface text-neutral-900'}`}>
          <span className="flex items-center gap-3"><span className="w-6 text-right text-neutral-600">#{e.rank}</span>{e.name}{e.isMe && '（你）'}</span>
          <span className="font-bold">{e.value} {unit}</span>
        </li>
      ))}
      {board.myRank !== null && !board.entries.some((e) => e.isMe) && (
        <li className="mt-3 rounded-control bg-primary-100 px-4 py-3 text-center font-bold text-primary-700">你的排名 #{board.myRank}</li>
      )}
    </ul>
  )
}

export function LeaderboardTabs({ weekly, allTime }: { weekly: Board; allTime: Board }) {
  const [tab, setTab] = useState<'weekly' | 'allTime'>('weekly')
  return (
    <>
      <div className="mb-4 flex gap-2">
        {(['weekly', 'allTime'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-control py-2 font-bold transition ${tab === t ? 'bg-primary-500 text-white' : 'bg-primary-50 text-primary-600'}`}>
            {t === 'weekly' ? '本週' : '總榜'}
          </button>
        ))}
      </div>
      {tab === 'weekly' ? <Rows board={weekly} unit="XP" /> : <Rows board={allTime} unit="XP" />}
    </>
  )
}
```

- [ ] **Step 3: 首頁加入口**（`app/page.tsx`：在「開始學單字」連結後加一個次要連結）
```tsx
        <Link href="/leaderboard" className="text-sm font-bold text-primary-600 hover:underline">查看排行榜 🏆</Link>
```
（放在 SignOutButton 之前；沿用既有結構。）

- [ ] **Step 4: tsc + build + 測試**
Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、全綠。

- [ ] **Step 5: Commit**
```bash
git add app/leaderboard/ app/page.tsx
git commit -m "feat(leaderboard): /leaderboard page (weekly/all-time tabs) + home entry"
```

---

## Task 7: 全量驗證 + 手動 e2e

**Files:** 無（驗證）

- [ ] **Step 1: 全量測試 + 型別 + build**
Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 全綠、乾淨、成功。

- [ ] **Step 2: 手動 e2e（dev）**
`npm run dev`，登入後：
- 到 `/settings`：設暱稱 + 開啟「出現在排行榜」→ 儲存。
- 跑一輪複習（答對幾題）→ XP 增加（後端判定）。
- 到 `/leaderboard`：本週/總榜兩頁籤；自己出現且醒目；未 opt-in 時顯示提示。
- **防作弊驗證**：在瀏覽器 devtools 改 `submitAnswerAction` 的送出值無法偽造對錯（server 以該字重判）——可選：用 Network 觀察送出的是 `userAnswer` 而非 `correct`。
驗證後關閉 dev server。

- [ ] **Step 3: 最終 commit（若有微調）**
```bash
git add -A && git commit -m "test(leaderboard): verification pass"
```

---

## Self-Review

**1. Spec coverage：**
- §2 後端判定（getWordCore + submitAnswerAction 重判 + review-session 送 userAnswer + CLAUDE.md 已加準則）→ Task 3 ✓；既有盤點（finishSession 不變、非排名徽章）→ 維持，Task 3 註記 ✓
- §3 資料模型（GamificationState weekly + User displayName/optIn + db:push）→ Task 1 ✓
- §4 每週懶重置（weekStartYmd + applyReview）→ Task 2 ✓
- §5 leaderboard 模組（rank/repository/service、opt-in 篩選、Top50+名次、週榜本週）→ Task 4 ✓
- §6 UI（/leaderboard 兩頁籤 + /settings 暱稱/opt-in + 入口、不顯示真名頭像）→ Task 5/6 ✓
- §7 測試（weekStartYmd、applyReview 週、後端判定、getBoard、rank、repository）→ 各 task TDD + Task 7 ✓
- §8 邊界、§9 成本（無 cron、on-demand）、§10 排除、§11 參數（Top50、週一、預設 optIn false/displayName=name）→ 對齊 ✓

**2. Placeholder scan：** 無 TBD/「適當處理」；每個 code step 皆含完整程式或精確編輯。✓

**3. Type consistency：**
- `GamificationStateData` 加 `weeklyXp`/`weekStartDate` → service `next`/`DEFAULT_STATE`/repository pass-through 一致（getContext `gamification:true` 全選、saveState 寫全物件）✓
- `submitAnswerAction(wordId, questionType: QuestionType, userAnswer)` → review-session 呼叫一致；`QuestionType` 取自 `@/lib/learning/question` ✓
- `getWordCore` 回 `{headword, definitionZh}` → action 使用一致 ✓
- `LeaderboardService.getBoard(...)→Board{entries,myRank,optedIn}`、`BoardEntry{rank,name,value,isMe}` → tabs.tsx 使用一致 ✓
- `weekStartYmd(now, timezone)` 在 date 定義、service/leaderboard 使用一致 ✓
- `rankFromCountAbove`/`displayNameOf` 簽章一致 ✓
