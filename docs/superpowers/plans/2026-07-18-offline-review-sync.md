# 離線複習＋同步佇列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在線自動預抓今日複習包存 IndexedDB；離線可完整作答（本地即時回饋）；回線後批次同步，由後端權威重判、按時序重放 FSRS、入帳獎勵。

**Architecture:** 方案 A「原始作答重放」——離線佇列只存原始作答 `{uuid, wordId, questionType, userAnswer, answeredAt}`，本地判分僅供 UI；`POST /api/sync` 逐筆去重（`ReviewLog.clientRef` unique）→ `judgeAnswer` 重判 → 按 `answeredAt` 升冪重放既有 `submitAnswer`（FSRS）＋ `gamificationService.applyReview`。離線入口是 SW navigation fallback 到可預快取的 `/offline` 頁（client-only，讀 IndexedDB 選書複習）。

**Tech Stack:** Next.js App Router、IndexedDB（自寫薄封裝，零新依賴）、Service Worker、Prisma 6.19.3 + Neon HTTP、Vitest。

## Global Constraints

- **零新依賴**：不裝 zod／uuid／idb 等套件。驗證手寫（比照 `app/api/push/subscribe/handler.ts`），uuid 用 `crypto.randomUUID()`。
- **後端權威**（spec 鐵則）：離線本地判分僅供 UI 即時回饋；同步時 server 重判對錯、重放 FSRS 與遊戲化；不信任前端送的 correct／XP／題數。
- **Prisma 釘 6.19.3**，schema 變更用 `npm run db:push`（不用 migrate）。Neon HTTP 無交易——重放逐筆寫入即可（與線上路徑同級）。
- **`answeredAt` clamp**：server 端 `min(answeredAt, serverNow)` 且不早於 serverNow − 7 天。
- UI 文案繁體中文。離線結束畫面固定文案：「已記錄 N 題，回線後入帳」。
- 測試指令：`npm test`（vitest run，node env，`@/` alias 指 repo root）。
- commit message 全部以 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 結尾（heredoc/`@'…'@` 多行）。

## File Structure

```
lib/learning/judge.ts                 judgeAnswer 純函式（線上 action 與 /api/sync 共用）
lib/learning/review-items.ts          buildReviewItems（自 page.tsx 抽出；page 與 pack 路由共用）＋ SESSION_LIMITS
lib/learning/repository.ts            +clientRef 貫穿、listClientRefs、listStartedBooks
lib/learning/submit.ts                submitAnswer input +clientRef?
lib/sync/types.ts                     QueueEntry / OfflinePack / StoredPack（wire 契約歸 sync 模組）
lib/sync/kv.ts                        KV 介面 + localYmd
lib/sync/idb.ts                       KV 的 IndexedDB 實作（openKV）
lib/sync/pack-store.ts                savePacks / loadPack / listPacks / removePack
lib/sync/queue.ts                     enqueueAnswer / listQueue / removeQueued
lib/sync/meta.ts                      getMeta / setMeta
lib/sync/client.ts                    syncNow（POST /api/sync、清佇列）
app/api/offline/pack/handler.ts       handleOfflinePack（可注入測試）
app/api/offline/pack/route.ts         GET 路由（auth 接線）
app/api/sync/handler.ts               parseEntries / clampAnsweredAt / handleSync（可注入測試）
app/api/sync/route.ts                 POST 路由（接線真實 deps）
components/review-session.tsx         +submit/finish 注入 prop、offlineMode 收尾畫面
components/sync-on-reconnect.tsx      online 事件觸發 syncNow + toast
components/offline-prefetch.tsx       每日一次預抓包
app/offline/page.tsx                  靜態離線頁（選書 → 離線複習）
app/layout.tsx                        掛 <OfflinePrefetch/> <SyncOnReconnect/>
app/learn/[slug]/page.tsx             改用 buildReviewItems
app/learn/[slug]/actions.ts           改用 judgeAnswer
public/sw.js                          CACHE bump v2、預快取 /offline、navigation fallback
prisma/schema.prisma                  ReviewLog +clientRef String? @unique
```

---

### Task 1: `judgeAnswer` 純函式抽出

**Files:**
- Create: `lib/learning/judge.ts`
- Create: `lib/learning/__tests__/judge.test.ts`
- Modify: `app/learn/[slug]/actions.ts`

**Interfaces:**
- Consumes: `checkAnswer(input: string, expected: string): boolean`、`QuestionType`（`lib/learning/question.ts`）
- Produces: `judgeAnswer(word: { headword: string; definitionZh: string }, questionType: QuestionType, userAnswer: string): boolean` — Task 7 的 `/api/sync` 重判也用它。

- [ ] **Step 1: Write the failing test**

`lib/learning/__tests__/judge.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { judgeAnswer } from '../judge'

const word = { headword: 'invoice', definitionZh: '發票；請款單' }

describe('judgeAnswer', () => {
  it('mc 全字串比對 definitionZh', () => {
    expect(judgeAnswer(word, 'mc', '發票；請款單')).toBe(true)
    expect(judgeAnswer(word, 'mc', '發票')).toBe(false)
  })
  it('cloze/typing 比對 headword（不分大小寫、修剪空白）', () => {
    expect(judgeAnswer(word, 'cloze', ' Invoice ')).toBe(true)
    expect(judgeAnswer(word, 'typing', 'invoise')).toBe(false)
  })
  it('空作答一律判錯', () => {
    expect(judgeAnswer(word, 'mc', '')).toBe(false)
    expect(judgeAnswer(word, 'typing', '')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/learning/__tests__/judge.test.ts`
Expected: FAIL（Cannot find module '../judge'）

- [ ] **Step 3: Write minimal implementation**

`lib/learning/judge.ts`：

```ts
import { checkAnswer, type QuestionType } from './question'

// 後端權威判定的單一實作：線上 submitAnswerAction 與 /api/sync 離線重放共用。
export function judgeAnswer(
  word: { headword: string; definitionZh: string },
  questionType: QuestionType,
  userAnswer: string,
): boolean {
  return questionType === 'mc'
    ? userAnswer === word.definitionZh
    : checkAnswer(userAnswer, word.headword)
}
```

注意：`checkAnswer('', 'invoice')` 本就為 false（空字串不等於 headword），空作答判錯不需特判。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/learning/__tests__/judge.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: `actions.ts` 改用 judgeAnswer**

`app/learn/[slug]/actions.ts`——import 區把 `import { checkAnswer, type QuestionType } from '@/lib/learning/question'` 改為：

```ts
import type { QuestionType } from '@/lib/learning/question'
import { judgeAnswer } from '@/lib/learning/judge'
```

並把：

```ts
  // 後端權威判定：不信任前端送的對錯
  const correct = questionType === 'mc'
    ? userAnswer === word.definitionZh
    : checkAnswer(userAnswer, word.headword)
```

改為：

```ts
  // 後端權威判定：不信任前端送的對錯
  const correct = judgeAnswer(word, questionType, userAnswer)
```

- [ ] **Step 6: Run full tests + typecheck**

Run: `npm test` → 全綠；`npx tsc --noEmit` → 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add lib/learning/judge.ts lib/learning/__tests__/judge.test.ts "app/learn/[slug]/actions.ts"
git commit -m "refactor(learning): extract judgeAnswer for online action + offline sync reuse"
```

---

### Task 2: `ReviewLog.clientRef` migration ＋ repository 擴充

**Files:**
- Modify: `prisma/schema.prisma`（ReviewLog model，約 154–169 行）
- Modify: `lib/learning/repository.ts`
- Test: `lib/learning/__tests__/repository-sync.test.ts`（新檔）

**Interfaces:**
- Produces:
  - `ReviewLogInput` 增加 `clientRef?: string`
  - `LearningRepository.listClientRefs(refs: string[]): Promise<string[]>`
  - `LearningRepository.listStartedBooks(userId: string): Promise<{ id: string; slug: string; name: string }[]>`

- [ ] **Step 1: schema 加欄位**

`prisma/schema.prisma` 的 `model ReviewLog` 內，`reviewedAt` 行後加：

```prisma
  clientRef       String?  @unique // 離線作答 uuid；同步冪等去重（重送安全）
```

- [ ] **Step 2: 推 schema**

Run: `npm run db:push`
Expected: `Your database is now in sync with your Prisma schema`（會自動 `prisma generate`）。

- [ ] **Step 3: Write the failing test**

`lib/learning/__tests__/repository-sync.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { LearningRepository } from '../repository'

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    userCard: { findUnique: async () => null, create: async () => ({ id: 'c1' }), update: async () => ({ id: 'c1' }), findMany: async () => [] },
    word: { findMany: async () => [] },
    reviewLog: { create: async () => ({}), findMany: async () => [] },
    ...overrides,
  } as ConstructorParameters<typeof LearningRepository>[0]
}

describe('LearningRepository sync additions', () => {
  it('createReviewLog 把 clientRef 傳進 db.create', async () => {
    let captured: unknown
    const repo = new LearningRepository(fakeDb({
      reviewLog: { create: async (args: unknown) => { captured = args; return {} }, findMany: async () => [] },
    }))
    await repo.createReviewLog({
      userCardId: 'c1', rating: 3, state: 2, due: new Date(), stability: 1, difficulty: 5,
      elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 1, clientRef: 'uuid-1',
    })
    expect((captured as { data: { clientRef?: string } }).data.clientRef).toBe('uuid-1')
  })

  it('listClientRefs 回傳已存在的 refs；空輸入不打 DB', async () => {
    let called = false
    const repo = new LearningRepository(fakeDb({
      reviewLog: {
        create: async () => ({}),
        findMany: async () => { called = true; return [{ clientRef: 'a' }, { clientRef: 'b' }] },
      },
    }))
    expect(await repo.listClientRefs([])).toEqual([])
    expect(called).toBe(false)
    expect(await repo.listClientRefs(['a', 'b', 'c'])).toEqual(['a', 'b'])
  })

  it('listStartedBooks 以 book id 去重', async () => {
    const b1 = { id: 'bk1', slug: 'office', name: '辦公室' }
    const b2 = { id: 'bk2', slug: 'finance', name: '財務' }
    const repo = new LearningRepository(fakeDb({
      userCard: {
        findUnique: async () => null, create: async () => ({ id: 'c1' }), update: async () => ({ id: 'c1' }),
        findMany: async () => [
          { word: { wordBook: b1 } }, { word: { wordBook: b1 } }, { word: { wordBook: b2 } },
        ],
      },
    }))
    expect(await repo.listStartedBooks('u1')).toEqual([b1, b2])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run lib/learning/__tests__/repository-sync.test.ts`
Expected: FAIL（`listClientRefs is not a function` 等）

- [ ] **Step 5: Implement**

`lib/learning/repository.ts`：

1. `LearningDb` 介面的 `reviewLog` 改為：

```ts
  reviewLog: { create(args: unknown): Promise<unknown>; findMany(args: unknown): Promise<unknown[]> }
```

2. `ReviewLogInput` 最後加一行 `clientRef?: string`（`createReviewLog` 本來就整包 `data: input` 傳入，undefined 欄位 Prisma 會忽略，不用改實作）。

3. class 內加兩個方法：

```ts
  // 同步冪等：回傳 refs 中已入帳（ReviewLog.clientRef 已存在）的子集。
  async listClientRefs(refs: string[]): Promise<string[]> {
    if (refs.length === 0) return []
    const rows = (await this.db.reviewLog.findMany({
      where: { clientRef: { in: refs } }, select: { clientRef: true },
    })) as { clientRef: string }[]
    return rows.map((r) => r.clientRef)
  }

  // 有學習進度（存在 UserCard）的單字書，離線預抓包的範圍。
  async listStartedBooks(userId: string): Promise<{ id: string; slug: string; name: string }[]> {
    const rows = (await this.db.userCard.findMany({
      where: { userId },
      select: { word: { select: { wordBook: { select: { id: true, slug: true, name: true } } } } },
    })) as { word: { wordBook: { id: string; slug: string; name: string } } }[]
    const byId = new Map<string, { id: string; slug: string; name: string }>()
    for (const r of rows) byId.set(r.word.wordBook.id, r.word.wordBook)
    return [...byId.values()]
  }
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run lib/learning/__tests__/repository-sync.test.ts` → PASS；`npm test` → 全綠。

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/learning/repository.ts lib/learning/__tests__/repository-sync.test.ts
git commit -m "feat(sync): ReviewLog.clientRef + repository listClientRefs/listStartedBooks"
```

---

### Task 3: `submitAnswer` 貫穿 clientRef

**Files:**
- Modify: `lib/learning/submit.ts`
- Modify: `lib/learning/__tests__/submit.test.ts`（既有測試檔；若實際檔名不同，找 `__tests__` 下測 submitAnswer 的檔案）

**Interfaces:**
- Produces: `submitAnswer` 的 `input` 增加 `clientRef?: string`，會寫進 `createReviewLog` 的 `clientRef`。Task 7 重放時以佇列 uuid 傳入。

- [ ] **Step 1: Write the failing test**

在既有 submitAnswer 測試檔加一個 case（沿用該檔既有的 fake deps 寫法；若該檔的 fake learning repo 是物件字面量，補抓 `createReviewLog` 參數）：

```ts
it('clientRef 有給時寫進 review log', async () => {
  let logged: { clientRef?: string } | undefined
  const learning = {
    getCard: async () => null,
    saveCard: async () => 'card-1',
    createReviewLog: async (input: { clientRef?: string }) => { logged = input },
  }
  const scheduler = {
    newCard: () => ({ due: new Date(), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, learningSteps: 0, lastReview: null }),
    review: (s: unknown) => s,
  }
  const bus = { publish: async () => {} }
  await submitAnswer(
    { userId: 'u1', wordId: 'w1', correct: true, now: new Date(), clientRef: 'uuid-9' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { learning: learning as any, scheduler: scheduler as any, bus: bus as any },
  )
  expect(logged?.clientRef).toBe('uuid-9')
})
```

（型別細節以該測試檔既有 fake 寫法為準——重點是斷言 `createReviewLog` 收到 `clientRef: 'uuid-9'`。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/learning/__tests__/` 該檔
Expected: FAIL（clientRef 為 undefined 或 TS 編譯錯）

- [ ] **Step 3: Implement**

`lib/learning/submit.ts`：

```ts
export async function submitAnswer(
  input: { userId: string; wordId: string; correct: boolean; now: Date; clientRef?: string },
  deps: { learning: LearningRepository; scheduler: SchedulerService; bus: EventBus },
): Promise<{ mastered: boolean }> {
```

並在 `createReviewLog({...})` 物件最後加 `clientRef: input.clientRef,`。

- [ ] **Step 4: Run tests**

Run: `npm test` → 全綠。

- [ ] **Step 5: Commit**

```bash
git add lib/learning/submit.ts lib/learning/__tests__/
git commit -m "feat(sync): thread clientRef through submitAnswer to review log"
```

---

### Task 4: `buildReviewItems` 抽出共用

**Files:**
- Create: `lib/learning/review-items.ts`
- Create: `lib/learning/__tests__/review-items.test.ts`
- Modify: `app/learn/[slug]/page.tsx`

**Interfaces:**
- Consumes: `buildSession`（`./session`）、`buildQuestion`／`sample`／`Question`（`./question`）、`LearningRepository`
- Produces:
  - `interface BuiltReviewItem { question: Question; isSpotCheck: boolean }`
  - `const SESSION_LIMITS = { newLimit: 20, dueLimit: 100, spotCheckLimit: 3 }`
  - `interface ReviewContentDeps`（見下）
  - `buildReviewItems(args, deps): Promise<BuiltReviewItem[]>` — Task 5 的 pack 路由重用。

- [ ] **Step 1: Write the failing test**

`lib/learning/__tests__/review-items.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildReviewItems } from '../review-items'
import type { LearningRepository } from '../repository'

const W = (id: string, headword: string, definitionZh: string) => ({
  id, headword, phonetic: null, partOfSpeech: 'n.', definitionZh, examples: [],
})

function deps(opts: { due?: { wordId: string; consecutiveCorrect: number }[]; newIds?: string[]; defs?: string[] }) {
  const learning = {
    listDueCards: async () => opts.due ?? [],
    listNewWordIds: async () => opts.newIds ?? [],
    listMasteredWordIds: async () => [],
  } as unknown as LearningRepository
  const content = {
    listWordsWithExamplesByIds: async (ids: string[]) =>
      ids.map((id) => W(id, `hw-${id}`, `def-${id}`)),
    listAllDefinitions: async () => opts.defs ?? [],
    listWordsByBook: async () => (opts.defs ?? []).map((definitionZh) => ({ definitionZh })),
  }
  return { learning, content }
}

describe('buildReviewItems', () => {
  it('mc 題有 4 個選項且干擾不含正解', async () => {
    const d = deps({ newIds: ['w1'], defs: ['def-w1', 'X', 'Y', 'Z', 'W'] })
    const items = await buildReviewItems(
      { userId: 'u1', book: { id: 'bk1' }, now: new Date(), newLimit: 20, dueLimit: 100, spotCheckLimit: 3, rng: () => 0.5 },
      d,
    )
    expect(items).toHaveLength(1)
    const q = items[0].question
    expect(q.type).toBe('mc')
    expect(q.options).toHaveLength(4)
    expect(q.options).toContain('def-w1')
    expect(q.options!.filter((o) => o === 'def-w1')).toHaveLength(1)
  })

  it('book=null（mixed）用 listAllDefinitions 當干擾池', async () => {
    let usedAll = false
    const d = deps({ newIds: ['w1'], defs: ['A', 'B', 'C'] })
    d.content.listAllDefinitions = async () => { usedAll = true; return ['A', 'B', 'C'] }
    await buildReviewItems(
      { userId: 'u1', book: null, now: new Date(), newLimit: 20, dueLimit: 100, spotCheckLimit: 3 },
      d,
    )
    expect(usedAll).toBe(true)
  })

  it('查不到字卡資料的 item 靜默略過', async () => {
    const d = deps({ newIds: ['w1', 'w2'] })
    d.content.listWordsWithExamplesByIds = async () => [W('w1', 'hw', 'def')]
    const items = await buildReviewItems(
      { userId: 'u1', book: { id: 'bk1' }, now: new Date(), newLimit: 20, dueLimit: 100, spotCheckLimit: 3 },
      d,
    )
    expect(items.map((i) => i.question.wordId)).toEqual(['w1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/learning/__tests__/review-items.test.ts`
Expected: FAIL（Cannot find module '../review-items'）

- [ ] **Step 3: Implement**

`lib/learning/review-items.ts`（邏輯自 `app/learn/[slug]/page.tsx:30-50` 原樣搬移）：

```ts
import { buildSession } from './session'
import { buildQuestion, sample, type Question } from './question'
import type { LearningRepository } from './repository'
import type { WordWithExamples } from '@/lib/content/types'

export interface BuiltReviewItem { question: Question; isSpotCheck: boolean }

export const SESSION_LIMITS = { newLimit: 20, dueLimit: 100, spotCheckLimit: 3 }

// ContentRepository 的結構子集：page 與 offline-pack 路由都以它注入，測試給 fake。
export interface ReviewContentDeps {
  listWordsWithExamplesByIds(ids: string[]): Promise<WordWithExamples[]>
  listAllDefinitions(): Promise<string[]>
  listWordsByBook(bookId: string): Promise<{ definitionZh: string }[]>
}

export async function buildReviewItems(
  args: { userId: string; book: { id: string } | null; now: Date; newLimit: number; dueLimit: number; spotCheckLimit: number; rng?: () => number },
  deps: { learning: LearningRepository; content: ReviewContentDeps },
): Promise<BuiltReviewItem[]> {
  const items = await buildSession(
    { userId: args.userId, wordBookId: args.book?.id, now: args.now, newLimit: args.newLimit, dueLimit: args.dueLimit, spotCheckLimit: args.spotCheckLimit, rng: args.rng },
    { learning: deps.learning },
  )
  const words = await deps.content.listWordsWithExamplesByIds(items.map((i) => i.wordId))
  const byId = new Map(words.map((w) => [w.id, w]))
  const needsMc = items.some((i) => i.questionType === 'mc')
  const allDefs = needsMc
    ? (args.book
        ? (await deps.content.listWordsByBook(args.book.id)).map((w) => w.definitionZh)
        : await deps.content.listAllDefinitions())
    : []

  const out: BuiltReviewItem[] = []
  for (const item of items) {
    const word = byId.get(item.wordId)
    if (!word) continue
    const distractors = item.questionType === 'mc'
      ? sample([...new Set(allDefs)].filter((d) => d !== word.definitionZh), 3, args.rng)
      : []
    out.push({ question: buildQuestion(word, item.questionType, distractors), isSpotCheck: item.isSpotCheck })
  }
  return out
}
```

（注意 `W()` 測試 fixture 的欄位要符合 `WordWithExamples`；若型別還有其他必填欄位，以 `lib/content/types.ts` 實際定義補齊 fixture，不改 production 型別。）

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/learning/__tests__/review-items.test.ts` → PASS。

- [ ] **Step 5: `page.tsx` 改用**

`app/learn/[slug]/page.tsx`：刪掉本地的 `NEW_LIMIT/DUE_LIMIT/SPOT_CHECK_LIMIT` 常數與 30–50 行的組題邏輯，改為：

```ts
import { buildReviewItems, SESSION_LIMITS } from '@/lib/learning/review-items'
```

```ts
  const reviewItems: ReviewItem[] = await buildReviewItems(
    { userId: user.id, book: book ? { id: book.id } : null, now: new Date(), ...SESSION_LIMITS },
    { learning: new LearningRepository(), content },
  )
```

同時把不再用到的 `buildSession`、`buildQuestion`、`sample` import 移除（`ReviewSession`、`ReviewItem` 等保留）。`BuiltReviewItem` 與元件的 `ReviewItem` 結構相同，直接指派即可。

- [ ] **Step 6: Run full tests + typecheck + build**

Run: `npm test` → 全綠；`npx tsc --noEmit` → 無錯誤。

- [ ] **Step 7: Commit**

```bash
git add lib/learning/review-items.ts lib/learning/__tests__/review-items.test.ts "app/learn/[slug]/page.tsx"
git commit -m "refactor(learning): extract buildReviewItems for page + offline pack reuse"
```

---

### Task 5: `GET /api/offline/pack`

**Files:**
- Create: `lib/sync/types.ts`
- Create: `app/api/offline/pack/handler.ts`
- Create: `app/api/offline/pack/route.ts`
- Test: `app/api/offline/pack/__tests__/handler.test.ts`

**Interfaces:**
- Consumes: `buildReviewItems`／`SESSION_LIMITS`／`BuiltReviewItem`／`ReviewContentDeps`（Task 4）、`LearningRepository.listStartedBooks`（Task 2）、`SessionUser`（`@/lib/auth/session`）
- Produces:
  - `lib/sync/types.ts`：`QueueEntry`、`OfflinePack`（wire 契約，client 與 server 共用）
  - `handleOfflinePack(user, deps, now): Promise<{ ok: boolean; packs: OfflinePack[] }>`

- [ ] **Step 1: 先建 wire 契約**

`lib/sync/types.ts`：

```ts
import type { QuestionType } from '@/lib/learning/question'
import type { BuiltReviewItem } from '@/lib/learning/review-items'

// 離線作答佇列的一筆原始作答（同步時 server 重判，本地判分不上傳）。
export interface QueueEntry {
  uuid: string
  wordId: string
  questionType: QuestionType
  userAnswer: string
  answeredAt: string // ISO 8601
}

// /api/offline/pack 回傳的一本書的今日複習包。
export interface OfflinePack {
  slug: string
  name: string
  items: BuiltReviewItem[]
}

// IndexedDB 裡存的包：加當日 ymd，隔日視為過期。
export interface StoredPack extends OfflinePack {
  ymd: string
}
```

- [ ] **Step 2: Write the failing test**

`app/api/offline/pack/__tests__/handler.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { handleOfflinePack } from '../handler'

const user = { id: 'u1', email: 'a@b.c', name: null, image: null }

function deps(books: { id: string; slug: string; name: string }[], itemsPerBook: number) {
  return {
    learning: {
      listStartedBooks: async () => books,
      listDueCards: async () => Array.from({ length: itemsPerBook }, (_, i) => ({ wordId: `w${i}`, consecutiveCorrect: 0 })),
      listNewWordIds: async () => [],
      listMasteredWordIds: async () => [],
    },
    content: {
      listWordsWithExamplesByIds: async (ids: string[]) =>
        ids.map((id) => ({ id, headword: `hw-${id}`, phonetic: null, partOfSpeech: 'n.', definitionZh: `def-${id}`, examples: [] })),
      listAllDefinitions: async () => ['A', 'B', 'C', 'D'],
      listWordsByBook: async () => ['A', 'B', 'C', 'D'].map((definitionZh) => ({ definitionZh })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('handleOfflinePack', () => {
  it('未登入 → ok:false 空包', async () => {
    const res = await handleOfflinePack(null, deps([], 0), new Date())
    expect(res).toEqual({ ok: false, packs: [] })
  })

  it('每本有進度的書出一包；空 session 的書不出包', async () => {
    const res = await handleOfflinePack(
      user,
      deps([{ id: 'b1', slug: 'office', name: '辦公室' }, { id: 'b2', slug: 'empty', name: '空' }], 2),
      new Date(),
    )
    // fake 對兩本書都回 2 張 due 卡 → 兩包都有 items
    expect(res.ok).toBe(true)
    expect(res.packs.map((p) => p.slug)).toEqual(['office', 'empty'])
    expect(res.packs[0].items.length).toBeGreaterThan(0)
  })

  it('沒有進度書 → 空 packs', async () => {
    const res = await handleOfflinePack(user, deps([], 0), new Date())
    expect(res).toEqual({ ok: true, packs: [] })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/offline/pack/__tests__/handler.test.ts`
Expected: FAIL（Cannot find module '../handler'）

- [ ] **Step 4: Implement handler**

`app/api/offline/pack/handler.ts`：

```ts
import type { SessionUser } from '@/lib/auth/session'
import { buildReviewItems, SESSION_LIMITS, type ReviewContentDeps } from '@/lib/learning/review-items'
import type { LearningRepository } from '@/lib/learning/repository'
import type { OfflinePack } from '@/lib/sync/types'

export async function handleOfflinePack(
  user: SessionUser | null,
  deps: { learning: LearningRepository; content: ReviewContentDeps },
  now: Date,
): Promise<{ ok: boolean; packs: OfflinePack[] }> {
  if (!user) return { ok: false, packs: [] }
  const books = await deps.learning.listStartedBooks(user.id)
  const packs: OfflinePack[] = []
  for (const book of books) {
    const items = await buildReviewItems({ userId: user.id, book, now, ...SESSION_LIMITS }, deps)
    if (items.length > 0) packs.push({ slug: book.slug, name: book.name, items })
  }
  return { ok: true, packs }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/offline/pack/__tests__/handler.test.ts` → PASS。

- [ ] **Step 6: Route 接線**

`app/api/offline/pack/route.ts`（比照 `app/api/push/subscribe/route.ts`）：

```ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { ContentRepository } from '@/lib/content/repository'
import { handleOfflinePack } from './handler'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const user = await getCurrentUser()
  const res = await handleOfflinePack(user, { learning: new LearningRepository(), content: new ContentRepository() }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 401 })
}
```

- [ ] **Step 7: Run full tests + typecheck、commit**

Run: `npm test`、`npx tsc --noEmit` → 全綠。

```bash
git add lib/sync/types.ts app/api/offline/pack/
git commit -m "feat(sync): offline pack API - per started-book daily review pack"
```

---

### Task 6: 客端儲存層（KV 介面 + IndexedDB 實作 + queue/pack/meta）

**Files:**
- Create: `lib/sync/kv.ts`
- Create: `lib/sync/idb.ts`
- Create: `lib/sync/queue.ts`
- Create: `lib/sync/pack-store.ts`
- Create: `lib/sync/meta.ts`
- Test: `lib/sync/__tests__/stores.test.ts`

**Interfaces:**
- Produces:
  - `kv.ts`：`type StoreName = 'packs' | 'queue' | 'meta'`；`interface KV { get(store, key): Promise<unknown>; put(store, key, value): Promise<void>; remove(store, key): Promise<void>; getAll(store): Promise<unknown[]> }`；`localYmd(d: Date): string`
  - `idb.ts`：`openKV(): KV`（唯一碰真 IndexedDB 的檔；不進單元測試）
  - `queue.ts`：`enqueueAnswer(kv, e: Omit<QueueEntry,'uuid'>): Promise<QueueEntry>`、`listQueue(kv): Promise<QueueEntry[]>`（answeredAt 升冪）、`removeQueued(kv, uuids: string[]): Promise<void>`
  - `pack-store.ts`：`savePacks(kv, packs: OfflinePack[], ymd: string)`、`loadPack(kv, slug, ymd): Promise<StoredPack | null>`、`listPacks(kv, ymd): Promise<StoredPack[]>`、`removePack(kv, slug)`
  - `meta.ts`：`getMeta(kv, key): Promise<string | null>`、`setMeta(kv, key, value: string)`

- [ ] **Step 1: Write the failing test**

`lib/sync/__tests__/stores.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { KV, StoreName } from '../kv'
import { localYmd } from '../kv'
import { enqueueAnswer, listQueue, removeQueued } from '../queue'
import { savePacks, loadPack, listPacks, removePack } from '../pack-store'
import { getMeta, setMeta } from '../meta'

function memKV(): KV {
  const data: Record<StoreName, Map<string, unknown>> = { packs: new Map(), queue: new Map(), meta: new Map() }
  return {
    get: async (s, k) => data[s].get(k),
    put: async (s, k, v) => { data[s].set(k, v) },
    remove: async (s, k) => { data[s].delete(k) },
    getAll: async (s) => [...data[s].values()],
  }
}

const item = { question: { wordId: 'w1', type: 'mc' as const, prompt: 'hw', hint: null, audioText: 'hw', options: ['a', 'b'], answer: 'a' }, isSpotCheck: false }

describe('localYmd', () => {
  it('本地時區 YYYY-MM-DD', () => {
    expect(localYmd(new Date(2026, 6, 18, 23, 59))).toBe('2026-07-18')
    expect(localYmd(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('queue', () => {
  it('enqueue 產 uuid、listQueue 按 answeredAt 升冪、removeQueued 移除', async () => {
    const kv = memKV()
    const b = await enqueueAnswer(kv, { wordId: 'w2', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T02:00:00.000Z' })
    const a = await enqueueAnswer(kv, { wordId: 'w1', questionType: 'typing', userAnswer: 'y', answeredAt: '2026-07-18T01:00:00.000Z' })
    expect(a.uuid).toBeTruthy()
    expect(a.uuid).not.toBe(b.uuid)
    const q = await listQueue(kv)
    expect(q.map((e) => e.wordId)).toEqual(['w1', 'w2'])
    await removeQueued(kv, [a.uuid])
    expect((await listQueue(kv)).map((e) => e.wordId)).toEqual(['w2'])
  })
})

describe('pack-store', () => {
  it('save/load 當日有效、隔日過期、removePack 移除', async () => {
    const kv = memKV()
    await savePacks(kv, [{ slug: 'office', name: '辦公室', items: [item] }], '2026-07-18')
    expect((await loadPack(kv, 'office', '2026-07-18'))?.name).toBe('辦公室')
    expect(await loadPack(kv, 'office', '2026-07-19')).toBeNull()
    expect((await listPacks(kv, '2026-07-18')).map((p) => p.slug)).toEqual(['office'])
    expect(await listPacks(kv, '2026-07-19')).toEqual([])
    await removePack(kv, 'office')
    expect(await loadPack(kv, 'office', '2026-07-18')).toBeNull()
  })
})

describe('meta', () => {
  it('get/set 往返；未設回 null', async () => {
    const kv = memKV()
    expect(await getMeta(kv, 'lastPrefetchYmd')).toBeNull()
    await setMeta(kv, 'lastPrefetchYmd', '2026-07-18')
    expect(await getMeta(kv, 'lastPrefetchYmd')).toBe('2026-07-18')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync/__tests__/stores.test.ts`
Expected: FAIL（modules not found）

- [ ] **Step 3: Implement**

`lib/sync/kv.ts`：

```ts
export type StoreName = 'packs' | 'queue' | 'meta'

// IndexedDB 的最小抽象：真實實作在 idb.ts；測試用 in-memory fake。
export interface KV {
  get(store: StoreName, key: string): Promise<unknown>
  put(store: StoreName, key: string, value: unknown): Promise<void>
  remove(store: StoreName, key: string): Promise<void>
  getAll(store: StoreName): Promise<unknown[]>
}

// 裝置本地日期（非 UTC）：包過期與預抓頻率都以使用者本地日為準。
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
```

`lib/sync/idb.ts`：

```ts
import type { KV, StoreName } from './kv'

const DB_NAME = 'vocab-offline'
const STORES: StoreName[] = ['packs', 'queue', 'meta']

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      for (const s of STORES) {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = run(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function openKV(): KV {
  const dbPromise = open()
  return {
    get: async (store, key) => tx(await dbPromise, store, 'readonly', (s) => s.get(key)),
    put: async (store, key, value) => { await tx(await dbPromise, store, 'readwrite', (s) => s.put(value, key)) },
    remove: async (store, key) => { await tx(await dbPromise, store, 'readwrite', (s) => s.delete(key)) },
    getAll: async (store) => tx(await dbPromise, store, 'readonly', (s) => s.getAll()),
  }
}
```

`lib/sync/queue.ts`：

```ts
import type { KV } from './kv'
import type { QueueEntry } from './types'

export async function enqueueAnswer(kv: KV, e: Omit<QueueEntry, 'uuid'>): Promise<QueueEntry> {
  const entry: QueueEntry = { ...e, uuid: crypto.randomUUID() }
  await kv.put('queue', entry.uuid, entry)
  return entry
}

export async function listQueue(kv: KV): Promise<QueueEntry[]> {
  const all = (await kv.getAll('queue')) as QueueEntry[]
  return all.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
}

export async function removeQueued(kv: KV, uuids: string[]): Promise<void> {
  for (const id of uuids) await kv.remove('queue', id)
}
```

`lib/sync/pack-store.ts`：

```ts
import type { KV } from './kv'
import type { OfflinePack, StoredPack } from './types'

export async function savePacks(kv: KV, packs: OfflinePack[], ymd: string): Promise<void> {
  for (const p of packs) await kv.put('packs', p.slug, { ...p, ymd } satisfies StoredPack)
}

export async function loadPack(kv: KV, slug: string, ymd: string): Promise<StoredPack | null> {
  const v = (await kv.get('packs', slug)) as StoredPack | undefined
  return v && v.ymd === ymd ? v : null
}

export async function listPacks(kv: KV, ymd: string): Promise<StoredPack[]> {
  const all = (await kv.getAll('packs')) as StoredPack[]
  return all.filter((p) => p.ymd === ymd)
}

export async function removePack(kv: KV, slug: string): Promise<void> {
  await kv.remove('packs', slug)
}
```

`lib/sync/meta.ts`：

```ts
import type { KV } from './kv'

export async function getMeta(kv: KV, key: string): Promise<string | null> {
  const v = (await kv.get('meta', key)) as string | undefined
  return typeof v === 'string' && v !== '' ? v : null
}

export async function setMeta(kv: KV, key: string, value: string): Promise<void> {
  await kv.put('meta', key, value)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/sync/__tests__/stores.test.ts` → PASS；`npm test` → 全綠。

- [ ] **Step 5: Commit**

```bash
git add lib/sync/
git commit -m "feat(sync): client-side stores - KV abstraction, IndexedDB impl, queue/pack/meta"
```

---

### Task 7: `POST /api/sync` 重放 handler

**Files:**
- Create: `app/api/sync/handler.ts`
- Create: `app/api/sync/route.ts`
- Test: `app/api/sync/__tests__/handler.test.ts`
- Modify: `docs/superpowers/specs/2026-07-17-offline-review-sync-design.md`（「zod 驗證」字樣改「手寫驗證（比照 push handler，零新依賴）」——兩處：§1 與 §3）

**Interfaces:**
- Consumes: `judgeAnswer`（Task 1）、`submitAnswer`／`finishSession`（Task 3 後含 clientRef）、`LearningRepository.listClientRefs`（Task 2）、`QueueEntry`（Task 5）、`gamificationService.applyReview`／`applySessionFinish`、`ContentRepository.getWordCore`
- Produces:
  - `parseEntries(raw: unknown): QueueEntry[] | null`
  - `clampAnsweredAt(atMs: number, nowMs: number): Date`
  - `interface SyncEntryResult { uuid: string; status: 'applied' | 'duplicate' | 'error' }`
  - `interface SyncReward { xp: number; coins: number; level: number | null; badges: string[]; applied: number; correct: number; perfect: boolean }`
  - `handleSync(user, body, deps, now): Promise<{ ok: boolean; results: SyncEntryResult[]; reward: SyncReward }>`

**deps 形狀**（route 接真實例，測試給 fake）：

```ts
export interface SyncDeps {
  learning: LearningRepository
  scheduler: SchedulerService
  bus: EventBus
  getWordCore(wordId: string): Promise<{ id: string; headword: string; definitionZh: string } | null>
  applyReview(input: { userId: string; correct: boolean; mastered: boolean; now: Date }): Promise<ReviewReward>
  applySessionFinish(input: { userId: string; reviewed: number; correct: number; now: Date }): Promise<SessionReward>
}
```

- [ ] **Step 1: Write the failing test**

`app/api/sync/__tests__/handler.test.ts`：

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/sync/__tests__/handler.test.ts`
Expected: FAIL（Cannot find module '../handler'）

- [ ] **Step 3: Implement handler**

`app/api/sync/handler.ts`：

```ts
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

  const existing = new Set(await deps.learning.listClientRefs(entries.map((e) => e.uuid)))
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
      const r = await deps.applyReview({ userId: user.id, correct, mastered, now: at })
      reward.xp += r.xpGained
      reward.coins += r.coinsGained
      if (r.leveledUpTo !== null) reward.level = r.leveledUpTo
      reward.badges.push(...r.newBadges)
    } catch { /* 獎勵失敗不阻斷同步（與線上 action 同策略） */ }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/sync/__tests__/handler.test.ts` → PASS。

- [ ] **Step 5: Route 接線**

`app/api/sync/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { ContentRepository } from '@/lib/content/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { eventBus } from '@/lib/events/bus'
import { gamificationService } from '@/lib/gamification/service'
import { handleSync } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const content = new ContentRepository()
  const res = await handleSync(user, body, {
    learning: new LearningRepository(),
    scheduler,
    bus: eventBus,
    getWordCore: (id) => content.getWordCore(id),
    applyReview: (i) => gamificationService.applyReview(i),
    applySessionFinish: (i) => gamificationService.applySessionFinish(i),
  }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
```

- [ ] **Step 6: spec 字樣修正**

`docs/superpowers/specs/2026-07-17-offline-review-sync-design.md`：把「zod 驗證」（§1 同步段與 §3 route 段共兩處）改為「手寫驗證（比照 push handler 模式，零新依賴）」。

- [ ] **Step 7: Run full tests + typecheck、commit**

Run: `npm test`、`npx tsc --noEmit` → 全綠。

```bash
git add app/api/sync/ docs/superpowers/specs/2026-07-17-offline-review-sync-design.md
git commit -m "feat(sync): POST /api/sync - dedup, server re-judge, ordered FSRS replay, reward rollup"
```

---

### Task 8: sync client ＋ `<SyncOnReconnect/>`

**Files:**
- Create: `lib/sync/client.ts`
- Create: `components/sync-on-reconnect.tsx`
- Test: `lib/sync/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `listQueue`／`removeQueued`（Task 6）、`getMeta`／`setMeta`（Task 6）、`KV`、`SyncEntryResult`／`SyncReward` 形狀（Task 7 wire 格式）
- Produces: `syncNow(kv: KV, fetchFn?: typeof fetch): Promise<{ synced: number; xp: number; coins: number } | null>`（null＝沒東西可同步或失敗保留佇列）

- [ ] **Step 1: Write the failing test**

`lib/sync/__tests__/client.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { KV, StoreName } from '../kv'
import { enqueueAnswer, listQueue } from '../queue'
import { setMeta, getMeta } from '../meta'
import { syncNow } from '../client'

function memKV(): KV {
  const data: Record<StoreName, Map<string, unknown>> = { packs: new Map(), queue: new Map(), meta: new Map() }
  return {
    get: async (s, k) => data[s].get(k),
    put: async (s, k, v) => { data[s].set(k, v) },
    remove: async (s, k) => { data[s].delete(k) },
    getAll: async (s) => [...data[s].values()],
  }
}

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response

describe('syncNow', () => {
  it('佇列空 → 不打 API、回 null', async () => {
    const kv = memKV()
    let called = false
    const res = await syncNow(kv, (async () => { called = true; return okResponse({}) }) as typeof fetch)
    expect(res).toBeNull()
    expect(called).toBe(false)
  })

  it('成功 → 清掉 applied+duplicate、保留 error、清 session 標記、回彙總', async () => {
    const kv = memKV()
    const a = await enqueueAnswer(kv, { wordId: 'w1', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T01:00:00.000Z' })
    const b = await enqueueAnswer(kv, { wordId: 'w2', questionType: 'mc', userAnswer: 'y', answeredAt: '2026-07-18T02:00:00.000Z' })
    const c = await enqueueAnswer(kv, { wordId: 'w3', questionType: 'mc', userAnswer: 'z', answeredAt: '2026-07-18T03:00:00.000Z' })
    await setMeta(kv, 'pendingSessionFinishedAt', '2026-07-18T03:00:00.000Z')
    const res = await syncNow(kv, (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string)
      expect(body.entries).toHaveLength(3)
      expect(body.session.finishedAt).toBe('2026-07-18T03:00:00.000Z')
      return okResponse({
        ok: true,
        results: [
          { uuid: a.uuid, status: 'applied' },
          { uuid: b.uuid, status: 'duplicate' },
          { uuid: c.uuid, status: 'error' },
        ],
        reward: { xp: 12, coins: 50, level: null, badges: [], applied: 1, correct: 1, perfect: false },
      })
    }) as typeof fetch)
    expect(res).toEqual({ synced: 2, xp: 12, coins: 50 })
    expect((await listQueue(kv)).map((e) => e.uuid)).toEqual([c.uuid])
    expect(await getMeta(kv, 'pendingSessionFinishedAt')).toBeNull()
  })

  it('HTTP 失敗 → 佇列原封不動、回 null', async () => {
    const kv = memKV()
    await enqueueAnswer(kv, { wordId: 'w1', questionType: 'mc', userAnswer: 'x', answeredAt: '2026-07-18T01:00:00.000Z' })
    const res = await syncNow(kv, (async () => ({ ok: false, json: async () => ({}) }) as Response) as typeof fetch)
    expect(res).toBeNull()
    expect(await listQueue(kv)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync/__tests__/client.test.ts`
Expected: FAIL（Cannot find module '../client'）

- [ ] **Step 3: Implement**

`lib/sync/client.ts`：

```ts
import type { KV } from './kv'
import { listQueue, removeQueued } from './queue'
import { getMeta, setMeta } from './meta'

interface SyncResponse {
  ok: boolean
  results: { uuid: string; status: 'applied' | 'duplicate' | 'error' }[]
  reward: { xp: number; coins: number }
}

// 回線同步：讀佇列 → POST /api/sync → 清已入帳（applied+duplicate）。
// error 筆保留下次重試；HTTP 失敗整包保留。回 null = 無事可做或失敗。
export async function syncNow(
  kv: KV,
  fetchFn: typeof fetch = fetch,
): Promise<{ synced: number; xp: number; coins: number } | null> {
  const entries = await listQueue(kv)
  if (entries.length === 0) return null
  const finishedAt = await getMeta(kv, 'pendingSessionFinishedAt')
  let data: SyncResponse
  try {
    const res = await fetchFn('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries, ...(finishedAt ? { session: { finishedAt } } : {}) }),
    })
    if (!res.ok) return null
    data = (await res.json()) as SyncResponse
  } catch {
    return null
  }
  if (!data.ok) return null
  const done = data.results.filter((r) => r.status !== 'error').map((r) => r.uuid)
  await removeQueued(kv, done)
  if (finishedAt) await setMeta(kv, 'pendingSessionFinishedAt', '')
  return { synced: done.length, xp: data.reward.xp, coins: data.reward.coins }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/sync/__tests__/client.test.ts` → PASS。

- [ ] **Step 5: `<SyncOnReconnect/>` 元件**

`components/sync-on-reconnect.tsx`：

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { openKV } from '@/lib/sync/idb'
import { syncNow } from '@/lib/sync/client'

// 掛在 layout：mount 時與 online 事件時嘗試同步離線佇列，成功顯示入帳 toast。
export function SyncOnReconnect() {
  const running = useRef(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      if (running.current || !navigator.onLine) return
      running.current = true
      try {
        const res = await syncNow(openKV())
        if (res && res.synced > 0) {
          setToast(`離線複習 ${res.synced} 題已入帳 +${res.xp} XP${res.coins > 0 ? ` +${res.coins} 🪙` : ''}`)
          setTimeout(() => setToast(null), 6000)
        }
      } catch { /* 靜默：下次再試 */ }
      running.current = false
    }
    void run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [])

  if (!toast) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      {toast}
    </div>
  )
}
```

- [ ] **Step 6: Run full tests + typecheck、commit**

Run: `npm test`、`npx tsc --noEmit` → 全綠。

```bash
git add lib/sync/client.ts components/sync-on-reconnect.tsx lib/sync/__tests__/client.test.ts
git commit -m "feat(sync): syncNow client + reconnect toast component"
```

---

### Task 9: `<OfflinePrefetch/>` ＋ layout 掛載

**Files:**
- Create: `components/offline-prefetch.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `openKV`、`localYmd`、`getMeta`／`setMeta`、`savePacks`（Task 6）、`GET /api/offline/pack`（Task 5）

- [ ] **Step 1: 元件**

`components/offline-prefetch.tsx`：

```tsx
'use client'
import { useEffect } from 'react'
import { openKV } from '@/lib/sync/idb'
import { localYmd } from '@/lib/sync/kv'
import { getMeta, setMeta } from '@/lib/sync/meta'
import { savePacks } from '@/lib/sync/pack-store'
import type { OfflinePack } from '@/lib/sync/types'

// 掛在 layout：在線時每日一次背景預抓今日複習包存 IndexedDB（離線複習資料源）。
export function OfflinePrefetch() {
  useEffect(() => {
    async function run() {
      if (!navigator.onLine || !('indexedDB' in window)) return
      const kv = openKV()
      const ymd = localYmd(new Date())
      if ((await getMeta(kv, 'lastPrefetchYmd')) === ymd) return
      try {
        const res = await fetch('/api/offline/pack')
        if (!res.ok) return // 未登入等情況：明天再說
        const data = (await res.json()) as { ok: boolean; packs: OfflinePack[] }
        if (!data.ok) return
        await savePacks(kv, data.packs, ymd)
        await setMeta(kv, 'lastPrefetchYmd', ymd)
      } catch { /* 靜默 */ }
    }
    void run()
  }, [])
  return null
}
```

- [ ] **Step 2: layout 掛載**

`app/layout.tsx`：import 兩個元件並掛在 `<PwaRegister />` 旁：

```tsx
import { OfflinePrefetch } from "@/components/offline-prefetch";
import { SyncOnReconnect } from "@/components/sync-on-reconnect";
```

```tsx
        {children}
        <PwaRegister />
        <OfflinePrefetch />
        <SyncOnReconnect />
```

- [ ] **Step 3: typecheck + tests + commit**

Run: `npx tsc --noEmit`、`npm test` → 全綠。

```bash
git add components/offline-prefetch.tsx app/layout.tsx
git commit -m "feat(sync): daily offline-pack prefetch + reconnect sync mounted in layout"
```

---

### Task 10: `ReviewSession` 注入 submit/finish ＋ offlineMode

**Files:**
- Modify: `components/review-session.tsx`

**Interfaces:**
- Produces（Task 11 消費）:

```ts
export type SubmitAnswerFn = (wordId: string, type: QuestionType, userAnswer: string) =>
  Promise<{ ok: boolean; mastered: boolean; correct: boolean; reward: ReviewReward | null }>
export type FinishSessionFn = (reviewed: number, correct: number) =>
  Promise<{ ok: boolean; reward: SessionReward | null }>
```

props 增加 `submit?: SubmitAnswerFn; finish?: FinishSessionFn; offlineMode?: boolean`；預設維持現行 server actions，線上行為零改變。

- [ ] **Step 1: Implement**

`components/review-session.tsx`：

1. import 增補：

```ts
import type { QuestionType } from '@/lib/learning/question'
import type { ReviewReward, SessionReward } from '@/lib/gamification/types'
```

2. 型別與 props（`ReviewItem` 介面後）：

```ts
export type SubmitAnswerFn = (wordId: string, type: QuestionType, userAnswer: string) =>
  Promise<{ ok: boolean; mastered: boolean; correct: boolean; reward: ReviewReward | null }>
export type FinishSessionFn = (reviewed: number, correct: number) =>
  Promise<{ ok: boolean; reward: SessionReward | null }>
```

```tsx
export function ReviewSession({ bookName, bookSlug, items, equipped, submit, finish, offlineMode }: {
  bookName: string; bookSlug: string; items: ReviewItem[]; equipped?: Equipped
  submit?: SubmitAnswerFn; finish?: FinishSessionFn; offlineMode?: boolean
}) {
```

3. 函式內開頭（`const router = useRouter()` 後）：

```ts
  const submitFn: SubmitAnswerFn = submit ?? submitAnswerAction
  const finishFn: FinishSessionFn = finish ?? finishSessionAction
```

`commit()` 內 `submitAnswerAction(q.wordId, q.type, userAnswer)` 改 `submitFn(q.wordId, q.type, userAnswer)`；`next()` 內 `finishSessionAction(items.length, correctCount)` 改 `finishFn(items.length, correctCount)`。

4. 結束畫面：offlineMode 時不顯示獎勵卡與「再來一輪」，改固定文案。`if (done)` 區塊內的 `<div className="mt-2 grid …">…</div>` 與底部按鈕列改為：

```tsx
        {offlineMode ? (
          <p className="mt-2 text-sm font-semibold text-neutral-600">已記錄 {finishedTotal} 題，回線後入帳</p>
        ) : (
          <div className="mt-2 grid w-full max-w-xs gap-2">
            <CelebrateCard tone="reward">+{rewards.xp} XP</CelebrateCard>
            {rewards.coins > 0 && <CelebrateCard tone="coin">+{rewards.coins} 🪙</CelebrateCard>}
            {rewards.level !== null && <CelebrateCard tone="level">升級到 Lv.{rewards.level}！</CelebrateCard>}
            {sessionPerfect && <CelebrateCard tone="mastery">完美一回，全部答對！</CelebrateCard>}
            {rewards.badges.length > 0 && <CelebrateCard tone="mastery">🏆 {rewards.badges.join('、')}</CelebrateCard>}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-4">
          <Link href={backHref} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 回單字書</Link>
          {!offlineMode && <button onClick={restart} className="text-sm font-bold text-primary-600 hover:underline">再來一輪</button>}
        </div>
```

5. `next()` 完成分支中的 `router.refresh()`：offlineMode 時跳過（離線 refresh 無意義且會打網路）：

```ts
      setDone(true)
      if (!offlineMode) router.refresh()
      return
```

- [ ] **Step 2: typecheck + tests**

Run: `npx tsc --noEmit`、`npm test` → 全綠（此元件無單元測試；線上行為由預設參數保持不變）。

- [ ] **Step 3: Commit**

```bash
git add components/review-session.tsx
git commit -m "feat(sync): injectable submit/finish + offline end screen in ReviewSession"
```

---

### Task 11: `/offline` 頁（選書 → 離線複習）

**Files:**
- Create: `app/offline/page.tsx`
- Create: `components/offline-home.tsx`

**Interfaces:**
- Consumes: `listPacks`／`removePack`（Task 6）、`enqueueAnswer`、`setMeta`、`openKV`、`localYmd`、`checkAnswer`（`@/lib/learning/question`）、`ReviewSession`＋`SubmitAnswerFn`／`FinishSessionFn`（Task 10）、`StoredPack`（Task 5）

- [ ] **Step 1: 頁面（必須可預渲染，SW 才能快取當 fallback）**

`app/offline/page.tsx`：

```tsx
import { OfflineHome } from '@/components/offline-home'

// 靜態頁：不碰 auth 與 DB，build 時預渲染，SW 預快取後當離線 navigation fallback。
export const dynamic = 'force-static'

export default function OfflinePage() {
  return <OfflineHome />
}
```

- [ ] **Step 2: 離線首頁元件**

`components/offline-home.tsx`：

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { openKV } from '@/lib/sync/idb'
import { localYmd } from '@/lib/sync/kv'
import { listPacks, removePack } from '@/lib/sync/pack-store'
import { enqueueAnswer } from '@/lib/sync/queue'
import { setMeta } from '@/lib/sync/meta'
import type { StoredPack } from '@/lib/sync/types'
import { checkAnswer } from '@/lib/learning/question'
import { ReviewSession, type SubmitAnswerFn, type FinishSessionFn } from '@/components/review-session'
import { Mascot } from '@/components/ui/mascot'
import { CardLink } from '@/components/ui/card-link'

export function OfflineHome() {
  const kv = useMemo(() => openKV(), [])
  const [packs, setPacks] = useState<StoredPack[] | null>(null)
  const [active, setActive] = useState<StoredPack | null>(null)

  useEffect(() => {
    void listPacks(kv, localYmd(new Date())).then(setPacks).catch(() => setPacks([]))
  }, [kv])

  if (active) {
    // 離線判分僅供 UI 即時回饋；權威判定在回線同步時由 server 重判。
    const submit: SubmitAnswerFn = async (wordId, type, userAnswer) => {
      const q = active.items.find((i) => i.question.wordId === wordId)?.question
      const correct = q ? (type === 'mc' ? userAnswer === q.answer : checkAnswer(userAnswer, q.answer)) : false
      await enqueueAnswer(kv, { wordId, questionType: type, userAnswer, answeredAt: new Date().toISOString() })
      return { ok: true, mastered: false, correct, reward: null }
    }
    const finish: FinishSessionFn = async () => {
      await setMeta(kv, 'pendingSessionFinishedAt', new Date().toISOString())
      await removePack(kv, active.slug) // 包已作答完，避免重複刷同一包
      return { ok: true, reward: null }
    }
    return <ReviewSession bookName={active.name} bookSlug={active.slug} items={active.items} offlineMode submit={submit} finish={finish} />
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 text-center">
      <Mascot mood="hi" size={110} className="mx-auto" />
      <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">離線複習</h1>
      <p className="mt-1 text-sm text-neutral-600">目前沒有網路連線，可以先複習已下載的今日單字包。</p>
      {packs === null && <p className="mt-8 text-sm text-neutral-600">載入中…</p>}
      {packs !== null && packs.length === 0 && (
        <p className="mt-8 text-sm text-neutral-600">沒有可用的離線單字包——上次在線時尚未下載，回線後打開 app 會自動準備。</p>
      )}
      {packs !== null && packs.length > 0 && (
        <div className="mt-6 grid gap-3 text-left">
          {packs.map((p) => (
            <button key={p.slug} type="button" onClick={() => setActive(p)} className="w-full">
              <CardLink as="div" title={p.name} subtitle={`${p.items.length} 題`} />
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
```

**注意**：`CardLink` 的實際 props 以 `components/ui/card-link.tsx` 為準——若它只接受 `href`，改用 `Card` 或簡單 `<div className="…">` 呈現書名＋題數即可，不為此改 ui 元件。

- [ ] **Step 3: typecheck + build 驗證 `/offline` 是靜態**

Run: `npx tsc --noEmit` → 無錯誤。
Run: `npm run build`
Expected: build 成功，route 表中 `/offline` 標記為 `○ (Static)`。

- [ ] **Step 4: Run full tests、commit**

Run: `npm test` → 全綠。

```bash
git add app/offline/ components/offline-home.tsx
git commit -m "feat(sync): /offline page - pick cached pack, review offline, queue answers"
```

---

### Task 12: `sw.js` app-shell fallback

**Files:**
- Modify: `public/sw.js`

**Interfaces:**
- Consumes: 既有 `shouldCache`（`./sw-strategy.js`，不改）。
- Produces: 離線導航一律 fallback 到快取的 `/offline`。

- [ ] **Step 1: Implement**

`public/sw.js` 改為（push／notificationclick 兩段維持原樣，只列出變更區）：

```js
import { shouldCache } from './sw-strategy.js'

const CACHE = 'vocab-v2' // bump：讓既有安裝重新跑 install、快取 /offline
const OFFLINE_URL = '/offline'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // 離線導航 fallback：任何頁面導航失敗都給快取的 /offline 殼
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.open(CACHE).then((c) => c.match(OFFLINE_URL)).then((r) => r ?? Response.error())
      )
    )
    return
  }
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !shouldCache(url.pathname)) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const res = await fetch(event.request)
      await cache.put(event.request, res.clone())
      return res
    })
  )
})
```

- [ ] **Step 2: 本地 build 驗證**

Run: `npm run build`
Expected: 成功（sw.js 是 public 靜態檔，不進 webpack；此步驟確認整體 build 未破）。

runtime 行為（fallback 真的生效）無法在單元測試驗，列入 Task 13 手動驗收。

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(pwa): offline navigation fallback to cached /offline shell (cache v2)"
```

---

### Task 13: 全量驗證 ＋ README ＋ 部署 ＋ 手動驗收清單

**Files:**
- Modify: `README.md`（追加「離線複習」短節）

- [ ] **Step 1: 全量驗證**

Run: `npm test` → 全綠（含新舊全部測試）。
Run: `npx tsc --noEmit` → 無錯誤。
Run: `npm run build` → 成功，`/offline` 為 Static、`/api/sync`、`/api/offline/pack` 為 Dynamic。

- [ ] **Step 2: README 短節**

`README.md` 追加：

```markdown
## 離線複習

在線時 app 會每日自動預抓「有學習進度的書」的今日複習包存 IndexedDB。離線打開 app 會落到 `/offline`：選書作答（本地即時回饋），作答存進同步佇列；回線後自動 `POST /api/sync`——server 逐筆去重（`ReviewLog.clientRef`）、重判對錯、按作答時間重放 FSRS 並入帳獎勵，完成後顯示入帳 toast。
```

- [ ] **Step 3: Commit + push（自動部署）**

```bash
git add README.md
git commit -m "docs: offline review + sync notes"
git push origin master
```

Run: `gh run watch $(gh run list --branch master --limit 1 --json databaseId -q '.[0].databaseId') --exit-status`
Expected: deploy `success`。

- [ ] **Step 4: 手動驗收清單（使用者做，iPhone PWA）**

1. 在線打開 app（首頁）→ 等幾秒（預抓）。
2. 開飛航模式 → 重開 PWA → 應落在「離線複習」頁、看到書包列表。
3. 選一本複習幾題 → 結束畫面顯示「已記錄 N 題，回線後入帳」。
4. 關飛航模式 → 回到 app → 應出現「離線複習 N 題已入帳 +XX XP」toast。
5. `/stats` 與頂部列 XP 反映新複習。

---

## Self-Review 紀錄

- **Spec coverage**：預抓（§1）→ Task 5/9；離線複習（§1）→ Task 10/11/12；同步重放（§1/§3）→ Task 7/8；資料模型 clientRef＋IndexedDB stores＋clamp（§2）→ Task 2/6/7；judgeAnswer 抽出（§3）→ Task 1；ReviewSession 注入（§3)→ Task 10；sw app-shell（§3）→ Task 12；測試矩陣（§4）→ 各 task TDD 步驟（衝突收斂以 Task 7「亂序重放」＋「重複去重」測試覆蓋：兩裝置＝兩批 entries，交錯時間戳排序重放 deterministic）。✅
- **Placeholder scan**：無 TBD/TODO；所有程式碼給全文。兩處「以實際檔案為準」（Task 3 既有 submit 測試檔名、Task 11 CardLink props）是對既有程式的防呆註記，附了明確 fallback 做法，非佔位。✅
- **Type consistency**：`QueueEntry`／`OfflinePack`／`StoredPack` 定義於 Task 5 `lib/sync/types.ts`，Task 6/7/8/9/11 引用同名同形；`SubmitAnswerFn`／`FinishSessionFn` 定義於 Task 10、Task 11 消費；`handleSync` 回傳 `{ok, results, reward}` 與 Task 8 client 解析欄位一致（client 僅用 reward.xp/coins，子集合法）。`clientRef` 貫穿 Task 2（schema/repo）→ Task 3（submit）→ Task 7（handler 傳 uuid）。✅
- **偏差紀錄**：spec 原寫 zod 驗證——repo 無 zod 依賴，per 成本鐵則零新依賴改手寫驗證（Task 7 一併修 spec 字樣）。
