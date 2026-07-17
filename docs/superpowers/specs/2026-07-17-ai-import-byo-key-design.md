# AI 匯入生卡（BYO Key）設計

日期：2026-07-17
狀態：設計已核可，待寫實作計畫

## 目標

讓使用者貼上一串單字，由 AI 自動補音標／詞性／中文釋義／例句，生成一本**私人單字書**，接入既有 FSRS 排程與遊戲化。核心引擎零改動——匯入只是「多餵一份 `SeedBook`」。

## 鐵則落點

- **成本鐵則（不在 runtime 呼叫 AI、無超量自動爆帳單）**：AI 呼叫全在**瀏覽器直呼 `api.anthropic.com`**，走**使用者自己的 API key（BYO）**與額度。我方伺服器從不呼叫付費 AI，零邊際成本、零帳單風險。
- **資安鐵則（前端只呈現、後端權威）**：AI 產出視為**不可信輸入**。`/api/import` 以 `parseSeedBook` 驗證＋消毒後才落地；owner 綁 server session（Auth.js `auth()`），**不信任前端宣稱的 ownerId**。
- **模組化**：新增集中在 `lib/content`（生成管線）＋ `/api/import` 路由，複用既有 seed 管線與 repository。核心（scheduler／gamification）不動。

## §1 資料模型

現況：`WordBook.sourceType` 已預留（default `"builtin"`），但缺 owner 欄位，且 `slug` 全域 `@unique`。

改動（小 migration）：

```prisma
model WordBook {
  ...
  sourceType  String   @default("builtin")   // 匯入書用 "user-import"
  ownerId     String?                        // 新增：builtin=null；匯入=使用者 id
  owner       User?    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  ...
  @@unique([ownerId, slug])                  // 取代全域 slug @unique
}
```

規則：
- `ownerId = null` → builtin 公用書（現有全部）。
- `ownerId = <uid>` → 私人匯入書，只 owner 可見。
- 查詢：list books = `ownerId IS NULL OR ownerId = session.uid`。
- slug 唯一性改為 `[ownerId, slug]`，兩使用者各自匯入 `gre-500` 不衝突。

`Word` / `Example` 不動——匯入書一樣掛 `WordBook` 下，複用既有 seed 管線。

## §2 匯入流程 + 畫面

單頁 `/import`，三步狀態機（不換路由）。

**Step 1 — 設定**
- 欄位：Anthropic API Key（`sk-ant-…`，🔒，說明「只存你瀏覽器 localStorage，永不上傳，用完可清除」）；書名；貼單字文字區（一行一個／逗號分隔），顯示字數。
- 鈕：`生成卡片 →`。

**Step 2 — 生成**
- 前端切 batch（每批 ~20 字）呼 `api.anthropic.com`，帶 `anthropic-dangerous-direct-browser-access` header，key 由使用者提供。
- 逐批進度顯示（`生成中… 8/12`）。單字失敗可重試該字，不整批爆。
- 產出對齊 `SeedWord`（headword / phonetic / partOfSpeech / definitionZh / examples[]）。

**Step 3 — 預覽可編輯 → 存檔**
- 卡片列出：headword、音標、詞性、中文釋義、例句（英＋中）；每張可「編輯／刪除」。
- 鈕：`← 重生`、`存成我的單字書`。
- 存檔 → `POST /api/import`，body = 完整 `SeedBook`（**不含 key**）→ 成功導向 `/books/<slug>`，可直接進 `/learn`。

**入口**：`/books` 加「+ 匯入單字書」鈕。

## §3 模組拆解 + 測試

新增／改動：

```
lib/content/
  generation/
    prompt.ts          buildGenPrompt(headwords) → Anthropic messages payload
    client.ts          generateCards(key, words, onProgress) → SeedWord[]
                       （瀏覽器 fetch；batch；逐字重試；進度 callback）
    __tests__/prompt.test.ts
  repository.ts        + createUserBook(ownerId, seed)
                       + listBooksFor(ownerId)  // ownerId IS NULL OR = uid
  card-source.ts       MVP 直接複用 book 讀取，不新增 UserImportedSource（跳過）

app/import/
  page.tsx             三步狀態機（client component）

app/api/import/route.ts   POST：auth() → parseSeedBook(body) → createUserBook → { slug }
                          （key 永不進此路由）

prisma/schema.prisma      §1 migration：ownerId + @@unique([ownerId, slug])
app/books/page.tsx        + 匯入入口鈕；改用 listBooksFor(uid)
```

**API key 存放**：純 client `localStorage`，僅 `generation/client.ts` 讀。永不進 server、git、POST body。

**測試（TDD）**

| 測什麼 | 檔 |
|---|---|
| prompt 含所有 headword ＋輸出 schema 指示 | `generation/__tests__/prompt.test.ts` |
| `parseSeedBook` 擋壞 AI 輸出（缺 example、空 headword） | 既有 seed-schema 測試擴充 |
| `createUserBook` 綁對 ownerId、slug 衝突處理 | `content/__tests__/repository.test.ts` |
| `listBooksFor` 只回 builtin ＋ 自己的書 | 同上 |
| `/api/import` 未登入拒、忽略前端送的 ownerId | route 測試 |

`generateCards` 把「batch 切分＋逐字重試＋進度 callback」抽成可測純函式，AI fetch 注入以便測試。

## 明確跳過（YAGNI）

- 檔案上傳／OCR（先只貼文字）。
- 匯入書分享給他人（先私人）。
- `UserImportedSource` class（直接複用 book 讀取）。
- server 端 AI fallback（違成本鐵則，不做）。

## 已知限制（誠實記錄）

- 使用者需自備 Anthropic API key，有門檻；但這是守住零帳單風險的必要取捨。
- AI 產出品質依使用者 key 對應模型而定；預覽可編輯以補救。
- key 存 localStorage 有 XSS 風險面；不上傳伺服器已將風險限縮在使用者自身瀏覽器。
