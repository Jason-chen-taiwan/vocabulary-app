# 作答模式（主動回憶複習）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 P3 的翻卡自評複習改寫為主動回憶作答（選擇題 / 克漏字 / 拼寫），以「連續答對次數階梯」推導 FSRS 評分並在第 5 次答對時標記「記憶完成」，並對記憶完成字隨機抽考。

**Architecture:** 在 `lib/learning` 新增純函式 `grading.ts`（答對與否 + 連續數 → FSRS 評分、下一連續數、是否畢業）與 `question.ts`（題型選擇、答案比對、出題、取樣）。`UserCard` 增 `consecutiveCorrect`/`mastered`。`submitReview` 改為 `submitAnswer`（吃 `correct: boolean`，評分由 grading 推導）。session 依連續數指派題型並加入抽考。複習 UI 改為「作答→判定回饋→自動前進」。

**Tech Stack:** Next.js 16 (App Router) · TypeScript · ts-fsrs（經 P3 `SchedulerService`）· Prisma 7 + Neon · Vitest

## Global Constraints

- 模組化優先：純邏輯（評分階梯、題型、答案比對、取樣、出題）與 IO/UI 分離；跨模組以介面/型別溝通。
- 排程仍經 P3 `SchedulerService.review(card, rating, now)`；本計畫只改變 rating 來源（由 correctness + 連續數推導）。
- ALL DB 經 repository；edge HTTP driver；**單筆寫入**（先 saveCard 後 createReviewLog），不得用 `$transaction`/`upsert`/`createMany`。
- 純函式不得用 `Date.now()`/`Math.random()`：時間由 `now: Date` 注入；隨機由可注入的 `rng` 注入（預設 `Math.random`，但測試傳入確定性 rng）。
- 數字參數集中為具名常數：畢業門檻 5、題型門檻（0-1 mc / 2-3 cloze / 4+ typing）、抽考數 3。
- 打字判定：忽略大小寫 + 去頭尾空白，其餘需完全相符。
- 學習核心只 publish 事件（沿用 P3 `eventBus`，`ReviewCompleted` payload 本計畫不變，P4 再擴充）。
- 所有頁面登入守衛；server actions 驗證使用者。繁中文案。採 TDD。
- npm；Windows / Git Bash；DB 已上線。

---

### Task 1: 評分階梯（grading，純函式）

**Files:**
- Create: `lib/learning/grading.ts`
- Create: `lib/learning/__tests__/grading.test.ts`

**Interfaces:**
- Consumes: P3 `Rating`（`@/lib/learning/types`）。
- Produces:
  - `MASTERY_THRESHOLD = 5`
  - `interface GradeResult { rating: Rating; nextStreak: number; mastered: boolean }`
  - `grade(isCorrect: boolean, prevStreak: number): GradeResult`

- [ ] **Step 1: 寫測試（先失敗）**

Create `lib/learning/__tests__/grading.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { grade, MASTERY_THRESHOLD } from '@/lib/learning/grading'

describe('grade', () => {
  it('wrong answer → again, streak resets to 0, not mastered', () => {
    expect(grade(false, 3)).toEqual({ rating: 'again', nextStreak: 0, mastered: false })
  })
  it('climbs hard → good → good → easy on the first four correct answers', () => {
    expect(grade(true, 0)).toEqual({ rating: 'hard', nextStreak: 1, mastered: false })
    expect(grade(true, 1)).toEqual({ rating: 'good', nextStreak: 2, mastered: false })
    expect(grade(true, 2)).toEqual({ rating: 'good', nextStreak: 3, mastered: false })
    expect(grade(true, 3)).toEqual({ rating: 'easy', nextStreak: 4, mastered: false })
  })
  it('fifth consecutive correct graduates to mastered (rated easy)', () => {
    expect(grade(true, 4)).toEqual({ rating: 'easy', nextStreak: 5, mastered: true })
  })
  it('a correct spot-check on an already-mastered card stays mastered', () => {
    expect(grade(true, 5)).toEqual({ rating: 'easy', nextStreak: 6, mastered: true })
  })
  it('a failed spot-check un-masters (again, streak 0)', () => {
    expect(grade(false, 6)).toEqual({ rating: 'again', nextStreak: 0, mastered: false })
  })
  it('MASTERY_THRESHOLD is 5', () => {
    expect(MASTERY_THRESHOLD).toBe(5)
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- learning/__tests__/grading`
Expected: FAIL，找不到 `@/lib/learning/grading`。

- [ ] **Step 3: 實作**

Create `lib/learning/grading.ts`:
```ts
import type { Rating } from './types'

export const MASTERY_THRESHOLD = 5

export interface GradeResult {
  rating: Rating
  nextStreak: number
  mastered: boolean
}

export function grade(isCorrect: boolean, prevStreak: number): GradeResult {
  if (!isCorrect) {
    return { rating: 'again', nextStreak: 0, mastered: false }
  }
  const nextStreak = prevStreak + 1
  let rating: Rating
  if (nextStreak === 1) rating = 'hard'
  else if (nextStreak <= 3) rating = 'good'
  else rating = 'easy'
  return { rating, nextStreak, mastered: nextStreak >= MASTERY_THRESHOLD }
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- learning/__tests__/grading`
Expected: PASS（6 passed）。

- [ ] **Step 5: Commit**

```
git add lib/learning/grading.ts lib/learning/__tests__/grading.test.ts
git commit -m "feat(learning): add correctness→FSRS rating ladder with mastery threshold"
```

---

### Task 2: 題型、答案比對、取樣、出題（question，純函式）

**Files:**
- Create: `lib/learning/question.ts`
- Create: `lib/learning/__tests__/question.test.ts`

**Interfaces:**
- Consumes: P2 `WordWithExamples`（`@/lib/content/types`）。
- Produces:
  - `type QuestionType = 'mc' | 'cloze' | 'typing'`
  - `pickQuestionType(streak: number): QuestionType`（0-1→mc，2-3→cloze，4+→typing）
  - `checkAnswer(input: string, expected: string): boolean`（trim + 忽略大小寫，其餘完全相符）
  - `sample<T>(arr: T[], n: number, rng?: () => number): T[]`（不重複取樣最多 n 個；rng 預設 Math.random）
  - `interface Question { wordId: string; type: QuestionType; prompt: string; hint: string | null; audioText: string | null; options: string[] | null; answer: string }`
  - `buildQuestion(word: WordWithExamples, type: QuestionType, distractorDefs: string[]): Question`

- [ ] **Step 1: 寫測試（先失敗）**

Create `lib/learning/__tests__/question.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pickQuestionType, checkAnswer, sample, buildQuestion } from '@/lib/learning/question'

const word = {
  id: 'w1', headword: 'negotiate', phonetic: '/n/', partOfSpeech: 'v.', definitionZh: '談判，協商', examTags: ['TOEIC'],
  examples: [{ id: 'e1', sentence: 'We need to negotiate the terms.', translationZh: '我們需要協商條款。', source: null }],
}

describe('pickQuestionType', () => {
  it('maps streak to type by threshold', () => {
    expect([0, 1, 2, 3, 4, 9].map(pickQuestionType)).toEqual(['mc', 'mc', 'cloze', 'cloze', 'typing', 'typing'])
  })
})

describe('checkAnswer', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(checkAnswer('  Negotiate ', 'negotiate')).toBe(true)
  })
  it('rejects misspelling', () => {
    expect(checkAnswer('negociate', 'negotiate')).toBe(false)
  })
})

describe('sample', () => {
  it('takes n items deterministically with an injected rng', () => {
    const rng = () => 0 // always picks index 0 of the remaining
    expect(sample(['a', 'b', 'c'], 2, rng)).toEqual(['a', 'b'])
  })
  it('caps at array length', () => {
    expect(sample(['a'], 3, () => 0)).toEqual(['a'])
  })
})

describe('buildQuestion', () => {
  it('mc: headword prompt, options include correct def + distractors, answer is the def', () => {
    const q = buildQuestion(word as any, 'mc', ['錯誤一', '錯誤二', '錯誤三'])
    expect(q.type).toBe('mc')
    expect(q.prompt).toBe('negotiate')
    expect(q.audioText).toBe('negotiate')
    expect(q.answer).toBe('談判，協商')
    expect(q.options).toEqual(['談判，協商', '錯誤一', '錯誤二', '錯誤三'])
  })
  it('cloze: blanks the headword in the example, hint is the translation, answer is headword', () => {
    const q = buildQuestion(word as any, 'cloze', [])
    expect(q.type).toBe('cloze')
    expect(q.prompt).toBe('We need to _____ the terms.')
    expect(q.hint).toBe('我們需要協商條款。')
    expect(q.options).toBeNull()
    expect(q.answer).toBe('negotiate')
  })
  it('typing: definition prompt, no options, answer is headword', () => {
    const q = buildQuestion(word as any, 'typing', [])
    expect(q.type).toBe('typing')
    expect(q.prompt).toBe('談判，協商')
    expect(q.options).toBeNull()
    expect(q.answer).toBe('negotiate')
  })
  it('cloze falls back to typing when no example contains the headword', () => {
    const noEx = { ...word, examples: [{ id: 'e', sentence: 'unrelated text', translationZh: 'x', source: null }] }
    const q = buildQuestion(noEx as any, 'cloze', [])
    expect(q.type).toBe('typing')
    expect(q.prompt).toBe('談判，協商')
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- learning/__tests__/question`
Expected: FAIL，找不到 `@/lib/learning/question`。

- [ ] **Step 3: 實作**

Create `lib/learning/question.ts`:
```ts
import type { WordWithExamples } from '@/lib/content/types'

export type QuestionType = 'mc' | 'cloze' | 'typing'

export function pickQuestionType(streak: number): QuestionType {
  if (streak <= 1) return 'mc'
  if (streak <= 3) return 'cloze'
  return 'typing'
}

export function checkAnswer(input: string, expected: string): boolean {
  return input.trim().toLowerCase() === expected.trim().toLowerCase()
}

export function sample<T>(arr: T[], n: number, rng: () => number = Math.random): T[] {
  const pool = [...arr]
  const out: T[] = []
  const count = Math.min(n, pool.length)
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

export interface Question {
  wordId: string
  type: QuestionType
  prompt: string
  hint: string | null
  audioText: string | null
  options: string[] | null
  answer: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function typingQuestion(word: WordWithExamples): Question {
  return { wordId: word.id, type: 'typing', prompt: word.definitionZh, hint: null, audioText: null, options: null, answer: word.headword }
}

export function buildQuestion(word: WordWithExamples, type: QuestionType, distractorDefs: string[]): Question {
  if (type === 'mc') {
    return {
      wordId: word.id, type: 'mc', prompt: word.headword, hint: null, audioText: word.headword,
      options: [word.definitionZh, ...distractorDefs], answer: word.definitionZh,
    }
  }
  if (type === 'cloze') {
    const ex = word.examples[0]
    if (ex) {
      const re = new RegExp(`\\b${escapeRegExp(word.headword)}\\b`, 'i')
      if (re.test(ex.sentence)) {
        return {
          wordId: word.id, type: 'cloze', prompt: ex.sentence.replace(re, '_____'),
          hint: ex.translationZh, audioText: null, options: null, answer: word.headword,
        }
      }
    }
    return typingQuestion(word) // fallback when no usable example
  }
  return typingQuestion(word)
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- learning/__tests__/question`
Expected: PASS（7 passed）。

- [ ] **Step 5: Commit**

```
git add lib/learning/question.ts lib/learning/__tests__/question.test.ts
git commit -m "feat(learning): add question type selection, answer check, sampling, builder"
```

---

### Task 3: schema 與 repository 改動（progression 持久化）

**Files:**
- Modify: `prisma/schema.prisma`（UserCard + consecutiveCorrect、mastered）
- Modify: `lib/learning/repository.ts`
- Modify: `lib/learning/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: P3 `CardState`/`toCardState`、P1 `getPrisma()`。
- Produces（`LearningRepository` 改動）：
  - `getCard(userId, wordId): Promise<{ state: CardState; consecutiveCorrect: number; mastered: boolean } | null>`
  - `saveCard(userId, wordId, state: CardState, progress: { consecutiveCorrect: number; mastered: boolean; exists: boolean }): Promise<string>`
  - `createReviewLog(input)`（不變）
  - `listDueCards(userId, now, limit): Promise<{ wordId: string; consecutiveCorrect: number }[]>`（新增 `mastered: false` 條件；回傳含連續數）
  - `listNewWordIds(userId, wordBookId, limit)`（不變）
  - `listMasteredWordIds(userId): Promise<string[]>`（新）

- [ ] **Step 1: schema 加欄位並推送**

在 `prisma/schema.prisma` 的 `model UserCard` 內，新增兩行（置於 `lastReview` 附近）：
```prisma
  consecutiveCorrect Int     @default(0)
  mastered           Boolean @default(false)
```
Run:
```
npm run db:generate
npm run db:push
```
Expected: 成功；Neon 的 UserCard 出現兩個新欄位（既有資料 default 0 / false）。

- [ ] **Step 2: 改寫 repository 測試（先失敗）**

Replace `lib/learning/__tests__/repository.test.ts` 內容為：
```ts
import { describe, it, expect, vi } from 'vitest'
import { LearningRepository } from '@/lib/learning/repository'

const now = new Date('2026-06-28T00:00:00Z')
const state = { due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now }
const stateData = { due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now }

function makeDb() {
  return {
    userCard: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    word: { findMany: vi.fn() },
    reviewLog: { create: vi.fn() },
  }
}

describe('LearningRepository', () => {
  it('getCard returns state + progression or null', async () => {
    const db = makeDb()
    db.userCard.findUnique.mockResolvedValue({ ...stateData, consecutiveCorrect: 2, mastered: false })
    const repo = new LearningRepository(db as any)
    expect(await repo.getCard('u1', 'w1')).toEqual({ state, consecutiveCorrect: 2, mastered: false })
    db.userCard.findUnique.mockResolvedValue(null)
    expect(await repo.getCard('u1', 'w2')).toBeNull()
  })

  it('saveCard update path writes state + progression and returns id', async () => {
    const db = makeDb(); db.userCard.update.mockResolvedValue({ id: 'c1' })
    const repo = new LearningRepository(db as any)
    const id = await repo.saveCard('u1', 'w1', state, { consecutiveCorrect: 3, mastered: false, exists: true })
    expect(id).toBe('c1')
    expect(db.userCard.update).toHaveBeenCalledWith({
      where: { userId_wordId: { userId: 'u1', wordId: 'w1' } },
      data: { ...stateData, consecutiveCorrect: 3, mastered: false },
    })
  })

  it('saveCard create path writes state + progression and returns id', async () => {
    const db = makeDb(); db.userCard.create.mockResolvedValue({ id: 'c2' })
    const repo = new LearningRepository(db as any)
    const id = await repo.saveCard('u1', 'w1', state, { consecutiveCorrect: 5, mastered: true, exists: false })
    expect(id).toBe('c2')
    expect(db.userCard.create).toHaveBeenCalledWith({
      data: { userId: 'u1', wordId: 'w1', ...stateData, consecutiveCorrect: 5, mastered: true },
    })
  })

  it('listDueCards excludes mastered and returns wordId + streak', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([{ wordId: 'w1', consecutiveCorrect: 2 }])
    const repo = new LearningRepository(db as any)
    const result = await repo.listDueCards('u1', now, 50)
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', mastered: false, due: { lte: now } },
      orderBy: { due: 'asc' }, take: 50, select: { wordId: true, consecutiveCorrect: true },
    })
    expect(result).toEqual([{ wordId: 'w1', consecutiveCorrect: 2 }])
  })

  it('listMasteredWordIds returns ids of mastered cards', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([{ wordId: 'w9' }, { wordId: 'w8' }])
    const repo = new LearningRepository(db as any)
    expect(await repo.listMasteredWordIds('u1')).toEqual(['w9', 'w8'])
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', mastered: true }, select: { wordId: true },
    })
  })

  it('listNewWordIds finds words with no card for the user', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([{ id: 'w2' }])
    const repo = new LearningRepository(db as any)
    expect(await repo.listNewWordIds('u1', 'b1', 10)).toEqual(['w2'])
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { wordBookId: 'b1', userCards: { none: { userId: 'u1' } } },
      orderBy: { order: 'asc' }, take: 10, select: { id: true },
    })
  })
})
```

- [ ] **Step 3: 執行確認失敗**

Run: `npm test -- learning/__tests__/repository`
Expected: FAIL（saveCard 簽章/回傳、getCard 形狀、listDueCards 條件不符）。

- [ ] **Step 4: 改寫 repository 實作**

Replace `lib/learning/repository.ts` 內容為：
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
    learningSteps: state.learningSteps, elapsedDays: state.elapsedDays, scheduledDays: state.scheduledDays,
    reps: state.reps, lapses: state.lapses, state: state.state, lastReview: state.lastReview,
  }
}

export interface ReviewLogInput {
  userCardId: string; rating: number; state: number; due: Date
  stability: number; difficulty: number; elapsedDays: number
  lastElapsedDays: number; scheduledDays: number
}

export interface CardProgress {
  consecutiveCorrect: number
  mastered: boolean
  exists: boolean
}

export class LearningRepository {
  private readonly db: LearningDb
  constructor(db?: LearningDb) {
    this.db = db ?? (getPrisma() as unknown as LearningDb)
  }

  async getCard(userId: string, wordId: string): Promise<{ state: CardState; consecutiveCorrect: number; mastered: boolean } | null> {
    const row = (await this.db.userCard.findUnique({ where: { userId_wordId: { userId, wordId } } })) as
      (Parameters<typeof toCardState>[0] & { consecutiveCorrect: number; mastered: boolean }) | null
    if (!row) return null
    return { state: toCardState(row), consecutiveCorrect: row.consecutiveCorrect, mastered: row.mastered }
  }

  async saveCard(userId: string, wordId: string, state: CardState, progress: CardProgress): Promise<string> {
    const data = { ...stateData(state), consecutiveCorrect: progress.consecutiveCorrect, mastered: progress.mastered }
    if (progress.exists) {
      const row = (await this.db.userCard.update({ where: { userId_wordId: { userId, wordId } }, data })) as { id: string }
      return row.id
    }
    const row = (await this.db.userCard.create({ data: { userId, wordId, ...data } })) as { id: string }
    return row.id
  }

  async createReviewLog(input: ReviewLogInput): Promise<void> {
    await this.db.reviewLog.create({ data: input })
  }

  async listDueCards(userId: string, now: Date, limit: number): Promise<{ wordId: string; consecutiveCorrect: number }[]> {
    const rows = await this.db.userCard.findMany({
      where: { userId, mastered: false, due: { lte: now } },
      orderBy: { due: 'asc' }, take: limit, select: { wordId: true, consecutiveCorrect: true },
    })
    return rows as { wordId: string; consecutiveCorrect: number }[]
  }

  async listMasteredWordIds(userId: string): Promise<string[]> {
    const rows = await this.db.userCard.findMany({ where: { userId, mastered: true }, select: { wordId: true } })
    return (rows as { wordId: string }[]).map((r) => r.wordId)
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

- [ ] **Step 5: 執行確認通過**

Run: `npm test -- learning/__tests__/repository`
Expected: PASS（6 passed）。

- [ ] **Step 6: 確認全套（submit/session 仍是 P3 版，可能尚未相容——若全套有紅燈，僅限 submit/session 因簽章改變，Task 4/5 會修；本步驟只需 repository 測試綠 + build 之外的既有 learning 單元測試）**

Run: `npm test -- learning/__tests__/repository learning/__tests__/grading learning/__tests__/question`
Expected: 這三組全綠。
> 註：`submit.test.ts` 與 `session.test.ts`（P3 版）此刻可能因 repository 簽章改變而紅燈——Task 4、Task 5 會改寫它們。不要在本任務修改 submit/session。先確認 repository/grading/question 綠燈即可。

- [ ] **Step 7: Commit**

```
git add prisma/schema.prisma lib/learning/repository.ts lib/learning/__tests__/repository.test.ts
git commit -m "feat(learning): persist consecutiveCorrect/mastered; repository due/mastered queries"
```

---

### Task 4: session 改寫（題型指派 + 抽考）

**Files:**
- Modify: `lib/learning/session.ts`
- Modify: `lib/learning/__tests__/session.test.ts`

**Interfaces:**
- Consumes: Task 2 `QuestionType`/`pickQuestionType`/`sample`；Task 3 `LearningRepository`（`listDueCards`/`listNewWordIds`/`listMasteredWordIds`）。
- Produces:
  - `interface SessionItem { wordId: string; questionType: QuestionType; isNew: boolean; isSpotCheck: boolean }`
  - `buildSession(args: { userId; wordBookId; now; newLimit; dueLimit; spotCheckLimit; rng? }, deps: { learning: LearningRepository }): Promise<SessionItem[]>`
  - 移除 P3 的 `assignMode`/`ReviewMode` 用法（本檔不再匯出 assignMode）。

- [ ] **Step 1: 改寫測試（先失敗）**

Replace `lib/learning/__tests__/session.test.ts` 內容為：
```ts
import { describe, it, expect, vi } from 'vitest'
import { buildSession } from '@/lib/learning/session'

const now = new Date('2026-06-28T00:00:00Z')

describe('buildSession', () => {
  it('orders due (by streak→type) then new (mc) then spot-checks (mc), with correct repo calls', async () => {
    const learning = {
      listDueCards: vi.fn().mockResolvedValue([{ wordId: 'd1', consecutiveCorrect: 0 }, { wordId: 'd2', consecutiveCorrect: 2 }, { wordId: 'd3', consecutiveCorrect: 4 }]),
      listNewWordIds: vi.fn().mockResolvedValue(['n1']),
      listMasteredWordIds: vi.fn().mockResolvedValue(['m1', 'm2', 'm3', 'm4']),
    }
    const rng = () => 0 // sample picks first remaining each time
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50, spotCheckLimit: 2, rng }, { learning: learning as any })
    expect(learning.listDueCards).toHaveBeenCalledWith('u1', now, 50)
    expect(learning.listNewWordIds).toHaveBeenCalledWith('u1', 'b1', 5)
    expect(learning.listMasteredWordIds).toHaveBeenCalledWith('u1')
    expect(items).toEqual([
      { wordId: 'd1', questionType: 'mc', isNew: false, isSpotCheck: false },
      { wordId: 'd2', questionType: 'cloze', isNew: false, isSpotCheck: false },
      { wordId: 'd3', questionType: 'typing', isNew: false, isSpotCheck: false },
      { wordId: 'n1', questionType: 'mc', isNew: true, isSpotCheck: false },
      { wordId: 'm1', questionType: 'mc', isNew: false, isSpotCheck: true },
      { wordId: 'm2', questionType: 'mc', isNew: false, isSpotCheck: true },
    ])
  })

  it('returns [] when nothing due, new, or mastered', async () => {
    const learning = { listDueCards: vi.fn().mockResolvedValue([]), listNewWordIds: vi.fn().mockResolvedValue([]), listMasteredWordIds: vi.fn().mockResolvedValue([]) }
    const items = await buildSession({ userId: 'u1', wordBookId: 'b1', now, newLimit: 5, dueLimit: 50, spotCheckLimit: 3, rng: () => 0 }, { learning: learning as any })
    expect(items).toEqual([])
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- learning/__tests__/session`
Expected: FAIL（buildSession 形狀改變）。

- [ ] **Step 3: 改寫實作**

Replace `lib/learning/session.ts` 內容為：
```ts
import { pickQuestionType, sample, type QuestionType } from './question'
import type { LearningRepository } from './repository'

export interface SessionItem {
  wordId: string
  questionType: QuestionType
  isNew: boolean
  isSpotCheck: boolean
}

export async function buildSession(
  args: { userId: string; wordBookId: string; now: Date; newLimit: number; dueLimit: number; spotCheckLimit: number; rng?: () => number },
  deps: { learning: LearningRepository },
): Promise<SessionItem[]> {
  const due = await deps.learning.listDueCards(args.userId, args.now, args.dueLimit)
  const newIds = await deps.learning.listNewWordIds(args.userId, args.wordBookId, args.newLimit)
  const masteredIds = await deps.learning.listMasteredWordIds(args.userId)
  const spot = sample(masteredIds, args.spotCheckLimit, args.rng)

  return [
    ...due.map((d) => ({ wordId: d.wordId, questionType: pickQuestionType(d.consecutiveCorrect), isNew: false, isSpotCheck: false })),
    ...newIds.map((id) => ({ wordId: id, questionType: 'mc' as QuestionType, isNew: true, isSpotCheck: false })),
    ...spot.map((id) => ({ wordId: id, questionType: 'mc' as QuestionType, isNew: false, isSpotCheck: true })),
  ]
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- learning/__tests__/session`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```
git add lib/learning/session.ts lib/learning/__tests__/session.test.ts
git commit -m "feat(learning): session assigns question type by streak and adds spot-checks"
```

---

### Task 5: submit 改寫（submitAnswer）

**Files:**
- Modify: `lib/learning/submit.ts`
- Modify: `lib/learning/__tests__/submit.test.ts`

**Interfaces:**
- Consumes: Task 1 `grade`；P3 `RATING_TO_INT`/`CardState`、`SchedulerService`、`EventBus`；Task 3 `LearningRepository`（`getCard`/`saveCard`/`createReviewLog`）。
- Produces:
  - `submitAnswer(input: { userId: string; wordId: string; correct: boolean; now: Date }, deps: { learning: LearningRepository; scheduler: SchedulerService; bus: EventBus }): Promise<{ mastered: boolean }>`
  - `finishSession(input: { userId: string; reviewed: number; now: Date }, deps: { bus: EventBus }): Promise<void>`（不變，沿用 P3）

- [ ] **Step 1: 改寫測試（先失敗）**

Replace `lib/learning/__tests__/submit.test.ts` 內容為：
```ts
import { describe, it, expect, vi } from 'vitest'
import { submitAnswer, finishSession } from '@/lib/learning/submit'

const now = new Date('2026-06-28T00:00:00Z')
const newState = { due: now, stability: 0, difficulty: 0, learningSteps: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null }
const reviewed = { due: new Date('2026-06-29T00:00:00Z'), stability: 2, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }

function deps(existing: any) {
  const learning = {
    getCard: vi.fn().mockResolvedValue(existing),
    saveCard: vi.fn().mockResolvedValue('c1'),
    createReviewLog: vi.fn().mockResolvedValue(undefined),
  }
  const scheduler = { newCard: vi.fn().mockReturnValue(newState), review: vi.fn().mockReturnValue(reviewed) }
  const bus = { publish: vi.fn().mockResolvedValue(undefined) }
  return { learning, scheduler, bus }
}

describe('submitAnswer', () => {
  it('correct on a new card: hard rating, streak 1, saves progression, logs, publishes', async () => {
    const d = deps(null)
    const result = await submitAnswer({ userId: 'u1', wordId: 'w1', correct: true, now }, d as any)
    expect(d.scheduler.newCard).toHaveBeenCalledWith(now)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'hard', now)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed, { consecutiveCorrect: 1, mastered: false, exists: false })
    expect(d.learning.createReviewLog).toHaveBeenCalledWith(expect.objectContaining({ userCardId: 'c1', rating: 2 }))
    expect(d.bus.publish).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'hard', at: now })
    expect(result).toEqual({ mastered: false })
  })

  it('fifth correct graduates: easy rating, mastered true', async () => {
    const d = deps({ state: newState, consecutiveCorrect: 4, mastered: false })
    const result = await submitAnswer({ userId: 'u1', wordId: 'w1', correct: true, now }, d as any)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'easy', now)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed, { consecutiveCorrect: 5, mastered: true, exists: true })
    expect(result).toEqual({ mastered: true })
  })

  it('wrong answer: again rating, streak reset, mastered false', async () => {
    const d = deps({ state: newState, consecutiveCorrect: 6, mastered: true })
    const result = await submitAnswer({ userId: 'u1', wordId: 'w1', correct: false, now }, d as any)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'again', now)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed, { consecutiveCorrect: 0, mastered: false, exists: true })
    expect(result).toEqual({ mastered: false })
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
Expected: FAIL（submitAnswer 不存在 / 簽章不符）。

- [ ] **Step 3: 改寫實作**

Replace `lib/learning/submit.ts` 內容為：
```ts
import { RATING_TO_INT } from './types'
import { grade } from './grading'
import type { SchedulerService } from './scheduler'
import type { LearningRepository } from './repository'
import type { EventBus } from '@/lib/events/bus'

export async function submitAnswer(
  input: { userId: string; wordId: string; correct: boolean; now: Date },
  deps: { learning: LearningRepository; scheduler: SchedulerService; bus: EventBus },
): Promise<{ mastered: boolean }> {
  const { userId, wordId, correct, now } = input
  const existing = await deps.learning.getCard(userId, wordId)
  const before = existing?.state ?? deps.scheduler.newCard(now)
  const prevStreak = existing?.consecutiveCorrect ?? 0

  const { rating, nextStreak, mastered } = grade(correct, prevStreak)
  const next = deps.scheduler.review(before, rating, now)

  const cardId = await deps.learning.saveCard(userId, wordId, next, {
    consecutiveCorrect: nextStreak, mastered, exists: existing !== null,
  })
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
  await deps.bus.publish({ type: 'ReviewCompleted', userId, wordId, rating, at: now })
  return { mastered }
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
Expected: PASS（4 passed）。

- [ ] **Step 5: 確認全套 + build**

Run: `npm test && npm run build`
Expected: 全套通過（注意：UI 仍是 P3 版，呼叫舊的 `submitReview`/`submitReviewAction`——若 `npm run build` 因 UI 呼叫已移除的 `submitReview` 而型別錯誤，屬預期；Task 6 會改 UI。若 build 失敗僅因 `app/learn` 引用，記錄並續行 Task 6；單元測試本身須全綠）。
> 為避免 build 紅燈擋住，本步驟以 `npm test` 全綠為硬性驗收；`npm run build` 的 UI 型別錯誤待 Task 6 修復後再驗。

- [ ] **Step 6: Commit**

```
git add lib/learning/submit.ts lib/learning/__tests__/submit.test.ts
git commit -m "feat(learning): submitAnswer derives rating from correctness + streak"
```

---

### Task 6: 複習 UI 改寫（三題型作答 + 判定回饋 + server action）

**Files:**
- Modify: `app/learn/[slug]/actions.ts`
- Modify: `app/learn/[slug]/page.tsx`
- Modify: `components/review-session.tsx`

**Interfaces:**
- Consumes: P1 `getCurrentUser()`；P2 `ContentRepository`（`getWordBookBySlug`、`listWordsWithExamplesByIds`、`listWordsByBook`）；Task 2 `buildQuestion`/`checkAnswer`/`sample`/`Question`；Task 3 `LearningRepository`；Task 4 `buildSession`；Task 5 `submitAnswer`/`finishSession`；Task 2/P2 `TtsButton`。
- Produces: `/learn/<slug>` 主動作答複習；server actions `submitAnswerAction(wordId, correct)`、`finishSessionAction(reviewed)`；客戶端 `<ReviewSession>`（三題型）。

- [ ] **Step 1: 改寫 server actions**

Replace `app/learn/[slug]/actions.ts` 內容為：
```ts
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
```

- [ ] **Step 2: 改寫複習頁（組裝題目）**

Replace `app/learn/[slug]/page.tsx` 內容為：
```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { buildSession } from '@/lib/learning/session'
import { buildQuestion, sample } from '@/lib/learning/question'
import { ReviewSession, type ReviewItem } from '@/components/review-session'

const NEW_LIMIT = 20
const DUE_LIMIT = 100
const SPOT_CHECK_LIMIT = 3

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const content = new ContentRepository()
  const book = await content.getWordBookBySlug(slug)
  if (!book) notFound()

  const items = await buildSession(
    { userId: user.id, wordBookId: book.id, now: new Date(), newLimit: NEW_LIMIT, dueLimit: DUE_LIMIT, spotCheckLimit: SPOT_CHECK_LIMIT },
    { learning: new LearningRepository() },
  )

  const words = await content.listWordsWithExamplesByIds(items.map((i) => i.wordId))
  const byId = new Map(words.map((w) => [w.id, w]))
  const allWords = await content.listWordsByBook(book.id)
  const allDefs = allWords.map((w) => w.definitionZh)

  const reviewItems: ReviewItem[] = []
  for (const item of items) {
    const word = byId.get(item.wordId)
    if (!word) continue
    const distractors = item.questionType === 'mc'
      ? sample(allDefs.filter((d) => d !== word.definitionZh), 3)
      : []
    reviewItems.push({ question: buildQuestion(word, item.questionType, distractors), isSpotCheck: item.isSpotCheck })
  }

  if (reviewItems.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{book.name}</h1>
        <p className="mt-4 text-gray-400">今天沒有待複習的單字了 🎉</p>
        <Link href={`/books/${slug}`} className="mt-6 inline-block text-sm text-gray-400 hover:underline">← 回單字書</Link>
      </main>
    )
  }
  return <ReviewSession bookName={book.name} bookSlug={slug} items={reviewItems} />
}
```

- [ ] **Step 3: 改寫複習元件（三題型）**

Replace `components/review-session.tsx` 內容為：
```tsx
'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TtsButton } from '@/components/tts-button'
import { checkAnswer, sample, type Question } from '@/lib/learning/question'
import { submitAnswerAction, finishSessionAction } from '@/app/learn/[slug]/actions'

export interface ReviewItem {
  question: Question
  isSpotCheck: boolean
}

export function ReviewSession({ bookName, bookSlug, items }: { bookName: string; bookSlug: string; items: ReviewItem[] }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [result, setResult] = useState<null | { correct: boolean }>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const item = items[index]
  const q = item.question
  // shuffle MC options once per card
  const options = useMemo(() => (q.options ? sample(q.options, q.options.length) : null), [q])

  function evaluate(answer: string): boolean {
    return q.type === 'mc' ? answer === q.answer : checkAnswer(answer, q.answer)
  }

  async function commit(correct: boolean) {
    if (busy) return
    setBusy(true)
    setResult({ correct })
    try {
      await submitAnswerAction(q.wordId, correct)
    } catch {
      // even on error we let the user continue; progress for this card may not have saved
    }
    setBusy(false)
  }

  function onPick(opt: string) {
    if (result) return
    setPicked(opt)
    void commit(evaluate(opt))
  }

  function onSubmitText(e: React.FormEvent) {
    e.preventDefault()
    if (result || !input.trim()) return
    void commit(evaluate(input))
  }

  async function next() {
    if (index + 1 >= items.length) {
      try { await finishSessionAction(items.length) } catch { /* ignore */ }
      setDone(true)
      return
    }
    setIndex(index + 1)
    setInput(''); setPicked(null); setResult(null)
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">完成！</h1>
        <p className="mt-4 text-gray-400">本次複習了 {items.length} 個單字。</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link href={`/books/${bookSlug}`} className="text-sm text-gray-400 hover:underline">← 回單字書</Link>
          <button onClick={() => router.refresh()} className="text-sm text-blue-400 hover:underline">再來一輪</button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
      <div className="mb-6 flex items-center justify-between text-sm text-gray-500">
        <Link href={`/books/${bookSlug}`} className="hover:underline">← {bookName}</Link>
        <span>{index + 1} / {items.length}</span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 text-center">
        {item.isSpotCheck && <span className="rounded-full bg-purple-700 px-2 py-0.5 text-xs">記憶抽考</span>}

        {/* prompt */}
        {q.type === 'mc' && (
          <div className="flex items-center gap-2">
            <span className="text-4xl font-bold">{q.prompt}</span>
            {q.audioText && <TtsButton text={q.audioText} />}
          </div>
        )}
        {q.type === 'cloze' && (
          <div className="space-y-2">
            <p className="text-2xl">{q.prompt}</p>
            {q.hint && <p className="text-sm text-gray-400">{q.hint}</p>}
            <p className="text-xs text-gray-500">填入空格的英文字</p>
          </div>
        )}
        {q.type === 'typing' && (
          <div className="space-y-1">
            <p className="text-2xl">{q.prompt}</p>
            <p className="text-xs text-gray-500">拼出對應的英文字</p>
          </div>
        )}

        {/* answer area */}
        <div className="mt-4 w-full">
          {q.type === 'mc' && options && (
            <div className="grid gap-2">
              {options.map((opt) => {
                const state = result
                  ? opt === q.answer ? 'border-green-500 bg-green-900/40'
                    : opt === picked ? 'border-red-500 bg-red-900/40' : 'border-gray-700 opacity-60'
                  : 'border-gray-700 hover:bg-gray-900'
                return (
                  <button key={opt} disabled={!!result} onClick={() => onPick(opt)}
                    className={`rounded-lg border px-4 py-3 text-left ${state}`}>{opt}</button>
                )
              })}
            </div>
          )}
          {q.type !== 'mc' && (
            <form onSubmit={onSubmitText} className="flex flex-col items-center gap-2">
              <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} disabled={!!result}
                className="w-full rounded-lg border border-gray-700 bg-transparent px-4 py-3 text-center text-lg"
                placeholder="輸入英文單字" />
              {!result && <button type="submit" className="w-full rounded-lg bg-white py-3 font-medium text-black">作答</button>}
            </form>
          )}
        </div>

        {/* feedback */}
        {result && (
          <div className="mt-4">
            <p className={result.correct ? 'text-green-400' : 'text-red-400'}>
              {result.correct ? '答對了！' : '答錯了'}
            </p>
            <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold">
              {q.answer}{q.type !== 'mc' && <TtsButton text={q.answer} />}
            </p>
          </div>
        )}
      </div>

      {result && (
        <button onClick={next} disabled={busy} className="mt-6 w-full rounded-lg bg-white py-3 font-medium text-black disabled:opacity-50">
          {index + 1 >= items.length ? '完成' : '下一個'}
        </button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: 確認全套測試 + build**

Run: `npm test && npm run build`
Expected: 全套通過；build exit 0；路由含 `/learn/[slug]`。

- [ ] **Step 5: 手動驗證（dev，需登入）**

Run: `npm run dev`，登入後到 `/books/toeic-core` 點「開始複習」
Expected:
- 新字出選擇題（看英文選中文，4 選項）；選對顯示綠、選錯顯示紅 + 正解；按「下一個」前進。
- 同一字累積答對後，後續複習會升級為克漏字（句中填空打字）、再升級為拼寫（看中打英）。
- 連續答對 5 次的字標記記憶完成、不再出現在到期佇列；之後可能以「記憶抽考」紫標出現。
- 最後一題作答後按「完成」顯示完成畫面。

- [ ] **Step 6: 驗證資料**

Run:
```
node -e "import('dotenv/config').then(async()=>{const{neon}=await import('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);const r=await sql\`SELECT w.headword, uc.\"consecutiveCorrect\", uc.mastered FROM \"UserCard\" uc JOIN \"Word\" w ON w.id=uc.\"wordId\" ORDER BY uc.\"updatedAt\" DESC LIMIT 8\`;r.forEach(x=>console.log(x.headword,'streak',x.consecutiveCorrect,'mastered',x.mastered));})"
```
Expected: 作答過的字 `consecutiveCorrect` 反映答對次數；連續 5 次者 `mastered=true`。

- [ ] **Step 7: Commit**

```
git add app/learn components/review-session.tsx
git commit -m "feat(learning): active-recall review UI (mc/cloze/typing) with answer feedback"
```

---

## Self-Review

**Spec coverage：**
- 三題型（選擇/克漏字/拼寫）→ Task 2 `buildQuestion` + Task 6 UI ✅
- FSRS 排時間 × 次數階梯畢業 → Task 1 `grade` + Task 5 `submitAnswer` + Task 3 持久化 ✅
- 題型隨熟練度遞增（0-1/2-3/4+）→ Task 2 `pickQuestionType` + Task 4 session ✅
- 答錯 Again 歸零、第 5 次畢業 → Task 1 測試涵蓋 ✅
- 打字判定（忽略大小寫+空白、拼字要正確）→ Task 2 `checkAnswer` ✅
- 記憶完成抽考（隨機 3，答錯取消）→ Task 4 session 抽考 + Task 1 `grade(false,…)` 取消 mastered + Task 6 紫標 ✅
- session 組成（到期排除 mastered → 新 → 抽考）→ Task 3 `listDueCards` + Task 4 ✅
- 只發事件（ReviewCompleted/SessionFinished，payload 不變）→ Task 5 ✅
- 單筆寫入、無交易、now/rng 注入、repository 收斂、TDD、登入守衛、繁中 → Global Constraints 落實各 Task ✅
- 遊戲化/離線同步/防作弊/聽力作答：spec 明確排除，不在本計畫 ✅

**Placeholder scan：** 無 TBD/TODO；每個 code step 均含完整程式碼與確切指令/預期輸出。Task 3 Step 6 與 Task 5 Step 5 明確說明「UI 仍是舊版時 build 可能因 UI 型別錯誤紅燈」屬預期、以單元測試為硬性驗收，Task 6 修復後 build 須綠——非 placeholder，是跨任務暫態的明確處置。

**Type consistency：** `grade`/`GradeResult`/`MASTERY_THRESHOLD`、`QuestionType`/`pickQuestionType`/`checkAnswer`/`sample`/`Question`/`buildQuestion`、`LearningRepository`（`getCard` 回傳 `{state,consecutiveCorrect,mastered}`、`saveCard(...,progress)→string`、`listDueCards→{wordId,consecutiveCorrect}[]`、`listMasteredWordIds`）、`SessionItem`/`buildSession`、`submitAnswer`/`finishSession`、`ReviewItem`/`ReviewSession` 於定義與消費處一致。`saveCard` 的 `CardProgress.exists` 與 submit 的 `existing !== null` 對應。CardState 仍含 `learningSteps`（P3 修正），`stateData` 與測試 fixture 皆含之。
