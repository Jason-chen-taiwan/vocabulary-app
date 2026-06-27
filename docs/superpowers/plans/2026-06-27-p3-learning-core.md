# P3 學習核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立線上學習迴圈——FSRS 間隔重複排程引擎（抽象於介面後）、每使用者卡片狀態與複習紀錄、每日複習佇列（到期卡 + 新卡配額）、翻卡式多模式複習 UI 與評分，並以領域事件發出 `ReviewCompleted`/`SessionFinished` 供 P4 遊戲化訂閱。

**Architecture:** 新增 `lib/learning` 模組與 `lib/events` 事件匯流排。排程藏在 `SchedulerService` 介面後（FSRS 為實作，可替換）。學習狀態存 `UserCard`（FSRS 三參數）+ `ReviewLog`（稽核/重算）。複習採 Anki 式翻卡 + 自評 4 級（Again/Hard/Good/Easy）；「多模式」= 卡片正面三種呈現（看英/看中/聽音）。寫入用各自單筆（避開 HTTP 模式不支援交易）。學習核心只 publish 事件，不直接呼叫遊戲化。

**Tech Stack:** Next.js 16 (App Router) · TypeScript · `ts-fsrs` · Prisma 7 + Neon · Vitest · Web Speech API

## Global Constraints

- 模組化優先：跨模組只透過介面與領域型別溝通；學習核心不得依賴遊戲化，只 publish 事件。
- 排程必須藏在 `SchedulerService` 介面後；上層不得直接 import `ts-fsrs`。
- ALL DB 存取經 repository 層；edge runtime DB 走 Neon HTTP driver（`getPrisma()`）。
- **交易限制**：PrismaNeonHttp 在 Prisma 7 不支援交易。複習寫入用各自單筆 `update`/`create`（先 UserCard 後 ReviewLog），不得用 `$transaction`/`createMany`/`upsert`（後兩者會觸發隱含交易而在 HTTP 模式失敗）。
- 純邏輯（排程映射、佇列、評分、事件）先寫測試（TDD）；UI / schema / 整合以可重現指令驗收。
- 純函式不得用 `Date.now()`：時間一律由呼叫端以 `now: Date` 注入（可測試）。
- 所有頁面登入守衛，與既有頁一致。繁中文案。npm；Windows / Git Bash；DB 已上線。
- 本計畫不含離線同步（獨立計畫）；不含遊戲化 UI/規則（P4，僅預留事件）。

---

### Task 1: 學習資料模型與領域型別

**Files:**
- Modify: `prisma/schema.prisma`（新增 UserCard、ReviewLog；於 User 與 Word 加反向關聯）
- Create: `lib/learning/types.ts`
- Create: `lib/learning/__tests__/types.test.ts`

**Interfaces:**
- Consumes: 既有 User（P1）、Word（P2）models。
- Produces:
  - Prisma models `UserCard`、`ReviewLog`（欄位見下）；User 加 `cards UserCard[]`、Word 加 `userCards UserCard[]`。
  - 領域型別：
    - `type Rating = 'again' | 'hard' | 'good' | 'easy'`
    - `type ReviewMode = 'recognition' | 'recall' | 'listening'`
    - `interface CardState { due: Date; stability: number; difficulty: number; elapsedDays: number; scheduledDays: number; reps: number; lapses: number; state: number; lastReview: Date | null }`
    - `RATING_TO_INT: Record<Rating, number>`（again=1,hard=2,good=3,easy=4）與 `toCardState(row)` 映射（Prisma row → CardState）。

- [ ] **Step 1: 新增 Prisma models 與反向關聯**

在 `prisma/schema.prisma` 末尾新增：
```prisma
model UserCard {
  id            String      @id @default(cuid())
  userId        String
  wordId        String
  due           DateTime
  stability     Float       @default(0)
  difficulty    Float       @default(0)
  elapsedDays   Int         @default(0)
  scheduledDays Int         @default(0)
  reps          Int         @default(0)
  lapses        Int         @default(0)
  state         Int         @default(0)
  lastReview    DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  word          Word        @relation(fields: [wordId], references: [id], onDelete: Cascade)
  reviewLogs    ReviewLog[]

  @@unique([userId, wordId])
  @@index([userId, due])
}

model ReviewLog {
  id              String   @id @default(cuid())
  userCardId      String
  rating          Int
  state           Int
  due             DateTime
  stability       Float
  difficulty      Float
  elapsedDays     Int
  lastElapsedDays Int
  scheduledDays   Int
  reviewedAt      DateTime @default(now())
  userCard        UserCard @relation(fields: [userCardId], references: [id], onDelete: Cascade)

  @@index([userCardId])
}
```
在既有 `model User` 內新增一行關聯欄位：`cards UserCard[]`
在既有 `model Word` 內新增一行關聯欄位：`userCards UserCard[]`

- [ ] **Step 2: 產生 client 並推送 schema 到 Neon**

Run:
```
npm run db:generate
npm run db:push
```
Expected: 成功；Neon 出現 `UserCard`、`ReviewLog` 表，既有表保留。

- [ ] **Step 3: 寫型別映射測試（先失敗）**

Create `lib/learning/__tests__/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { RATING_TO_INT, toCardState } from '@/lib/learning/types'

describe('RATING_TO_INT', () => {
  it('maps ratings to FSRS integers', () => {
    expect(RATING_TO_INT).toEqual({ again: 1, hard: 2, good: 3, easy: 4 })
  })
})

describe('toCardState', () => {
  it('maps a UserCard row to CardState (only the scheduling fields)', () => {
    const due = new Date('2026-07-01T00:00:00Z')
    const last = new Date('2026-06-27T00:00:00Z')
    const row = {
      id: 'c1', userId: 'u1', wordId: 'w1',
      due, stability: 3.5, difficulty: 5.2, elapsedDays: 1, scheduledDays: 4,
      reps: 2, lapses: 0, state: 2, lastReview: last,
      createdAt: new Date(), updatedAt: new Date(),
    }
    expect(toCardState(row as any)).toEqual({
      due, stability: 3.5, difficulty: 5.2, elapsedDays: 1, scheduledDays: 4,
      reps: 2, lapses: 0, state: 2, lastReview: last,
    })
  })

  it('keeps lastReview null when absent', () => {
    const due = new Date('2026-07-01T00:00:00Z')
    const row = { due, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null }
    expect(toCardState(row as any).lastReview).toBeNull()
  })
})
```

- [ ] **Step 4: 執行確認失敗**

Run: `npm test -- learning/__tests__/types`
Expected: FAIL，找不到 `@/lib/learning/types`。

- [ ] **Step 5: 實作型別**

Create `lib/learning/types.ts`:
```ts
export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type ReviewMode = 'recognition' | 'recall' | 'listening'

export const RATING_TO_INT: Record<Rating, number> = { again: 1, hard: 2, good: 3, easy: 4 }

export interface CardState {
  due: Date
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: number
  lastReview: Date | null
}

type UserCardRow = {
  due: Date; stability: number; difficulty: number; elapsedDays: number
  scheduledDays: number; reps: number; lapses: number; state: number; lastReview: Date | null
}

export function toCardState(row: UserCardRow): CardState {
  return {
    due: row.due, stability: row.stability, difficulty: row.difficulty,
    elapsedDays: row.elapsedDays, scheduledDays: row.scheduledDays,
    reps: row.reps, lapses: row.lapses, state: row.state, lastReview: row.lastReview,
  }
}
```

- [ ] **Step 6: 執行確認通過**

Run: `npm test -- learning/__tests__/types`
Expected: PASS（3 passed）。

- [ ] **Step 7: 確認全套與 build**

Run: `npm test && npm run build`
Expected: 全套通過；build exit 0。

- [ ] **Step 8: Commit**

```
git add prisma/schema.prisma lib/learning/types.ts lib/learning/__tests__/types.test.ts
git commit -m "feat(learning): add UserCard/ReviewLog models and learning domain types"
```

---

### Task 2: 排程引擎抽象（FSRS）

**Files:**
- Create: `lib/learning/scheduler.ts`
- Create: `lib/learning/__tests__/scheduler.test.ts`
- Modify: `package.json`（安裝 ts-fsrs — 由 npm install 自動）

**Interfaces:**
- Consumes: Task 1 `CardState`、`Rating`。
- Produces:
  - `interface SchedulerService { newCard(now: Date): CardState; review(card: CardState, rating: Rating, now: Date): CardState }`
  - `class FsrsScheduler implements SchedulerService`（用 ts-fsrs，關閉 fuzz 以求確定性）。
  - 預設匯出單例 `export const scheduler: SchedulerService = new FsrsScheduler()`。

- [ ] **Step 1: 安裝 ts-fsrs**

Run:
```
npm install ts-fsrs
```
Expected: dependencies 出現 ts-fsrs。

- [ ] **Step 2: 寫排程測試（先失敗）**

Create `lib/learning/__tests__/scheduler.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { FsrsScheduler } from '@/lib/learning/scheduler'

const now = new Date('2026-06-27T00:00:00Z')

describe('FsrsScheduler', () => {
  it('newCard starts in the New state, reps 0, due at now', () => {
    const s = new FsrsScheduler()
    const c = s.newCard(now)
    expect(c.state).toBe(0)
    expect(c.reps).toBe(0)
    expect(c.due.getTime()).toBe(now.getTime())
    expect(c.lastReview).toBeNull()
  })

  it('review with "good" advances reps and schedules due in the future', () => {
    const s = new FsrsScheduler()
    const next = s.review(s.newCard(now), 'good', now)
    expect(next.reps).toBe(1)
    expect(next.due.getTime()).toBeGreaterThan(now.getTime())
    expect(next.lastReview?.getTime()).toBe(now.getTime())
    expect(next.state).toBeGreaterThan(0) // left New
  })

  it('review with "again" keeps the card due very soon (shorter than "good")', () => {
    const s = new FsrsScheduler()
    const card = s.newCard(now)
    const again = s.review(card, 'again', now)
    const good = s.review(card, 'good', now)
    expect(again.due.getTime()).toBeLessThan(good.due.getTime())
    expect(again.lapses).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic (fuzz disabled): same input → same due', () => {
    const s = new FsrsScheduler()
    const card = s.newCard(now)
    expect(s.review(card, 'good', now).due.getTime()).toBe(s.review(card, 'good', now).due.getTime())
  })
})
```

- [ ] **Step 3: 執行確認失敗**

Run: `npm test -- learning/__tests__/scheduler`
Expected: FAIL，找不到 `@/lib/learning/scheduler`。

- [ ] **Step 4: 實作 FsrsScheduler**

Create `lib/learning/scheduler.ts`:
```ts
import { fsrs, generatorParameters, createEmptyCard, Rating as FsrsRating, type Card, type FSRS } from 'ts-fsrs'
import type { CardState, Rating } from './types'

const RATING_MAP: Record<Rating, FsrsRating> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
}

function toCardState(card: Card): CardState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  }
}

function toFsrsCard(state: CardState): Card {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview ?? undefined,
  } as Card
}

export interface SchedulerService {
  newCard(now: Date): CardState
  review(card: CardState, rating: Rating, now: Date): CardState
}

export class FsrsScheduler implements SchedulerService {
  private readonly f: FSRS
  constructor() {
    // enable_fuzz: false → deterministic scheduling (required for tests + reproducibility)
    this.f = fsrs(generatorParameters({ enable_fuzz: false }))
  }

  newCard(now: Date): CardState {
    return toCardState(createEmptyCard(now))
  }

  review(card: CardState, rating: Rating, now: Date): CardState {
    const result = this.f.next(toFsrsCard(card), now, RATING_MAP[rating])
    return toCardState(result.card)
  }
}

export const scheduler: SchedulerService = new FsrsScheduler()
```
> 註：若安裝的 ts-fsrs 版本 API 有差異（如 `next` 回傳形狀、Card 欄位命名），以實際安裝版本的型別為準調整映射，並在報告說明。`createEmptyCard(now)` 的 `due` 應等於 `now`。

- [ ] **Step 5: 執行確認通過**

Run: `npm test -- learning/__tests__/scheduler`
Expected: PASS（4 passed）。

- [ ] **Step 6: 確認全套與 build**

Run: `npm test && npm run build`
Expected: 全套通過；build exit 0。

- [ ] **Step 7: Commit**

```
git add lib/learning/scheduler.ts lib/learning/__tests__/scheduler.test.ts package.json package-lock.json
git commit -m "feat(learning): add SchedulerService interface and FSRS implementation"
```

---

### Task 3: 領域事件匯流排

**Files:**
- Create: `lib/events/bus.ts`
- Create: `lib/events/__tests__/bus.test.ts`

**Interfaces:**
- Consumes: Task 1 `Rating`。
- Produces:
  - `type DomainEvent = { type: 'ReviewCompleted'; userId: string; wordId: string; rating: Rating; at: Date } | { type: 'SessionFinished'; userId: string; reviewed: number; at: Date }`
  - `class EventBus { subscribe(type, handler): void; publish(event): Promise<void> }`，`publish` 依序 await 所有該類型 handler。
  - 單例 `export const eventBus = new EventBus()`。P4 遊戲化將 `eventBus.subscribe('ReviewCompleted', ...)`。

- [ ] **Step 1: 寫事件匯流排測試（先失敗）**

Create `lib/events/__tests__/bus.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/lib/events/bus'

const at = new Date('2026-06-27T00:00:00Z')

describe('EventBus', () => {
  it('delivers an event to subscribers of that type only', async () => {
    const bus = new EventBus()
    const onReview = vi.fn()
    const onSession = vi.fn()
    bus.subscribe('ReviewCompleted', onReview)
    bus.subscribe('SessionFinished', onSession)
    await bus.publish({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', at })
    expect(onReview).toHaveBeenCalledOnce()
    expect(onReview).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', at })
    expect(onSession).not.toHaveBeenCalled()
  })

  it('awaits async handlers', async () => {
    const bus = new EventBus()
    const order: string[] = []
    bus.subscribe('SessionFinished', async () => { await Promise.resolve(); order.push('handler') })
    await bus.publish({ type: 'SessionFinished', userId: 'u1', reviewed: 5, at })
    order.push('after')
    expect(order).toEqual(['handler', 'after'])
  })

  it('publish with no subscribers resolves quietly', async () => {
    const bus = new EventBus()
    await expect(bus.publish({ type: 'SessionFinished', userId: 'u1', reviewed: 0, at })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- events/__tests__/bus`
Expected: FAIL，找不到 `@/lib/events/bus`。

- [ ] **Step 3: 實作事件匯流排**

Create `lib/events/bus.ts`:
```ts
import type { Rating } from '@/lib/learning/types'

export type DomainEvent =
  | { type: 'ReviewCompleted'; userId: string; wordId: string; rating: Rating; at: Date }
  | { type: 'SessionFinished'; userId: string; reviewed: number; at: Date }

type EventType = DomainEvent['type']
type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>
type Handler<T extends EventType> = (event: EventOf<T>) => void | Promise<void>

export class EventBus {
  private readonly handlers = new Map<EventType, Handler<EventType>[]>()

  subscribe<T extends EventType>(type: T, handler: Handler<T>): void {
    const list = this.handlers.get(type) ?? []
    list.push(handler as Handler<EventType>)
    this.handlers.set(type, list)
  }

  async publish(event: DomainEvent): Promise<void> {
    const list = this.handlers.get(event.type) ?? []
    for (const handler of list) {
      await handler(event)
    }
  }
}

export const eventBus = new EventBus()
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- events/__tests__/bus`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```
git add lib/events/bus.ts lib/events/__tests__/bus.test.ts
git commit -m "feat(events): add in-process domain event bus"
```

---

### Task 4: 學習 Repository

**Files:**
- Create: `lib/learning/repository.ts`
- Create: `lib/learning/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: Task 1 `CardState`、`toCardState`；P1 `getPrisma()`。
- Produces: `LearningRepository`（建構子可注入 prisma-like db，預設 `getPrisma()`），方法：
  - `getCard(userId: string, wordId: string): Promise<CardState | null>`
  - `saveCard(userId, wordId, state: CardState): Promise<void>`（單筆 update-or-create，不用 upsert/transaction）
  - `createReviewLog(input: { userCardId: string; rating: number; state: number; due: Date; stability: number; difficulty: number; elapsedDays: number; lastElapsedDays: number; scheduledDays: number }): Promise<void>`
  - `getCardId(userId, wordId): Promise<string | null>`
  - `listDueCards(userId, now: Date, limit: number): Promise<{ wordId: string; state: CardState }[]>`
  - `listNewWordIds(userId, wordBookId, limit: number): Promise<string[]>`（該書中該使用者尚無 UserCard 的 word id，依 order）

- [ ] **Step 1: 寫 repository 測試（先失敗）**

Create `lib/learning/__tests__/repository.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { LearningRepository } from '@/lib/learning/repository'

const now = new Date('2026-06-27T00:00:00Z')
const state = { due: now, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now }

function makeDb() {
  return {
    userCard: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    word: { findMany: vi.fn() },
    reviewLog: { create: vi.fn() },
  }
}

describe('LearningRepository', () => {
  it('getCard returns null when no card', async () => {
    const db = makeDb(); db.userCard.findUnique.mockResolvedValue(null)
    const repo = new LearningRepository(db as any)
    expect(await repo.getCard('u1', 'w1')).toBeNull()
    expect(db.userCard.findUnique).toHaveBeenCalledWith({ where: { userId_wordId: { userId: 'u1', wordId: 'w1' } } })
  })

  it('saveCard updates when the card exists', async () => {
    const db = makeDb(); db.userCard.findUnique.mockResolvedValue({ id: 'c1' })
    const repo = new LearningRepository(db as any)
    await repo.saveCard('u1', 'w1', state)
    expect(db.userCard.update).toHaveBeenCalledWith({
      where: { userId_wordId: { userId: 'u1', wordId: 'w1' } },
      data: { due: now, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now },
    })
    expect(db.userCard.create).not.toHaveBeenCalled()
  })

  it('saveCard creates when the card does not exist', async () => {
    const db = makeDb(); db.userCard.findUnique.mockResolvedValue(null)
    const repo = new LearningRepository(db as any)
    await repo.saveCard('u1', 'w1', state)
    expect(db.userCard.create).toHaveBeenCalledWith({
      data: { userId: 'u1', wordId: 'w1', due: now, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now },
    })
  })

  it('listDueCards maps rows to {wordId, state} ordered by due, limited', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([{ wordId: 'w1', due: now, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }])
    const repo = new LearningRepository(db as any)
    const result = await repo.listDueCards('u1', now, 50)
    expect(db.userCard.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', due: { lte: now } }, orderBy: { due: 'asc' }, take: 50 })
    expect(result).toEqual([{ wordId: 'w1', state: { due: now, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now } }])
  })

  it('listNewWordIds finds words in the book with no card for the user', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([{ id: 'w2' }, { id: 'w3' }])
    const repo = new LearningRepository(db as any)
    const ids = await repo.listNewWordIds('u1', 'b1', 10)
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { wordBookId: 'b1', userCards: { none: { userId: 'u1' } } },
      orderBy: { order: 'asc' }, take: 10, select: { id: true },
    })
    expect(ids).toEqual(['w2', 'w3'])
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- learning/__tests__/repository`
Expected: FAIL，找不到 `@/lib/learning/repository`。

- [ ] **Step 3: 實作 repository**

Create `lib/learning/repository.ts`:
```ts
import { getPrisma } from '@/lib/db/client'
import { toCardState, type CardState } from './types'

interface LearningDb {
  userCard: {
    findUnique(args: unknown): Promise<unknown | null>
    create(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
    findMany(args: unknown): Promise<unknown[]>
  }
  word: { findMany(args: unknown): Promise<unknown[]> }
  reviewLog: { create(args: unknown): Promise<unknown> }
}

function stateData(state: CardState) {
  return {
    due: state.due, stability: state.stability, difficulty: state.difficulty,
    elapsedDays: state.elapsedDays, scheduledDays: state.scheduledDays,
    reps: state.reps, lapses: state.lapses, state: state.state, lastReview: state.lastReview,
  }
}

export interface ReviewLogInput {
  userCardId: string; rating: number; state: number; due: Date
  stability: number; difficulty: number; elapsedDays: number
  lastElapsedDays: number; scheduledDays: number
}

export class LearningRepository {
  private readonly db: LearningDb
  constructor(db?: LearningDb) {
    this.db = db ?? (getPrisma() as unknown as LearningDb)
  }

  async getCard(userId: string, wordId: string): Promise<CardState | null> {
    const row = await this.db.userCard.findUnique({ where: { userId_wordId: { userId, wordId } } })
    return row ? toCardState(row as Parameters<typeof toCardState>[0]) : null
  }

  async getCardId(userId: string, wordId: string): Promise<string | null> {
    const row = (await this.db.userCard.findUnique({ where: { userId_wordId: { userId, wordId } } })) as { id: string } | null
    return row?.id ?? null
  }

  async saveCard(userId: string, wordId: string, state: CardState): Promise<void> {
    const existing = await this.db.userCard.findUnique({ where: { userId_wordId: { userId, wordId } } })
    if (existing) {
      await this.db.userCard.update({ where: { userId_wordId: { userId, wordId } }, data: stateData(state) })
    } else {
      await this.db.userCard.create({ data: { userId, wordId, ...stateData(state) } })
    }
  }

  async createReviewLog(input: ReviewLogInput): Promise<void> {
    await this.db.reviewLog.create({ data: { ...input, reviewedAt: undefined } as ReviewLogInput })
  }

  async listDueCards(userId: string, now: Date, limit: number): Promise<{ wordId: string; state: CardState }[]> {
    const rows = await this.db.userCard.findMany({ where: { userId, due: { lte: now } }, orderBy: { due: 'asc' }, take: limit })
    return (rows as ({ wordId: string } & Parameters<typeof toCardState>[0])[]).map((r) => ({ wordId: r.wordId, state: toCardState(r) }))
  }

  async listNewWordIds(userId: string, wordBookId: string, limit: number): Promise<string[]> {
    const rows = await this.db.word.findMany({
      where: { wordBookId, userCards: { none: { userId } } },
      orderBy: { order: 'asc' }, take: limit, select: { id: true },
    })
    return (rows as { id: string }[]).map((r) => r.id)
  }
}
```
> 註：`createReviewLog` 以單筆 `create` 寫入（HTTP 模式 OK）。`reviewedAt: undefined` 讓 DB 套用 `@default(now())`；若型別不接受，移除該鍵即可（schema 已有預設）。測試中 `createReviewLog` 未直接斷言，於 Task 6 整合驗證。

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- learning/__tests__/repository`
Expected: PASS（5 passed）。

- [ ] **Step 5: Commit**

```
git add lib/learning/repository.ts lib/learning/__tests__/repository.test.ts
git commit -m "feat(learning): add LearningRepository (cards, logs, due + new queries)"
```

---

### Task 5: 複習佇列建構器

**Files:**
- Create: `lib/learning/session.ts`
- Create: `lib/learning/__tests__/session.test.ts`

**Interfaces:**
- Consumes: Task 1 `CardState`/`ReviewMode`；Task 2 `SchedulerService`（`scheduler`）；Task 4 `LearningRepository`；P2 `ContentRepository`。
- Produces:
  - 純函式 `assignMode(index: number): ReviewMode`（0→recognition,1→recall,2→listening 輪替）。
  - `interface SessionItem { wordId: string; mode: ReviewMode; isNew: boolean }`
  - `buildSession(args: { userId: string; wordBookId: string; now: Date; newLimit: number; dueLimit: number }, deps: { learning: LearningRepository }): Promise<SessionItem[]>`：先到期卡（isNew=false）後新卡（isNew=true，新卡 wordId 來自 `listNewWordIds`），每項依整體索引 `assignMode`。

- [ ] **Step 1: 寫測試（先失敗）**

Create `lib/learning/__tests__/session.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { assignMode, buildSession } from '@/lib/learning/session'

const now = new Date('2026-06-27T00:00:00Z')
const st = { due: now, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }

describe('assignMode', () => {
  it('rotates recognition → recall → listening', () => {
    expect([0, 1, 2, 3, 4].map(assignMode)).toEqual(['recognition', 'recall', 'listening', 'recognition', 'recall'])
  })
})

describe('buildSession', () => {
  it('puts due cards first, then new words, assigning modes by overall index', async () => {
    const learning = {
      listDueCards: vi.fn().mockResolvedValue([{ wordId: 'd1', state: st }, { wordId: 'd2', state: st }]),
      listNewWordIds: vi.fn().mockResolvedValue(['n1']),
    }
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50 }, { learning: learning as any })
    expect(learning.listDueCards).toHaveBeenCalledWith('u1', now, 50)
    expect(learning.listNewWordIds).toHaveBeenCalledWith('u1', 'b1', 5)
    expect(items).toEqual([
      { wordId: 'd1', mode: 'recognition', isNew: false },
      { wordId: 'd2', mode: 'recall', isNew: false },
      { wordId: 'n1', mode: 'listening', isNew: true },
    ])
  })

  it('returns [] when nothing due and no new words', async () => {
    const learning = { listDueCards: vi.fn().mockResolvedValue([]), listNewWordIds: vi.fn().mockResolvedValue([]) }
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50 }, { learning: learning as any })
    expect(items).toEqual([])
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- learning/__tests__/session`
Expected: FAIL，找不到 `@/lib/learning/session`。

- [ ] **Step 3: 實作**

Create `lib/learning/session.ts`:
```ts
import type { ReviewMode } from './types'
import type { LearningRepository } from './repository'

const MODES: ReviewMode[] = ['recognition', 'recall', 'listening']

export function assignMode(index: number): ReviewMode {
  return MODES[index % MODES.length]
}

export interface SessionItem {
  wordId: string
  mode: ReviewMode
  isNew: boolean
}

export async function buildSession(
  args: { userId: string; wordBookId: string; now: Date; newLimit: number; dueLimit: number },
  deps: { learning: LearningRepository },
): Promise<SessionItem[]> {
  const due = await deps.learning.listDueCards(args.userId, args.now, args.dueLimit)
  const newIds = await deps.learning.listNewWordIds(args.userId, args.wordBookId, args.newLimit)
  const items: SessionItem[] = [
    ...due.map((d) => ({ wordId: d.wordId, isNew: false })),
    ...newIds.map((id) => ({ wordId: id, isNew: true })),
  ].map((item, index) => ({ ...item, mode: assignMode(index) }))
  return items
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- learning/__tests__/session`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```
git add lib/learning/session.ts lib/learning/__tests__/session.test.ts
git commit -m "feat(learning): add session builder (due + new queue, mode rotation)"
```

---

### Task 6: 送出複習服務（排程 + 持久化 + 事件）

**Files:**
- Create: `lib/learning/submit.ts`
- Create: `lib/learning/__tests__/submit.test.ts`

**Interfaces:**
- Consumes: Task 1 `Rating`/`RATING_TO_INT`/`CardState`；Task 2 `SchedulerService`；Task 3 `EventBus`/`DomainEvent`；Task 4 `LearningRepository`。
- Produces:
  - `submitReview(input: { userId: string; wordId: string; rating: Rating; now: Date }, deps: { learning: LearningRepository; scheduler: SchedulerService; bus: EventBus }): Promise<CardState>`：取得現有 card（無則 `scheduler.newCard`）→ `scheduler.review` → `learning.saveCard`（先）→ `learning.createReviewLog`（後，需 cardId）→ `bus.publish(ReviewCompleted)` → 回傳新狀態。
  - `finishSession(input: { userId: string; reviewed: number; now: Date }, deps: { bus: EventBus }): Promise<void>`：`bus.publish(SessionFinished)`。

- [ ] **Step 1: 寫測試（先失敗）**

Create `lib/learning/__tests__/submit.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { submitReview, finishSession } from '@/lib/learning/submit'

const now = new Date('2026-06-27T00:00:00Z')
const newState = { due: now, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null }
const reviewed = { due: new Date('2026-06-28T00:00:00Z'), stability: 2, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }

function deps(existing: any) {
  const learning = {
    getCard: vi.fn().mockResolvedValue(existing),
    saveCard: vi.fn().mockResolvedValue(undefined),
    getCardId: vi.fn().mockResolvedValue('c1'),
    createReviewLog: vi.fn().mockResolvedValue(undefined),
  }
  const scheduler = { newCard: vi.fn().mockReturnValue(newState), review: vi.fn().mockReturnValue(reviewed) }
  const bus = { publish: vi.fn().mockResolvedValue(undefined) }
  return { learning, scheduler, bus }
}

describe('submitReview', () => {
  it('creates a new card state when none exists, schedules, saves, logs, and publishes', async () => {
    const d = deps(null)
    const result = await submitReview({ userId: 'u1', wordId: 'w1', rating: 'good', now }, d as any)
    expect(d.scheduler.newCard).toHaveBeenCalledWith(now)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'good', now)
    // saveCard BEFORE createReviewLog (UserCard is the source of truth)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed)
    expect(d.learning.createReviewLog).toHaveBeenCalledWith(expect.objectContaining({ userCardId: 'c1', rating: 3, state: reviewed.state, due: reviewed.due }))
    expect(d.bus.publish).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', at: now })
    expect(result).toEqual(reviewed)
  })

  it('uses the existing card state when present', async () => {
    const d = deps(newState)
    await submitReview({ userId: 'u1', wordId: 'w1', rating: 'again', now }, d as any)
    expect(d.scheduler.newCard).not.toHaveBeenCalled()
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'again', now)
  })
})

describe('finishSession', () => {
  it('publishes SessionFinished', async () => {
    const bus = { publish: vi.fn().mockResolvedValue(undefined) }
    await finishSession({ userId: 'u1', reviewed: 7, now }, { bus } as any)
    expect(bus.publish).toHaveBeenCalledWith({ type: 'SessionFinished', userId: 'u1', reviewed: 7, at: now })
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- learning/__tests__/submit`
Expected: FAIL，找不到 `@/lib/learning/submit`。

- [ ] **Step 3: 實作**

Create `lib/learning/submit.ts`:
```ts
import { RATING_TO_INT, type CardState, type Rating } from './types'
import type { SchedulerService } from './scheduler'
import type { LearningRepository } from './repository'
import type { EventBus } from '@/lib/events/bus'

export async function submitReview(
  input: { userId: string; wordId: string; rating: Rating; now: Date },
  deps: { learning: LearningRepository; scheduler: SchedulerService; bus: EventBus },
): Promise<CardState> {
  const { userId, wordId, rating, now } = input
  const existing = await deps.learning.getCard(userId, wordId)
  const before = existing ?? deps.scheduler.newCard(now)
  const next = deps.scheduler.review(before, rating, now)

  // UserCard is the source of truth — write it first (single write, HTTP-safe).
  await deps.learning.saveCard(userId, wordId, next)

  // ReviewLog is append-only audit — best-effort after the card is saved.
  const cardId = await deps.learning.getCardId(userId, wordId)
  if (cardId) {
    await deps.learning.createReviewLog({
      userCardId: cardId,
      rating: RATING_TO_INT[rating],
      state: next.state,
      due: next.due,
      stability: next.stability,
      difficulty: next.difficulty,
      elapsedDays: next.elapsedDays,
      lastElapsedDays: before.elapsedDays,
      scheduledDays: next.scheduledDays,
    })
  }

  await deps.bus.publish({ type: 'ReviewCompleted', userId, wordId, rating, at: now })
  return next
}

export async function finishSession(
  input: { userId: string; reviewed: number; now: Date },
  deps: { bus: EventBus },
): Promise<void> {
  await deps.bus.publish({ type: 'SessionFinished', userId: input.userId, reviewed: input.reviewed, at: input.now })
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- learning/__tests__/submit`
Expected: PASS（3 passed）。

- [ ] **Step 5: 確認全套與 build**

Run: `npm test && npm run build`
Expected: 全套通過；build exit 0。

- [ ] **Step 6: Commit**

```
git add lib/learning/submit.ts lib/learning/__tests__/submit.test.ts
git commit -m "feat(learning): add submitReview/finishSession (schedule, persist, emit events)"
```

---

### Task 7: 複習 UI（伺服器頁 + 客戶端流程 + server actions）

**Files:**
- Create: `app/learn/[slug]/page.tsx`
- Create: `app/learn/[slug]/actions.ts`
- Create: `components/review-session.tsx`
- Modify: `app/books/[slug]/page.tsx`（加「開始複習」入口連結）

**Interfaces:**
- Consumes: P1 `getCurrentUser()`；P2 `ContentRepository`（`getWordBookBySlug`、`getWordWithExamples`）；Task 4 `LearningRepository`；Task 5 `buildSession`；Task 6 `submitReview`/`finishSession`；Task 1 `Rating`/`ReviewMode`；Task 2 `scheduler`；Task 3 `eventBus`；P2 `TtsButton`。
- Produces: `/learn/<slug>` 複習頁；server actions `submitReviewAction`、`finishSessionAction`；翻卡式 UI 元件 `<ReviewSession>`。

- [ ] **Step 1: 建立 server actions**

Create `app/learn/[slug]/actions.ts`:
```ts
'use server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { eventBus } from '@/lib/events/bus'
import { submitReview, finishSession } from '@/lib/learning/submit'
import type { Rating } from '@/lib/learning/types'

export async function submitReviewAction(wordId: string, rating: Rating): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  await submitReview(
    { userId: user.id, wordId, rating, now: new Date() },
    { learning: new LearningRepository(), scheduler, bus: eventBus },
  )
  return { ok: true }
}

export async function finishSessionAction(reviewed: number): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  await finishSession({ userId: user.id, reviewed, now: new Date() }, { bus: eventBus })
  return { ok: true }
}
```

- [ ] **Step 2: 建立複習頁（伺服器組裝 session 資料）**

Create `app/learn/[slug]/page.tsx`:
```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { buildSession } from '@/lib/learning/session'
import { ReviewSession, type ReviewCard } from '@/components/review-session'

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const content = new ContentRepository()
  const book = await content.getWordBookBySlug(slug)
  if (!book) notFound()

  const items = await buildSession(
    { userId: user.id, wordBookId: book.id, now: new Date(), newLimit: user.dailyGoal ?? 20, dueLimit: 100 },
    { learning: new LearningRepository() },
  )

  const cards: ReviewCard[] = []
  for (const item of items) {
    const word = await content.getWordWithExamples(item.wordId)
    if (word) cards.push({ mode: item.mode, isNew: item.isNew, word })
  }

  if (cards.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{book.name}</h1>
        <p className="mt-4 text-gray-400">今天沒有待複習的單字了 🎉</p>
        <Link href={`/books/${slug}`} className="mt-6 inline-block text-sm text-gray-400 hover:underline">← 回單字書</Link>
      </main>
    )
  }
  return <ReviewSession bookName={book.name} bookSlug={slug} cards={cards} />
}
```
> 註：`getCurrentUser()` 回傳的 `SessionUser` 目前不含 `dailyGoal`。本步驟用 `user.dailyGoal ?? 20`；若 `SessionUser` 未含該欄位導致型別錯誤，改用常數 `20`（並在報告註明：dailyGoal 個人化留待後續）。

- [ ] **Step 3: 建立翻卡式複習元件**

Create `components/review-session.tsx`:
```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TtsButton } from '@/components/tts-button'
import type { WordWithExamples } from '@/lib/content/types'
import type { ReviewMode, Rating } from '@/lib/learning/types'
import { submitReviewAction, finishSessionAction } from '@/app/learn/[slug]/actions'

export interface ReviewCard {
  mode: ReviewMode
  isNew: boolean
  word: WordWithExamples
}

const RATINGS: { rating: Rating; label: string; className: string }[] = [
  { rating: 'again', label: '忘記', className: 'bg-red-600' },
  { rating: 'hard', label: '困難', className: 'bg-orange-600' },
  { rating: 'good', label: '良好', className: 'bg-green-600' },
  { rating: 'easy', label: '簡單', className: 'bg-blue-600' },
]

export function ReviewSession({ bookName, bookSlug, cards }: { bookName: string; bookSlug: string; cards: ReviewCard[] }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const card = cards[index]

  async function grade(rating: Rating) {
    if (busy) return
    setBusy(true)
    await submitReviewAction(card.word.id, rating)
    setBusy(false)
    if (index + 1 >= cards.length) {
      await finishSessionAction(cards.length)
      setDone(true)
    } else {
      setIndex(index + 1)
      setRevealed(false)
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">完成！</h1>
        <p className="mt-4 text-gray-400">本次複習了 {cards.length} 個單字。</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link href={`/books/${bookSlug}`} className="text-sm text-gray-400 hover:underline">← 回單字書</Link>
          <button onClick={() => router.refresh()} className="text-sm text-blue-400 hover:underline">再來一輪</button>
        </div>
      </main>
    )
  }

  // Front face depends on mode: recognition shows English; recall shows Chinese; listening shows only audio.
  const showEnglishFront = card.mode === 'recognition'
  const showChineseFront = card.mode === 'recall'
  const showAudioFront = card.mode === 'listening'

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
      <div className="mb-4 flex items-center justify-between text-sm text-gray-500">
        <Link href={`/books/${bookSlug}`} className="hover:underline">← {bookName}</Link>
        <span>{index + 1} / {cards.length}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {card.isNew && <span className="rounded-full bg-yellow-600 px-2 py-0.5 text-xs">新字</span>}

        {showEnglishFront && <div className="text-4xl font-bold">{card.word.headword}</div>}
        {showChineseFront && <div className="text-2xl">{card.word.definitionZh}</div>}
        {showAudioFront && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-500">聽發音，回想這個字</span>
            <TtsButton text={card.word.headword} />
          </div>
        )}

        {revealed && (
          <div className="mt-2 border-t border-gray-700 pt-4">
            <div className="flex items-center justify-center gap-2 text-3xl font-bold">
              {card.word.headword}<TtsButton text={card.word.headword} />
            </div>
            {card.word.phonetic && <div className="text-gray-400">{card.word.phonetic}</div>}
            <div className="mt-1 text-xl">{card.word.definitionZh}</div>
            {card.word.examples[0] && (
              <div className="mt-3 text-sm text-gray-400">
                <p>{card.word.examples[0].sentence}</p>
                <p>{card.word.examples[0].translationZh}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        {!revealed ? (
          <button onClick={() => setRevealed(true)} className="w-full rounded-lg bg-white py-3 font-medium text-black">
            顯示答案
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button key={r.rating} disabled={busy} onClick={() => grade(r.rating)}
                className={`${r.className} rounded-lg py-3 text-sm font-medium text-white disabled:opacity-50`}>
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: 單字書頁加「開始複習」入口**

Modify `app/books/[slug]/page.tsx`：在 `<h1>{book.name}</h1>` 之後加入複習入口連結（保留既有單字列表）。確保檔案頂部已 import `Link`（已有）。插入：
```tsx
<Link href={`/learn/${slug}`} className="mb-4 inline-block rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-gray-200">
  開始複習
</Link>
```

- [ ] **Step 5: 確認全套測試與 build**

Run: `npm test && npm run build`
Expected: 全套通過（前面任務的單元測試）；build exit 0；路由清單含 `/learn/[slug]`。

- [ ] **Step 6: 手動驗證（dev，需登入）**

Run: `npm run dev`，登入後到 `/books/toeic-core` 點「開始複習」
Expected: 進入複習流程；看到卡片正面（依模式為英文/中文/聽音）→ 點「顯示答案」顯示完整內容 → 點 Again/Hard/Good/Easy 評分 → 進下一張；最後一張評分後顯示「完成！複習了 N 個單字」。重新整理後，剛學的新字已建立 UserCard（之後依 FSRS 到期才再出現），故第二次進入待複習數會變化。

- [ ] **Step 7: 驗證資料已寫入 Neon**

Run:
```
node -e "import('dotenv/config').then(async()=>{const{neon}=await import('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);const c=await sql\`SELECT count(*)::int n FROM \"UserCard\"\`;const l=await sql\`SELECT count(*)::int n FROM \"ReviewLog\"\`;console.log('UserCards',c[0].n,'ReviewLogs',l[0].n);})"
```
Expected: 完成一輪複習後，UserCard 與 ReviewLog 筆數 > 0。

- [ ] **Step 8: Commit**

```
git add app/learn components/review-session.tsx app/books/[slug]/page.tsx
git commit -m "feat(learning): add flashcard review session UI and server actions"
```

---

## Self-Review

**Spec coverage（P3 範圍）：**
- FSRS 排程引擎，藏於 `SchedulerService` 介面後（可調/可換）→ Task 2 ✅（目標記憶率等進階參數可後續加在 FsrsScheduler）
- UserCard（FSRS 三參數）+ ReviewLog → Task 1 ✅
- 每日複習佇列（到期卡 + 新卡配額）→ Task 4（查詢）+ Task 5（組裝）✅
- 多模式複習（看英/看中/聽音）→ Task 5（assignMode）+ Task 7（三種正面）✅
- 4 級評分驅動排程 → Task 2 + Task 6 + Task 7 ✅
- 學習核心只發事件（ReviewCompleted/SessionFinished），供 P4 訂閱 → Task 3 + Task 6 ✅
- 例句語境 + TTS → Task 7（翻卡背面 + 聽音模式）✅
- repository 收斂、介面解耦、TDD、登入守衛、繁中 → Global Constraints 並落實各 Task ✅

**刻意決策（非缺口）：**
- 採 Anki 式翻卡 + 自評（非選擇題/拼寫）——更忠於 FSRS、更乾淨可測；選擇題/拼寫模式為日後 UX 增強，`ReviewMode` 抽象已預留三模式。
- 寫入用各自單筆（先 UserCard 後 ReviewLog），避開 HTTP 模式不支援交易；ReviewLog 為稽核、最壞情況為偶發稽核缺漏（不影響排程正確性）。
- FSRS 關閉 fuzz 以求確定性與可測；目標記憶率（desired retention）滑桿為後續增強。
- 「目標記憶率可調」屬未來增強，本輪用 FSRS 預設（0.9）。
- 離線同步、遊戲化規則/UI 不在本計畫（各自獨立計畫）。

**Placeholder scan：** 無 TBD/TODO；每個 code step 均含完整程式碼與確切指令/預期輸出。

**Type consistency：** `Rating`/`ReviewMode`/`CardState`/`RATING_TO_INT`/`toCardState`、`SchedulerService`/`FsrsScheduler`/`scheduler`、`EventBus`/`DomainEvent`/`eventBus`、`LearningRepository`（`getCard`/`getCardId`/`saveCard`/`createReviewLog`/`listDueCards`/`listNewWordIds`）、`assignMode`/`SessionItem`/`buildSession`、`submitReview`/`finishSession`、`ReviewSession`/`ReviewCard` 於定義與消費處名稱一致。Prisma 複合唯一鍵 `userId_wordId` 對應 `@@unique([userId, wordId])`。
