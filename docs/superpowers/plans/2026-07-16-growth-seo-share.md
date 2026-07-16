# 成長與推廣（公開門面、SEO、成就分享卡）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 0stack.org 對外可見——公開 landing page、可被 Google 索引的單字頁 + sitemap/OG、純前端成就分享卡。

**Architecture:** 全部落在 `content` repository（兩個新查詢）與純呈現層（landing、`/word/[headword]`、share-card canvas）。不動 scheduler/learning/gamification/shop 邏輯、不新增 API endpoint、不碰硬幣經濟。分享卡在前端 canvas 產圖 + Web Share API，零伺服器成本。

**Tech Stack:** Next.js App Router（既有）、Prisma + Neon（既有 repository 模式）、Vitest、Canvas 2D + Web Share API、sharp（僅一次性離線產 OG 圖，不進 deploy 依賴）。

**Spec:** `docs/superpowers/specs/2026-07-16-growth-seo-share-design.md`

## Global Constraints

- Prisma 釘在 6.19.3，不得升級（Cloudflare Workers WASM 限制，見 `lib/db/client.ts`）。
- DB 一律經 repository（`lib/*/repository.ts`），不得散落原生 SQL；edge 上走 Neon serverless driver（已由 `getPrisma()` 收斂）。
- 不在 runtime 呼叫 AI、不新增任何可能超量計費的外部服務。
- 前端只呈現；不新增任何信任前端輸入的後端邏輯。分享卡只讀後端算好的數字。
- UI 文案一律繁體中文，跟隨既有檔案的命名與註解密度（註解只寫「為什麼」）。
- 測試指令：`npx vitest run <path>`；全套：`npm test`。TDD：先寫測試、先看它 fail。
- 站台正式網址：`https://0stack.org`。
- 建置驗證用 `npm run build`（webpack）；不要跑 `npm run cf:deploy`（push master 會自動部署）。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `lib/content/public-word.ts` | Create | 公開單字頁的型別 + 跨書合併純函式 |
| `lib/content/__tests__/public-word.test.ts` | Create | 合併函式 + 兩個新 repo 方法的測試 |
| `lib/content/repository.ts` | Modify | 新增 `getPublicWordByHeadword`、`listAllHeadwords` |
| `lib/seo/site.ts` | Create | `SITE_URL` 常數 + sitemap 條目生成純函式 |
| `lib/seo/__tests__/sitemap-entries.test.ts` | Create | sitemap 條目測試 |
| `app/word/[headword]/page.tsx` | Create | 公開單字頁（免登入、generateMetadata） |
| `components/landing/landing-page.tsx` | Create | 未登入首頁內容（純呈現，吃 props） |
| `app/page.tsx` | Modify | 未登入改渲染 LandingPage（不再 redirect） |
| `app/login/page.tsx` | Modify | 加「回首頁看介紹」連結 |
| `app/robots.ts` | Create | robots + sitemap 指向 |
| `app/sitemap.ts` | Create | `/` + 全部單字頁 |
| `app/layout.tsx` | Modify | metadataBase / OG / twitter card |
| `public/og-source.svg` | Create | OG 圖源（1200×630） |
| `scripts/gen-og.mjs` | Create | sharp 一次性產 `public/og.png` |
| `components/share-card/card-data.ts` | Create | 分享卡數據→文案 純函式 |
| `components/share-card/__tests__/card-data.test.ts` | Create | 文案函式測試 |
| `components/share-card/draw-card.ts` | Create | Canvas 繪製（吃資料，不碰 DOM 狀態） |
| `components/share-card/share-button.tsx` | Create | client 元件：產圖 + Web Share / 下載 fallback |
| `app/stats/page.tsx` | Modify | 加分享按鈕（server 端補抓 level/badge 資料） |

---

### Task 1: ContentRepository 公開單字查詢（合併純函式 + 兩個方法）

**Files:**
- Create: `lib/content/public-word.ts`
- Create: `lib/content/__tests__/public-word.test.ts`
- Modify: `lib/content/repository.ts`

**Interfaces:**
- Consumes: `ExampleData`、`toExampleData`（`lib/content/types.ts` 既有）
- Produces:
  - `interface PublicWordData { headword: string; phonetic: string | null; partOfSpeech: string | null; definitionZh: string; examples: ExampleData[]; books: { slug: string; name: string }[] }`
  - `mergePublicWordRows(rows): PublicWordData | null`（`lib/content/public-word.ts`）
  - `ContentRepository.getPublicWordByHeadword(headword: string): Promise<PublicWordData | null>`
  - `ContentRepository.listAllHeadwords(): Promise<string[]>`（小寫、去重、排序）

- [ ] **Step 1: 寫失敗測試**

建立 `lib/content/__tests__/public-word.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { mergePublicWordRows } from '@/lib/content/public-word'
import { ContentRepository } from '@/lib/content/repository'

function makeDb() {
  return {
    wordBook: { findMany: vi.fn(), findUnique: vi.fn() },
    word: { findMany: vi.fn(), findUnique: vi.fn() },
  }
}

const rowA = {
  id: 'w1', headword: 'invoice', phonetic: '/ˈɪnvɔɪs/', partOfSpeech: 'n.',
  definitionZh: '發票', examTags: ['TOEIC'],
  examples: [{ id: 'e1', sentence: 'Send the invoice.', translationZh: '寄出發票。', source: null }],
  wordBook: { slug: 'toeic-finance', name: '財務金融' },
}
const rowB = {
  id: 'w2', headword: 'Invoice', phonetic: null, partOfSpeech: 'v.',
  definitionZh: '開發票', examTags: ['TOEIC'],
  examples: [
    { id: 'e2', sentence: 'Send the invoice.', translationZh: '寄出發票。', source: null }, // 與 e1 句子重複
    { id: 'e3', sentence: 'We invoice monthly.', translationZh: '我們按月開發票。', source: null },
  ],
  wordBook: { slug: 'toeic-office', name: '辦公室' },
}

describe('mergePublicWordRows', () => {
  it('空陣列回 null', () => {
    expect(mergePublicWordRows([])).toBeNull()
  })

  it('單筆直接映射，headword 正規化為小寫', () => {
    const w = mergePublicWordRows([{ ...rowA, headword: 'Invoice' }])
    expect(w).toMatchObject({ headword: 'invoice', phonetic: '/ˈɪnvɔɪs/', partOfSpeech: 'n.', definitionZh: '發票' })
    expect(w?.books).toEqual([{ slug: 'toeic-finance', name: '財務金融' }])
  })

  it('多書合併：欄位取首筆、例句依句子去重聯集、books 依 slug 去重', () => {
    const w = mergePublicWordRows([rowA, rowB])
    expect(w?.definitionZh).toBe('發票')
    expect(w?.partOfSpeech).toBe('n.')
    expect(w?.examples.map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(w?.books).toEqual([
      { slug: 'toeic-finance', name: '財務金融' },
      { slug: 'toeic-office', name: '辦公室' },
    ])
  })

  it('首筆欄位為 null 時向後補值', () => {
    const w = mergePublicWordRows([{ ...rowA, phonetic: null }, rowB])
    expect(w?.phonetic).toBeNull() // rowB.phonetic 也是 null
    const w2 = mergePublicWordRows([{ ...rowB, id: 'x' }, rowA])
    expect(w2?.phonetic).toBe('/ˈɪnvɔɪs/') // 首筆 null，取後筆的音標
  })
})

describe('ContentRepository 公開查詢', () => {
  it('getPublicWordByHeadword 正規化輸入並以 insensitive 查詢', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([rowA])
    const repo = new ContentRepository(db as any)
    const w = await repo.getPublicWordByHeadword('  Invoice ')
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { headword: { equals: 'invoice', mode: 'insensitive' } },
      include: {
        examples: { orderBy: { order: 'asc' } },
        wordBook: { select: { slug: true, name: true } },
      },
    })
    expect(w?.headword).toBe('invoice')
  })

  it('getPublicWordByHeadword 空字串不打 DB、直接 null', async () => {
    const db = makeDb()
    const repo = new ContentRepository(db as any)
    expect(await repo.getPublicWordByHeadword('   ')).toBeNull()
    expect(db.word.findMany).not.toHaveBeenCalled()
  })

  it('getPublicWordByHeadword 查無回 null', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([])
    const repo = new ContentRepository(db as any)
    expect(await repo.getPublicWordByHeadword('missing')).toBeNull()
  })

  it('listAllHeadwords 小寫去重排序', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([
      { headword: 'Budget' }, { headword: 'audit' }, { headword: 'budget' },
    ])
    const repo = new ContentRepository(db as any)
    expect(await repo.listAllHeadwords()).toEqual(['audit', 'budget'])
    expect(db.word.findMany).toHaveBeenCalledWith({
      select: { headword: true },
      distinct: ['headword'],
      orderBy: { headword: 'asc' },
    })
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `npx vitest run lib/content/__tests__/public-word.test.ts`
Expected: FAIL — `Cannot find module '@/lib/content/public-word'`（或 `mergePublicWordRows is not a function`）

- [ ] **Step 3: 實作 `lib/content/public-word.ts`**

```ts
import { toExampleData, type ExampleData } from './types'

// 公開單字頁（/word/[headword]）的合併視圖：同一 headword 可能出現在多本主題書。
export interface PublicWordBookRef { slug: string; name: string }

export interface PublicWordData {
  headword: string
  phonetic: string | null
  partOfSpeech: string | null
  definitionZh: string
  examples: ExampleData[]
  books: PublicWordBookRef[]
}

type ExampleRow = { id: string; sentence: string; translationZh: string; source: string | null }
export type PublicWordRow = {
  headword: string; phonetic: string | null; partOfSpeech: string | null
  definitionZh: string; examples: ExampleRow[]; wordBook: PublicWordBookRef
}

// 欄位取首筆非 null 值；例句依句子文字去重聯集；books 依 slug 去重。
export function mergePublicWordRows(rows: PublicWordRow[]): PublicWordData | null {
  if (rows.length === 0) return null
  const examples: ExampleData[] = []
  const seenSentences = new Set<string>()
  const books: PublicWordBookRef[] = []
  const seenSlugs = new Set<string>()
  for (const row of rows) {
    for (const e of row.examples) {
      if (seenSentences.has(e.sentence)) continue
      seenSentences.add(e.sentence)
      examples.push(toExampleData(e))
    }
    if (!seenSlugs.has(row.wordBook.slug)) {
      seenSlugs.add(row.wordBook.slug)
      books.push({ slug: row.wordBook.slug, name: row.wordBook.name })
    }
  }
  return {
    headword: rows[0].headword.toLowerCase(),
    phonetic: rows.find((r) => r.phonetic !== null)?.phonetic ?? null,
    partOfSpeech: rows.find((r) => r.partOfSpeech !== null)?.partOfSpeech ?? null,
    definitionZh: rows[0].definitionZh,
    examples,
    books,
  }
}
```

- [ ] **Step 4: 在 `lib/content/repository.ts` 加兩個方法**

在 import 區加：

```ts
import { mergePublicWordRows, type PublicWordData, type PublicWordRow } from './public-word'
```

在 class 內（`getWordCore` 之後）加：

```ts
  /** 公開單字頁用：跨書合併同一 headword。匿名可呼叫，無使用者資料。 */
  async getPublicWordByHeadword(headword: string): Promise<PublicWordData | null> {
    const hw = headword.trim().toLowerCase()
    if (!hw) return null
    const rows = await this.db.word.findMany({
      where: { headword: { equals: hw, mode: 'insensitive' } },
      include: {
        examples: { orderBy: { order: 'asc' } },
        wordBook: { select: { slug: true, name: true } },
      },
    })
    return mergePublicWordRows(rows as PublicWordRow[])
  }

  /** sitemap 用：全站 headword（小寫、去重、排序）。 */
  async listAllHeadwords(): Promise<string[]> {
    const rows = (await this.db.word.findMany({
      select: { headword: true },
      distinct: ['headword'],
      orderBy: { headword: 'asc' },
    })) as { headword: string }[]
    return [...new Set(rows.map((r) => r.headword.toLowerCase()))].sort()
  }
```

- [ ] **Step 5: 跑測試確認 pass**

Run: `npx vitest run lib/content/__tests__/public-word.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 6: 全套測試 + commit**

Run: `npm test` — Expected: 全綠。

```bash
git add lib/content/public-word.ts lib/content/__tests__/public-word.test.ts lib/content/repository.ts
git commit -m "feat(content): public word lookup by headword + all-headwords listing"
```

---

### Task 2: 公開單字頁 `/word/[headword]`

**Files:**
- Create: `app/word/[headword]/page.tsx`

**Interfaces:**
- Consumes: `ContentRepository.getPublicWordByHeadword`（Task 1）、`TtsButton`（`components/tts-button`）、`Card`（`components/ui/card`）
- Produces: 公開路由 `/word/[headword]`（後續 sitemap、landing 內部連結指向它）

- [ ] **Step 1: 建立頁面**

`app/word/[headword]/page.tsx`（免登入——這是本頁的重點，內容本來就對前端可見，無新資安面）：

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ContentRepository } from '@/lib/content/repository'
import { TtsButton } from '@/components/tts-button'
import { Card } from '@/components/ui/card'

export async function generateMetadata({ params }: { params: Promise<{ headword: string }> }): Promise<Metadata> {
  const { headword } = await params
  const word = await new ContentRepository().getPublicWordByHeadword(headword)
  if (!word) return { title: '找不到單字｜VocabApp' }
  const firstExample = word.examples[0]?.sentence ?? ''
  return {
    title: `${word.headword} 中文意思・例句｜VocabApp`,
    description: `${word.headword}：${word.definitionZh}。${firstExample}`,
    alternates: { canonical: `/word/${encodeURIComponent(word.headword)}` },
  }
}

export default async function PublicWordPage({ params }: { params: Promise<{ headword: string }> }) {
  const { headword } = await params
  const word = await new ContentRepository().getPublicWordByHeadword(headword)
  if (!word) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← VocabApp 首頁</Link>
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-3xl font-extrabold text-neutral-900">{word.headword}</h1>
        <TtsButton text={word.headword} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-neutral-600">
        {word.phonetic && <span>{word.phonetic}</span>}
        {word.partOfSpeech && (
          <span className="rounded-pill bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-600">{word.partOfSpeech}</span>
        )}
      </div>
      <p className="mt-3 text-lg text-neutral-900">{word.definitionZh}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {word.books.map((b) => (
          <span key={b.slug} className="rounded-pill bg-primary-50 px-2 py-0.5 text-xs font-semibold text-neutral-600">
            📚 {b.name}
          </span>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-sm font-bold text-neutral-600">例句</h2>
      <ul className="space-y-3">
        {word.examples.map((e) => (
          <li key={e.id}>
            <Card className="p-4">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-neutral-900">{e.sentence}</p>
                <TtsButton text={e.sentence} />
              </div>
              <p className="mt-1 text-sm text-neutral-600">{e.translationZh}</p>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="mt-8 flex flex-col items-center gap-3 p-6 text-center">
        <p className="font-bold text-neutral-900">想把「{word.headword}」記進長期記憶？</p>
        <p className="text-sm text-neutral-600">登入後用科學排程（FSRS）複習，還有連續天數與徽章等你解鎖。</p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary-500 px-6 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          免費開始學習
        </Link>
      </Card>
    </main>
  )
}
```

- [ ] **Step 2: 驗證 build 與手動確認**

Run: `npm run build`
Expected: build 成功，路由清單出現 `/word/[headword]`。

Run: `npm run dev`（背景啟動），瀏覽 `http://localhost:3000/word/invoice`（用 seed 過的任一字）。
Expected: 未登入可看到內容；`/word/zzz-not-a-word` 回 404。確認後停掉 dev server。

- [ ] **Step 3: Commit**

```bash
git add app/word
git commit -m "feat(seo): public word page /word/[headword] with metadata + login CTA"
```

---

### Task 3: Landing page + `/` 分流

**Files:**
- Create: `components/landing/landing-page.tsx`
- Modify: `app/page.tsx`（只動未登入分支）
- Modify: `app/login/page.tsx`（加一行連結）

**Interfaces:**
- Consumes: `ContentRepository.listWordBooks(): Promise<WordBookData[]>`（既有）、`Mascot`、`Card`
- Produces: `LandingPage({ books }: { books: WordBookData[] })`（純呈現元件，server 可直接渲染）

- [ ] **Step 1: 建立 `components/landing/landing-page.tsx`**

```tsx
import Link from 'next/link'
import { Mascot } from '@/components/ui/mascot'
import { Card } from '@/components/ui/card'
import type { WordBookData } from '@/lib/content/types'

// 未登入首頁。純呈現：資料由 app/page.tsx 抓好傳入，本身不碰 DB。
const FEATURES = [
  { icon: '🧠', title: '科學排程', desc: 'FSRS 演算法算出每個字的最佳複習時機，該複習才複習。' },
  { icon: '🔥', title: '遊戲化動力', desc: '連續天數、徽章、硬幣商店幫小狐狸換裝，背單字不孤單。' },
  { icon: '📴', title: '離線也能背', desc: 'PWA 可安裝到手機主畫面，通勤沒網路照樣複習。' },
] as const

// 頁尾內部連結：挑常見 TOEIC 字，讓搜尋引擎從首頁爬得到單字頁。
const FEATURED_WORDS = ['invoice', 'budget', 'schedule', 'contract', 'refund', 'shipment'] as const

export function LandingPage({ books }: { books: WordBookData[] }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-10 px-4 py-12">
      <section className="flex flex-col items-center gap-4 text-center">
        <Mascot mood="hi" size={132} />
        <h1 className="text-3xl font-extrabold text-neutral-900">TOEIC 單字，用科學排程背起來</h1>
        <p className="max-w-md text-neutral-600">
          免費的英文字彙學習 PWA：FSRS 間隔重複、遊戲化成就、離線複習，一個帳號跨裝置同步。
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary-500 px-8 py-4 text-lg font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          用 Google 登入，免費開始
        </Link>
      </section>

      <section className="grid w-full gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="flex flex-col items-center gap-2 p-5 text-center">
            <span className="text-3xl">{f.icon}</span>
            <h2 className="font-extrabold text-neutral-900">{f.title}</h2>
            <p className="text-sm text-neutral-600">{f.desc}</p>
          </Card>
        ))}
      </section>

      {books.length > 0 && (
        <section className="w-full">
          <h2 className="mb-3 text-center text-lg font-extrabold text-neutral-900">收錄單字書</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {books.map((b) => (
              <Card key={b.slug} className="flex items-center justify-between p-4">
                <span className="font-bold text-neutral-900">{b.name}</span>
                <span className="text-xs font-semibold text-neutral-600">{b.wordCount} 字</span>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="w-full text-center">
        <h2 className="mb-2 text-sm font-bold text-neutral-600">熱門單字</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {FEATURED_WORDS.map((w) => (
            <Link key={w} href={`/word/${w}`} className="rounded-pill bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-600 hover:bg-primary-100">
              {w}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: 修改 `app/page.tsx` 未登入分支**

把：

```tsx
import { redirect } from 'next/navigation'
```

改為（移除不再用的 `redirect`）：

```tsx
import { ContentRepository } from '@/lib/content/repository'
import { LandingPage } from '@/components/landing/landing-page'
```

把：

```tsx
  const user = await getCurrentUser()
  if (!user) redirect('/login')
```

改為：

```tsx
  const user = await getCurrentUser()
  if (!user) {
    // 未登入：對外門面。DB 掛了也要能渲染（books 給空陣列）。
    let books: Awaited<ReturnType<ContentRepository['listWordBooks']>> = []
    try { books = await new ContentRepository().listWordBooks() } catch { /* 靜態內容照常呈現 */ }
    return <LandingPage books={books} />
  }
```

已登入分支完全不動。

- [ ] **Step 3: 修改 `app/login/page.tsx`**

在 `<SignInButton />` 之後加：

```tsx
      <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 回首頁看介紹</Link>
```

並在檔頭加 `import Link from 'next/link'`。

- [ ] **Step 4: 驗證**

Run: `npm test` — Expected: 全綠（本 task 無新測試，確保沒弄壞舊的）。
Run: `npm run build` — Expected: 成功。
Run: `npm run dev`，無痕視窗開 `http://localhost:3000/`。
Expected: 未登入看到 landing（hero、三特色、12 本書、熱門單字連結）；點熱門單字進單字頁；已登入（一般視窗）仍看到原本 home。
若某個熱門單字回 404（不在 seed 資料裡），把 `FEATURED_WORDS` 換成存在的字（可用 `Select-String -Path content\*.json -Pattern '"headword"' | Select-Object -First 20` 挑）。

- [ ] **Step 5: Commit**

```bash
git add components/landing app/page.tsx app/login/page.tsx
git commit -m "feat(landing): public landing page for anonymous visitors on /"
```

---

### Task 4: SEO 基礎（robots / sitemap / metadata / OG 圖）

**Files:**
- Create: `lib/seo/site.ts`
- Create: `lib/seo/__tests__/sitemap-entries.test.ts`
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Modify: `app/layout.tsx`（metadata 補齊）
- Create: `public/og-source.svg`、`scripts/gen-og.mjs`（產出 `public/og.png`）

**Interfaces:**
- Consumes: `ContentRepository.listAllHeadwords()`（Task 1）
- Produces: `SITE_URL = 'https://0stack.org'`、`buildSitemapEntries(headwords: string[]): { url: string; priority: number }[]`（`lib/seo/site.ts`）

- [ ] **Step 1: 寫失敗測試 `lib/seo/__tests__/sitemap-entries.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { SITE_URL, buildSitemapEntries } from '@/lib/seo/site'

describe('buildSitemapEntries', () => {
  it('首頁 priority 1，單字頁 0.6 並做 URL encode', () => {
    const entries = buildSitemapEntries(['invoice', 'e-mail'])
    expect(entries[0]).toEqual({ url: `${SITE_URL}/`, priority: 1 })
    expect(entries).toContainEqual({ url: `${SITE_URL}/word/invoice`, priority: 0.6 })
    expect(entries).toContainEqual({ url: `${SITE_URL}/word/e-mail`, priority: 0.6 })
    expect(entries).toHaveLength(3)
  })

  it('無單字時仍含首頁', () => {
    expect(buildSitemapEntries([])).toEqual([{ url: `${SITE_URL}/`, priority: 1 }])
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `npx vitest run lib/seo/__tests__/sitemap-entries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/seo/site'`

- [ ] **Step 3: 實作 `lib/seo/site.ts`**

```ts
export const SITE_URL = 'https://0stack.org'

// sitemap 條目（純函式，方便測試；app/sitemap.ts 只負責取資料）。
export function buildSitemapEntries(headwords: string[]): { url: string; priority: number }[] {
  return [
    { url: `${SITE_URL}/`, priority: 1 },
    ...headwords.map((hw) => ({ url: `${SITE_URL}/word/${encodeURIComponent(hw)}`, priority: 0.6 })),
  ]
}
```

Run: `npx vitest run lib/seo/__tests__/sitemap-entries.test.ts` — Expected: PASS

- [ ] **Step 4: 建立 `app/robots.ts` 與 `app/sitemap.ts`**

`app/robots.ts`：

```ts
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

`app/sitemap.ts`：

```ts
import type { MetadataRoute } from 'next'
import { ContentRepository } from '@/lib/content/repository'
import { buildSitemapEntries } from '@/lib/seo/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let headwords: string[] = []
  try { headwords = await new ContentRepository().listAllHeadwords() } catch { /* DB 掛了至少回首頁 */ }
  return buildSitemapEntries(headwords)
}
```

- [ ] **Step 5: 補齊 `app/layout.tsx` metadata**

把現有 `export const metadata: Metadata = {...}` 換成：

```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://0stack.org"),
  title: "VocabApp 字彙學習",
  description: "免費 TOEIC 單字學習 PWA：FSRS 科學排程、遊戲化成就、離線複習，跨裝置同步。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "VocabApp" },
  icons: { apple: "/icons/icon-192.png" },
  openGraph: {
    type: "website",
    siteName: "VocabApp",
    title: "VocabApp 字彙學習",
    description: "免費 TOEIC 單字學習 PWA：FSRS 科學排程、遊戲化成就、離線複習。",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};
```

（`metadataBase` 直接用字面量而非 import `SITE_URL`：layout 是 server 入口，維持零額外依賴；兩處同值，`lib/seo/site.ts` 註解註明。）在 `lib/seo/site.ts` 的 `SITE_URL` 上方加註解：`// 與 app/layout.tsx 的 metadataBase 同值；改網域兩處都要改。`

- [ ] **Step 6: OG 圖（一次性產出）**

建立 `public/og-source.svg`（1200×630，自包含、不引外部圖；文字用系統無襯線字體）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FF6A3D"/>
  <rect x="40" y="40" width="1120" height="550" rx="36" fill="#FFF7F2"/>
  <!-- 簡化版小橙狐（自包含，避免外部引用在 librsvg 失效） -->
  <g transform="translate(120,170)">
    <polygon points="30,60 10,-10 75,35" fill="#FF6A3D" stroke="#1A1A1A" stroke-width="7" stroke-linejoin="round"/>
    <polygon points="210,60 230,-10 165,35" fill="#FF6A3D" stroke="#1A1A1A" stroke-width="7" stroke-linejoin="round"/>
    <ellipse cx="120" cy="140" rx="115" ry="105" fill="#FF6A3D" stroke="#1A1A1A" stroke-width="7"/>
    <ellipse cx="120" cy="185" rx="70" ry="52" fill="#FFF7F2"/>
    <circle cx="78" cy="120" r="12" fill="#1A1A1A"/>
    <circle cx="162" cy="120" r="12" fill="#1A1A1A"/>
    <ellipse cx="120" cy="168" rx="14" ry="10" fill="#1A1A1A"/>
    <path d="M96 200 q24 18 48 0" stroke="#1A1A1A" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>
  <text x="480" y="270" font-family="Segoe UI, Noto Sans TC, sans-serif" font-size="76" font-weight="800" fill="#1A1A1A">VocabApp 字彙學習</text>
  <text x="480" y="350" font-family="Segoe UI, Noto Sans TC, sans-serif" font-size="40" fill="#555555">TOEIC 單字，用科學排程背起來</text>
  <text x="480" y="470" font-family="Segoe UI, Noto Sans TC, sans-serif" font-size="34" font-weight="700" fill="#FF6A3D">0stack.org・免費・離線可用</text>
</svg>
```

建立 `scripts/gen-og.mjs`（跟隨 `gen-icons.mjs` 模式）：

```js
/**
 * gen-og.mjs — rasterize public/og-source.svg into public/og.png (1200x630 OG image).
 * 一次性產圖：npm i --no-save sharp && node scripts/gen-og.mjs
 * sharp 只在產圖時需要，不是 runtime/deploy 依賴。
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/og-source.svg'))
await sharp(svg, { density: 192 }).resize(1200, 630).png().toFile(join(root, 'public/og.png'))
console.log('wrote public/og.png 1200x630')
```

Run:

```bash
npm i --no-save sharp
node scripts/gen-og.mjs
```

Expected: `wrote public/og.png 1200x630`。用系統圖片檢視器打開 `public/og.png` 目視確認（狐狸 + 文字沒有跑版、中文有正常渲染——中文若變豆腐字，把 `font-family` 改成機器上有的中文字型再重產）。

- [ ] **Step 7: 全面驗證 + commit**

Run: `npm test` — Expected: 全綠。
Run: `npm run build` — Expected: 成功，路由清單出現 `/robots.txt`、`/sitemap.xml`。
Run: `npm run dev`，開 `http://localhost:3000/sitemap.xml` 與 `/robots.txt`。
Expected: sitemap 有首頁 + 全部單字頁；robots 指向 sitemap。

```bash
git add lib/seo app/robots.ts app/sitemap.ts app/layout.tsx public/og-source.svg public/og.png scripts/gen-og.mjs
git commit -m "feat(seo): robots, sitemap with all word pages, OG metadata + static OG image"
```

---

### Task 5: 分享卡文案純函式

**Files:**
- Create: `components/share-card/card-data.ts`
- Create: `components/share-card/__tests__/card-data.test.ts`

**Interfaces:**
- Consumes: 無（純函式）
- Produces:
  - `interface ShareCardStats { streak: number; level: number; badgeCount: number; goalMet: boolean; dateLabel: string }`
  - `interface ShareCardContent { headline: string; lines: { label: string; value: string }[]; footer: string; dateLabel: string }`
  - `buildShareCardContent(s: ShareCardStats): ShareCardContent`

- [ ] **Step 1: 寫失敗測試 `components/share-card/__tests__/card-data.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildShareCardContent } from '@/components/share-card/card-data'

const base = { streak: 12, level: 5, badgeCount: 8, goalMet: true, dateLabel: '2026年7月16日' }

describe('buildShareCardContent', () => {
  it('組出標題、三行數據與 footer', () => {
    const c = buildShareCardContent(base)
    expect(c.headline).toBe('我在 VocabApp 連續達標 12 天！')
    expect(c.lines).toEqual([
      { label: '🔥 連續達標', value: '12 天' },
      { label: '⭐ 等級', value: 'Lv.5' },
      { label: '🏅 徽章', value: '8 枚' },
    ])
    expect(c.footer).toBe('0stack.org・免費 TOEIC 單字 App')
    expect(c.dateLabel).toBe('2026年7月16日')
  })

  it('streak 0 時標題改為今日達標語氣（避免尷尬的 0 天）', () => {
    expect(buildShareCardContent({ ...base, streak: 0 }).headline).toBe('我今天在 VocabApp 完成單字複習！')
  })

  it('goalMet false 時標題為進行中語氣', () => {
    expect(buildShareCardContent({ ...base, goalMet: false }).headline).toBe('我正在 VocabApp 累積連續 12 天！')
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `npx vitest run components/share-card/__tests__/card-data.test.ts`
Expected: FAIL — `Cannot find module '@/components/share-card/card-data'`

- [ ] **Step 3: 實作 `components/share-card/card-data.ts`**

```ts
// 分享卡「資料 → 文案」純函式。canvas 繪製（draw-card.ts）只吃這裡的輸出，文案邏輯集中可測。
export interface ShareCardStats {
  streak: number
  level: number
  badgeCount: number
  goalMet: boolean
  dateLabel: string
}

export interface ShareCardContent {
  headline: string
  lines: { label: string; value: string }[]
  footer: string
  dateLabel: string
}

export function buildShareCardContent(s: ShareCardStats): ShareCardContent {
  const headline = s.goalMet
    ? s.streak > 0
      ? `我在 VocabApp 連續達標 ${s.streak} 天！`
      : '我今天在 VocabApp 完成單字複習！'
    : `我正在 VocabApp 累積連續 ${s.streak} 天！`
  return {
    headline,
    lines: [
      { label: '🔥 連續達標', value: `${s.streak} 天` },
      { label: '⭐ 等級', value: `Lv.${s.level}` },
      { label: '🏅 徽章', value: `${s.badgeCount} 枚` },
    ],
    footer: '0stack.org・免費 TOEIC 單字 App',
    dateLabel: s.dateLabel,
  }
}
```

- [ ] **Step 4: 跑測試確認 pass + commit**

Run: `npx vitest run components/share-card/__tests__/card-data.test.ts` — Expected: PASS

```bash
git add components/share-card
git commit -m "feat(share): share card content builder (pure, tested)"
```

---

### Task 6: 分享卡 canvas 繪製 + 分享按鈕 + 入口

**Files:**
- Create: `components/share-card/draw-card.ts`
- Create: `components/share-card/share-button.tsx`
- Modify: `app/stats/page.tsx`（抓資料 + 放按鈕）
- Modify: `app/page.tsx`（home 小入口連到 /stats）

**Interfaces:**
- Consumes: `buildShareCardContent`、`ShareCardStats`（Task 5）；`GamificationRepository.getContext(userId)` 與 `.listBadgeKeys(userId)`（既有）；`todayYmd`（`lib/gamification/date`，既有）；狐狸圖 `public/icon-source.svg`（既有靜態資產）
- Produces: `drawShareCard(canvas: HTMLCanvasElement, content: ShareCardContent, mascot: HTMLImageElement | null): void`、`<ShareButton stats={ShareCardStats} />`（client 元件）

- [ ] **Step 1: 實作 `components/share-card/draw-card.ts`**

```ts
import type { ShareCardContent } from './card-data'

// 1080x1350（IG 直式 4:5）。純繪製：所有文案來自 content，不做任何邏輯。
export const CARD_W = 1080
export const CARD_H = 1350

const ORANGE = '#FF6A3D'
const CREAM = '#FFF7F2'
const INK = '#1A1A1A'
const GREY = '#555555'
const FONT = '"Nunito", "Noto Sans TC", sans-serif'

export function drawShareCard(canvas: HTMLCanvasElement, content: ShareCardContent, mascot: HTMLImageElement | null): void {
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = ORANGE
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 內卡
  const pad = 48
  ctx.fillStyle = CREAM
  roundRect(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 40)
  ctx.fill()

  ctx.textAlign = 'center'

  // 狐狸（icon-source.svg 為方形，等比置頂）
  if (mascot) ctx.drawImage(mascot, CARD_W / 2 - 160, 110, 320, 320)

  // 標題（過長自動縮字級）
  ctx.fillStyle = INK
  let size = 64
  ctx.font = `800 ${size}px ${FONT}`
  while (ctx.measureText(content.headline).width > CARD_W - pad * 4 && size > 36) {
    size -= 4
    ctx.font = `800 ${size}px ${FONT}`
  }
  ctx.fillText(content.headline, CARD_W / 2, 540)

  // 數據列
  let y = 680
  for (const line of content.lines) {
    ctx.font = `700 44px ${FONT}`
    ctx.fillStyle = GREY
    ctx.textAlign = 'left'
    ctx.fillText(line.label, pad + 80, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.font = `800 52px ${FONT}`
    ctx.fillText(line.value, CARD_W - pad - 80, y)
    y += 120
  }

  // 日期 + footer
  ctx.textAlign = 'center'
  ctx.fillStyle = GREY
  ctx.font = `600 36px ${FONT}`
  ctx.fillText(content.dateLabel, CARD_W / 2, 1140)
  ctx.fillStyle = ORANGE
  ctx.font = `800 44px ${FONT}`
  ctx.fillText(content.footer, CARD_W / 2, 1230)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
```

- [ ] **Step 2: 實作 `components/share-card/share-button.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { buildShareCardContent, type ShareCardStats } from './card-data'
import { drawShareCard } from './draw-card'

// 產圖 + 分享：手機走 Web Share API（LINE/IG），不支援時 fallback 下載 PNG。
// 全程前端完成，不打任何 API。
export function ShareButton({ stats }: { stats: ShareCardStats }) {
  const [busy, setBusy] = useState(false)

  async function handleShare() {
    setBusy(true)
    try {
      await document.fonts.ready // 等網頁字型就緒，避免 canvas 畫出 fallback 字型
      const mascot = await loadImage('/icon-source.svg').catch(() => null)
      const canvas = document.createElement('canvas')
      drawShareCard(canvas, buildShareCardContent(stats), mascot)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return
      const file = new File([blob], 'vocabapp-share.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'VocabApp', text: '我的 VocabApp 學習成果 🦊 0stack.org' })
          return
        } catch (err) {
          if ((err as DOMException).name === 'AbortError') return // 使用者取消，不 fallback
        }
      }
      downloadBlob(blob, 'vocabapp-share.png')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600 disabled:opacity-60"
    >
      {busy ? '產生中…' : '分享我的成績 📤'}
    </button>
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: `app/stats/page.tsx` 抓資料 + 放按鈕**

import 區加：

```tsx
import { GamificationRepository } from '@/lib/gamification/repository'
import { todayYmd } from '@/lib/gamification/date'
import { ShareButton } from '@/components/share-card/share-button'
import type { ShareCardStats } from '@/components/share-card/card-data'
```

`const d = await statsService.getDashboard(...)` 之後加：

```tsx
  // 分享卡資料：全部是後端已算好的權威數字，前端只畫圖。
  let share: ShareCardStats = { streak: 0, level: 1, badgeCount: 0, goalMet: false, dateLabel: '' }
  try {
    const repo = new GamificationRepository()
    const [{ state, timezone, dailyGoal }, badgeKeys] = await Promise.all([
      repo.getContext(user.id),
      repo.listBadgeKeys(user.id),
    ])
    const today = todayYmd(new Date(), timezone)
    share = {
      streak: state?.streak ?? 0,
      level: state?.level ?? 1,
      badgeCount: badgeKeys.length,
      goalMet: state ? state.lastReviewDate === today && state.reviewsToday >= dailyGoal : false,
      dateLabel: new Intl.DateTimeFormat('zh-TW', { dateStyle: 'long', timeZone: timezone }).format(new Date()),
    }
  } catch { /* 分享卡用預設值，不阻斷頁面 */ }
```

`</div>`（`space-y-6` 區塊結尾）前加一張卡：

```tsx
          <Card className="space-y-3 p-5">
            <h2 className="text-base font-extrabold text-neutral-900">📤 分享成果</h2>
            <p className="text-xs text-neutral-600">產生一張成績圖卡，分享到 LINE / IG / FB。</p>
            <ShareButton stats={share} />
          </Card>
```

- [ ] **Step 4: home 小入口（`app/page.tsx`）**

已登入分支的三個既有連結區（`查看排行榜`/`前往商店`/`學習數據`）中，把「學習數據」那行改為：

```tsx
        <Link href="/stats" className="text-sm font-bold text-primary-600 hover:underline">學習數據與分享 📊</Link>
```

- [ ] **Step 5: 驗證**

Run: `npm test` — Expected: 全綠。
Run: `npm run build` — Expected: 成功。
Run: `npm run dev`，登入後開 `/stats`，點「分享我的成績 📤」。
Expected: 桌機 Chrome 下載 `vocabapp-share.png`；打開圖片確認排版（狐狸、標題、三行數據、日期、footer）。

- [ ] **Step 6: Commit**

```bash
git add components/share-card app/stats/page.tsx app/page.tsx
git commit -m "feat(share): achievement share card via canvas + Web Share API on /stats"
```

---

### Task 7: 收尾驗證與部署

**Files:** 無新檔案（驗證 + push）

- [ ] **Step 1: 全面驗證**

Run: `npm test` — Expected: 全綠。
Run: `npm run lint` — Expected: 無 error。
Run: `npm run build` — Expected: 成功。

- [ ] **Step 2: Push 觸發自動部署**

```bash
git push origin master
```

Expected: GitHub Actions 綠燈（`gh run watch` 或 repo Actions 頁確認），0stack.org 更新。

- [ ] **Step 3: 線上手動驗收（使用者裝置）**

請使用者確認（依 spec「手動驗收」節）：

1. 無痕視窗開 `https://0stack.org` → 看到 landing；`/word/invoice` 免登入可看。
2. `https://0stack.org/sitemap.xml`、`/robots.txt` 正常。
3. LINE 貼 `https://0stack.org` → 出現 OG 預覽卡（狐狸圖）。
4. iPhone 登入 → `/stats` → 分享按鈕 → 分享面板出現、可傳到 LINE。
5. Google Search Console 提交 `https://0stack.org/sitemap.xml`（使用者操作，一次性）。
