# 多益核心詞包（~1000 字）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把詞庫擴充為 ~1000 字、分 9 本主題書的多益核心詞包（離線原創靜態資料），並修好複習佇列的單字書範圍。

**Architecture:** 內容為 `content/toeic-<topic>.json`（既有 `SeedBook` 格式），經既有 `npm run seed` 入 Neon；核心引擎不動（內容與引擎解耦）。唯一程式改動：`learning` 查詢層加單字書範圍篩選。新增開發期檢查腳本 `scripts/check-content.mjs`。

**Tech Stack:** Node 腳本、既有 Prisma seed 管線、Vitest；內容為純 JSON。

## Global Constraints

- **純內容 + 一處 learning 查詢修正**；core/scheduler/content 邏輯不動。既有測試須全綠。
- **零成本**：內容離線一次性生成的靜態 JSON；無 runtime AI、無外部請求、無付費源。
- **資料格式**（`lib/content/seed-schema.ts` 的 `SeedBook`/`SeedWord`/`SeedExample`，verbatim）：
  - `SeedWord`：`headword`(必), `partOfSpeech`(填), `definitionZh`(必,繁中), `examples`(必,1–2 筆), `examTags: ["TOEIC","<topic>"]`；**不放 `phonetic`**。
  - `SeedExample`：`sentence`(英,商務情境), `translationZh`(繁中)。
- **品質規則**：同一本書內各字 `definitionZh` 必須**夠區別**（MC 干擾項取自同書其他字定義）；定義精簡口語；例句自然、長度適中（≤ ~90 字元）、用到該字商務用法；無錯字。
- **去重**：所有書（含既有 `content/toeic-core.json` 的 12 字）跨書 `headword` 不重複（小寫正規化）。
- **選字依據**：公開免費商業/多益頻率詞表（TOEIC Service List 或 NGSL+BSL）為骨幹；取不到乾淨來源時以對該領域之知識產出等價清單，並於報告標註實際來源。
- **入庫**：`npm run seed content/<file>.json`（idempotent，按 slug + headword upsert）。需要 `.env` 的 `DATABASE_URL`（live Neon）。
- Book-scoping 不變式：`/learn/<slug>` 的到期卡與抽考只來自該書。

---

## File Structure

**新增**
- `content/_headwords.json` — 選字產物：`{ "<topic-slug>": { "name": string, "headwords": string[] }, ... }`（中介檔，不被 seed 讀取）。
- `content/toeic-office.json` … `content/toeic-tech.json`（9 本主題書，`SeedBook` 格式）。
- `scripts/check-content.mjs` — 內容檢查（跨檔去重、同書定義重複、例句存在、長度）。
- `lib/content/__tests__/check-content.test.ts` — 測 check-content 的純核心。

**修改**
- `lib/learning/repository.ts` — `listDueCards`、`listMasteredWordIds` 加 `wordBookId` 篩選。
- `lib/learning/session.ts` — 把 `wordBookId` 傳入上述兩查詢。
- `lib/learning/__tests__/repository.test.ts`、`session.test.ts` — 更新斷言。
- （`app/learn/[slug]/page.tsx` 已傳 `wordBookId` 給 `buildSession`，無需改。）

**主題書（9 本，slug / 名稱 / 目標字數）**
1. `toeic-office` 辦公室與日常溝通 ~110
2. `toeic-meetings` 會議與簡報 ~110
3. `toeic-hr` 人事與招聘 ~110
4. `toeic-finance` 財務與會計 ~110
5. `toeic-contracts` 合約與法務 ~110
6. `toeic-marketing` 行銷與業務 ~110
7. `toeic-logistics` 物流與採購 ~110
8. `toeic-travel` 旅遊、交通與接待 ~110
9. `toeic-tech` 科技與 IT ~110

（合計 ~990 + 既有 `toeic-core` 12 ≈ ~1000。`toeic-core` 保留，去重時視為已存在。）

---

## Task 1: 選字與主題分配 → `content/_headwords.json`

**Files:**
- Create: `content/_headwords.json`

**Interfaces:**
- Produces：`content/_headwords.json` = 物件，鍵為 9 個 topic slug，值 `{ name, headwords: string[] }`；9 本合計 ~990 個**互不重複且不與 `toeic-core` 的 12 字重複**的小寫 headword。

- [ ] **Step 1: 取得頻率詞表骨幹**

嘗試以 WebFetch/WebSearch 取得 TOEIC Service List（或 NGSL + BSL）的 headword 清單。
- 成功：取其 headword 作為候選池。
- 失敗（來源非乾淨可解析）：改以對 TSL/NGSL/BSL 與多益商務領域之知識，產出等價候選池。
於 Step 4 報告標註實際採用來源。

- [ ] **Step 2: 篩選並分配到 9 個主題**

從候選池挑 ~990 個最具多益代表性的字，分配到 §File Structure 的 9 個主題（每本 ~110）。規則：
- 小寫、原形（lemma）。
- 跨主題不重複；排除已在 `content/toeic-core.json` 的 12 字（negotiate, invoice, deadline, colleague, schedule, budget, client, shipment, warranty, reimburse, agenda, vendor）。
- 每字放最貼合的主題。

- [ ] **Step 3: 寫出 `content/_headwords.json`**

格式範例（值為實際清單）：
```json
{
  "toeic-office": { "name": "辦公室與日常溝通", "headwords": ["staple", "stationery", "..."] },
  "toeic-meetings": { "name": "會議與簡報", "headwords": ["..."] }
}
```

- [ ] **Step 4: 自我檢查 + 記錄來源**

確認：9 個鍵齊全、合計約 990、無跨主題重複、無與 toeic-core 12 字重複（可用一次性 node 指令或目視）。
Run: `node -e "const d=require('./content/_headwords.json');const a=Object.values(d).flatMap(b=>b.headwords);console.log('total',a.length,'unique',new Set(a.map(x=>x.toLowerCase())).size)"`
Expected: `total` ≈ 990 且等於 `unique`（無重複）。

- [ ] **Step 5: Commit**

```bash
git add content/_headwords.json
git commit -m "content: TOEIC headword pool partitioned into 9 topic books"
```

---

## Task 2: 內容檢查腳本 `scripts/check-content.mjs`

**Files:**
- Create: `scripts/check-content.mjs`, `lib/content/check-content.ts`
- Test: `lib/content/__tests__/check-content.test.ts`

**Interfaces:**
- Produces：純函式 `checkContent(books: { slug: string; words: { headword: string; definitionZh: string; examples: { sentence: string }[] }[] }[]): string[]`（回傳問題訊息陣列，空陣列＝通過）。檢查：(a) 跨書 headword 重複（小寫）；(b) 同書 definitionZh 重複；(c) 每字 ≥1 例句；(d) 例句長度 ≤ 90。
- `scripts/check-content.mjs`：讀 `content/toeic-*.json`（排除 `_headwords.json`），呼叫 `checkContent`，印問題並以非零碼結束（有問題時）。

- [ ] **Step 1: 寫失敗測試**

建立 `lib/content/__tests__/check-content.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { checkContent } from '@/lib/content/check-content'

const ex = [{ sentence: 'A short sentence.' }]
describe('checkContent', () => {
  it('passes clean books', () => {
    expect(checkContent([
      { slug: 'a', words: [{ headword: 'alpha', definitionZh: '甲', examples: ex }] },
      { slug: 'b', words: [{ headword: 'beta', definitionZh: '乙', examples: ex }] },
    ])).toEqual([])
  })
  it('flags cross-book duplicate headword (case-insensitive)', () => {
    const out = checkContent([
      { slug: 'a', words: [{ headword: 'Alpha', definitionZh: '甲', examples: ex }] },
      { slug: 'b', words: [{ headword: 'alpha', definitionZh: '乙', examples: ex }] },
    ])
    expect(out.join()).toMatch(/duplicate headword.*alpha/i)
  })
  it('flags duplicate definitionZh within a book', () => {
    const out = checkContent([
      { slug: 'a', words: [
        { headword: 'alpha', definitionZh: '相同', examples: ex },
        { headword: 'beta', definitionZh: '相同', examples: ex },
      ] },
    ])
    expect(out.join()).toMatch(/duplicate definition/i)
  })
  it('flags missing example', () => {
    expect(checkContent([{ slug: 'a', words: [{ headword: 'alpha', definitionZh: '甲', examples: [] }] }]).join())
      .toMatch(/no example/i)
  })
  it('flags overlong sentence', () => {
    const long = 'x'.repeat(91)
    expect(checkContent([{ slug: 'a', words: [{ headword: 'alpha', definitionZh: '甲', examples: [{ sentence: long }] }] }]).join())
      .toMatch(/too long/i)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/content/__tests__/check-content.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `lib/content/check-content.ts`**

```ts
export interface CheckWord { headword: string; definitionZh: string; examples: { sentence: string }[] }
export interface CheckBook { slug: string; words: CheckWord[] }

const MAX_SENTENCE = 90

export function checkContent(books: CheckBook[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, string>() // headword(lower) -> slug
  for (const book of books) {
    const defs = new Map<string, string>() // definitionZh -> headword
    for (const w of book.words) {
      const key = w.headword.toLowerCase()
      const prev = seen.get(key)
      if (prev) problems.push(`duplicate headword "${w.headword}" in ${book.slug} (also in ${prev})`)
      else seen.set(key, book.slug)

      const dprev = defs.get(w.definitionZh)
      if (dprev) problems.push(`duplicate definition "${w.definitionZh}" in ${book.slug} (${dprev} & ${w.headword})`)
      else defs.set(w.definitionZh, w.headword)

      if (!w.examples || w.examples.length === 0) problems.push(`no example for "${w.headword}" in ${book.slug}`)
      for (const e of w.examples ?? []) {
        if (e.sentence.length > MAX_SENTENCE) problems.push(`sentence too long for "${w.headword}" in ${book.slug} (${e.sentence.length})`)
      }
    }
  }
  return problems
}
```

- [ ] **Step 4: 實作 `scripts/check-content.mjs`**

```js
import { readFileSync, readdirSync } from 'node:fs'
import { checkContent } from '../lib/content/check-content.ts'

const files = readdirSync('content').filter((f) => f.startsWith('toeic-') && f.endsWith('.json'))
const books = files.map((f) => JSON.parse(readFileSync(`content/${f}`, 'utf8')))
const problems = checkContent(books)
if (problems.length) {
  console.error(`Found ${problems.length} content problem(s):`)
  for (const p of problems) console.error(' -', p)
  process.exit(1)
}
console.log(`OK: ${books.length} books, ${books.reduce((n, b) => n + b.words.length, 0)} words, no problems.`)
```

- [ ] **Step 5: 跑測試確認通過 + 對現有內容跑一次**

Run: `npx vitest run lib/content/__tests__/check-content.test.ts`
Expected: PASS。
Run: `node --experimental-strip-types scripts/check-content.mjs`
Expected: 目前只有 toeic-core → `OK: 1 books, 12 words, no problems.`

- [ ] **Step 6: Commit**

```bash
git add scripts/check-content.mjs lib/content/check-content.ts lib/content/__tests__/check-content.test.ts
git commit -m "feat(content): check-content script (dedup/definition/example/length)"
```

---

## Task 3: 複習佇列依單字書範圍（learning 修正，TDD）

**Files:**
- Modify: `lib/learning/repository.ts`, `lib/learning/session.ts`
- Test: `lib/learning/__tests__/repository.test.ts`, `lib/learning/__tests__/session.test.ts`

**Interfaces:**
- Produces：
  - `listDueCards(userId: string, now: Date, limit: number, wordBookId: string): Promise<{ wordId: string; consecutiveCorrect: number }[]>`（新增必填 `wordBookId`）。
  - `listMasteredWordIds(userId: string, wordBookId: string): Promise<string[]>`（新增必填 `wordBookId`）。
  - `buildSession` 內部把 `args.wordBookId` 傳入上述兩者。

- [ ] **Step 1: 更新 repository 測試（先失敗）**

於 `lib/learning/__tests__/repository.test.ts`：
- `listDueCards` 測試改為呼叫 `repo.listDueCards('u1', now, 50, 'b1')`，並斷言：
```ts
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', mastered: false, due: { lte: now }, word: { wordBookId: 'b1' } },
      orderBy: { due: 'asc' }, take: 50, select: { wordId: true, consecutiveCorrect: true },
    })
```
- `listMasteredWordIds` 測試改為 `repo.listMasteredWordIds('u1', 'b1')`，斷言：
```ts
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', mastered: true, word: { wordBookId: 'b1' } }, select: { wordId: true },
    })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/learning/__tests__/repository.test.ts`
Expected: FAIL（目前 where 無 `word` 篩選 / 參數簽章不符）。

- [ ] **Step 3: 改實作 `lib/learning/repository.ts`**

`listDueCards`：
```ts
  async listDueCards(userId: string, now: Date, limit: number, wordBookId: string): Promise<{ wordId: string; consecutiveCorrect: number }[]> {
    const rows = await this.db.userCard.findMany({
      where: { userId, mastered: false, due: { lte: now }, word: { wordBookId } },
      orderBy: { due: 'asc' }, take: limit, select: { wordId: true, consecutiveCorrect: true },
    })
    return rows as { wordId: string; consecutiveCorrect: number }[]
  }
```
`listMasteredWordIds`：
```ts
  async listMasteredWordIds(userId: string, wordBookId: string): Promise<string[]> {
    const rows = await this.db.userCard.findMany({ where: { userId, mastered: true, word: { wordBookId } }, select: { wordId: true } })
    return (rows as { wordId: string }[]).map((r) => r.wordId)
  }
```

- [ ] **Step 4: 改 `lib/learning/session.ts` 傳入 wordBookId**

```ts
  const due = await deps.learning.listDueCards(args.userId, args.now, args.dueLimit, args.wordBookId)
  const newIds = await deps.learning.listNewWordIds(args.userId, args.wordBookId, args.newLimit)
  const masteredIds = await deps.learning.listMasteredWordIds(args.userId, args.wordBookId)
```

- [ ] **Step 5: 更新 session 測試**

於 `lib/learning/__tests__/session.test.ts`：把 mock 的 `listDueCards`/`listMasteredWordIds` 斷言補上 `wordBookId`（與 buildSession 傳入的一致，例如 `'b1'`）。若原測試只檢查回傳組合，確認呼叫參數含 wordBookId。

- [ ] **Step 6: 跑相關測試確認通過 + 全量**

Run: `npx vitest run lib/learning/__tests__/repository.test.ts lib/learning/__tests__/session.test.ts`
Expected: PASS。
Run: `npx tsc --noEmit`
Expected: 乾淨（`app/learn/[slug]/page.tsx` 已傳 wordBookId 給 buildSession，submit/其他呼叫端不受影響）。

- [ ] **Step 7: Commit**

```bash
git add lib/learning/repository.ts lib/learning/session.ts lib/learning/__tests__/repository.test.ts lib/learning/__tests__/session.test.ts
git commit -m "fix(learning): scope due-cards and spot-check pool to the word book"
```

---

## Task 4: 生成 9 本主題書（每本一檔，可平行）

> **執行建議**：9 本各自獨立、寫不同檔案，**可一書一個 subagent 平行生成**；每本各自做品質 review。

**Files (each book):**
- Create: `content/<slug>.json`

**Interfaces:**
- Consumes：`content/_headwords.json`（Task 1）該 topic 的 `headwords` 與 `name`；`SeedBook` 格式；Global Constraints 的品質規則。
- Produces：合法 `SeedBook` JSON，`words` 對應該 topic 的 headwords。

**每本書的程序（對 §File Structure 的 9 本各做一次）：**

- [ ] **Step 1: 讀該 topic 的 headwords**

從 `content/_headwords.json` 取該 slug 的 `name` 與 `headwords`。

- [ ] **Step 2: 生成 `content/<slug>.json`**

產出 `SeedBook`：
```json
{
  "slug": "<slug>",
  "name": "<name>",
  "description": "<一句中文描述該主題>",
  "level": "TOEIC",
  "words": [
    {
      "headword": "<headword>",
      "partOfSpeech": "<n./v./adj./...>",
      "definitionZh": "<繁中定義，精簡口語>",
      "examTags": ["TOEIC", "<slug 去掉 toeic- 的主題鍵或中文主題>"],
      "examples": [
        { "sentence": "<商務情境英文句，≤90 字元，用到該字>", "translationZh": "<繁中翻譯>" }
      ]
    }
  ]
}
```
規則：每個 headword 一筆；1–2 句例句；**同書 definitionZh 互不重複**且夠區別；`phonetic` 不放。

- [ ] **Step 3: 結構驗證**

Run: `node --experimental-strip-types -e "import('./lib/content/seed-schema.ts').then(m=>{const b=m.parseSeedBook(JSON.parse(require('fs').readFileSync('content/<slug>.json','utf8')));console.log('OK',b.slug,b.words.length)})"`
Expected: `OK <slug> <count>`（無 throw）。

- [ ] **Step 4: Commit（該本）**

```bash
git add content/<slug>.json
git commit -m "content: <slug> word book (~110 TOEIC words)"
```

---

## Task 5: 全內容檢查 + 入庫 + 端到端驗證

**Files:** 無（驗證 + seed）

- [ ] **Step 1: 跨全部內容檢查**

Run: `node --experimental-strip-types scripts/check-content.mjs`
Expected: `OK: 10 books, ~1002 words, no problems.`（9 主題 + toeic-core；有問題則回到對應書修正後重跑）

- [ ] **Step 2: 全量測試 + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 全綠、乾淨、成功。

- [ ] **Step 3: 逐本入庫（live Neon）**

對 9 本各跑一次（idempotent）：
```bash
npm run seed content/toeic-office.json
npm run seed content/toeic-meetings.json
npm run seed content/toeic-hr.json
npm run seed content/toeic-finance.json
npm run seed content/toeic-contracts.json
npm run seed content/toeic-marketing.json
npm run seed content/toeic-logistics.json
npm run seed content/toeic-travel.json
npm run seed content/toeic-tech.json
```
Expected: 每本印出載入字數，無錯誤。

- [ ] **Step 4: 端到端驗證（dev）**

`npm run dev`，登入後：
- `/books` 顯示 10 本書（含各自字數）。
- 進某主題書 → `/learn/<slug>`：複習/新卡只出現該書的字（驗證 book-scoping）。
- 三種題型在較大詞庫下運作；MC 干擾項合理（同書定義夠區別）。
驗證後關閉 dev server。

- [ ] **Step 5: 最終 commit（若驗收有微調）**

```bash
git add -A
git commit -m "content: seed + verify TOEIC ~1000-word pack"
```

---

## Self-Review

**1. Spec coverage：**
- §2 範圍（~1000、9 本主題書、WordBook/examTags）→ Task 1（分配）+ Task 4（生成）✓
- §3 選字（頻率表為本 + fallback + 去重）→ Task 1 ✓
- §4 每字內容（欄位、略音標、品質、定義區別）→ Global Constraints + Task 4 ✓
- §5 流程（每本一檔、check-content、抽查、逐本 seed）→ Task 2/4/5 ✓
- §6 learning book-scoping（listDueCards/listMasteredWordIds/session + 測試）→ Task 3 ✓
- §7 模組邊界（內容靜態、查詢層相容新增參數）→ Task 3 介面（新增必填參數；唯一呼叫端 session 已改、page 不變）✓
- §8 驗收（check-content、測試、build、seed、端到端 book-scoping）→ Task 5 ✓
- §9 排除（音標/runtime AI/付費/2000+/其他語言）→ 未納入 ✓
- §10 參數 → Task/Global Constraints 對齊（~110×9、1–2 例句）✓

**2. Placeholder scan：** 內容生成任務的「字詞本身」是執行時依規則產出的**資料產物**（非可預寫的程式），已給定 schema、數量、品質規則、驗證指令——非佔位。程式步驟（check-content、repository 修正）皆含完整程式碼。✓

**3. Type consistency：**
- `listDueCards(userId, now, limit, wordBookId)`、`listMasteredWordIds(userId, wordBookId)` 在 repository 定義、session 呼叫、測試斷言一致 ✓。
- `checkContent(books)` 形狀（slug/words/headword/definitionZh/examples.sentence）在 ts 定義、mjs 呼叫、測試一致 ✓。
- `SeedBook`/`SeedWord` 欄位與 `lib/content/seed-schema.ts` 一致（不放 phonetic、examples 非空）✓。
- `_headwords.json` 形狀（topic→{name,headwords}）在 Task 1 產出、Task 4 消費一致 ✓。
