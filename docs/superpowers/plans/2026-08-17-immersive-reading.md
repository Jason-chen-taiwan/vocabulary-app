# 沉浸閱讀＋篇章理解題 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用者在 `/read` 讀 TOEIC 情境短文與公有領域童話，逐字點擊查詞、收進「我的生字本」接上 FSRS 複習；TOEIC 短文讀完計時作答 3–5 題理解題（server 判分、首次完成給 XP），成為 Part 7 訓練。

**Architecture:** 內容全部在建置期離線預解析（tokenize＋lemmatize＋ECDICT 抽繁體釋義），存進新的 `Passage` 表（首批 Json 欄位）；runtime 零字典基礎設施。收藏是 `CardSource` 擴充點第一個實作——收進來的字就是普通 UserCard，FSRS／離線同步／遊戲化全走既有軌道，核心引擎零改動。判分與獎勵全部 server 權威；正解不出 server。

**Tech Stack:** Next.js App Router＋TS、Prisma 6.19.3（pin，`db push` 工作流）、Neon HTTP（runtime）／WebSocket（seed 腳本）、Vitest、Tailwind v4 `@theme` tokens、ECDICT（MIT，建置期）＋`opencc-js`（devDependency，建置期）。

**Spec:** `docs/superpowers/specs/2026-08-16-immersive-reading-design.md`

## Global Constraints

- Prisma 釘 **6.19.3**，schema 的 generator block（`previewFeatures = ["queryCompiler", "driverAdapters"]`）**不可動**；migration 工作流是 `npm run db:push` ＋ `npm run db:generate`（repo 無 migrations 目錄）。
- **不引入 zod／任何驗證庫**：手寫驗證（比照 `app/api/sync/handler.ts` 的 `parseEntries` 與 `lib/content/seed-schema.ts` 的 `req()`）。
- **不新增 runtime dependency**；`opencc-js` 只進 devDependencies、只被建置腳本 import，不得被 `app/`、`components/`、`lib/`（pipeline 目錄除外，且 pipeline 不 import opencc）任何會進 bundle 的模組引用。
- API route 慣例：`export const dynamic = 'force-dynamic'`；route.ts 是薄組合根，邏輯在同層 `handler.ts`（可注入 deps）；auth 用 `getCurrentUser()`（`@/lib/auth/session`）；失敗回 `{ ok: false, ... }` 零值 payload（不用 `{ error }`）；**無 `export const runtime`**（OpenNext→Workers）。
- 測試：放 `__tests__/` 同層目錄、檔名 `<module>.test.ts`（**只有 `.ts` 會被跑到**，無 jsdom——UI 邏輯抽成 `lib/**` 純函式測）；mock 一律走建構子／deps 注入（不 `vi.mock`）；跑 `npm test`。
- 判分／獎勵 server 權威：正解只存 server、GET payload 剝除；`coinBalance` 只有 gamification／shop 服務層可動（本功能不發幣）。
- 內容格式：glossary 釋義遵守「短對譯」機器驗證——去全形括號後，每個「；」義項在第一個「，、」前 ≤6 字。
- 零 runtime AI、零付費 API；ECDICT 資料下載到 gitignored `vendor/`，不進 repo。
- UI 文案繁體中文；頁面樣式用 `globals.css` 既有 tokens（`rounded-card`、`bg-primary-500`、`min-h-11` 等），不自創色票。
- 每個 commit 訊息結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- **既有慣例偏離記錄（沿用 P4a 的決定）**：`PassageFinished` 會發佈到 eventBus（接縫保留），但 XP 由組合根（submit handler 的 deps）直呼 `gamificationService.applyPassageFinish`，因為 reward 需同步回傳 UI——與 `docs/superpowers/plans/2026-06-28-p4a-core-gamification.md:1374` 的偏離記錄一致。gamification 失敗一律 try/catch 吞掉、不阻斷主流程。

---

### Task 1: Prisma schema — Passage 與 PassageResult

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: 無
- Produces: `Passage`、`PassageResult` model；`User.passageResults` 關聯。後續任務經 `getPrisma()` 使用 `prisma.passage`、`prisma.passageResult` delegate。

- [ ] **Step 1: 在 schema.prisma 末尾加兩個 model，並在 User 加關聯**

在 `model User` 的 `pushSubscriptions PushSubscription[]` 下一行加：

```prisma
  passageResults PassageResult[]
```

在檔案末尾（`model UserItem` 之後）加：

```prisma
model Passage {
  id        String          @id @default(cuid())
  slug      String          @unique
  kind      String          // "toeic" | "story"
  title     String
  titleZh   String?
  level     String?
  topic     String?
  source    String          // 出處與版權聲明
  wordCount Int
  content   Json            // PassageToken[][]（見 lib/reading/types.ts）
  glossary  Json            // Record<lemma, GlossEntry>
  questions Json            // PassageQuestion[]（含 answer；只在 server 使用，API 輸出剝除）
  order     Int             @default(0)
  results   PassageResult[]
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
}

model PassageResult {
  id           String   @id @default(cuid())
  userId       String
  passageId    String
  correctCount Int
  totalCount   Int
  readSeconds  Int?     // 閱讀計時，純統計顯示
  completedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  passage      Passage  @relation(fields: [passageId], references: [id], onDelete: Cascade)

  @@unique([userId, passageId]) // 首次完成才給獎的冪等錨點
  @@index([userId])
}
```

- [ ] **Step 2: 推 schema 並重新生成 client**

Run: `npm run db:push`（需要 `.env` 的 DATABASE_URL；輸出應含 `Your database is now in sync`）
Run: `npm run db:generate`
Expected: 兩者 exit 0。

- [ ] **Step 3: 確認既有測試不受影響**

Run: `npm test`
Expected: 全數 PASS（schema 只加不改）。

- [ ] **Step 4: Commit**

```powershell
git add prisma/schema.prisma; git commit -m @'
feat(reading): add Passage and PassageResult models

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: lib/reading 型別與 passage 驗證 schema

**Files:**
- Create: `lib/reading/types.ts`
- Create: `lib/reading/passage-schema.ts`
- Test: `lib/reading/__tests__/passage-schema.test.ts`

**Interfaces:**
- Consumes: 無
- Produces（後續所有任務都依賴這些名字）:
  - `type PassageKind = 'toeic' | 'story'`
  - `type PassageQuestionType = 'main' | 'detail' | 'inference'`
  - `interface PassageToken { w: string; l?: string }`
  - `interface GlossEntry { zh: string; pos?: string; wordId?: string; curated?: boolean }`
  - `interface PassageQuestion { id: string; type: PassageQuestionType; stem: string; options: string[]; answer: number }`
  - `interface PassageFile { slug; kind; title; titleZh?; level?; topic?; source; wordCount; content: PassageToken[][]; glossary: Record<string, GlossEntry>; questions: PassageQuestion[] }`
  - `interface PassageData`（PassageFile ＋ `id: string`，optional 欄位轉 `| null`）
  - `interface PassageListItem { id; slug; kind; title; titleZh: string | null; level: string | null; topic: string | null; wordCount: number; questionCount: number }`
  - `type ClientPassageQuestion = Omit<PassageQuestion, 'answer'>`
  - `interface PassagePayload`（PassageData 但 `questions: ClientPassageQuestion[]`）
  - `parsePassageFile(raw: unknown): PassageFile`（壞形狀 throw `Error('Invalid passage: ...')`）
  - `isValidGloss(zh: string): boolean`

- [ ] **Step 1: 寫失敗測試**

`lib/reading/__tests__/passage-schema.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parsePassageFile, isValidGloss } from '@/lib/reading/passage-schema'

function valid() {
  return {
    slug: 'office-memo-1',
    kind: 'toeic',
    title: 'Office Supply Reminder',
    titleZh: '辦公用品提醒',
    level: 'L1',
    topic: 'office',
    source: 'self-made',
    wordCount: 2,
    content: [[{ w: 'Please' , l: 'please' }, { w: ' ' }, { w: 'staple', l: 'staple' }, { w: '.' }]],
    glossary: { please: { zh: '請' }, staple: { zh: '裝訂', curated: true } },
    questions: [
      { id: 'q1', type: 'main', stem: 'What is the memo about?', options: ['A', 'B', 'C', 'D'], answer: 0 },
      { id: 'q2', type: 'detail', stem: 'Who should reply?', options: ['A', 'B', 'C', 'D'], answer: 2 },
      { id: 'q3', type: 'inference', stem: 'What will happen next?', options: ['A', 'B', 'C', 'D'], answer: 3 },
    ],
  }
}

describe('parsePassageFile', () => {
  it('接受合法 passage', () => {
    const p = parsePassageFile(valid())
    expect(p.slug).toBe('office-memo-1')
    expect(p.wordCount).toBe(2)
  })

  it('token 的 lemma 必須在 glossary 中（完整性）', () => {
    const p = valid()
    p.content = [[{ w: 'unknown', l: 'unknown' }]]
    p.wordCount = 1
    expect(() => parsePassageFile(p)).toThrow(/glossary/)
  })

  it('wordCount 必須等於帶 lemma 的 token 數', () => {
    const p = valid()
    p.wordCount = 99
    expect(() => parsePassageFile(p)).toThrow(/wordCount/)
  })

  it('toeic 題數必須 3–5；story 可為 0', () => {
    const p = valid()
    p.questions = p.questions.slice(0, 2)
    expect(() => parsePassageFile(p)).toThrow(/questions/)
    const s = valid()
    s.kind = 'story'
    s.questions = []
    expect(() => parsePassageFile(s)).not.toThrow()
  })

  it('每題恰 4 選項、answer 0–3、id 不重複', () => {
    const p = valid()
    p.questions[0].options = ['A', 'B', 'C']
    expect(() => parsePassageFile(p)).toThrow(/options/)
    const q = valid()
    q.questions[0].answer = 4
    expect(() => parsePassageFile(q)).toThrow(/answer/)
    const r = valid()
    r.questions[1].id = 'q1'
    expect(() => parsePassageFile(r)).toThrow(/id/)
  })

  it('glossary 釋義必須符合短對譯規則', () => {
    const p = valid()
    p.glossary.please = { zh: '這是一個非常長的解釋不是對譯' }
    expect(() => parsePassageFile(p)).toThrow(/gloss/)
  })

  it('source 必填', () => {
    const p = valid()
    p.source = ''
    expect(() => parsePassageFile(p)).toThrow(/source/)
  })
})

describe('isValidGloss', () => {
  it('每個「；」義項去全形括號後，第一個「，、」前 ≤6 字', () => {
    expect(isValidGloss('裝訂')).toBe(true)
    expect(isValidGloss('條款，合約中規範特定事項的條文')).toBe(true)
    expect(isValidGloss('放棄；拋棄')).toBe(true)
    expect(isValidGloss('（口語）好的，同意')).toBe(true)
    expect(isValidGloss('透過電話線傳送文件的機器')).toBe(false)
    expect(isValidGloss('')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/reading/__tests__/passage-schema.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

`lib/reading/types.ts`：

```ts
export type PassageKind = 'toeic' | 'story'
export type PassageQuestionType = 'main' | 'detail' | 'inference'

// l = 詞形還原後的 lemma（小寫）；標點/空白 token 無 l
export interface PassageToken { w: string; l?: string }

// curated：建置期標記「在精修字庫」；seed 時換成實際 wordId
export interface GlossEntry { zh: string; pos?: string; wordId?: string; curated?: boolean }

export interface PassageQuestion {
  id: string
  type: PassageQuestionType
  stem: string
  options: string[] // 恰 4 個
  answer: number    // 0–3；只在 server 使用
}

// content/passages/*.json 的形狀（建置產物＝seed 輸入）
export interface PassageFile {
  slug: string
  kind: PassageKind
  title: string
  titleZh?: string
  level?: string
  topic?: string
  source: string
  wordCount: number
  content: PassageToken[][]
  glossary: Record<string, GlossEntry>
  questions: PassageQuestion[]
}

// DB 讀出後的完整形狀（server 端）
export interface PassageData {
  id: string
  slug: string
  kind: PassageKind
  title: string
  titleZh: string | null
  level: string | null
  topic: string | null
  source: string
  wordCount: number
  content: PassageToken[][]
  glossary: Record<string, GlossEntry>
  questions: PassageQuestion[]
}

export interface PassageListItem {
  id: string
  slug: string
  kind: PassageKind
  title: string
  titleZh: string | null
  level: string | null
  topic: string | null
  wordCount: number
  questionCount: number
}

export type ClientPassageQuestion = Omit<PassageQuestion, 'answer'>

// 給前端的 payload：questions 一律剝掉 answer
export interface PassagePayload extends Omit<PassageData, 'questions'> {
  questions: ClientPassageQuestion[]
}

export interface PassageResultData {
  passageId: string
  correctCount: number
  totalCount: number
  readSeconds: number | null
  completedAt: Date
}
```

`lib/reading/passage-schema.ts`（手寫驗證，比照 `lib/content/seed-schema.ts` 的 `req()` 風格）：

```ts
import type { GlossEntry, PassageFile, PassageQuestion, PassageToken } from './types'

function req(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invalid passage: ${msg}`)
}

const KINDS = ['toeic', 'story']
const QUESTION_TYPES = ['main', 'detail', 'inference']

// CLAUDE.md 內容格式慣例的機器驗證：去全形括號後，每個「；」義項第一個「，、」前 ≤6 字
export function isValidGloss(zh: string): boolean {
  if (!zh.trim()) return false
  return zh.split('；').every((sense) => {
    const stripped = sense.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
    const first = stripped.split(/[，、]/)[0].trim()
    return first.length > 0 && first.length <= 6
  })
}

function parseToken(raw: unknown, where: string): PassageToken {
  const t = raw as Record<string, unknown>
  req(typeof t === 'object' && t !== null, `${where} 不是物件`)
  req(typeof t.w === 'string' && t.w.length > 0, `${where}.w 必填`)
  if (t.l === undefined) return { w: t.w as string }
  req(typeof t.l === 'string' && (t.l as string).length > 0, `${where}.l 需為非空字串`)
  return { w: t.w as string, l: t.l as string }
}

function parseQuestion(raw: unknown, i: number): PassageQuestion {
  const q = raw as Record<string, unknown>
  req(typeof q === 'object' && q !== null, `questions[${i}] 不是物件`)
  req(typeof q.id === 'string' && q.id.length > 0, `questions[${i}].id 必填`)
  req(typeof q.type === 'string' && QUESTION_TYPES.includes(q.type as string), `questions[${i}].type 非法`)
  req(typeof q.stem === 'string' && (q.stem as string).trim().length > 0, `questions[${i}].stem 必填`)
  const options = q.options
  req(Array.isArray(options) && options.length === 4 && options.every((o) => typeof o === 'string' && o.trim().length > 0), `questions[${i}].options 需恰 4 個非空字串`)
  req(typeof q.answer === 'number' && Number.isInteger(q.answer) && (q.answer as number) >= 0 && (q.answer as number) <= 3, `questions[${i}].answer 需為 0–3 整數`)
  return { id: q.id as string, type: q.type as PassageQuestion['type'], stem: q.stem as string, options: options as string[], answer: q.answer as number }
}

export function parsePassageFile(raw: unknown): PassageFile {
  const p = raw as Record<string, unknown>
  req(typeof p === 'object' && p !== null, '不是物件')
  req(typeof p.slug === 'string' && /^[a-z0-9-]+$/.test(p.slug as string), 'slug 需為 kebab-case')
  req(typeof p.kind === 'string' && KINDS.includes(p.kind as string), 'kind 需為 toeic|story')
  req(typeof p.title === 'string' && (p.title as string).trim().length > 0, 'title 必填')
  req(typeof p.source === 'string' && (p.source as string).trim().length > 0, 'source 必填（出處與版權聲明）')

  req(Array.isArray(p.content) && (p.content as unknown[]).length > 0, 'content 需為非空段落陣列')
  const content = (p.content as unknown[]).map((para, pi) => {
    req(Array.isArray(para) && para.length > 0, `content[${pi}] 需為非空 token 陣列`)
    return (para as unknown[]).map((t, ti) => parseToken(t, `content[${pi}][${ti}]`))
  })

  req(typeof p.glossary === 'object' && p.glossary !== null && !Array.isArray(p.glossary), 'glossary 需為物件')
  const glossary: Record<string, GlossEntry> = {}
  for (const [lemma, entry] of Object.entries(p.glossary as Record<string, unknown>)) {
    const e = entry as Record<string, unknown>
    req(typeof e === 'object' && e !== null && typeof e.zh === 'string', `glossary["${lemma}"].zh 必填`)
    req(isValidGloss(e.zh as string), `glossary["${lemma}"] gloss 不符短對譯規則：「${e.zh}」`)
    glossary[lemma] = { zh: e.zh as string }
    if (typeof e.pos === 'string') glossary[lemma].pos = e.pos
    if (typeof e.wordId === 'string') glossary[lemma].wordId = e.wordId
    if (e.curated === true) glossary[lemma].curated = true
  }

  // 完整性：每個可點 token 的 lemma 都查得到 glossary
  let lemmaTokens = 0
  for (const para of content) for (const t of para) {
    if (t.l !== undefined) {
      lemmaTokens += 1
      req(glossary[t.l] !== undefined, `token "${t.w}" 的 lemma "${t.l}" 不在 glossary`)
    }
  }
  req(typeof p.wordCount === 'number' && p.wordCount === lemmaTokens, `wordCount(${p.wordCount}) 必須等於帶 lemma 的 token 數(${lemmaTokens})`)

  req(Array.isArray(p.questions), 'questions 需為陣列')
  const questions = (p.questions as unknown[]).map(parseQuestion)
  const ids = new Set(questions.map((q) => q.id))
  req(ids.size === questions.length, 'questions id 不可重複')
  if (p.kind === 'toeic') req(questions.length >= 3 && questions.length <= 5, 'toeic 篇 questions 需 3–5 題')
  else req(questions.length <= 5, 'story 篇 questions 需 0–5 題')

  const out: PassageFile = {
    slug: p.slug as string, kind: p.kind as PassageFile['kind'], title: p.title as string,
    source: p.source as string, wordCount: p.wordCount as number, content, glossary, questions,
  }
  if (typeof p.titleZh === 'string' && p.titleZh) out.titleZh = p.titleZh
  if (typeof p.level === 'string' && p.level) out.level = p.level
  if (typeof p.topic === 'string' && p.topic) out.topic = p.topic
  return out
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/reading/__tests__/passage-schema.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add lib/reading; git commit -m @'
feat(reading): passage types and hand-written file validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: 建置管線純函式 — tokenize／lemma／ECDICT gloss

**Files:**
- Create: `lib/reading/pipeline/tokenize.ts`
- Create: `lib/reading/pipeline/lemma.ts`
- Create: `lib/reading/pipeline/ecdict.ts`
- Test: `lib/reading/pipeline/__tests__/tokenize.test.ts`
- Test: `lib/reading/pipeline/__tests__/lemma.test.ts`
- Test: `lib/reading/pipeline/__tests__/ecdict.test.ts`

**Interfaces:**
- Consumes: `PassageToken`（Task 2）
- Produces:
  - `tokenize(paragraph: string, lemmaOf: (word: string) => string): PassageToken[]`
  - `parseLemmaFile(text: string): Map<string, string>`（變形（小寫）→ lemma（小寫））
  - `makeLemmaOf(map: Map<string, string>): (word: string) => string`
  - `parseCsvLine(line: string): string[]`
  - `buildDictIndex(csvText: string, needed: Set<string>): Map<string, { word: string; pos: string; translation: string }>`
  - `glossFromTranslation(translation: string, toTraditional: (s: string) => string): { zh: string; pos?: string } | null`

注意：**pipeline 目錄不得 import `opencc-js`**——繁化函式由呼叫端（build 腳本）注入，測試用 identity 函式。

- [ ] **Step 1: 寫失敗測試**

`lib/reading/pipeline/__tests__/tokenize.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { tokenize } from '@/lib/reading/pipeline/tokenize'

const lower = (w: string) => w.toLowerCase()

describe('tokenize', () => {
  it('英文字帶 lemma，標點與空白原樣保留', () => {
    expect(tokenize('He ran fast.', lower)).toEqual([
      { w: 'He', l: 'he' }, { w: ' ' }, { w: 'ran', l: 'ran' }, { w: ' ' }, { w: 'fast', l: 'fast' }, { w: '.' },
    ])
  })

  it('縮寫與連字號視為一個字', () => {
    expect(tokenize("Don't re-enter", lower)).toEqual([
      { w: "Don't", l: "don't" }, { w: ' ' }, { w: 're-enter', l: 're-enter' },
    ])
  })

  it('串回原文不失真', () => {
    const src = 'Hello, world! (See attached: Q3-report.)'
    const joined = tokenize(src, lower).map((t) => t.w).join('')
    expect(joined).toBe(src)
  })
})
```

`lib/reading/pipeline/__tests__/lemma.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parseLemmaFile, makeLemmaOf } from '@/lib/reading/pipeline/lemma'

const SAMPLE = [
  '; BNC lemma list',
  'run/1000 -> ran,running,runs',
  'study/500 -> studied,studies,studying',
].join('\n')

describe('lemma', () => {
  it('parseLemmaFile 建出 變形→lemma 對照，跳過註解行', () => {
    const map = parseLemmaFile(SAMPLE)
    expect(map.get('ran')).toBe('run')
    expect(map.get('studies')).toBe('study')
    expect(map.has(';')).toBe(false)
  })

  it('makeLemmaOf：小寫化查表，查無回小寫原詞', () => {
    const lemmaOf = makeLemmaOf(parseLemmaFile(SAMPLE))
    expect(lemmaOf('Ran')).toBe('run')
    expect(lemmaOf('Hello')).toBe('hello')
  })
})
```

`lib/reading/pipeline/__tests__/ecdict.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parseCsvLine, buildDictIndex, glossFromTranslation } from '@/lib/reading/pipeline/ecdict'

const id = (s: string) => s

describe('parseCsvLine', () => {
  it('處理引號欄位與內嵌逗號/雙引號', () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
    expect(parseCsvLine('a,"say ""hi""",c')).toEqual(['a', 'say "hi"', 'c'])
  })
})

describe('buildDictIndex', () => {
  it('只收 needed 內的字（省記憶體），欄位對映 word/pos/translation', () => {
    // ECDICT 欄序：word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
    const csv = [
      'word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio',
      'run,rʌn,to move fast,"v. 跑, 奔跑\\nn. 跑步",v:80/n:20,3,1,cet4,100,120,,,',
      'skip,skɪp,to jump,跳过,,,,,,,,,',
    ].join('\n')
    const idx = buildDictIndex(csv, new Set(['run']))
    expect(idx.has('skip')).toBe(false)
    expect(idx.get('run')?.translation).toBe('v. 跑, 奔跑\\nn. 跑步')
  })
})

describe('glossFromTranslation', () => {
  it('取第一義、剝詞性前綴為 pos、在逗號截為短對譯，經繁化函式輸出', () => {
    expect(glossFromTranslation('v. 跑, 奔跑\\nn. 跑步', id)).toEqual({ zh: '跑', pos: 'v.' })
  })
  it('無詞性前綴也可', () => {
    expect(glossFromTranslation('跳过', id)).toEqual({ zh: '跳过' })
  })
  it('空翻譯回 null', () => {
    expect(glossFromTranslation('', id)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/reading/pipeline`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

`lib/reading/pipeline/tokenize.ts`：

```ts
import type { PassageToken } from '../types'

const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g

// 把一段原文切成 token 串：英文字帶 lemma，其餘（標點、空白）原樣保留，串回可還原原文
export function tokenize(paragraph: string, lemmaOf: (word: string) => string): PassageToken[] {
  const out: PassageToken[] = []
  let last = 0
  for (const m of paragraph.matchAll(WORD_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push({ w: paragraph.slice(last, start) })
    out.push({ w: m[0], l: lemmaOf(m[0]) })
    last = start + m[0].length
  }
  if (last < paragraph.length) out.push({ w: paragraph.slice(last) })
  return out
}
```

`lib/reading/pipeline/lemma.ts`：

```ts
// 解析 ECDICT 附帶的 BNC lemma.en.txt：每行「lemma/freq -> form1,form2」，';' 開頭為註解
export function parseLemmaFile(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';')) continue
    const arrow = trimmed.indexOf('->')
    if (arrow < 0) continue
    const lemma = trimmed.slice(0, arrow).split('/')[0].trim().toLowerCase()
    if (!lemma) continue
    for (const form of trimmed.slice(arrow + 2).split(',')) {
      const f = form.trim().toLowerCase()
      if (f && f !== lemma) map.set(f, lemma)
    }
  }
  return map
}

export function makeLemmaOf(map: Map<string, string>): (word: string) => string {
  return (word: string) => {
    const lower = word.toLowerCase()
    return map.get(lower) ?? lower
  }
}
```

`lib/reading/pipeline/ecdict.ts`：

```ts
export interface DictRow { word: string; pos: string; translation: string }

// 最小 CSV 行解析：處理雙引號欄位與 "" 跳脫（ECDICT 換行以字面 \n 存放，逐行解析安全）
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// 掃整份 csv 但只收 needed 的 lemma（66MB 檔全收會爆記憶體）
export function buildDictIndex(csvText: string, needed: Set<string>): Map<string, DictRow> {
  const idx = new Map<string, DictRow>()
  const lines = csvText.split('\n')
  for (let i = 1; i < lines.length; i++) { // 跳過表頭
    const line = lines[i]
    if (!line) continue
    const comma = line.indexOf(',')
    if (comma < 0) continue
    // 先便宜取 word 欄避免整行解析
    const head = line.startsWith('"') ? null : line.slice(0, comma).toLowerCase()
    if (head !== null && !needed.has(head)) continue
    const cols = parseCsvLine(line)
    const word = cols[0].toLowerCase()
    if (!needed.has(word) || idx.has(word)) continue
    idx.set(word, { word, pos: cols[4] ?? '', translation: cols[3] ?? '' })
  }
  return idx
}

// 從 ECDICT translation 抽短對譯：多義以字面 \n 分隔，取第一義；
// 剝前導詞性標記（如 "v. "）為 pos；在「,，;；、」截斷取第一片段；經注入的繁化函式輸出
export function glossFromTranslation(
  translation: string,
  toTraditional: (s: string) => string,
): { zh: string; pos?: string } | null {
  const first = translation.split('\\n')[0]?.trim()
  if (!first) return null
  const m = first.match(/^([a-z]+\.)\s*(.*)$/)
  const pos = m ? m[1] : undefined
  const body = (m ? m[2] : first).trim()
  const zh = toTraditional(body.split(/[,，;；、]/)[0].trim())
  if (!zh) return null
  return pos ? { zh, pos } : { zh }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/reading/pipeline`
Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add lib/reading/pipeline; git commit -m @'
feat(reading): build pipeline pure functions (tokenize, lemma, ecdict gloss)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: 組裝函式 buildPassage ＋ 建置腳本 ＋ 樣本短文端到端

**Files:**
- Create: `lib/reading/pipeline/build.ts`
- Test: `lib/reading/pipeline/__tests__/build.test.ts`
- Create: `scripts/fetch-dict.mjs`
- Create: `scripts/build-passage.mjs`
- Create: `content/passages-src/_gloss-overrides.json`
- Create: `content/passages-src/office-supply-memo.json`
- Modify: `.gitignore`（加 `vendor/`）
- Modify: `package.json`（scripts 加 `fetch:dict`、`build:passages`）

**Interfaces:**
- Consumes: Task 2/3 全部；`content/_headwords.json`（既有，形狀 `{ "<book-slug>": { name, headwords: string[] } }`）
- Produces:
  - `interface PassageSrc { slug; kind; title; titleZh?; level?; topic?; source; paragraphs: string[]; questions: { type; stem; options: string[]; answer: number }[] }`
  - `parsePassageSrc(raw: unknown): PassageSrc`
  - `buildPassage(src: PassageSrc, deps: { lemmaOf: (w: string) => string; lookup: (lemma: string) => { zh: string; pos?: string } | null; curated: Set<string> }): PassageFile`（缺釋義時 throw，錯誤訊息列出所有缺字）
  - npm scripts：`npm run fetch:dict`、`npm run build:passages`（建 `content/passages-src/*.json` → `content/passages/*.json`）
  - 樣本短文 `content/passages/office-supply-memo.json`（建置產物，commit 進 repo）

- [ ] **Step 1: 寫失敗測試**

`lib/reading/pipeline/__tests__/build.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildPassage, parsePassageSrc } from '@/lib/reading/pipeline/build'

const SRC = {
  slug: 'memo-1', kind: 'toeic', title: 'Memo', titleZh: '備忘錄', level: 'L1', topic: 'office', source: 'self-made',
  paragraphs: ['He ran fast.'],
  questions: [
    { type: 'main', stem: 'Q1?', options: ['A', 'B', 'C', 'D'], answer: 0 },
    { type: 'detail', stem: 'Q2?', options: ['A', 'B', 'C', 'D'], answer: 1 },
    { type: 'inference', stem: 'Q3?', options: ['A', 'B', 'C', 'D'], answer: 2 },
  ],
}

const DICT: Record<string, { zh: string; pos?: string }> = {
  he: { zh: '他' }, run: { zh: '跑', pos: 'v.' }, fast: { zh: '快', pos: 'adj.' },
}

function deps(curated: string[] = []) {
  return {
    lemmaOf: (w: string) => (w.toLowerCase() === 'ran' ? 'run' : w.toLowerCase()),
    lookup: (lemma: string) => DICT[lemma] ?? null,
    curated: new Set(curated),
  }
}

describe('buildPassage', () => {
  it('組出通過 parsePassageFile 的 PassageFile；question id 自動編號', () => {
    const p = buildPassage(parsePassageSrc(SRC), deps())
    expect(p.wordCount).toBe(3)
    expect(p.glossary.run).toEqual({ zh: '跑', pos: 'v.' })
    expect(p.questions.map((q) => q.id)).toEqual(['memo-1-q1', 'memo-1-q2', 'memo-1-q3'])
  })

  it('curated 字標 curated: true', () => {
    const p = buildPassage(parsePassageSrc(SRC), deps(['run']))
    expect(p.glossary.run.curated).toBe(true)
  })

  it('查無釋義時 throw 並列出全部缺字', () => {
    const src = parsePassageSrc({ ...SRC, paragraphs: ['He zzz qqq.'] })
    expect(() => buildPassage(src, deps())).toThrow(/zzz[\s\S]*qqq|qqq[\s\S]*zzz/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/reading/pipeline/__tests__/build.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作 build.ts**

`lib/reading/pipeline/build.ts`：

```ts
import type { GlossEntry, PassageFile } from '../types'
import { parsePassageFile } from '../passage-schema'
import { tokenize } from './tokenize'

export interface PassageSrcQuestion { type: string; stem: string; options: string[]; answer: number }
export interface PassageSrc {
  slug: string; kind: string; title: string; titleZh?: string; level?: string; topic?: string; source: string
  paragraphs: string[]
  questions: PassageSrcQuestion[]
}

function req(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invalid passage src: ${msg}`)
}

export function parsePassageSrc(raw: unknown): PassageSrc {
  const p = raw as Record<string, unknown>
  req(typeof p === 'object' && p !== null, '不是物件')
  req(typeof p.slug === 'string' && (p.slug as string).length > 0, 'slug 必填')
  req(typeof p.kind === 'string', 'kind 必填')
  req(typeof p.title === 'string', 'title 必填')
  req(typeof p.source === 'string' && (p.source as string).length > 0, 'source 必填')
  req(Array.isArray(p.paragraphs) && (p.paragraphs as unknown[]).every((s) => typeof s === 'string' && s.trim().length > 0), 'paragraphs 需為非空字串陣列')
  req(Array.isArray(p.questions), 'questions 需為陣列')
  return p as unknown as PassageSrc
}

export interface BuildDeps {
  lemmaOf(word: string): string
  lookup(lemma: string): { zh: string; pos?: string } | null
  curated: Set<string>
}

// 組裝＋驗證：產物一定通過 parsePassageFile（缺釋義在建置期整批報錯）
export function buildPassage(src: PassageSrc, deps: BuildDeps): PassageFile {
  const content = src.paragraphs.map((para) => tokenize(para, deps.lemmaOf))
  const glossary: Record<string, GlossEntry> = {}
  const missing: string[] = []
  let wordCount = 0
  for (const para of content) for (const t of para) {
    if (t.l === undefined) continue
    wordCount += 1
    if (glossary[t.l]) continue
    const entry = deps.lookup(t.l)
    if (!entry) { if (!missing.includes(t.l)) missing.push(t.l); continue }
    glossary[t.l] = { zh: entry.zh }
    if (entry.pos) glossary[t.l].pos = entry.pos
    if (deps.curated.has(t.l)) glossary[t.l].curated = true
  }
  if (missing.length) throw new Error(`查無釋義（請補 content/passages-src/_gloss-overrides.json）：\n${missing.join('\n')}`)

  const questions = src.questions.map((q, i) => ({ id: `${src.slug}-q${i + 1}`, type: q.type, stem: q.stem, options: q.options, answer: q.answer }))
  const file: Record<string, unknown> = {
    slug: src.slug, kind: src.kind, title: src.title, source: src.source, wordCount, content, glossary, questions,
  }
  if (src.titleZh) file.titleZh = src.titleZh
  if (src.level) file.level = src.level
  if (src.topic) file.topic = src.topic
  return parsePassageFile(file) // 最終驗證（含 gloss 格式、題數、完整性）
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/reading/pipeline`
Expected: PASS。

- [ ] **Step 5: 下載腳本與 .gitignore**

`.gitignore` 加一行：

```
vendor/
```

`scripts/fetch-dict.mjs`：

```js
// 下載 ECDICT 資料到 gitignored vendor/（已存在則跳過）。MIT 授權，只在建置期使用。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const FILES = [
  ['https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv', 'vendor/ecdict/ecdict.csv'],
  ['https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt', 'vendor/ecdict/lemma.en.txt'],
]

mkdirSync('vendor/ecdict', { recursive: true })
for (const [url, path] of FILES) {
  if (existsSync(path)) { console.log(`skip (exists): ${path}`); continue }
  console.log(`downloading ${url} ...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  console.log(`saved: ${path}`)
}
```

- [ ] **Step 6: 建置腳本**

`scripts/build-passage.mjs`：

```js
// 建置期預解析：content/passages-src/*.json -> content/passages/*.json
// 用法：npm run build:passages            （全部）
//       npm run build:passages -- <slug>  （單篇）
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import * as OpenCC from 'opencc-js'
import { parseLemmaFile, makeLemmaOf } from '../lib/reading/pipeline/lemma.ts'
import { buildDictIndex, glossFromTranslation } from '../lib/reading/pipeline/ecdict.ts'
import { buildPassage, parsePassageSrc } from '../lib/reading/pipeline/build.ts'
import { tokenize } from '../lib/reading/pipeline/tokenize.ts'

const CSV = 'vendor/ecdict/ecdict.csv'
const LEMMA = 'vendor/ecdict/lemma.en.txt'
if (!existsSync(CSV) || !existsSync(LEMMA)) throw new Error('先跑 npm run fetch:dict 下載 ECDICT 資料')

const only = process.argv[2]
const srcDir = 'content/passages-src'
const outDir = 'content/passages'
mkdirSync(outDir, { recursive: true })

const files = readdirSync(srcDir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .filter((f) => (only ? f === `${only}.json` : true))
if (files.length === 0) throw new Error('沒有可建置的 passages-src 檔')

const srcs = files.map((f) => parsePassageSrc(JSON.parse(readFileSync(`${srcDir}/${f}`, 'utf8'))))

// slug 跨檔不可重複（spec §2 驗證第 4 點）
const dup = srcs.map((s) => s.slug).filter((s, i, a) => a.indexOf(s) !== i)
if (dup.length) throw new Error(`slug 重複：${[...new Set(dup)].join(', ')}`)

// 詞形還原表 + 手動釋義覆寫
const lemmaOf = makeLemmaOf(parseLemmaFile(readFileSync(LEMMA, 'utf8')))
const overridesPath = `${srcDir}/_gloss-overrides.json`
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {}

// 先掃全部原文收集需要的 lemma，再一次掃 66MB csv 建索引
const needed = new Set()
for (const src of srcs) for (const para of src.paragraphs) for (const t of tokenize(para, lemmaOf)) if (t.l) needed.add(t.l)
const dict = buildDictIndex(readFileSync(CSV, 'utf8'), needed)

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' })
const curated = new Set(
  Object.values(JSON.parse(readFileSync('content/_headwords.json', 'utf8')))
    .flatMap((b) => b.headwords.map((h) => h.toLowerCase())),
)

const lookup = (lemma) => {
  if (overrides[lemma]) return overrides[lemma] // 覆寫優先（已是繁體短對譯）
  const row = dict.get(lemma)
  if (!row) return null
  return glossFromTranslation(row.translation, toTraditional)
}

let failed = 0
for (const src of srcs) {
  try {
    const passage = buildPassage(src, { lemmaOf, lookup, curated })
    writeFileSync(`${outDir}/${src.slug}.json`, `${JSON.stringify(passage, null, 2)}\n`)
    console.log(`built: ${src.slug}（${passage.wordCount} 字，${passage.questions.length} 題）`)
  } catch (err) {
    failed += 1
    console.error(`FAILED: ${src.slug}\n${err.message}\n`)
  }
}
if (failed) process.exit(1)
```

`content/passages-src/_gloss-overrides.json` 初始為：

```json
{}
```

`package.json` scripts 加：

```json
    "fetch:dict": "node scripts/fetch-dict.mjs",
    "build:passages": "node --experimental-strip-types scripts/build-passage.mjs",
```

安裝 devDependency：

Run: `npm install --save-dev opencc-js`

- [ ] **Step 7: 樣本短文（真實內容，之後直接上線）**

`content/passages-src/office-supply-memo.json`：

```json
{
  "slug": "office-supply-memo",
  "kind": "toeic",
  "title": "Office Supply Order Reminder",
  "titleZh": "辦公用品訂購提醒",
  "level": "L1",
  "topic": "office",
  "source": "self-made",
  "paragraphs": [
    "To: All Staff",
    "From: Rita Huang, Office Manager",
    "Subject: Monthly supply order",
    "Please send your stationery requests to me by Friday, March 14. Our supplier delivers only once a month, so late requests will wait until April. Common items such as staplers, folders, and toner are kept in the storage room next to the copier; check there first before you order.",
    "If an item you need is not on the standard list, attach a short note explaining why it is necessary. Orders above NT$2,000 require approval from your department head.",
    "Thank you for your cooperation."
  ],
  "questions": [
    {
      "type": "main",
      "stem": "What is the main purpose of this memo?",
      "options": [
        "To ask staff to submit supply requests by a deadline",
        "To announce a new office manager",
        "To report a problem with the copier",
        "To introduce a new supplier"
      ],
      "answer": 0
    },
    {
      "type": "detail",
      "stem": "What should employees do before ordering common items?",
      "options": [
        "Ask their department head",
        "Check the storage room next to the copier",
        "Call the supplier directly",
        "Wait until April"
      ],
      "answer": 1
    },
    {
      "type": "inference",
      "stem": "What will most likely happen to a request sent on March 20?",
      "options": [
        "It will be delivered the next day",
        "It will be rejected permanently",
        "It will be included in the April order",
        "It will require a note from Rita Huang"
      ],
      "answer": 2
    }
  ]
}
```

- [ ] **Step 8: 端到端跑通**

Run: `npm run fetch:dict`（首次約下載 68MB）
Run: `npm run build:passages`
Expected: `built: office-supply-memo（… 字，3 題）`，產生 `content/passages/office-supply-memo.json`。若有 `查無釋義` 或 gloss 格式錯誤，把該 lemma 加進 `_gloss-overrides.json`（值形如 `{ "zh": "影印機", "pos": "n." }`）再跑到過。

- [ ] **Step 9: Commit**

```powershell
git add lib/reading/pipeline scripts/fetch-dict.mjs scripts/build-passage.mjs content/passages-src content/passages .gitignore package.json package-lock.json; git commit -m @'
feat(reading): offline passage build pipeline with sample TOEIC memo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: PassageRepository、payload 剝答案與 DictionaryService

**Files:**
- Create: `lib/reading/repository.ts`
- Create: `lib/reading/dictionary.ts`
- Test: `lib/reading/__tests__/repository.test.ts`
- Test: `lib/reading/__tests__/dictionary.test.ts`

**Interfaces:**
- Consumes: Task 2 型別；`getPrisma()`（`@/lib/db/client`）
- Produces:
  - `class PassageRepository { constructor(db?) }`
    - `listPassages(): Promise<PassageListItem[]>`（依 `order` 升冪；不載 content/glossary/questions 大欄位）
    - `getPassageBySlug(slug: string): Promise<PassageData | null>`
    - `getResult(userId: string, passageId: string): Promise<PassageResultData | null>`
    - `listResults(userId: string, passageIds: string[]): Promise<Map<string, PassageResultData>>`
    - `saveResult(userId, passageId, data: { correctCount: number; totalCount: number; readSeconds: number | null }): Promise<{ firstCompletion: boolean }>`（顯式 findUnique→create/update，避免內建 upsert 觸發交易——比照 seed 腳本註解）
    - `listCollectedLemmas(userId: string, entries: { lemma: string; wordId?: string }[]): Promise<string[]>`
  - `toPassagePayload(p: PassageData): PassagePayload`（**剝 `answer`**）
  - `interface DictEntry { lemma: string; zh: string; pos?: string; wordId?: string }`
  - `interface DictionaryService { lookup(lemma: string, passage: Pick<PassageData, 'glossary'>): DictEntry | null }`（隔離點：未來「自貼文章」換全字典實作，上層不動——spec §4）
  - `class GlossaryDictionary implements DictionaryService`（本輪唯一實作：查 passage glossary）

- [ ] **Step 0: DictionaryService 契約測試與實作**

`lib/reading/__tests__/dictionary.test.ts`（契約測試：對「所有實作」跑同一組行為斷言，之後新增實作只要加進陣列）：

```ts
import { describe, it, expect } from 'vitest'
import { GlossaryDictionary } from '@/lib/reading/dictionary'
import type { DictionaryService } from '@/lib/reading/dictionary'

const passage = { glossary: { run: { zh: '跑', pos: 'v.', wordId: 'w1' }, zeal: { zh: '熱忱' } } }

const implementations: [string, DictionaryService][] = [
  ['GlossaryDictionary', new GlossaryDictionary()],
]

describe.each(implementations)('DictionaryService 契約：%s', (_name, dict) => {
  it('查得到：回 lemma 與釋義，有 wordId/pos 就帶上', () => {
    expect(dict.lookup('run', passage)).toEqual({ lemma: 'run', zh: '跑', pos: 'v.', wordId: 'w1' })
    expect(dict.lookup('zeal', passage)).toEqual({ lemma: 'zeal', zh: '熱忱' })
  })
  it('查無回 null', () => {
    expect(dict.lookup('nope', passage)).toBeNull()
  })
})
```

先跑 `npx vitest run lib/reading/__tests__/dictionary.test.ts` 確認 FAIL，再實作 `lib/reading/dictionary.ts`：

```ts
import type { PassageData } from './types'

export interface DictEntry { lemma: string; zh: string; pos?: string; wordId?: string }

// 查詞隔離點（spec §4）：本輪 = 查 passage glossary；未來「自貼文章」換全字典實作，上層不動
export interface DictionaryService {
  lookup(lemma: string, passage: Pick<PassageData, 'glossary'>): DictEntry | null
}

export class GlossaryDictionary implements DictionaryService {
  lookup(lemma: string, passage: Pick<PassageData, 'glossary'>): DictEntry | null {
    const e = passage.glossary[lemma]
    if (!e) return null
    const out: DictEntry = { lemma, zh: e.zh }
    if (e.pos) out.pos = e.pos
    if (e.wordId) out.wordId = e.wordId
    return out
  }
}
```

再跑一次同測試確認 PASS。（Task 11 的 `PassageReader` 點字卡片一律經 `new GlossaryDictionary().lookup(lemma, passage)` 取釋義，不直接讀 `passage.glossary[lemma]`。）

- [ ] **Step 1: 寫失敗測試**（mock 模式比照 `lib/learning/__tests__/repository.test.ts`：手刻 delegate＋`vi.fn()`）

`lib/reading/__tests__/repository.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { PassageRepository, toPassagePayload } from '@/lib/reading/repository'
import type { PassageData } from '@/lib/reading/types'

function makeDb() {
  return {
    passage: { findMany: vi.fn(), findUnique: vi.fn() },
    passageResult: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    userCard: { findMany: vi.fn() },
  }
}

const ROW = {
  id: 'p1', slug: 's1', kind: 'toeic', title: 'T', titleZh: null, level: 'L1', topic: 'office',
  source: 'self-made', wordCount: 1, order: 0,
  content: [[{ w: 'run', l: 'run' }]],
  glossary: { run: { zh: '跑' } },
  questions: [{ id: 'q1', type: 'main', stem: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 2 }],
}

describe('PassageRepository', () => {
  it('getPassageBySlug 把 Json 欄位映成宣告型別', async () => {
    const db = makeDb(); db.passage.findUnique.mockResolvedValue(ROW)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new PassageRepository(db as any)
    const p = await repo.getPassageBySlug('s1')
    expect(p?.questions[0].answer).toBe(2)
    expect(db.passage.findUnique).toHaveBeenCalledWith({ where: { slug: 's1' } })
  })

  it('saveResult 首次 create 回 firstCompletion: true，之後 update 回 false', async () => {
    const db = makeDb()
    db.passageResult.findUnique.mockResolvedValueOnce(null)
    db.passageResult.create.mockResolvedValue({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new PassageRepository(db as any)
    const r1 = await repo.saveResult('u1', 'p1', { correctCount: 2, totalCount: 3, readSeconds: 60 })
    expect(r1.firstCompletion).toBe(true)
    db.passageResult.findUnique.mockResolvedValueOnce({ id: 'r1' })
    db.passageResult.update.mockResolvedValue({})
    const r2 = await repo.saveResult('u1', 'p1', { correctCount: 3, totalCount: 3, readSeconds: 50 })
    expect(r2.firstCompletion).toBe(false)
    expect(db.passageResult.update).toHaveBeenCalledWith({
      where: { userId_passageId: { userId: 'u1', passageId: 'p1' } },
      data: { correctCount: 3, totalCount: 3, readSeconds: 50 },
    })
  })

  it('listCollectedLemmas 併查精修 wordId 卡與生字本 headword 卡', async () => {
    const db = makeDb()
    db.userCard.findMany
      .mockResolvedValueOnce([{ wordId: 'w-run' }])                                  // 精修卡
      .mockResolvedValueOnce([{ word: { headword: 'zealous' } }])                    // 生字本卡
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new PassageRepository(db as any)
    const out = await repo.listCollectedLemmas('u1', [
      { lemma: 'run', wordId: 'w-run' }, { lemma: 'zealous' }, { lemma: 'walk', wordId: 'w-walk' },
    ])
    expect(out.sort()).toEqual(['run', 'zealous'])
  })
})

describe('toPassagePayload', () => {
  it('剝掉每題的 answer', () => {
    const payload = toPassagePayload(ROW as unknown as PassageData)
    expect(payload.questions).toHaveLength(1)
    expect('answer' in payload.questions[0]).toBe(false)
    expect(JSON.stringify(payload)).not.toContain('"answer"')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/reading/__tests__/repository.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作**

`lib/reading/repository.ts`：

```ts
import { getPrisma } from '@/lib/db/client'
import type {
  ClientPassageQuestion, GlossEntry, PassageData, PassageListItem, PassagePayload,
  PassageQuestion, PassageResultData, PassageToken,
} from './types'

// 結構性子集，方便測試注入假物件（比照 ContentRepository 的 ContentDb）
interface ReadingDb {
  passage: {
    findMany(args: unknown): Promise<unknown[]>
    findUnique(args: unknown): Promise<unknown | null>
  }
  passageResult: {
    findUnique(args: unknown): Promise<unknown | null>
    findMany(args: unknown): Promise<unknown[]>
    create(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
  }
  userCard: { findMany(args: unknown): Promise<unknown[]> }
}

interface PassageRow {
  id: string; slug: string; kind: string; title: string; titleZh: string | null
  level: string | null; topic: string | null; source: string; wordCount: number
  content: unknown; glossary: unknown; questions: unknown
}

interface ResultRow {
  passageId: string; correctCount: number; totalCount: number
  readSeconds: number | null; completedAt: Date
}

// Json 欄位在 repository 邊界一次轉成宣告型別（建置期已驗證過，讀取端信任落地資料）
function toPassageData(row: PassageRow): PassageData {
  return {
    id: row.id, slug: row.slug, kind: row.kind as PassageData['kind'], title: row.title,
    titleZh: row.titleZh, level: row.level, topic: row.topic, source: row.source,
    wordCount: row.wordCount,
    content: row.content as PassageToken[][],
    glossary: row.glossary as Record<string, GlossEntry>,
    questions: row.questions as PassageQuestion[],
  }
}

function toResultData(row: ResultRow): PassageResultData {
  return {
    passageId: row.passageId, correctCount: row.correctCount, totalCount: row.totalCount,
    readSeconds: row.readSeconds, completedAt: row.completedAt,
  }
}

export class PassageRepository {
  private readonly db: ReadingDb

  constructor(db?: ReadingDb) {
    this.db = db ?? (getPrisma() as unknown as ReadingDb)
  }

  async listPassages(): Promise<PassageListItem[]> {
    const rows = (await this.db.passage.findMany({
      orderBy: [{ order: 'asc' }, { slug: 'asc' }],
      select: { id: true, slug: true, kind: true, title: true, titleZh: true, level: true, topic: true, wordCount: true, questions: true },
    })) as (Omit<PassageRow, 'content' | 'glossary' | 'source'>)[]
    return rows.map((r) => ({
      id: r.id, slug: r.slug, kind: r.kind as PassageListItem['kind'], title: r.title,
      titleZh: r.titleZh, level: r.level, topic: r.topic, wordCount: r.wordCount,
      questionCount: (r.questions as unknown[]).length,
    }))
  }

  async getPassageBySlug(slug: string): Promise<PassageData | null> {
    const row = (await this.db.passage.findUnique({ where: { slug } })) as PassageRow | null
    return row ? toPassageData(row) : null
  }

  async getResult(userId: string, passageId: string): Promise<PassageResultData | null> {
    const row = (await this.db.passageResult.findUnique({
      where: { userId_passageId: { userId, passageId } },
    })) as ResultRow | null
    return row ? toResultData(row) : null
  }

  async listResults(userId: string, passageIds: string[]): Promise<Map<string, PassageResultData>> {
    if (passageIds.length === 0) return new Map()
    const rows = (await this.db.passageResult.findMany({
      where: { userId, passageId: { in: passageIds } },
    })) as ResultRow[]
    return new Map(rows.map((r) => [r.passageId, toResultData(r)]))
  }

  // 顯式 find→create/update：避免內建 upsert 觸發交易（Neon HTTP 無交易；比照 seed 腳本）
  async saveResult(
    userId: string, passageId: string,
    data: { correctCount: number; totalCount: number; readSeconds: number | null },
  ): Promise<{ firstCompletion: boolean }> {
    const existing = await this.db.passageResult.findUnique({
      where: { userId_passageId: { userId, passageId } },
    })
    if (existing === null) {
      await this.db.passageResult.create({ data: { userId, passageId, ...data } })
      return { firstCompletion: true }
    }
    await this.db.passageResult.update({
      where: { userId_passageId: { userId, passageId } },
      data,
    })
    return { firstCompletion: false }
  }

  // 回傳使用者已收藏的 lemma：精修字比 wordId、生字本字比 headword
  async listCollectedLemmas(userId: string, entries: { lemma: string; wordId?: string }[]): Promise<string[]> {
    const withId = entries.filter((e) => e.wordId !== undefined)
    const withoutId = entries.filter((e) => e.wordId === undefined).map((e) => e.lemma)
    const collected = new Set<string>()

    if (withId.length > 0) {
      const rows = (await this.db.userCard.findMany({
        where: { userId, wordId: { in: withId.map((e) => e.wordId) } },
        select: { wordId: true },
      })) as { wordId: string }[]
      const hit = new Set(rows.map((r) => r.wordId))
      for (const e of withId) if (hit.has(e.wordId as string)) collected.add(e.lemma)
    }
    if (withoutId.length > 0) {
      const rows = (await this.db.userCard.findMany({
        where: { userId, word: { headword: { in: withoutId }, wordBook: { sourceType: 'notebook' } } },
        select: { word: { select: { headword: true } } },
      })) as { word: { headword: string } }[]
      for (const r of rows) collected.add(r.word.headword)
    }
    return [...collected]
  }
}

export function toPassagePayload(p: PassageData): PassagePayload {
  const questions: ClientPassageQuestion[] = p.questions.map(({ id, type, stem, options }) => ({ id, type, stem, options }))
  return { ...p, questions }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/reading/__tests__/repository.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add lib/reading; git commit -m @'
feat(reading): PassageRepository with answer-stripping client payload

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: seed 腳本 — 灌 passage 進 Neon 並解析 curated wordId

**Files:**
- Create: `scripts/seed-passages.mjs`
- Modify: `package.json`（scripts 加 `seed:passages`）

**Interfaces:**
- Consumes: `parsePassageFile`（Task 2）；`content/passages/*.json`（Task 4 產物）
- Produces: `npm run seed:passages`（全部）／`npm run seed:passages -- <slug>`（單篇）。seed 時把 glossary 內 `curated: true` 的 entry 換成實際 `wordId`（查 builtin 書的 Word；查無則 console.warn 並保留純 gloss）。

- [ ] **Step 1: 實作腳本**（比照 `scripts/seed-content.mjs`：PrismaNeon WebSocket adapter、顯式 find→update/create）

`scripts/seed-passages.mjs`：

```js
// 灌 content/passages/*.json 進 Neon。用法：
//   npm run seed:passages              （全部）
//   npm run seed:passages -- <slug>    （單篇）
import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { parsePassageFile } from '../lib/reading/passage-schema.ts'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL }, {})
const prisma = new PrismaClient({ adapter })

const only = process.argv[2]
const files = readdirSync('content/passages')
  .filter((f) => f.endsWith('.json'))
  .filter((f) => (only ? f === `${only}.json` : true))
if (files.length === 0) throw new Error('沒有可 seed 的 passage')

for (const [i, file] of files.entries()) {
  const passage = parsePassageFile(JSON.parse(readFileSync(`content/passages/${file}`, 'utf8')))

  // curated 標記換成實際 wordId（headword 在 builtin 書間全域唯一，check-content 保證）
  for (const [lemma, entry] of Object.entries(passage.glossary)) {
    if (!entry.curated) continue
    delete entry.curated
    const word = await prisma.word.findFirst({
      where: { headword: lemma, wordBook: { sourceType: 'builtin' } },
      select: { id: true },
    })
    if (word) entry.wordId = word.id
    else console.warn(`warn: curated lemma "${lemma}" 在 DB 查無 builtin Word，以純 gloss 呈現`)
  }

  const data = {
    kind: passage.kind, title: passage.title, titleZh: passage.titleZh ?? null,
    level: passage.level ?? null, topic: passage.topic ?? null, source: passage.source,
    wordCount: passage.wordCount, content: passage.content, glossary: passage.glossary,
    questions: passage.questions, order: i,
  }
  // 顯式 upsert：避免內建 upsert 觸發交易
  const existing = await prisma.passage.findUnique({ where: { slug: passage.slug }, select: { id: true } })
  if (existing) await prisma.passage.update({ where: { slug: passage.slug }, data })
  else await prisma.passage.create({ data: { slug: passage.slug, ...data } })
  console.log(`seeded: ${passage.slug}`)
}
await prisma.$disconnect()
```

`package.json` scripts 加：

```json
    "seed:passages": "node --experimental-strip-types scripts/seed-passages.mjs",
```

- [ ] **Step 2: 跑通樣本**

Run: `npm run seed:passages`
Expected: `seeded: office-supply-memo`，exit 0。（樣本篇的 curated 字如 `staple`、`folder` 等應被換成 wordId——可由無 warn 輸出間接確認。）

- [ ] **Step 3: Commit**

```powershell
git add scripts/seed-passages.mjs package.json; git commit -m @'
feat(reading): passage seed script resolving curated wordIds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 7: 遊戲化 — applyPassageFinish

**Files:**
- Modify: `lib/gamification/rules.ts`
- Modify: `lib/gamification/types.ts`
- Modify: `lib/gamification/service.ts`
- Test: `lib/gamification/__tests__/service.test.ts`（追加 describe，不動既有測試）

**Interfaces:**
- Consumes: `GamificationRepository`（既有）、`weekStartYmd`／`levelForXp`（既有）
- Produces:
  - `rules.ts`: `XP_PASSAGE_BASE = 15`、`XP_PASSAGE_PER_CORRECT = 5`、`xpForPassage(correctCount: number): number`
  - `types.ts`: `interface PassageReward { xpGained: number; leveledUpTo: number | null }`
  - `service.ts`: `applyPassageFinish(input: { userId: string; correctCount: number; now: Date }): Promise<PassageReward>`——只動 xp／weeklyXp／level；**不發幣、不動 streak／每日複習數／徽章**。呼叫端只在首次完成時呼叫。

- [ ] **Step 1: 寫失敗測試**（沿用該檔既有的 `repoWith()` helper）

在 `lib/gamification/__tests__/service.test.ts` 末尾追加：

```ts
describe('applyPassageFinish', () => {
  it('XP = 15 + 5×答對數，累入 xp 與 weeklyXp，可升級', () => {
    const repo = repoWith({ ...base(), xp: 95, level: 1, weeklyXp: 10, weekStartDate: weekStartYmd(NOW, 'Asia/Taipei') })
    const svc = new GamificationService(repo as any)
    return svc.applyPassageFinish({ userId: 'u1', correctCount: 3, now: NOW }).then((r) => {
      expect(r.xpGained).toBe(30)
      expect(r.leveledUpTo).toBe(2) // 95+30=125 → level 2
      const saved = repo.saveState.mock.calls[0][1]
      expect(saved.xp).toBe(125)
      expect(saved.weeklyXp).toBe(40)
      expect(saved.coinBalance).toBe(base().coinBalance) // 不發幣
      expect(saved.streak).toBe(base().streak)           // 不動 streak
    })
  })

  it('首次（無 state）也可運作', async () => {
    const repo = repoWith(null)
    const svc = new GamificationService(repo as any)
    const r = await svc.applyPassageFinish({ userId: 'u1', correctCount: 0, now: NOW })
    expect(r.xpGained).toBe(15)
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ xp: 15 }), false)
  })
})
```

（`base()`／`NOW` 若該檔尚無同名 helper，比照該檔既有測試的寫法補一個回傳完整 `GamificationStateData` 的 helper 與固定時間常數；`weekStartYmd` 自 `@/lib/gamification/date` import。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/gamification`
Expected: 新 describe FAIL（`applyPassageFinish` 不存在），既有測試 PASS。

- [ ] **Step 3: 實作**

`rules.ts` 加：

```ts
export const XP_PASSAGE_BASE = 15
export const XP_PASSAGE_PER_CORRECT = 5
export function xpForPassage(correctCount: number): number {
  return XP_PASSAGE_BASE + XP_PASSAGE_PER_CORRECT * correctCount
}
```

`types.ts` 加：

```ts
export interface PassageReward { xpGained: number; leveledUpTo: number | null }
```

`service.ts`：import 加 `xpForPassage` 與 `PassageReward`，class 內加（呼叫端保證只在首次完成時呼叫）：

```ts
  // 讀完文章的小額 XP：只動 xp / weeklyXp / level，不發幣、不動 streak 與每日複習數
  async applyPassageFinish(input: { userId: string; correctCount: number; now: Date }): Promise<PassageReward> {
    const { userId, correctCount, now } = input
    const ctx = await this.repo.getContext(userId)
    const exists = ctx.state !== null
    const prev = ctx.state ?? DEFAULT_STATE
    const xpGained = xpForPassage(correctCount)
    const xp = prev.xp + xpGained
    const weekStart = weekStartYmd(now, ctx.timezone)
    const weeklyXp = (prev.weekStartDate === weekStart ? prev.weeklyXp : 0) + xpGained
    const level = levelForXp(xp)
    const leveledUpTo = level > prev.level ? level : null
    await this.repo.saveState(userId, { ...prev, xp, level, weeklyXp, weekStartDate: weekStart }, exists)
    return { xpGained, leveledUpTo }
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/gamification`
Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add lib/gamification; git commit -m @'
feat(gamification): passage-finish XP reward

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 8: PassageFinished 事件 ＋ 作答判分 API

**Files:**
- Modify: `lib/events/bus.ts`（DomainEvent union 加一項）
- Create: `app/api/passage/submit/handler.ts`
- Create: `app/api/passage/submit/route.ts`
- Test: `app/api/passage/submit/__tests__/handler.test.ts`

**Interfaces:**
- Consumes: `PassageData`／`PassageRepository.saveResult`（Task 5）、`applyPassageFinish`＋`PassageReward`（Task 7）、`EventBus`、`SessionUser`、`getCurrentUser`
- Produces:
  - `DomainEvent` 加 `{ type: 'PassageFinished'; userId: string; passageId: string; correctCount: number; totalCount: number; at: Date }`
  - `clampReadSeconds(raw: unknown): number | null`（非有限數字→null；否則取整並 clamp 到 10–3600）
  - `handlePassageSubmit(user: SessionUser | null, body: unknown, deps: PassageSubmitDeps, now: Date): Promise<PassageSubmitResult>`
  - `interface PassageSubmitDeps { getPassageBySlug(slug: string): Promise<PassageData | null>; saveResult(userId, passageId, data): Promise<{ firstCompletion: boolean }>; bus: EventBus; applyPassageFinish(input: { userId: string; correctCount: number; now: Date }): Promise<PassageReward> }`
  - `interface PassageSubmitResult { ok: boolean; results: { correct: boolean; answer: number }[]; correctCount: number; totalCount: number; firstCompletion: boolean; reward: PassageReward | null }`
  - `POST /api/passage/submit`，body `{ slug: string, answers: number[], readSeconds?: number }`，status `res.ok ? 200 : 400`

- [ ] **Step 1: 寫失敗測試**

`app/api/passage/submit/__tests__/handler.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { clampReadSeconds, handlePassageSubmit } from '@/app/api/passage/submit/handler'
import type { PassageData } from '@/lib/reading/types'

const NOW = new Date('2026-08-17T10:00:00Z')
const user = { id: 'u1', email: 'a@b.c', name: null, image: null }

const PASSAGE = {
  id: 'p1', slug: 's1', kind: 'toeic', title: 'T', titleZh: null, level: null, topic: null,
  source: 'self-made', wordCount: 10, content: [], glossary: {},
  questions: [
    { id: 'q1', type: 'main', stem: '?', options: ['A', 'B', 'C', 'D'], answer: 0 },
    { id: 'q2', type: 'detail', stem: '?', options: ['A', 'B', 'C', 'D'], answer: 3 },
    { id: 'q3', type: 'inference', stem: '?', options: ['A', 'B', 'C', 'D'], answer: 1 },
  ],
} as unknown as PassageData

function makeDeps(firstCompletion = true) {
  const published: unknown[] = []
  return {
    published,
    deps: {
      getPassageBySlug: vi.fn(async (slug: string) => (slug === 's1' ? PASSAGE : null)),
      saveResult: vi.fn(async () => ({ firstCompletion })),
      bus: { publish: async (e: unknown) => { published.push(e) } },
      applyPassageFinish: vi.fn(async () => ({ xpGained: 25, leveledUpTo: null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }
}

describe('clampReadSeconds', () => {
  it('非數字回 null；取整並 clamp 10–3600', () => {
    expect(clampReadSeconds(undefined)).toBeNull()
    expect(clampReadSeconds('60')).toBeNull()
    expect(clampReadSeconds(NaN)).toBeNull()
    expect(clampReadSeconds(3)).toBe(10)
    expect(clampReadSeconds(99999)).toBe(3600)
    expect(clampReadSeconds(61.7)).toBe(61)
  })
})

describe('handlePassageSubmit', () => {
  it('server 逐題判分，作答後才揭露正解', async () => {
    const { deps } = makeDeps()
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 1, 1], readSeconds: 60 }, deps, NOW)
    expect(res.ok).toBe(true)
    expect(res.results).toEqual([
      { correct: true, answer: 0 }, { correct: false, answer: 3 }, { correct: true, answer: 1 },
    ])
    expect(res.correctCount).toBe(2)
    expect(deps.saveResult).toHaveBeenCalledWith('u1', 'p1', { correctCount: 2, totalCount: 3, readSeconds: 60 })
  })

  it('首次完成：發 PassageFinished 並給 reward', async () => {
    const { deps, published } = makeDeps(true)
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 3, 1] }, deps, NOW)
    expect(res.firstCompletion).toBe(true)
    expect(res.reward).toEqual({ xpGained: 25, leveledUpTo: null })
    expect(published).toEqual([{ type: 'PassageFinished', userId: 'u1', passageId: 'p1', correctCount: 3, totalCount: 3, at: NOW }])
  })

  it('重做：不發事件、不給 reward', async () => {
    const { deps, published } = makeDeps(false)
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 3, 1] }, deps, NOW)
    expect(res.firstCompletion).toBe(false)
    expect(res.reward).toBeNull()
    expect(published).toHaveLength(0)
    expect(deps.applyPassageFinish).not.toHaveBeenCalled()
  })

  it('gamification 失敗不阻斷：reward 為 null、其餘照常', async () => {
    const { deps } = makeDeps(true)
    deps.applyPassageFinish.mockRejectedValue(new Error('boom'))
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 3, 1] }, deps, NOW)
    expect(res.ok).toBe(true)
    expect(res.reward).toBeNull()
  })

  it('拒絕：未登入、查無 slug、answers 長度不符或值域外', async () => {
    const { deps } = makeDeps()
    expect((await handlePassageSubmit(null, { slug: 's1', answers: [0, 0, 0] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 'nope', answers: [0, 0, 0] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 's1', answers: [0, 0] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 's1', answers: [0, 0, 9] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 's1', answers: 'x' }, deps, NOW)).ok).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run app/api/passage`
Expected: FAIL。

- [ ] **Step 3: 實作**

`lib/events/bus.ts` 的 `DomainEvent` union 加：

```ts
  | { type: 'PassageFinished'; userId: string; passageId: string; correctCount: number; totalCount: number; at: Date }
```

`app/api/passage/submit/handler.ts`：

```ts
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
```

`app/api/passage/submit/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { eventBus } from '@/lib/events/bus'
import { gamificationService } from '@/lib/gamification/service'
import { PassageRepository } from '@/lib/reading/repository'
import { handlePassageSubmit } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const repo = new PassageRepository()
  const res = await handlePassageSubmit(user, body, {
    getPassageBySlug: (slug) => repo.getPassageBySlug(slug),
    saveResult: (userId, passageId, data) => repo.saveResult(userId, passageId, data),
    bus: eventBus,
    applyPassageFinish: (i) => gamificationService.applyPassageFinish(i),
  }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run app/api/passage lib/events`
Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add lib/events/bus.ts app/api/passage; git commit -m @'
feat(reading): server-judged passage submit with first-completion XP

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 9: 收藏 API — /api/vocab/collect

**Files:**
- Modify: `lib/content/repository.ts`（加 `NOTEBOOK_SLUG`、`ensureNotebookBook`、`upsertNotebookWord`；`ContentDb` 結構介面補 `wordBook.create`、`word.findUnique`、`word.create`）
- Test: `lib/content/__tests__/repository.test.ts`（追加 describe）
- Create: `app/api/vocab/collect/handler.ts`
- Create: `app/api/vocab/collect/route.ts`
- Test: `app/api/vocab/collect/__tests__/handler.test.ts`

**Interfaces:**
- Consumes: `PassageData`（Task 5 的 `getPassageBySlug`）、`LearningRepository.getCard`／`saveCard`、`scheduler`（`SchedulerService`）
- Produces:
  - `export const NOTEBOOK_SLUG = 'my-notebook'`（`@/lib/content/repository`）
  - `ContentRepository.ensureNotebookBook(): Promise<{ id: string }>`（find→create，name「我的生字本」、sourceType `'notebook'`、order 99）
  - `ContentRepository.upsertNotebookWord(bookId: string, data: { headword: string; definitionZh: string; partOfSpeech: string | null }): Promise<{ id: string }>`（以 `wordBookId_headword` find→create；已存在直接回 id，不覆寫）
  - `handleCollect(user, body, deps, now): Promise<CollectResult>`；`interface CollectResult { ok: boolean; wordId: string | null; alreadyCollected: boolean }`
  - `POST /api/vocab/collect`，body `{ passageSlug: string, lemma: string }`，status `res.ok ? 200 : 400`

- [ ] **Step 1: 寫失敗測試（repository 部分）**

在 `lib/content/__tests__/repository.test.ts` 追加（mock db 物件形狀比照該檔既有 helper，補上新 delegate 方法）：

```ts
describe('notebook', () => {
  it('ensureNotebookBook：已存在回 id，不存在建立', async () => {
    const db = makeDb()
    db.wordBook.findUnique.mockResolvedValueOnce({ id: 'b1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new ContentRepository(db as any)
    expect(await repo.ensureNotebookBook()).toEqual({ id: 'b1' })

    db.wordBook.findUnique.mockResolvedValueOnce(null)
    db.wordBook.create.mockResolvedValueOnce({ id: 'b2' })
    expect(await repo.ensureNotebookBook()).toEqual({ id: 'b2' })
    expect(db.wordBook.create).toHaveBeenCalledWith({
      data: { slug: 'my-notebook', name: '我的生字本', sourceType: 'notebook', order: 99 },
      select: { id: true },
    })
  })

  it('upsertNotebookWord：同字冪等，不覆寫既有釋義', async () => {
    const db = makeDb()
    db.word.findUnique.mockResolvedValueOnce({ id: 'w1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new ContentRepository(db as any)
    expect(await repo.upsertNotebookWord('b1', { headword: 'zeal', definitionZh: '熱忱', partOfSpeech: 'n.' })).toEqual({ id: 'w1' })
    expect(db.word.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 寫失敗測試（handler 部分）**

`app/api/vocab/collect/__tests__/handler.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleCollect } from '@/app/api/vocab/collect/handler'
import type { PassageData } from '@/lib/reading/types'
import type { CardState } from '@/lib/learning/types'

const NOW = new Date('2026-08-17T10:00:00Z')
const user = { id: 'u1', email: 'a@b.c', name: null, image: null }

const CARD: CardState = { due: NOW, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, learningSteps: 0, lastReview: null }

const PASSAGE = {
  id: 'p1', slug: 's1', kind: 'toeic', title: 'T', titleZh: null, level: null, topic: null,
  source: 'self-made', wordCount: 2, content: [], questions: [],
  glossary: {
    staple: { zh: '裝訂', wordId: 'w-staple' },   // 精修字
    zeal: { zh: '熱忱', pos: 'n.' },              // 生字本字
  },
} as unknown as PassageData

function makeDeps() {
  return {
    getPassageBySlug: vi.fn(async (slug: string) => (slug === 's1' ? PASSAGE : null)),
    ensureNotebookBook: vi.fn(async () => ({ id: 'nb1' })),
    upsertNotebookWord: vi.fn(async () => ({ id: 'w-zeal' })),
    getCard: vi.fn(async () => null),
    saveCard: vi.fn(async () => 'c1'),
    scheduler: { newCard: () => CARD, review: (s: CardState) => s },
  }
}

describe('handleCollect', () => {
  it('精修字：直接對既有 wordId 建卡，不動生字本', async () => {
    const deps = makeDeps()
    const res = await handleCollect(user, { passageSlug: 's1', lemma: 'staple' }, deps, NOW)
    expect(res).toEqual({ ok: true, wordId: 'w-staple', alreadyCollected: false })
    expect(deps.ensureNotebookBook).not.toHaveBeenCalled()
    expect(deps.saveCard).toHaveBeenCalledWith('u1', 'w-staple', CARD, { consecutiveCorrect: 0, mastered: false, exists: false })
  })

  it('生字本字：upsert Word（gloss 當釋義）再建卡', async () => {
    const deps = makeDeps()
    const res = await handleCollect(user, { passageSlug: 's1', lemma: 'zeal' }, deps, NOW)
    expect(res).toEqual({ ok: true, wordId: 'w-zeal', alreadyCollected: false })
    expect(deps.upsertNotebookWord).toHaveBeenCalledWith('nb1', { headword: 'zeal', definitionZh: '熱忱', partOfSpeech: 'n.' })
  })

  it('冪等：已有卡回 alreadyCollected，不再建卡', async () => {
    const deps = makeDeps()
    deps.getCard.mockResolvedValue({ state: CARD, consecutiveCorrect: 0, mastered: false })
    const res = await handleCollect(user, { passageSlug: 's1', lemma: 'staple' }, deps, NOW)
    expect(res).toEqual({ ok: true, wordId: 'w-staple', alreadyCollected: true })
    expect(deps.saveCard).not.toHaveBeenCalled()
  })

  it('拒絕：未登入／查無 passage／lemma 不在 glossary（防偽造）', async () => {
    const deps = makeDeps()
    expect((await handleCollect(null, { passageSlug: 's1', lemma: 'staple' }, deps, NOW)).ok).toBe(false)
    expect((await handleCollect(user, { passageSlug: 'nope', lemma: 'staple' }, deps, NOW)).ok).toBe(false)
    expect((await handleCollect(user, { passageSlug: 's1', lemma: 'hacked' }, deps, NOW)).ok).toBe(false)
    expect(deps.saveCard).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run lib/content app/api/vocab`
Expected: 新測試 FAIL、既有 PASS。

- [ ] **Step 4: 實作**

`lib/content/repository.ts`：`ContentDb` 介面的 `wordBook` 補 `create(args: unknown): Promise<unknown>`、`word` 補 `findUnique(args: unknown): Promise<unknown | null>` 與 `create(args: unknown): Promise<unknown>`；檔案頂層加 `export const NOTEBOOK_SLUG = 'my-notebook'`；class 內加：

```ts
  // 「我的生字本」系統書：全域一本，個人視角由 UserCard 決定
  async ensureNotebookBook(): Promise<{ id: string }> {
    const existing = (await this.db.wordBook.findUnique({ where: { slug: NOTEBOOK_SLUG }, select: { id: true } })) as { id: string } | null
    if (existing) return existing
    return (await this.db.wordBook.create({
      data: { slug: NOTEBOOK_SLUG, name: '我的生字本', sourceType: 'notebook', order: 99 },
      select: { id: true },
    })) as { id: string }
  }

  // 收藏字 upsert：已存在直接回 id（不覆寫先收藏者建立的釋義）
  async upsertNotebookWord(
    bookId: string,
    data: { headword: string; definitionZh: string; partOfSpeech: string | null },
  ): Promise<{ id: string }> {
    const existing = (await this.db.word.findUnique({
      where: { wordBookId_headword: { wordBookId: bookId, headword: data.headword } },
      select: { id: true },
    })) as { id: string } | null
    if (existing) return existing
    return (await this.db.word.create({
      data: { wordBookId: bookId, headword: data.headword, definitionZh: data.definitionZh, partOfSpeech: data.partOfSpeech, examTags: ['reader'] },
      select: { id: true },
    })) as { id: string }
  }
```

`app/api/vocab/collect/handler.ts`：

```ts
import type { SessionUser } from '@/lib/auth/session'
import type { LearningRepository } from '@/lib/learning/repository'
import type { SchedulerService } from '@/lib/learning/scheduler'
import type { PassageData } from '@/lib/reading/types'

export interface CollectDeps {
  getPassageBySlug(slug: string): Promise<PassageData | null>
  ensureNotebookBook(): Promise<{ id: string }>
  upsertNotebookWord(bookId: string, data: { headword: string; definitionZh: string; partOfSpeech: string | null }): Promise<{ id: string }>
  getCard: LearningRepository['getCard']
  saveCard: LearningRepository['saveCard']
  scheduler: SchedulerService
}

export interface CollectResult { ok: boolean; wordId: string | null; alreadyCollected: boolean }

const EMPTY: CollectResult = { ok: false, wordId: null, alreadyCollected: false }

export async function handleCollect(
  user: SessionUser | null,
  body: unknown,
  deps: CollectDeps,
  now: Date,
): Promise<CollectResult> {
  if (!user) return EMPTY
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.passageSlug !== 'string' || typeof b.lemma !== 'string') return EMPTY

  const passage = await deps.getPassageBySlug(b.passageSlug)
  if (!passage) return EMPTY
  // 防偽造：只能收該篇 glossary 裡的字
  const entry = passage.glossary[b.lemma]
  if (!entry) return EMPTY

  let wordId = entry.wordId ?? null
  if (wordId === null) {
    const book = await deps.ensureNotebookBook()
    const word = await deps.upsertNotebookWord(book.id, {
      headword: b.lemma, definitionZh: entry.zh, partOfSpeech: entry.pos ?? null,
    })
    wordId = word.id
  }

  // 冪等：已有卡不重建（CardSource='reader' 的第一個實作——卡建立後與 TOEIC 卡完全同軌）
  const existing = await deps.getCard(user.id, wordId)
  if (existing) return { ok: true, wordId, alreadyCollected: true }
  await deps.saveCard(user.id, wordId, deps.scheduler.newCard(now), { consecutiveCorrect: 0, mastered: false, exists: false })
  return { ok: true, wordId, alreadyCollected: false }
}
```

`app/api/vocab/collect/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { PassageRepository } from '@/lib/reading/repository'
import { handleCollect } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const passages = new PassageRepository()
  const content = new ContentRepository()
  const learning = new LearningRepository()
  const res = await handleCollect(user, body, {
    getPassageBySlug: (slug) => passages.getPassageBySlug(slug),
    ensureNotebookBook: () => content.ensureNotebookBook(),
    upsertNotebookWord: (bookId, data) => content.upsertNotebookWord(bookId, data),
    getCard: (userId, wordId) => learning.getCard(userId, wordId),
    saveCard: (userId, wordId, state, progress) => learning.saveCard(userId, wordId, state, progress),
    scheduler,
  }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run lib/content app/api/vocab`
Expected: PASS。

- [ ] **Step 6: Commit**

```powershell
git add lib/content app/api/vocab; git commit -m @'
feat(reading): collect-to-notebook API with glossary anti-forgery check

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 10: 生字本與既有書系整合（防跨使用者洩漏）

**Files:**
- Modify: `lib/content/repository.ts`（`listWordBooks` 排除 notebook；加 `listCollectedWordsByBook`）
- Modify: `lib/learning/repository.ts`（`listNewWordIds` 排除 notebook 書的字）
- Modify: `app/books/page.tsx`（加「我的生字本」卡）
- Modify: `app/books/[slug]/page.tsx`（notebook 只列自己收藏的字）
- Modify: `app/learn/[slug]/page.tsx`（notebook 的 `newLimit` 設 0）
- Test: `lib/content/__tests__/repository.test.ts`、`lib/learning/__tests__/repository.test.ts`（追加）

**Interfaces:**
- Consumes: `NOTEBOOK_SLUG`（Task 9）
- Produces:
  - `ContentRepository.listWordBooks()`：where 加 `sourceType: { not: 'notebook' }`（生字本不出現在公用書單）
  - `ContentRepository.listCollectedWordsByBook(bookId: string, userId: string): Promise<WordData[]>`（`word.findMany` where `{ wordBookId, userCards: { some: { userId } } }`）
  - `LearningRepository.listNewWordIds`：where 的 `word` 條件加 `wordBook: { sourceType: { not: 'notebook' } }`——**關鍵防護**：生字本的 Word 全域共用，若進「新字」佇列會把別人收藏的字漏給每個使用者（含離線 pack 的 `listStartedBooks` 迭代路徑）。收藏的字只經「收藏當下建卡」進入到期佇列。

- [ ] **Step 1: 追加失敗測試**

`lib/learning/__tests__/repository.test.ts` 追加：

```ts
it('listNewWordIds 排除生字本書的字（他人收藏不得漏入新字佇列）', async () => {
  const db = makeDb()
  db.word.findMany.mockResolvedValue([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = new LearningRepository(db as any)
  await repo.listNewWordIds('u1', undefined, 5)
  const where = db.word.findMany.mock.calls[0][0].where
  expect(where.wordBook).toEqual({ sourceType: { not: 'notebook' } })
})
```

`lib/content/__tests__/repository.test.ts` 追加：

```ts
it('listWordBooks 排除 notebook 書', async () => {
  const db = makeDb()
  db.wordBook.findMany.mockResolvedValue([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await new ContentRepository(db as any).listWordBooks()
  expect(db.wordBook.findMany.mock.calls[0][0].where).toEqual({ sourceType: { not: 'notebook' } })
})

it('listCollectedWordsByBook 只取該使用者有卡的字', async () => {
  const db = makeDb()
  db.word.findMany.mockResolvedValue([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await new ContentRepository(db as any).listCollectedWordsByBook('b1', 'u1')
  expect(db.word.findMany.mock.calls[0][0].where).toEqual({ wordBookId: 'b1', userCards: { some: { userId: 'u1' } } })
})
```

（若既有測試斷言了 `listWordBooks`／`listNewWordIds` 的舊 where 形狀，一併更新斷言。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/content lib/learning`
Expected: 新測試 FAIL。

- [ ] **Step 3: 實作 repository 改動**

`ContentRepository.listWordBooks` 的 `findMany` args 加 `where: { sourceType: { not: 'notebook' } }`（保留既有 orderBy／select）。class 加：

```ts
  // 生字本個人視角：只列使用者有 UserCard 的字
  async listCollectedWordsByBook(bookId: string, userId: string): Promise<WordData[]> {
    const rows = (await this.db.word.findMany({
      where: { wordBookId: bookId, userCards: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    })) as WordRow[]
    return rows.map(toWordData)
  }
```

`LearningRepository.listNewWordIds` 的 `word.findMany` where 加 `wordBook: { sourceType: { not: 'notebook' } }`（與既有 `wordBookId`／`userCards: { none: ... }` 條件並存；若既有程式在有 `wordBookId` 時另組 where，兩個分支都要加）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/content lib/learning`
Expected: PASS。

- [ ] **Step 5: 頁面整合**

`app/books/page.tsx`：在既有書卡清單後加「我的生字本」卡（沿用該頁既有 `CardLink` 樣式；先 `ensureNotebookBook()` 再 `listCollectedWordsByBook(bookId, user.id)` 取 `length` 當字數，與其他資料 `Promise.all` 並行）：

```tsx
<CardLink href={`/books/${NOTEBOOK_SLUG}`} className="p-5">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-lg font-extrabold text-neutral-900">我的生字本 📓</h2>
      <p className="mt-1 text-sm text-neutral-600">閱讀時收藏的單字（{notebookCount} 字）</p>
    </div>
  </div>
</CardLink>
```

`app/books/[slug]/page.tsx`：取書後判斷（`getWordBookBySlug` 查不到 notebook 時——因 `listWordBooks` 已排除但 `getWordBookBySlug` 不受影響，仍查得到；若該頁另有依賴 `listWordBooks` 的地方不動）：

```tsx
const words = book.slug === NOTEBOOK_SLUG
  ? await repo.listCollectedWordsByBook(book.id, user.id)
  : await repo.listWordsByBook(book.id)
```

notebook 且 `words.length === 0` 時顯示空狀態文案：「閱讀文章時點字加入生字本，收藏的字會出現在這裡 →」附 `/read` 連結。

`app/learn/[slug]/page.tsx`：組 `buildReviewItems` args 時：

```tsx
const limits = slug === NOTEBOOK_SLUG ? { ...SESSION_LIMITS, newLimit: 0 } : SESSION_LIMITS
```

（用 `limits` 取代原本展開的 `SESSION_LIMITS`。）

- [ ] **Step 6: 型別與建置檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤。
Run: `npm test`
Expected: 全數 PASS。

- [ ] **Step 7: Commit**

```powershell
git add lib/content lib/learning app/books app/learn; git commit -m @'
feat(reading): my-notebook book integration without cross-user leakage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 11: 閱讀器 UI — /read 列表、閱讀頁、點字卡片、作答流程

**Files:**
- Create: `lib/reading/reader-logic.ts`
- Test: `lib/reading/__tests__/reader-logic.test.ts`
- Create: `components/passage-reader.tsx`（client）
- Create: `app/read/page.tsx`（server）
- Create: `app/read/[slug]/page.tsx`（server）
- Modify: `app/page.tsx`（加 `/read` 連結）

**Interfaces:**
- Consumes: `PassagePayload`／`PassageListItem`／`PassageResultData`（Task 2/5）、`toPassagePayload`、`PassageRepository`、`ContentRepository.listWordsWithExamplesByIds`（既有）、`TtsButton`（`@/components/tts-button`）、`Card`／`CardLink`（`@/components/ui/card`）、`GamificationBar`（`@/components/gamification-bar`）
- Produces:
  - `wpm(wordCount: number, readSeconds: number | null): number | null`（null 或 <10 秒回 null；否則 `Math.round(wordCount / (readSeconds / 60))`）
  - `readSecondsBetween(startMs: number, endMs: number): number`（`Math.max(0, Math.floor((endMs - startMs) / 1000))`）
  - `<PassageReader passage={PassagePayload} curatedWords={WordWithExamples[]} collectedLemmas={string[]} priorResult={...| null} />`

- [ ] **Step 1: 寫失敗測試**

`lib/reading/__tests__/reader-logic.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { wpm, readSecondsBetween } from '@/lib/reading/reader-logic'

describe('reader-logic', () => {
  it('wpm：wordCount / 分鐘，四捨五入', () => {
    expect(wpm(150, 60)).toBe(150)
    expect(wpm(100, 90)).toBe(67)
  })
  it('wpm：無計時或 <10 秒回 null（避免灌水數字）', () => {
    expect(wpm(150, null)).toBeNull()
    expect(wpm(150, 5)).toBeNull()
  })
  it('readSecondsBetween：向下取整秒、負值歸零', () => {
    expect(readSecondsBetween(1000, 62500)).toBe(61)
    expect(readSecondsBetween(5000, 1000)).toBe(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗 → 實作 → 通過**

Run: `npx vitest run lib/reading/__tests__/reader-logic.test.ts`（先 FAIL）

`lib/reading/reader-logic.ts`：

```ts
// 閱讀速度純前端統計顯示，不進排名
export function wpm(wordCount: number, readSeconds: number | null): number | null {
  if (readSeconds === null || readSeconds < 10) return null
  return Math.round(wordCount / (readSeconds / 60))
}

export function readSecondsBetween(startMs: number, endMs: number): number {
  return Math.max(0, Math.floor((endMs - startMs) / 1000))
}
```

Run: `npx vitest run lib/reading/__tests__/reader-logic.test.ts`
Expected: PASS。

- [ ] **Step 3: PassageReader client 元件**

`components/passage-reader.tsx`（完整檔案；狀態機 `reading → quiz → result`）：

```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { TtsButton } from '@/components/tts-button'
import type { WordWithExamples } from '@/lib/content/types'
import type { PassagePayload } from '@/lib/reading/types'
import { GlossaryDictionary } from '@/lib/reading/dictionary'
import { readSecondsBetween, wpm } from '@/lib/reading/reader-logic'

const dictionary = new GlossaryDictionary()

interface SubmitResponse {
  ok: boolean
  results: { correct: boolean; answer: number }[]
  correctCount: number
  totalCount: number
  firstCompletion: boolean
  reward: { xpGained: number; leveledUpTo: number | null } | null
}

export function PassageReader({ passage, curatedWords, collectedLemmas, priorResult }: {
  passage: PassagePayload
  curatedWords: WordWithExamples[]
  collectedLemmas: string[]
  priorResult: { correctCount: number; totalCount: number } | null
}) {
  const curatedById = useMemo(() => new Map(curatedWords.map((w) => [w.id, w])), [curatedWords])
  const [collected, setCollected] = useState(() => new Set(collectedLemmas))
  const [selected, setSelected] = useState<string | null>(null) // lemma
  const [phase, setPhase] = useState<'reading' | 'quiz' | 'result'>('reading')
  const [answers, setAnswers] = useState<(number | null)[]>(() => passage.questions.map(() => null))
  const [outcome, setOutcome] = useState<SubmitResponse | null>(null)
  const [readSeconds, setReadSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const startMs = useRef(Date.now())

  const entry = selected ? dictionary.lookup(selected, passage) : null // 查詞一律走 DictionaryService 隔離點
  const curated = entry?.wordId ? curatedById.get(entry.wordId) ?? null : null

  async function collect(lemma: string) {
    if (busy || collected.has(lemma)) return
    setBusy(true)
    try {
      const res = await fetch('/api/vocab/collect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passageSlug: passage.slug, lemma }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (data.ok) setCollected((prev) => new Set(prev).add(lemma))
    } finally { setBusy(false) }
  }

  function startQuiz() {
    setReadSeconds(readSecondsBetween(startMs.current, Date.now()))
    setPhase('quiz')
  }

  async function submit() {
    if (busy || answers.some((a) => a === null)) return
    setBusy(true)
    try {
      const res = await fetch('/api/passage/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: passage.slug, answers, readSeconds: readSeconds ?? undefined }),
      })
      const data: SubmitResponse = await res.json().catch(() => ({ ok: false, results: [], correctCount: 0, totalCount: 0, firstCompletion: false, reward: null }))
      if (data.ok) { setOutcome(data); setPhase('result') }
    } finally { setBusy(false) }
  }

  const speed = wpm(passage.wordCount, readSeconds)

  return (
    <div className="pb-28">
      {phase === 'reading' && (
        <article className="rounded-card bg-surface p-5 shadow-[0_12px_30px_rgba(255,106,61,.10)]">
          {passage.content.map((para, pi) => (
            <p key={pi} className="mb-4 leading-8 text-neutral-900">
              {para.map((t, ti) =>
                t.l ? (
                  <button
                    key={ti}
                    type="button"
                    onClick={() => setSelected(t.l ?? null)}
                    className={`rounded px-0.5 transition hover:bg-primary-100 ${
                      collected.has(t.l) ? 'bg-primary-100 text-primary-700'
                      : passage.glossary[t.l]?.wordId ? 'underline decoration-primary-300 decoration-dotted underline-offset-4' : ''
                    }`}
                  >{t.w}</button>
                ) : (
                  <span key={ti}>{t.w}</span>
                ),
              )}
            </p>
          ))}
          <button
            type="button"
            onClick={startQuiz}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
          >{passage.questions.length > 0 ? '開始作答 ✍️' : '標記完成 ✅'}</button>
          {priorResult && (
            <p className="mt-3 text-center text-sm text-neutral-600">
              上次成績：{priorResult.correctCount}/{priorResult.totalCount}
            </p>
          )}
        </article>
      )}

      {phase === 'quiz' && (
        <div className="space-y-4">
          {passage.questions.map((q, qi) => (
            <div key={q.id} className="rounded-card bg-surface p-5 shadow-[0_12px_30px_rgba(255,106,61,.10)]">
              <p className="font-extrabold text-neutral-900">{qi + 1}. {q.stem}</p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                    className={`block min-h-11 w-full rounded-control border px-4 py-2 text-left transition ${
                      answers[qi] === oi ? 'border-primary-500 bg-primary-50 font-bold text-primary-700' : 'border-neutral-200 hover:border-primary-300'
                    }`}
                  >{String.fromCharCode(65 + oi)}. {opt}</button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={busy || answers.some((a) => a === null)}
            onClick={submit}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600 disabled:opacity-40"
          >送出答案</button>
        </div>
      )}

      {phase === 'result' && outcome && (
        <div className="space-y-4">
          <div className="rounded-card bg-surface p-5 text-center shadow-[0_12px_30px_rgba(255,106,61,.10)]">
            <p className="text-2xl font-extrabold text-neutral-900">
              {outcome.totalCount > 0 ? `答對 ${outcome.correctCount}/${outcome.totalCount}` : '閱讀完成！'}
            </p>
            {speed !== null && <p className="mt-1 text-sm text-neutral-600">閱讀速度 {speed} WPM（{readSeconds} 秒）</p>}
            {outcome.reward && (
              <p className="mt-2 font-bold text-primary-600">
                +{outcome.reward.xpGained} XP{outcome.reward.leveledUpTo ? `，升到 Lv.${outcome.reward.leveledUpTo}！` : ''}
              </p>
            )}
            {!outcome.firstCompletion && outcome.totalCount > 0 && (
              <p className="mt-2 text-sm text-neutral-600">重讀不重複給獎，成績已更新</p>
            )}
          </div>
          {passage.questions.map((q, qi) => (
            <div key={q.id} className="rounded-card bg-surface p-5 shadow-[0_12px_30px_rgba(255,106,61,.10)]">
              <p className="font-extrabold text-neutral-900">
                {outcome.results[qi]?.correct ? '✅' : '❌'} {qi + 1}. {q.stem}
              </p>
              <p className="mt-2 text-sm text-neutral-600">
                正解：{String.fromCharCode(65 + (outcome.results[qi]?.answer ?? 0))}. {q.options[outcome.results[qi]?.answer ?? 0]}
              </p>
            </div>
          ))}
          <Link href="/read" className="block text-center text-sm font-bold text-primary-600 hover:underline">← 回文章列表</Link>
        </div>
      )}

      {/* 點字底部卡片 */}
      {selected && entry && (
        <div className="fixed inset-x-0 bottom-0 z-50">
          <button type="button" aria-label="關閉" onClick={() => setSelected(null)} className="fixed inset-0 cursor-default bg-black/20" />
          <div className="relative mx-auto max-w-2xl rounded-t-card bg-surface p-5 shadow-[0_-8px_30px_rgba(0,0,0,.15)]">
            <div className="flex items-center gap-3">
              <span className="text-xl font-extrabold text-neutral-900">{selected}</span>
              {(curated?.partOfSpeech ?? entry.pos) && (
                <span className="rounded-pill bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-600">{curated?.partOfSpeech ?? entry.pos}</span>
              )}
              <TtsButton text={selected} />
            </div>
            <p className="mt-2 text-neutral-900">{curated?.definitionZh ?? entry.zh}</p>
            {curated?.examples[0] && (
              <p className="mt-2 text-sm text-neutral-600">{curated.examples[0].sentence}<br />{curated.examples[0].translationZh}</p>
            )}
            <button
              type="button"
              disabled={busy || collected.has(selected)}
              onClick={() => collect(selected)}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600 disabled:opacity-60"
            >{collected.has(selected) ? '已在生字本 ✓' : '加入生字本 ➕'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: /read 列表頁與閱讀頁**

`app/read/page.tsx`：

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { PassageRepository } from '@/lib/reading/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { CardLink } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = { toeic: '多益情境短文', story: '故事閱讀' }

export default async function ReadListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const repo = new PassageRepository()
  const passages = await repo.listPassages()
  const results = await repo.listResults(user.id, passages.map((p) => p.id))

  return (
    <div className="min-h-screen bg-bg-warm">
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-extrabold text-neutral-900">沉浸閱讀 📖</h1>
        <p className="mt-1 text-neutral-600">讀文章、點生字、練 Part 7 — 收藏的字會進入你的複習排程</p>
        {(['toeic', 'story'] as const).map((kind) => {
          const group = passages.filter((p) => p.kind === kind)
          if (group.length === 0) return null
          return (
            <section key={kind} className="mt-6">
              <h2 className="text-lg font-extrabold text-neutral-900">{KIND_LABEL[kind]}</h2>
              <div className="mt-3 space-y-3">
                {group.map((p) => {
                  const r = results.get(p.id)
                  return (
                    <CardLink key={p.slug} href={`/read/${p.slug}`} className="block p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-extrabold text-neutral-900">{p.title}</h3>
                          <p className="mt-1 text-sm text-neutral-600">
                            {p.titleZh ? `${p.titleZh} · ` : ''}{p.wordCount} 字
                            {p.questionCount > 0 ? ` · ${p.questionCount} 題` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-sm font-bold">
                          {r ? <span className="text-success">✓ {p.questionCount > 0 ? `${r.correctCount}/${r.totalCount}` : '已讀'}</span>
                             : p.level ? <span className="rounded-pill bg-primary-100 px-3 py-1 text-primary-600">{p.level}</span> : null}
                        </div>
                      </div>
                    </CardLink>
                  )
                })}
              </div>
            </section>
          )
        })}
        <p className="mt-8 text-center"><Link href="/" className="text-sm font-bold text-primary-600 hover:underline">← 回首頁</Link></p>
      </main>
    </div>
  )
}
```

`app/read/[slug]/page.tsx`：

```tsx
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { PassageRepository, toPassagePayload } from '@/lib/reading/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { PassageReader } from '@/components/passage-reader'

export const dynamic = 'force-dynamic'

export default async function ReadPassagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const repo = new PassageRepository()
  const passage = await repo.getPassageBySlug(slug)
  if (!passage) notFound()

  const entries = Object.entries(passage.glossary).map(([lemma, e]) => ({ lemma, wordId: e.wordId }))
  const curatedIds = entries.filter((e) => e.wordId).map((e) => e.wordId as string)
  // 三筆互不相依 → 並行
  const [curatedWords, collectedLemmas, priorResult] = await Promise.all([
    curatedIds.length ? new ContentRepository().listWordsWithExamplesByIds(curatedIds) : Promise.resolve([]),
    repo.listCollectedLemmas(user.id, entries),
    repo.getResult(user.id, passage.id),
  ])

  return (
    <div className="min-h-screen bg-bg-warm">
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-extrabold text-neutral-900">{passage.title}</h1>
        <p className="mt-1 mb-4 text-sm text-neutral-600">
          {passage.titleZh ? `${passage.titleZh} · ` : ''}{passage.wordCount} 字 · 點單字看釋義
        </p>
        <PassageReader
          passage={toPassagePayload(passage)}
          curatedWords={curatedWords}
          collectedLemmas={collectedLemmas}
          priorResult={priorResult ? { correctCount: priorResult.correctCount, totalCount: priorResult.totalCount } : null}
        />
        <p className="mt-6 text-xs text-neutral-600">出處：{passage.source}</p>
      </main>
    </div>
  )
}
```

`app/page.tsx`：在既有 `/leaderboard` 連結那排加入（沿用同樣 className）：

```tsx
<Link href="/read" className="text-sm font-bold text-primary-600 hover:underline">沉浸閱讀 📖</Link>
```

- [ ] **Step 5: 型別、建置與全測試**

Run: `npx tsc --noEmit`
Expected: 無錯誤。
Run: `npm test`
Expected: 全數 PASS。
Run: `npm run build`
Expected: build 成功（`/read`、`/read/[slug]` 出現在輸出）。

- [ ] **Step 6: 本機手動煙霧測試**

Run: `npm run dev`，登入後開 `http://localhost:3000/read`：樣本短文可見 → 點字出卡片、TTS 可播、加入生字本後變 ✓ → 開始作答 → 送出 → 顯示對錯／正解／WPM／+XP → `/books/my-notebook` 看得到收藏的字 → `/learn/my-notebook` 可複習。DevTools Network 確認 `GET /read/office-supply-memo` 的 RSC payload 不含 `"answer"`。

- [ ] **Step 7: Commit**

```powershell
git add lib/reading components/passage-reader.tsx app/read app/page.tsx; git commit -m @'
feat(reading): /read list and tap-to-lookup reader with quiz flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 12: 內容量產 — 30 篇 TOEIC 短文＋6 篇公有領域童話

**Files:**
- Create: `content/passages-src/toeic-*.json` × 30（12 主題各 2–3 篇；檔名如 `toeic-office-supply-request.json`）
- Create: `content/passages-src/story-*.json` × 6（伊索寓言自家簡化改寫；如 `story-tortoise-and-hare.json`）
- Modify: `content/passages-src/_gloss-overrides.json`（建置報錯時補）
- Create: `content/passages/*.json`（建置產物，全部 commit）

**Interfaces:**
- Consumes: Task 4 的 `PassageSrc` 形狀與 `npm run build:passages`；`content/_headwords.json` 各主題字表
- Produces: 36 篇通過建置驗證的 passage JSON，seed 完成

流程（比照單字書量產：背景 agent 產出、controller 驗證，內容不經對話回顯）：

- [ ] **Step 1: 產生任務清單** — 12 個 TOEIC 主題（office/travel/finance/banking/contracts/hr/logistics/meetings/safety/service/tech/marketing）各 2–3 篇、合計 30；6 篇伊索寓言（如龜兔賽跑、狼來了、北風與太陽、獅子與老鼠、螞蟻與蚱蜢、狐狸與葡萄）。
- [ ] **Step 2: 派發生成 agent（並行，每 agent 6–9 篇）**，prompt 必含：
  - 輸出 `PassageSrc` JSON 直接寫檔到 `content/passages-src/`，**不回顯內容**。
  - TOEIC 篇：100–180 字；文體輪替（email、公告、廣告、行程、備忘錄）；**每篇至少嵌入 8 個該主題 `_headwords.json` 的字**；3–5 題（main/detail/inference 至少各一）；題幹與選項用英文（擬真）；`source: "self-made"`；`level` 依難度 L1–L3。
  - story 篇：300–500 字、**自家簡化改寫**（不得抄現代譯本）；`source: "Aesop's Fables（公有領域原著，自家簡化改寫）"`；`questions: []`；`titleZh` 必填。
  - 正解不可全押同一選項；錯誤選項要合理（文中出現過的元素）。
- [ ] **Step 3: 建置驗證迴圈** — `npm run build:passages`；對 `查無釋義`／gloss 格式錯誤逐字補 `_gloss-overrides.json`（值必須符合短對譯規則），跑到 exit 0。
- [ ] **Step 4: 抽查品質** — 隨機開 3 篇建置產物：確認 curated 標記存在、glossary 釋義可讀、題目正解正確。
- [ ] **Step 5: Seed** — `npm run seed:passages`（36 篇，Neon 逐篇 round-trip 需時；**用 run_in_background 跑**避免 10 分鐘 timeout）。Expected: 36 行 `seeded:`。
- [ ] **Step 6: Commit**

```powershell
git add content/passages-src content/passages; git commit -m @'
content: 30 TOEIC passages and 6 Aesop retellings for immersive reading

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 13: 收尾 — 全面驗證與部署

**Files:** 無新檔

- [ ] **Step 1: 全測試＋lint＋build**

Run: `npm test` → 全 PASS；`npm run lint` → 無 error；`npm run build` → 成功。

- [ ] **Step 2: Push 部署**

Run: `git push`（GitHub Actions 自動部署到 Cloudflare／0stack.org）。等 Actions 綠燈（`gh run watch` 或 `gh run list --limit 1`）。

- [ ] **Step 3: 線上驗證**

- `curl -s -o /dev/null -w "%{http_code}" https://0stack.org/read` → 未登入導向（3xx）或 200 登入頁。
- 登入後手動走一輪：讀樣本短文 → 收字 → 作答 → 到 `/books/my-notebook` 與 `/learn/my-notebook` 確認閉環；確認頁面 payload 無 `"answer"`。

- [ ] **Step 4: 更新記憶與收尾**

- 更新 memory `vocab-app-progress.md`：沉浸閱讀上線（範圍、commit、待 iPhone 驗收）。
- 向使用者回報：完成範圍、線上網址、路線圖下一步（Part 5/6 文法題庫）。
