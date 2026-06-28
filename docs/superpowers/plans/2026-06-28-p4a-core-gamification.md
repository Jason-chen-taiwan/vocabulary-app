# P4a 核心遊戲化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把每次作答轉成有感的 XP/等級、虛擬幣、每日目標+streak（含凍結）與里程碑徽章，並在頂部列與複習結束畫面顯示。

**Architecture:** 新增自成一格的 `lib/gamification` 模組（純規則 + 設定資料 + repository + service）。學習核心維持只 `publish` 領域事件、**不** import 遊戲化；組合根 `app/learn/[slug]/actions.ts` 在 `submitAnswer` 之後**直接呼叫** `gamificationService.applyReview(...)` 取得本次 reward delta 回傳給 UI。事件匯流排 payload 依 spec 擴充（保留未來 fire-and-forget 訂閱接縫），但 P4a 的 reward 走直接呼叫以同步回傳給畫面。

**Tech Stack:** Next.js（App Router）+ React + TypeScript、Prisma 7（Neon HTTP，單筆寫入、無交易）、Vitest。

## Global Constraints

- 模組化第一：`lib/gamification` 對外只透過 service/repository 介面；學習核心不得 import 遊戲化（複查 `submit.ts`/`session.ts` 無 gamification import）。
- 規則用具名常數/設定資料，集中於 `rules.ts`、`badges.ts`，不散落分支。
- 資料存取一律經 repository（Prisma）。**禁止** `$transaction`／`upsert`／`createMany`（Neon HTTP driver 不支援）；以 read→create-or-update 單筆寫入模擬。
- 日期以「YYYY-MM-DD 字串（使用者時區）」判斷跨日/連續，純函式不依賴系統時鐘。
- TDD：每個純函式與 service 分支先寫失敗測試再實作。
- 測試指令：`npx vitest run <path>`（單檔）/ `npx vitest run`（全部）。建置：`npm run build`。
- 跟隨既有檔案命名/註解密度/寫法（參考 `lib/learning/*`）。

---

## File Structure

新增：
- `lib/gamification/types.ts` — 模組型別（`GamificationStateData`、`ReviewReward`、`SessionReward`、`BadgeDef`、`BadgeContext`）。
- `lib/gamification/rules.ts` — 純規則 + 常數（`levelForXp`、`xpForReview`、`updateStreak`、`evaluateBadges`）。
- `lib/gamification/date.ts` — 純日期工具（`todayYmd`、`daysBetween`）。
- `lib/gamification/badges.ts` — 徽章設定資料 `BADGES`。
- `lib/gamification/repository.ts` — `GamificationRepository`（`getContext`/`saveState`/`countMastered`/`listBadgeKeys`/`unlockBadges`）。
- `lib/gamification/service.ts` — `GamificationService`（`applyReview`/`applySessionFinish`）+ 預設單例 `gamificationService`。
- `components/gamification-bar.tsx` — 頂部列 server component（🔥streak · Lv.N · 🪙coins）。
- 對應 `__tests__/`：`rules.test.ts`、`date.test.ts`、`badges.test.ts`、`repository.test.ts`、`service.test.ts`。

修改：
- `prisma/schema.prisma` — 新增 `GamificationState`、`UserBadge`；`User` 加反向關聯。
- `lib/events/bus.ts` — `ReviewCompleted` 加 `correct`/`mastered`；`SessionFinished` 加 `correct`。
- `lib/learning/submit.ts` — publish 帶上 `correct`/`mastered`；`finishSession` 加 `correct` 參數。
- `lib/learning/__tests__/submit.test.ts`、`lib/events/__tests__/bus.test.ts` — 跟著更新。
- `app/learn/[slug]/actions.ts` — `submitAnswerAction` 回傳 reward；`finishSessionAction(reviewed, correct)` 回傳 session reward。
- `components/review-session.tsx` — 累加每次 reward、結束畫面顯示、把 correct 數傳給 `finishSessionAction`。
- `app/page.tsx`、`app/books/page.tsx` — 掛上 `<GamificationBar />`。

---

## Task 1: Schema — GamificationState + UserBadge

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `GamificationState`、`UserBadge`；`User.gamification` 反向關聯。後續 repository 依賴這些欄位名。

- [ ] **Step 1: 在 `User` model 加反向關聯**

於 `prisma/schema.prisma` 的 `User` model（約 line 20，`cards UserCard[]` 之後）新增一行：

```prisma
  cards         UserCard[]
  gamification  GamificationState?
```

- [ ] **Step 2: 在檔案末端新增兩個 model**

於 `prisma/schema.prisma` 最後（`ReviewLog` 之後）新增：

```prisma
model GamificationState {
  id             String      @id @default(cuid())
  userId         String      @unique
  xp             Int         @default(0)
  level          Int         @default(1)
  coinBalance    Int         @default(0)
  streak         Int         @default(0)
  longestStreak  Int         @default(0)
  lastGoalDate   String?
  reviewsToday   Int         @default(0)
  lastReviewDate String?
  streakFreezes  Int         @default(0)
  user           User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  badges         UserBadge[]
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}

model UserBadge {
  id         String            @id @default(cuid())
  userId     String
  badgeKey   String
  unlockedAt DateTime          @default(now())
  state      GamificationState @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@unique([userId, badgeKey])
}
```

- [ ] **Step 3: 驗證 schema 並重新產生 client**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma\schema.prisma is valid` 且 client 產生成功。

- [ ] **Step 4: 套用到 Neon**

Run: `npm run db:push`
Expected: 同步成功，新增兩張表（無資料遺失警告即可）。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(gamification): add GamificationState and UserBadge models"
```

---

## Task 2: 模組型別 types.ts

**Files:**
- Create: `lib/gamification/types.ts`

**Interfaces:**
- Produces:
  - `GamificationStateData`：`{ xp: number; level: number; coinBalance: number; streak: number; longestStreak: number; lastGoalDate: string | null; reviewsToday: number; lastReviewDate: string | null; streakFreezes: number }`
  - `ReviewReward`：`{ xpGained: number; coinsGained: number; leveledUpTo: number | null; dailyGoalMet: boolean; streak: number; newBadges: string[] }`
  - `SessionReward`：`{ perfect: boolean; newBadges: string[] }`
  - `BadgeDef`：`{ key: string; name: string; description: string; type: 'streak' | 'mastered' | 'level' | 'perfect'; threshold: number }`
  - `BadgeContext`：`{ streak: number; level: number; masteredCount?: number; perfectSession?: boolean }`

- [ ] **Step 1: 建立型別檔（無測試，純型別）**

建立 `lib/gamification/types.ts`：

```ts
// 遊戲化模組對外型別。與 Prisma row 解耦：repository 負責 row→這些型別的轉換。
export interface GamificationStateData {
  xp: number
  level: number
  coinBalance: number
  streak: number
  longestStreak: number
  lastGoalDate: string | null
  reviewsToday: number
  lastReviewDate: string | null
  streakFreezes: number
}

// 單次作答的獎勵 delta，回傳給 UI 累加顯示。
export interface ReviewReward {
  xpGained: number
  coinsGained: number
  leveledUpTo: number | null
  dailyGoalMet: boolean
  streak: number
  newBadges: string[]
}

// session 結束結算。
export interface SessionReward {
  perfect: boolean
  newBadges: string[]
}

export interface BadgeDef {
  key: string
  name: string
  description: string
  type: 'streak' | 'mastered' | 'level' | 'perfect'
  threshold: number
}

export interface BadgeContext {
  streak: number
  level: number
  masteredCount?: number
  perfectSession?: boolean
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤（新檔僅型別，不影響既有）。

- [ ] **Step 3: Commit**

```bash
git add lib/gamification/types.ts
git commit -m "feat(gamification): module types"
```

---

## Task 3: 純日期工具 date.ts

**Files:**
- Create: `lib/gamification/date.ts`
- Test: `lib/gamification/__tests__/date.test.ts`

**Interfaces:**
- Produces:
  - `todayYmd(now: Date, timezone: string): string` — 回傳使用者時區的 `YYYY-MM-DD`。
  - `daysBetween(fromYmd: string, toYmd: string): number` — 兩個 `YYYY-MM-DD` 相差的整數天數（`to - from`）。

- [ ] **Step 1: 寫失敗測試**

建立 `lib/gamification/__tests__/date.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { todayYmd, daysBetween } from '@/lib/gamification/date'

describe('todayYmd', () => {
  it('formats in the given timezone (Asia/Taipei is UTC+8)', () => {
    // 2026-06-28T20:00:00Z => 台北已是 06-29 04:00
    expect(todayYmd(new Date('2026-06-28T20:00:00Z'), 'Asia/Taipei')).toBe('2026-06-29')
    // 同一時刻在 UTC 仍是 06-28
    expect(todayYmd(new Date('2026-06-28T20:00:00Z'), 'UTC')).toBe('2026-06-28')
  })
})

describe('daysBetween', () => {
  it('returns positive day delta', () => {
    expect(daysBetween('2026-06-27', '2026-06-28')).toBe(1)
    expect(daysBetween('2026-06-20', '2026-06-28')).toBe(8)
  })
  it('returns 0 for same day', () => {
    expect(daysBetween('2026-06-28', '2026-06-28')).toBe(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/gamification/__tests__/date.test.ts`
Expected: FAIL（`todayYmd`/`daysBetween` 未定義）。

- [ ] **Step 3: 實作**

建立 `lib/gamification/date.ts`：

```ts
// 純日期工具：以使用者時區決定「今天」，並計算 YYYY-MM-DD 字串間天數差。
// 不依賴系統當下時間以外的隱含狀態，方便測試。
export function todayYmd(now: Date, timezone: string): string {
  // en-CA locale 產出 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`)
  const to = Date.parse(`${toYmd}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000)
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/gamification/__tests__/date.test.ts`
Expected: PASS（全部）。

- [ ] **Step 5: Commit**

```bash
git add lib/gamification/date.ts lib/gamification/__tests__/date.test.ts
git commit -m "feat(gamification): timezone-aware date utils"
```

---

## Task 4: 徽章設定資料 badges.ts

**Files:**
- Create: `lib/gamification/badges.ts`
- Test: `lib/gamification/__tests__/badges.test.ts`

**Interfaces:**
- Consumes: `BadgeDef`（Task 2）。
- Produces: `BADGES: BadgeDef[]`（含 streak-7/30/100、mastered-10/50/100、level-5/10/25、perfect-session）。

- [ ] **Step 1: 寫失敗測試**

建立 `lib/gamification/__tests__/badges.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { BADGES } from '@/lib/gamification/badges'

describe('BADGES config', () => {
  it('has unique keys', () => {
    const keys = BADGES.map((b) => b.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('covers the four badge types', () => {
    const types = new Set(BADGES.map((b) => b.type))
    expect(types).toEqual(new Set(['streak', 'mastered', 'level', 'perfect']))
  })
  it('includes the documented milestone keys', () => {
    const keys = BADGES.map((b) => b.key)
    for (const k of ['streak-7', 'streak-30', 'streak-100', 'mastered-10', 'mastered-50', 'mastered-100', 'level-5', 'level-10', 'level-25', 'perfect-session']) {
      expect(keys).toContain(k)
    }
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/gamification/__tests__/badges.test.ts`
Expected: FAIL（`BADGES` 未定義）。

- [ ] **Step 3: 實作**

建立 `lib/gamification/badges.ts`：

```ts
import type { BadgeDef } from './types'

// 徽章為靜態設定資料（YAGNI：不建 Badge 表）。新增徽章 = 在此加一筆 + 在 rules.evaluateBadges 已涵蓋的 type 內。
export const BADGES: BadgeDef[] = [
  { key: 'streak-7', name: '一週不間斷', description: '連續達標 7 天', type: 'streak', threshold: 7 },
  { key: 'streak-30', name: '一月不間斷', description: '連續達標 30 天', type: 'streak', threshold: 30 },
  { key: 'streak-100', name: '百日不間斷', description: '連續達標 100 天', type: 'streak', threshold: 100 },
  { key: 'mastered-10', name: '初窺門徑', description: '記憶完成 10 個單字', type: 'mastered', threshold: 10 },
  { key: 'mastered-50', name: '漸入佳境', description: '記憶完成 50 個單字', type: 'mastered', threshold: 50 },
  { key: 'mastered-100', name: '融會貫通', description: '記憶完成 100 個單字', type: 'mastered', threshold: 100 },
  { key: 'level-5', name: 'Lv.5', description: '達到等級 5', type: 'level', threshold: 5 },
  { key: 'level-10', name: 'Lv.10', description: '達到等級 10', type: 'level', threshold: 10 },
  { key: 'level-25', name: 'Lv.25', description: '達到等級 25', type: 'level', threshold: 25 },
  { key: 'perfect-session', name: '完美一回', description: '單次複習全部答對', type: 'perfect', threshold: 1 },
]
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/gamification/__tests__/badges.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/gamification/badges.ts lib/gamification/__tests__/badges.test.ts
git commit -m "feat(gamification): config-driven badge definitions"
```

---

## Task 5: 純規則 rules.ts

**Files:**
- Create: `lib/gamification/rules.ts`
- Test: `lib/gamification/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: `BADGES`（Task 4）、`BadgeContext`（Task 2）。
- Produces:
  - 常數 `XP_CORRECT=10`、`XP_WRONG=2`、`COIN_DAILY_GOAL=50`、`COIN_MASTERY=20`、`XP_PER_LEVEL=100`、`FREEZE_PER_MILESTONE_DAYS=7`、`FREEZE_CAP=3`。
  - `levelForXp(xp: number): number`
  - `xpForReview(correct: boolean): number`
  - `updateStreak(daysSinceLastGoal: number | null, currentStreak: number, freezes: number): { streak: number; freezesConsumed: number; reset: boolean }`
  - `evaluateBadges(ctx: BadgeContext): string[]`（回傳門檻達成的 badgeKey；尚未過濾已解鎖，由 repository 過濾）

- [ ] **Step 1: 寫失敗測試**

建立 `lib/gamification/__tests__/rules.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { levelForXp, xpForReview, updateStreak, evaluateBadges, XP_CORRECT, XP_WRONG } from '@/lib/gamification/rules'

describe('levelForXp', () => {
  it('100 XP per level, starting at level 1', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(100)).toBe(2)
    expect(levelForXp(250)).toBe(3)
  })
})

describe('xpForReview', () => {
  it('correct gives XP_CORRECT, wrong gives XP_WRONG', () => {
    expect(xpForReview(true)).toBe(XP_CORRECT)
    expect(xpForReview(false)).toBe(XP_WRONG)
  })
})

describe('updateStreak', () => {
  it('first ever goal: streak 1', () => {
    expect(updateStreak(null, 0, 0)).toEqual({ streak: 1, freezesConsumed: 0, reset: false })
  })
  it('consecutive day: increments, no freeze used', () => {
    expect(updateStreak(1, 4, 2)).toEqual({ streak: 5, freezesConsumed: 0, reset: false })
  })
  it('one missed day with enough freezes: consumes 1, keeps streak', () => {
    expect(updateStreak(2, 4, 2)).toEqual({ streak: 5, freezesConsumed: 1, reset: false })
  })
  it('multi missed days, freezes cover gap: consumes gap, keeps streak', () => {
    // gap = 3 - 1 = 2 days missed
    expect(updateStreak(3, 4, 2)).toEqual({ streak: 5, freezesConsumed: 2, reset: false })
  })
  it('missed days exceed freezes: reset to 1, freezes consumed 0', () => {
    expect(updateStreak(3, 9, 1)).toEqual({ streak: 1, freezesConsumed: 0, reset: true })
  })
})

describe('evaluateBadges', () => {
  it('returns streak + level badges meeting thresholds', () => {
    expect(evaluateBadges({ streak: 7, level: 5 })).toEqual(expect.arrayContaining(['streak-7', 'level-5']))
  })
  it('skips mastered badges when masteredCount not provided', () => {
    expect(evaluateBadges({ streak: 1, level: 1 })).not.toContain('mastered-10')
  })
  it('includes mastered badge when count meets threshold', () => {
    expect(evaluateBadges({ streak: 1, level: 1, masteredCount: 10 })).toContain('mastered-10')
  })
  it('includes perfect-session only when perfectSession true', () => {
    expect(evaluateBadges({ streak: 1, level: 1, perfectSession: true })).toContain('perfect-session')
    expect(evaluateBadges({ streak: 1, level: 1 })).not.toContain('perfect-session')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/gamification/__tests__/rules.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 實作**

建立 `lib/gamification/rules.ts`：

```ts
import { BADGES } from './badges'
import type { BadgeContext } from './types'

export const XP_CORRECT = 10
export const XP_WRONG = 2
export const COIN_DAILY_GOAL = 50
export const COIN_MASTERY = 20
export const XP_PER_LEVEL = 100
export const FREEZE_PER_MILESTONE_DAYS = 7
export const FREEZE_CAP = 3

export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function xpForReview(correct: boolean): number {
  return correct ? XP_CORRECT : XP_WRONG
}

export interface StreakUpdate {
  streak: number
  freezesConsumed: number
  reset: boolean
}

// 懶評估，於「今天首次達標」時呼叫。daysSinceLastGoal = today - lastGoalDate（天）。
//  - null：史上首次達標 → streak 1
//  - 1：昨天也達標 → 連續 +1
//  - >1：中間漏 gap = days-1 天；凍結夠就消耗 gap 並保住，否則歸 1、凍結歸 0
export function updateStreak(daysSinceLastGoal: number | null, currentStreak: number, freezes: number): StreakUpdate {
  if (daysSinceLastGoal === null) return { streak: 1, freezesConsumed: 0, reset: false }
  if (daysSinceLastGoal <= 1) return { streak: currentStreak + 1, freezesConsumed: 0, reset: false }
  const gap = daysSinceLastGoal - 1
  if (freezes >= gap) return { streak: currentStreak + 1, freezesConsumed: gap, reset: false }
  return { streak: 1, freezesConsumed: 0, reset: true }
}

export function evaluateBadges(ctx: BadgeContext): string[] {
  const earned: string[] = []
  for (const b of BADGES) {
    if (b.type === 'streak' && ctx.streak >= b.threshold) earned.push(b.key)
    else if (b.type === 'level' && ctx.level >= b.threshold) earned.push(b.key)
    else if (b.type === 'mastered' && ctx.masteredCount !== undefined && ctx.masteredCount >= b.threshold) earned.push(b.key)
    else if (b.type === 'perfect' && ctx.perfectSession === true) earned.push(b.key)
  }
  return earned
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/gamification/__tests__/rules.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/gamification/rules.ts lib/gamification/__tests__/rules.test.ts
git commit -m "feat(gamification): pure reward/level/streak/badge rules"
```

---

## Task 6: repository.ts

**Files:**
- Create: `lib/gamification/repository.ts`
- Test: `lib/gamification/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: `GamificationStateData`（Task 2）；Prisma client（經 `getPrisma()`，比照 `lib/learning/repository.ts`）。
- Produces 類別 `GamificationRepository`（建構子接受可選 db，預設 `getPrisma()`）：
  - `getContext(userId: string): Promise<{ state: GamificationStateData | null; timezone: string; dailyGoal: number }>`
  - `saveState(userId: string, data: GamificationStateData, exists: boolean): Promise<void>`
  - `countMastered(userId: string): Promise<number>`
  - `listBadgeKeys(userId: string): Promise<string[]>`
  - `unlockBadges(userId: string, keys: string[]): Promise<void>`

- [ ] **Step 1: 寫失敗測試**

建立 `lib/gamification/__tests__/repository.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { GamificationRepository } from '@/lib/gamification/repository'

const stateData = {
  xp: 30, level: 1, coinBalance: 50, streak: 2, longestStreak: 3,
  lastGoalDate: '2026-06-27', reviewsToday: 5, lastReviewDate: '2026-06-28', streakFreezes: 1,
}

function makeDb() {
  return {
    user: { findUnique: vi.fn() },
    gamificationState: { create: vi.fn(), update: vi.fn() },
    userCard: { count: vi.fn() },
    userBadge: { findMany: vi.fn(), create: vi.fn() },
  }
}

describe('GamificationRepository', () => {
  it('getContext returns state + timezone + dailyGoal', async () => {
    const db = makeDb()
    db.user.findUnique.mockResolvedValue({ timezone: 'Asia/Taipei', dailyGoal: 20, gamification: stateData })
    const repo = new GamificationRepository(db as any)
    expect(await repo.getContext('u1')).toEqual({ state: stateData, timezone: 'Asia/Taipei', dailyGoal: 20 })
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { timezone: true, dailyGoal: true, gamification: true },
    })
  })

  it('getContext returns null state when no gamification row yet', async () => {
    const db = makeDb()
    db.user.findUnique.mockResolvedValue({ timezone: 'UTC', dailyGoal: 20, gamification: null })
    const repo = new GamificationRepository(db as any)
    expect(await repo.getContext('u1')).toEqual({ state: null, timezone: 'UTC', dailyGoal: 20 })
  })

  it('saveState create path when not exists', async () => {
    const db = makeDb()
    const repo = new GamificationRepository(db as any)
    await repo.saveState('u1', stateData, false)
    expect(db.gamificationState.create).toHaveBeenCalledWith({ data: { userId: 'u1', ...stateData } })
    expect(db.gamificationState.update).not.toHaveBeenCalled()
  })

  it('saveState update path when exists', async () => {
    const db = makeDb()
    const repo = new GamificationRepository(db as any)
    await repo.saveState('u1', stateData, true)
    expect(db.gamificationState.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: stateData })
    expect(db.gamificationState.create).not.toHaveBeenCalled()
  })

  it('countMastered counts mastered cards', async () => {
    const db = makeDb()
    db.userCard.count.mockResolvedValue(7)
    const repo = new GamificationRepository(db as any)
    expect(await repo.countMastered('u1')).toBe(7)
    expect(db.userCard.count).toHaveBeenCalledWith({ where: { userId: 'u1', mastered: true } })
  })

  it('listBadgeKeys returns unlocked keys', async () => {
    const db = makeDb()
    db.userBadge.findMany.mockResolvedValue([{ badgeKey: 'streak-7' }, { badgeKey: 'level-5' }])
    const repo = new GamificationRepository(db as any)
    expect(await repo.listBadgeKeys('u1')).toEqual(['streak-7', 'level-5'])
    expect(db.userBadge.findMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, select: { badgeKey: true } })
  })

  it('unlockBadges creates one row per key', async () => {
    const db = makeDb()
    const repo = new GamificationRepository(db as any)
    await repo.unlockBadges('u1', ['streak-7', 'level-5'])
    expect(db.userBadge.create).toHaveBeenCalledTimes(2)
    expect(db.userBadge.create).toHaveBeenNthCalledWith(1, { data: { userId: 'u1', badgeKey: 'streak-7' } })
    expect(db.userBadge.create).toHaveBeenNthCalledWith(2, { data: { userId: 'u1', badgeKey: 'level-5' } })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/gamification/__tests__/repository.test.ts`
Expected: FAIL（`GamificationRepository` 未定義）。

- [ ] **Step 3: 實作**

建立 `lib/gamification/repository.ts`（比照 `lib/learning/repository.ts` 的 db 介面注入寫法）：

```ts
import { getPrisma } from '@/lib/db/client'
import type { GamificationStateData } from './types'

interface GamificationDb {
  user: { findUnique(args: unknown): Promise<unknown | null> }
  gamificationState: {
    create(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
  }
  userCard: { count(args: unknown): Promise<number> }
  userBadge: {
    findMany(args: unknown): Promise<unknown[]>
    create(args: unknown): Promise<unknown>
  }
}

export class GamificationRepository {
  private readonly db: GamificationDb
  constructor(db?: GamificationDb) {
    this.db = db ?? (getPrisma() as unknown as GamificationDb)
  }

  async getContext(userId: string): Promise<{ state: GamificationStateData | null; timezone: string; dailyGoal: number }> {
    const row = (await this.db.user.findUnique({
      where: { id: userId },
      select: { timezone: true, dailyGoal: true, gamification: true },
    })) as { timezone: string; dailyGoal: number; gamification: GamificationStateData | null } | null
    if (!row) throw new Error(`user not found: ${userId}`)
    return { state: row.gamification, timezone: row.timezone, dailyGoal: row.dailyGoal }
  }

  async saveState(userId: string, data: GamificationStateData, exists: boolean): Promise<void> {
    if (exists) {
      await this.db.gamificationState.update({ where: { userId }, data })
      return
    }
    await this.db.gamificationState.create({ data: { userId, ...data } })
  }

  async countMastered(userId: string): Promise<number> {
    return this.db.userCard.count({ where: { userId, mastered: true } })
  }

  async listBadgeKeys(userId: string): Promise<string[]> {
    const rows = (await this.db.userBadge.findMany({ where: { userId }, select: { badgeKey: true } })) as { badgeKey: string }[]
    return rows.map((r) => r.badgeKey)
  }

  async unlockBadges(userId: string, keys: string[]): Promise<void> {
    for (const badgeKey of keys) {
      await this.db.userBadge.create({ data: { userId, badgeKey } })
    }
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/gamification/__tests__/repository.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/gamification/repository.ts lib/gamification/__tests__/repository.test.ts
git commit -m "feat(gamification): repository (state/badges/mastered count)"
```

---

## Task 7: service.applyReview

**Files:**
- Create: `lib/gamification/service.ts`
- Test: `lib/gamification/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `GamificationRepository`（Task 6）、rules（Task 5）、date（Task 3）、型別（Task 2）。
- Produces 類別 `GamificationService`（建構子接受 repo），方法：
  - `applyReview(input: { userId: string; correct: boolean; mastered: boolean; now: Date }): Promise<ReviewReward>`

說明：每次作答呼叫一次。讀 context（state/timezone/dailyGoal）→ 跨日重置 `reviewsToday` → `+1` → 加 XP/等級 → mastered 給幣 → 若今天首次達標：給幣、依 `updateStreak` 更新 streak/凍結/longestStreak/lastGoalDate → 評估徽章（streak/level，mastered 時才查 `countMastered`）→ 過濾未解鎖 → 寫 state + 徽章 → 回傳 delta。

- [ ] **Step 1: 寫失敗測試**

建立 `lib/gamification/__tests__/service.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { GamificationService } from '@/lib/gamification/service'

const now = new Date('2026-06-28T02:00:00Z') // 台北 06-28 10:00

function repoWith(state: any, opts: { dailyGoal?: number; mastered?: number; badges?: string[] } = {}) {
  return {
    getContext: vi.fn().mockResolvedValue({ state, timezone: 'Asia/Taipei', dailyGoal: opts.dailyGoal ?? 20 }),
    saveState: vi.fn().mockResolvedValue(undefined),
    countMastered: vi.fn().mockResolvedValue(opts.mastered ?? 0),
    listBadgeKeys: vi.fn().mockResolvedValue(opts.badges ?? []),
    unlockBadges: vi.fn().mockResolvedValue(undefined),
  }
}

const base = {
  xp: 0, level: 1, coinBalance: 0, streak: 0, longestStreak: 0,
  lastGoalDate: null, reviewsToday: 0, lastReviewDate: null, streakFreezes: 0,
}

describe('applyReview', () => {
  it('correct answer adds XP, no level up, creates state when none', async () => {
    const repo = repoWith(null)
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.xpGained).toBe(10)
    expect(r.leveledUpTo).toBeNull()
    expect(r.dailyGoalMet).toBe(false)
    // create path (exists=false)
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ xp: 10, reviewsToday: 1, lastReviewDate: '2026-06-28' }), false)
  })

  it('resets reviewsToday on a new day', async () => {
    const repo = repoWith({ ...base, reviewsToday: 9, lastReviewDate: '2026-06-27' })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: false, mastered: false, now })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ reviewsToday: 1 }), true)
  })

  it('mastered answer grants mastery coins', async () => {
    const repo = repoWith({ ...base }, { mastered: 3 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: true, now })
    expect(r.coinsGained).toBe(20)
  })

  it('hitting daily goal grants coins, starts streak, sets lastGoalDate', async () => {
    const repo = repoWith({ ...base, reviewsToday: 19, lastReviewDate: '2026-06-28' }, { dailyGoal: 20 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.dailyGoalMet).toBe(true)
    expect(r.coinsGained).toBe(50)
    expect(r.streak).toBe(1)
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ streak: 1, lastGoalDate: '2026-06-28', longestStreak: 1 }), true)
  })

  it('consecutive-day goal increments streak and unlocks streak-7 badge', async () => {
    // 已連 6 天，昨天達標；今天第 20 次達標 → streak 7
    const repo = repoWith(
      { ...base, streak: 6, longestStreak: 6, lastGoalDate: '2026-06-27', reviewsToday: 19, lastReviewDate: '2026-06-28' },
      { dailyGoal: 20 },
    )
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.streak).toBe(7)
    expect(r.newBadges).toContain('streak-7')
    expect(repo.unlockBadges).toHaveBeenCalledWith('u1', expect.arrayContaining(['streak-7']))
  })

  it('does not re-grant daily goal if already met today', async () => {
    const repo = repoWith({ ...base, reviewsToday: 25, lastReviewDate: '2026-06-28', lastGoalDate: '2026-06-28', streak: 3 }, { dailyGoal: 20 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.dailyGoalMet).toBe(false)
    expect(r.coinsGained).toBe(0)
  })

  it('grants a streak freeze at a 7-multiple milestone', async () => {
    const repo = repoWith(
      { ...base, streak: 6, longestStreak: 6, lastGoalDate: '2026-06-27', reviewsToday: 19, lastReviewDate: '2026-06-28', streakFreezes: 0 },
      { dailyGoal: 20 },
    )
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ streak: 7, streakFreezes: 1 }), true)
  })

  it('only queries countMastered when the review caused mastery', async () => {
    const repo = repoWith({ ...base })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(repo.countMastered).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/gamification/__tests__/service.test.ts`
Expected: FAIL（`GamificationService` 未定義）。

- [ ] **Step 3: 實作 applyReview（含預設單例佔位，applySessionFinish 下個 task 補）**

建立 `lib/gamification/service.ts`：

```ts
import { GamificationRepository } from './repository'
import { todayYmd, daysBetween } from './date'
import {
  xpForReview, levelForXp, updateStreak, evaluateBadges,
  COIN_DAILY_GOAL, COIN_MASTERY, FREEZE_PER_MILESTONE_DAYS, FREEZE_CAP,
} from './rules'
import type { GamificationStateData, ReviewReward } from './types'

const DEFAULT_STATE: GamificationStateData = {
  xp: 0, level: 1, coinBalance: 0, streak: 0, longestStreak: 0,
  lastGoalDate: null, reviewsToday: 0, lastReviewDate: null, streakFreezes: 0,
}

export class GamificationService {
  private readonly repo: GamificationRepository
  constructor(repo?: GamificationRepository) {
    this.repo = repo ?? new GamificationRepository()
  }

  async applyReview(input: { userId: string; correct: boolean; mastered: boolean; now: Date }): Promise<ReviewReward> {
    const { userId, correct, mastered, now } = input
    const ctx = await this.repo.getContext(userId)
    const exists = ctx.state !== null
    const prev = ctx.state ?? DEFAULT_STATE
    const today = todayYmd(now, ctx.timezone)

    // 跨日重置今日複習數
    const reviewsToday = (prev.lastReviewDate === today ? prev.reviewsToday : 0) + 1

    const xpGained = xpForReview(correct)
    const xp = prev.xp + xpGained
    const level = levelForXp(xp)
    const leveledUpTo = level > prev.level ? level : null

    let coinBalance = prev.coinBalance
    let coinsGained = 0
    if (mastered) {
      coinBalance += COIN_MASTERY
      coinsGained += COIN_MASTERY
    }

    let streak = prev.streak
    let longestStreak = prev.longestStreak
    let streakFreezes = prev.streakFreezes
    let lastGoalDate = prev.lastGoalDate
    let dailyGoalMet = false

    const alreadyMetToday = prev.lastGoalDate === today
    if (!alreadyMetToday && reviewsToday >= ctx.dailyGoal) {
      dailyGoalMet = true
      coinBalance += COIN_DAILY_GOAL
      coinsGained += COIN_DAILY_GOAL
      const days = prev.lastGoalDate ? daysBetween(prev.lastGoalDate, today) : null
      const su = updateStreak(days, streak, streakFreezes)
      streak = su.streak
      streakFreezes -= su.freezesConsumed
      if (streak % FREEZE_PER_MILESTONE_DAYS === 0 && streakFreezes < FREEZE_CAP) streakFreezes += 1
      longestStreak = Math.max(longestStreak, streak)
      lastGoalDate = today
    }

    // 徽章：streak/level 一律評估；mastered 觸發時才查精熟數
    const masteredCount = mastered ? await this.repo.countMastered(userId) : undefined
    const earned = evaluateBadges({ streak, level, masteredCount })
    const already = await this.repo.listBadgeKeys(userId)
    const newBadges = earned.filter((k) => !already.includes(k))

    const next: GamificationStateData = {
      xp, level, coinBalance, streak, longestStreak, lastGoalDate, reviewsToday, lastReviewDate: today, streakFreezes,
    }
    await this.repo.saveState(userId, next, exists)
    if (newBadges.length) await this.repo.unlockBadges(userId, newBadges)

    return { xpGained, coinsGained, leveledUpTo, dailyGoalMet, streak, newBadges }
  }
}

export const gamificationService = new GamificationService()
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/gamification/__tests__/service.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/gamification/service.ts lib/gamification/__tests__/service.test.ts
git commit -m "feat(gamification): applyReview service (xp/coins/streak/badges)"
```

---

## Task 8: service.applySessionFinish

**Files:**
- Modify: `lib/gamification/service.ts`
- Test: `lib/gamification/__tests__/service.test.ts`（追加）

**Interfaces:**
- Produces 方法 `applySessionFinish(input: { userId: string; reviewed: number; correct: number; now: Date }): Promise<SessionReward>` — 全對且 reviewed>0 → perfect；評估 `perfect-session` 徽章、過濾未解鎖、寫入；回傳 `{ perfect, newBadges }`。不改動 XP/幣/streak（僅徽章）。

- [ ] **Step 1: 追加失敗測試**

在 `lib/gamification/__tests__/service.test.ts` 末端追加：

```ts
describe('applySessionFinish', () => {
  it('perfect session unlocks perfect-session badge', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 5, correct: 5, now })
    expect(r.perfect).toBe(true)
    expect(r.newBadges).toContain('perfect-session')
    expect(repo.unlockBadges).toHaveBeenCalledWith('u1', ['perfect-session'])
  })

  it('non-perfect session unlocks nothing', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 5, correct: 4, now })
    expect(r.perfect).toBe(false)
    expect(r.newBadges).toEqual([])
    expect(repo.unlockBadges).not.toHaveBeenCalled()
  })

  it('empty session is not perfect', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 0, correct: 0, now })
    expect(r.perfect).toBe(false)
  })

  it('already-unlocked perfect badge is not re-added', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 }, { badges: ['perfect-session'] })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 3, correct: 3, now })
    expect(r.perfect).toBe(true)
    expect(r.newBadges).toEqual([])
    expect(repo.unlockBadges).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/gamification/__tests__/service.test.ts`
Expected: FAIL（`applySessionFinish` 未定義）。

- [ ] **Step 3: 實作**

在 `lib/gamification/service.ts` import 加上 `SessionReward`：

```ts
import type { GamificationStateData, ReviewReward, SessionReward } from './types'
```

並在 `GamificationService` 類別內（`applyReview` 之後）新增方法：

```ts
  async applySessionFinish(input: { userId: string; reviewed: number; correct: number; now: Date }): Promise<SessionReward> {
    const { userId, reviewed, correct } = input
    const perfect = reviewed > 0 && correct === reviewed
    if (!perfect) return { perfect: false, newBadges: [] }

    const ctx = await this.repo.getContext(userId)
    const prev = ctx.state ?? DEFAULT_STATE
    const earned = evaluateBadges({ streak: prev.streak, level: prev.level, perfectSession: true })
    const already = await this.repo.listBadgeKeys(userId)
    const newBadges = earned.filter((k) => !already.includes(k))
    if (newBadges.length) await this.repo.unlockBadges(userId, newBadges)
    return { perfect, newBadges }
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/gamification/__tests__/service.test.ts`
Expected: PASS（含先前 applyReview 測試）。

- [ ] **Step 5: Commit**

```bash
git add lib/gamification/service.ts lib/gamification/__tests__/service.test.ts
git commit -m "feat(gamification): applySessionFinish (perfect-session badge)"
```

---

## Task 9: 事件 payload 擴充（learning core）

**Files:**
- Modify: `lib/events/bus.ts`
- Modify: `lib/learning/submit.ts`
- Test: `lib/events/__tests__/bus.test.ts`、`lib/learning/__tests__/submit.test.ts`

**Interfaces:**
- Produces:
  - `ReviewCompleted` 加 `correct: boolean; mastered: boolean`。
  - `SessionFinished` 加 `correct: number`。
  - `finishSession(input: { userId: string; reviewed: number; correct: number; now: Date }, deps)` 簽章新增 `correct`。
- 注意：學習核心**不** import 遊戲化；只是把已知的 correct/mastered 放進事件（領域事件自我描述，保留未來訂閱接縫）。

- [ ] **Step 1: 更新事件型別**

於 `lib/events/bus.ts` 改 `DomainEvent`：

```ts
export type DomainEvent =
  | { type: 'ReviewCompleted'; userId: string; wordId: string; rating: Rating; correct: boolean; mastered: boolean; at: Date }
  | { type: 'SessionFinished'; userId: string; reviewed: number; correct: number; at: Date }
```

- [ ] **Step 2: 更新 bus 測試（補新欄位）**

於 `lib/events/__tests__/bus.test.ts`，把所有 `ReviewCompleted` 事件補 `correct`/`mastered`、`SessionFinished` 補 `correct`。例如第一個測試：

```ts
    await bus.publish({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', correct: true, mastered: false, at })
    expect(onReview).toHaveBeenCalledOnce()
    expect(onReview).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', correct: true, mastered: false, at })
```

「awaits async handlers」測試：`await bus.publish({ type: 'SessionFinished', userId: 'u1', reviewed: 5, correct: 5, at })`
「publish with no subscribers」測試：`{ type: 'SessionFinished', userId: 'u1', reviewed: 0, correct: 0, at }`
「a throwing handler」測試：`{ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', correct: true, mastered: false, at }`（兩處 publish 呼叫都補）。

- [ ] **Step 3: 更新 submit.ts**

於 `lib/learning/submit.ts`：
- `submitAnswer` 內 publish 改為帶 correct/mastered：

```ts
  await deps.bus.publish({ type: 'ReviewCompleted', userId, wordId, rating, correct, mastered, at: now })
```

- `finishSession` 簽章與 publish 加 correct：

```ts
export async function finishSession(
  input: { userId: string; reviewed: number; correct: number; now: Date },
  deps: { bus: EventBus },
): Promise<void> {
  await deps.bus.publish({ type: 'SessionFinished', userId: input.userId, reviewed: input.reviewed, correct: input.correct, at: input.now })
}
```

- [ ] **Step 4: 更新 submit 測試**

於 `lib/learning/__tests__/submit.test.ts`：
- 「correct on a new card」測試的 publish 斷言改為：

```ts
    expect(d.bus.publish).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'hard', correct: true, mastered: false, at: now })
```

- `finishSession` 測試改為：

```ts
    await finishSession({ userId: 'u1', reviewed: 7, correct: 6, now }, { bus } as any)
    expect(bus.publish).toHaveBeenCalledWith({ type: 'SessionFinished', userId: 'u1', reviewed: 7, correct: 6, at: now })
```

- [ ] **Step 5: 跑相關測試確認通過**

Run: `npx vitest run lib/events/__tests__/bus.test.ts lib/learning/__tests__/submit.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add lib/events/bus.ts lib/learning/submit.ts lib/events/__tests__/bus.test.ts lib/learning/__tests__/submit.test.ts
git commit -m "feat(learning): enrich domain events with correctness for gamification seam"
```

---

## Task 10: 組合根接線（actions.ts）

**Files:**
- Modify: `app/learn/[slug]/actions.ts`

**Interfaces:**
- Consumes: `gamificationService`（Task 7/8）、`submitAnswer`/`finishSession`（Task 9）。
- Produces:
  - `submitAnswerAction(wordId: string, correct: boolean): Promise<{ ok: boolean; mastered: boolean; reward: ReviewReward | null }>`
  - `finishSessionAction(reviewed: number, correct: number): Promise<{ ok: boolean; reward: SessionReward | null }>`

- [ ] **Step 1: 改寫 actions.ts**

將 `app/learn/[slug]/actions.ts` 改為：

```ts
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
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤（review-session 在 Task 11 會配合更新；此時若 review-session 對舊回傳型別有依賴而報錯，於 Task 11 修正。先確認 actions/gamification/learning 本身型別正確——若報錯僅來自 `components/review-session.tsx`，可接受並於下一個 task 修）。

> 註：`submitAnswerAction`/`finishSessionAction` 回傳型別擴增為向後相容（新增欄位），既有呼叫端讀 `ok`/`mastered` 仍可運作；新欄位於 Task 11 使用。

- [ ] **Step 3: Commit**

```bash
git add app/learn/[slug]/actions.ts
git commit -m "feat(gamification): wire applyReview/applySessionFinish at composition root"
```

---

## Task 11: UI — 頂部列 + 結束畫面獎勵

**Files:**
- Create: `components/gamification-bar.tsx`
- Modify: `components/review-session.tsx`
- Modify: `app/page.tsx`、`app/books/page.tsx`

**Interfaces:**
- Consumes: `GamificationRepository.getContext`（取 state；Task 6）、`getCurrentUser`、`submitAnswerAction`/`finishSessionAction`（Task 10）。

- [ ] **Step 1: 建立頂部列 server component**

建立 `components/gamification-bar.tsx`：

```tsx
import { getCurrentUser } from '@/lib/auth/session'
import { GamificationRepository } from '@/lib/gamification/repository'

// 伺服器元件：顯示 🔥streak · Lv.N · 🪙coins。無登入或尚無狀態則顯示初始值。
export async function GamificationBar() {
  const user = await getCurrentUser()
  if (!user) return null
  let streak = 0
  let level = 1
  let coins = 0
  try {
    const { state } = await new GamificationRepository().getContext(user.id)
    if (state) {
      streak = state.streak
      level = state.level
      coins = state.coinBalance
    }
  } catch {
    // 取不到狀態時用初始值，不阻斷頁面
  }
  return (
    <div className="flex items-center justify-center gap-4 border-b border-gray-800 py-2 text-sm">
      <span title="連續達標天數">🔥 {streak}</span>
      <span title="等級">Lv.{level}</span>
      <span title="金幣">🪙 {coins}</span>
    </div>
  )
}
```

- [ ] **Step 2: 在首頁與單字書列表掛上頂部列**

於 `app/page.tsx`：import 並在 `<main>` 最上方插入。將：

```tsx
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'
```

加上：

```tsx
import { GamificationBar } from '@/components/gamification-bar'
```

並把回傳改為（外層包一個 fragment，頂部列在最上）：

```tsx
  return (
    <>
      <GamificationBar />
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-bold">歡迎，{user.name ?? user.email}</h1>
        <Link href="/books" className="rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-gray-200">
          開始學單字
        </Link>
        <SignOutButton />
      </main>
    </>
  )
```

於 `app/books/page.tsx`：在檔案頂部 import `import { GamificationBar } from '@/components/gamification-bar'`，並在頁面 root 回傳的最上方插入 `<GamificationBar />`（用 fragment 包住原本內容；依該檔現有結構放在最外層第一個子元素）。

- [ ] **Step 3: review-session 累加並顯示獎勵**

修改 `components/review-session.tsx`：

(a) 累加狀態。於既有 `useState` 區塊新增：

```tsx
  const [rewards, setRewards] = useState({ xp: 0, coins: 0, level: null as number | null, badges: [] as string[] })
  const [correctCount, setCorrectCount] = useState(0)
  const [sessionPerfect, setSessionPerfect] = useState(false)
```

(b) `commit` 收集 reward。把 `commit` 改為：

```tsx
  async function commit(correct: boolean) {
    if (busy) return
    setBusy(true)
    setResult({ correct })
    if (correct) setCorrectCount((n) => n + 1)
    try {
      const res = await submitAnswerAction(q.wordId, correct)
      const r = res.reward
      if (r) {
        setRewards((prev) => ({
          xp: prev.xp + r.xpGained,
          coins: prev.coins + r.coinsGained,
          level: r.leveledUpTo ?? prev.level,
          badges: [...prev.badges, ...r.newBadges],
        }))
      }
    } catch {
      // 即使出錯也讓使用者繼續；本卡進度可能未存
    }
    setBusy(false)
  }
```

(c) `next` 在最後一題呼叫 `finishSessionAction(items.length, correctCount)` 並收 session reward：

```tsx
  async function next() {
    if (busy) return
    if (index + 1 >= items.length) {
      setBusy(true)
      try {
        const res = await finishSessionAction(items.length, correctCount)
        if (res.reward) {
          setSessionPerfect(res.reward.perfect)
          if (res.reward.newBadges.length) {
            setRewards((prev) => ({ ...prev, badges: [...prev.badges, ...res.reward!.newBadges] }))
          }
        }
      } catch { /* ignore */ }
      setDone(true)
      return
    }
    setIndex(index + 1)
    setInput(''); setPicked(null); setResult(null)
  }
```

(d) 結束畫面顯示累計。把 `done` 區塊的 `<main>` 內容（在「本次複習了 ... 個單字。」之後、按鈕之前）插入獎勵摘要：

```tsx
        <div className="mt-6 space-y-1 text-sm text-gray-300">
          <p>獲得經驗值 <span className="font-semibold text-blue-400">+{rewards.xp} XP</span></p>
          {rewards.coins > 0 && <p>獲得金幣 <span className="font-semibold text-yellow-400">+{rewards.coins} 🪙</span></p>}
          {rewards.level !== null && <p className="text-green-400">升級到 Lv.{rewards.level}！</p>}
          {sessionPerfect && <p className="text-purple-400">完美一回，全部答對！</p>}
          {rewards.badges.length > 0 && <p>解鎖徽章：{rewards.badges.join('、')}</p>}
        </div>
```

(e) 確認檔案頂部已 import `submitAnswerAction, finishSessionAction`（既有）。`rewards.level` 初始為 `null`，僅升級時顯示。

- [ ] **Step 4: 型別檢查 + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 型別無誤、build 成功。

- [ ] **Step 5: Commit**

```bash
git add components/gamification-bar.tsx components/review-session.tsx app/page.tsx app/books/page.tsx
git commit -m "feat(gamification): top bar + session-end reward display"
```

---

## Task 12: 全量測試 + 手動驗證

**Files:**
- 無（驗證用）

- [ ] **Step 1: 全量單元測試**

Run: `npx vitest run`
Expected: 全部 PASS（既有 65 + 本輪新增）。

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 手動驗證（dev）**

啟動：`npm run dev`（背景），瀏覽器登入後：
- 首頁與 `/books` 顯示頂部列 🔥/Lv./🪙。
- 進 `/learn/<slug>` 連續作答，最後一題完成後結束畫面顯示 +XP（與本次答對/答錯次數相符：每對 +10、每錯 +2）。
- 達 dailyGoal（預設 20）那次應顯示 +50 🪙、streak 顯示為 1（首日）。
- 重新整理首頁，頂部列 XP→等級、coins、streak 已更新。

驗證後關閉 dev server（PowerShell：找 port 3000 的 node 程序並結束）。

- [ ] **Step 4: 最終 commit（若手動驗證有微調）**

```bash
git add -A
git commit -m "test(gamification): full suite green + manual verification"
```

---

## Self-Review

**1. Spec coverage：**
- §2 資料模型（GamificationState/UserBadge/User 反向）→ Task 1 ✓
- §3 獎勵常數 → Task 5 ✓
- §4 streak/每日目標/凍結（懶評估純函式）→ Task 5（updateStreak）+ Task 7（service 套用）✓
- §5 徽章設定資料 + evaluateBadges + countMastered → Task 4/5/6 ✓
- §6 顯示（頂部列 + 結束畫面 delta）→ Task 11 ✓
- §7 事件 payload 擴充 → Task 9 ✓
- §8 模組邊界 + 組合根 → Task 2–8（模組）+ Task 10（組合根）✓。**偏離記錄**：spec §8 原述「register.ts 訂閱 eventBus」，但 reward 需同步回傳 UI，故 P4a 由組合根直接呼叫 service；bus 事件接縫仍保留（payload 已擴充），`register.ts` 延後到出現 fire-and-forget 訂閱者時再建（YAGNI）。
- §9 測試策略 → 各 task TDD ✓
- §10 排除項 → 未納入（商店/排行榜/統計）✓
- §11 數字參數集中 → rules.ts/badges.ts ✓

**2. Placeholder scan：** 無 TBD/「適當處理」等；每個 code step 皆含完整程式。✓

**3. Type consistency：**
- `GamificationStateData` 欄位（xp/level/coinBalance/streak/longestStreak/lastGoalDate/reviewsToday/lastReviewDate/streakFreezes）在 types/repository/service 一致 ✓
- `getContext` 回傳 `{ state, timezone, dailyGoal }` 在 repository 定義、service 使用一致 ✓
- `applyReview` 輸入 `{ userId, correct, mastered, now }`、回傳 `ReviewReward` 在 service/actions 一致 ✓
- `finishSession`（learning）新增 `correct`；`finishSessionAction(reviewed, correct)`；`applySessionFinish({ userId, reviewed, correct, now })` 三處 correct 一致 ✓
- `updateStreak(daysSinceLastGoal, currentStreak, freezes)` 簽章在 rules 定義、service 呼叫一致 ✓
- `evaluateBadges(BadgeContext)` 在 rules 定義、service 兩處呼叫一致 ✓
