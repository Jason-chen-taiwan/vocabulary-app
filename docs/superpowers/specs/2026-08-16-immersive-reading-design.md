# 沉浸閱讀＋篇章理解題（Part 7 訓練）設計

日期：2026-08-16
狀態：設計已核可，待寫實作計畫

## 目標

對標競品 zeroStudy 的「沉浸內容→點生字→複習」閉環，但以**文章閱讀**為載體（影片留後續）：使用者讀 TOEIC 情境短文與公有領域童話，逐字可點查詞、一鍵收進「我的生字本」接上既有 FSRS 複習；TOEIC 短文並附 3–5 題篇章理解題（主旨／細節／推論），讀完計時作答、後端判分——同一批內容直接成為 **Part 7 閱讀訓練**。

本功能是通用備考路線圖的第二塊拼圖（單字→**閱讀**→文法→聽力→模測），詳見 §11。

## 鐵則落點

- **成本鐵則**：零 runtime AI、零付費 API。詞典查詢用建置期預解析（方案 A）——每篇文章在離線管線就把「文中每個字的繁體釋義」抽好存進該篇的 glossary，runtime 不需要任何字典服務。字典來源 ECDICT（MIT 授權）＋ OpenCC 簡轉繁，皆只在建置期使用。
- **資安鐵則**：理解題**正解只存 server**，GET payload 剝掉答案欄位；對答案、給 XP 一律 server 判定，不信任前端送來的對錯。收藏生字時 server 驗證該字確實存在於該篇 glossary，防偽造亂收。已知限制：題幹與選項前端可見，無法完全防腳本化，但答案不外洩＋server 判分可擋粗暴偽造（與現有單字測驗同一水位）。
- **模組化**：核心引擎（scheduler／learning／gamification）零改動。收藏生字是 `CardSource` 擴充點的第一個實作——收進來的字就是一張普通 UserCard，FSRS、離線同步、遊戲化全走既有軌道。詞典查詢隔在 `DictionaryService` 介面後（本輪實作＝查 passage glossary；未來「自貼文章」再換更大的實作，上層不動）。

## §1 資料模型

新增兩個 model（小 migration）：

```prisma
model Passage {
  id        String   @id @default(cuid())
  slug      String   @unique
  kind      String   // "toeic" | "story"
  title     String
  titleZh   String?
  level     String?  // "L1"…（難度分級）
  topic     String?  // toeic 主題（office / travel …）；story 為 null
  source    String   // 出處與版權聲明（"self-made" / "Project Gutenberg #xxxx" …）
  wordCount Int
  content   Json     // 預解析 token 段落，見 §2
  glossary  Json     // { lemma: { zh, pos, wordId? } }，wordId = 該字已在精修字庫
  questions Json?    // [{ id, type: "main"|"detail"|"inference", stem, options[4], answer }]
                     // answer 只在 server 用；API 輸出一律剝除
  order     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model PassageResult {
  id           String   @id @default(cuid())
  userId       String
  passageId    String
  correctCount Int
  totalCount   Int
  readSeconds  Int?     // 閱讀計時（純統計顯示，不進排名）
  completedAt  DateTime @default(now())

  @@unique([userId, passageId])   // 首次完成才給獎的冪等錨點
}
```

- `content` 格式：段落陣列，每段是 token 陣列 `{ w: "ran", l: "run" }`（w=原文、l=lemma；標點與空白也是 token，`l` 省略）。前端渲染只做映射，不做任何語言處理。
- `glossary` 只含**該篇實際用到**的 lemma；`wordId` 有值代表該字在精修 1998 字庫，點擊時優先顯示精修定義與例句。
- 「我的生字本」＝一本系統 `WordBook`（`slug: "my-notebook"`、`sourceType: "notebook"`）。`Word` 列全域共用（同一個字只 upsert 一次），**個人視角由 UserCard 決定**：書本頁與字數統計對這本書只算「我有 UserCard 的字」，不顯示別人收的字。
- 已在 TOEIC 各書的字（glossary 帶 `wordId`）收藏時直接對既有 Word 建 UserCard，不在生字本重複建字。

## §2 內容管線（全部離線）

新增 `scripts/build-passage.mjs`：

```
原始文章 (content/passages-src/*.md，含 front-matter 中繼資料)
  → tokenize（保留標點/空白 token）
  → lemmatize（ECDICT exchange 變形資料：ran→run、studies→study）
  → 抽釋義（ECDICT 釋義 → OpenCC 轉繁 → 取短對譯；比對精修字庫 headword 填 wordId）
  → 驗證（見下）
  → 產出 content/passages/*.json
```

建置期驗證（缺漏直接報錯，不進 runtime）：

1. 文中每個單字 token 的 lemma 都查得到 glossary 釋義。
2. glossary 釋義遵守「短對譯」精神：以 2–6 字對譯開頭（沿用 CLAUDE.md 內容格式慣例的機器驗證規則）。
3. 每題恰 4 個選項、answer 索引在範圍內、type 合法；toeic 篇 3–5 題，story 篇可為空。
4. 同書 slug 不重複；source 欄位非空。

內容來源：

- **自製 TOEIC 短文（~30 篇）**：沿用單字書的離線 agent 生成流程，依主題（office／travel／finance…）撰寫 email、公告、廣告、雙篇對照等 TOEIC 常見文體，**刻意嵌入精修字庫的字**，並同時生成理解題。零版權問題。
- **公有領域童話（5–10 短篇或分章）**：Project Gutenberg 原文（格林、安徒生、伊索的舊譯/原文），必要時做我們自己的簡化改寫；`source` 記出處。不用現代譯本、不用迪士尼版本。

Seed：`npm run seed:passages`，upsert by slug（與單字 seed 同模式）。

## §3 閱讀器 UI

- `/read`：文章列表，依 kind／主題／難度分組，顯示字數、題數、完成狀態（✓ 與答對率）。
- `/read/[slug]`：server component 取 passage（**剝除 questions.answer**），client component 渲染：
  - 逐字可點；已收藏字與精修字庫字有淡色標記。
  - 點字 → 底部卡片：單字、lemma、發音鍵（Web Speech TTS）、釋義（精修定義優先、glossary 打底）、例句（精修字才有）、「加入生字本」鈕（已收藏顯示已收狀態）。
  - 展開文章即開始計時；文末「開始作答」鈕停止計時進入作答（story 無題則為「標記完成」）。
- 作答頁：逐題單選，全部作答後一次送出；結果頁顯示每題對錯與正解、答對率、閱讀速度（WPM＝wordCount÷閱讀秒數）。WPM 純前端統計顯示，不進排名。

## §4 點字查詞（DictionaryService）

```ts
interface DictionaryService {
  lookup(lemma: string, passage: PassagePayload): DictEntry | null
}
```

本輪唯一實作 `GlossaryDictionary`：先查 passage.glossary；有 `wordId` 再帶出精修定義與例句。介面存在的理由是未來「自貼文章」需要全字典（方案 B/C），屆時換實作、上層閱讀器不動。

## §5 收藏→複習

`POST /api/vocab/collect { passageSlug, lemma }`：

1. Auth.js `auth()` 取 session（未登入 401）。
2. 讀該 passage，驗證 lemma 在 glossary 中（不在 → 400，防偽造）。
3. glossary 帶 `wordId` → 直接 `upsert UserCard(userId, wordId)`；否則先 upsert 全域 `Word`（掛 my-notebook 書，definitionZh 用 glossary 釋義）再 upsert UserCard。
4. 冪等：重複收藏回傳既有卡，不報錯、不重複建。

收進來的卡從此與 TOEIC 卡完全同軌：出現在到期佇列、離線佇列、同步重放、遊戲化計數。核心程式零改動。

## §6 作答與判分

`POST /api/passage/submit { slug, answers: number[], readSeconds? }`：

1. Server 讀 passage.questions 逐題比對，算 correctCount。
2. `PassageResult` upsert by `(userId, passageId)`：**首次完成**才發 `PassageFinished` 領域事件；重做只更新成績顯示，不再發事件（`@@unique` 冪等錨點）。
3. 回傳每題對錯、正解索引、correctCount——正解只在此時（作答後）揭露。
4. `readSeconds` 僅存純統計；server clamp 至合理範圍（如 10–3600 秒）防髒資料。

## §7 遊戲化接點

- 新增領域事件 `PassageFinished { userId, passageId, correctCount, totalCount }`。
- 遊戲化訂閱者給小額 XP（基本完成分＋依答對率加成，數值寫在設定資料、不寫死）；不給硬幣或給極小額（經 gamification 服務層動 `coinBalance`，遵守虛擬經濟收斂）。
- 不修改任何既有訂閱者；成就（如「讀完 10 篇」）留後續，事件已備妥。

## §8 成本與版權

- Neon 儲存：~40 篇 × 每篇 content+glossary+questions 約 20–60KB JSON，總量 <3MB，遠低於免費額度。
- 零 runtime AI、零付費 API；ECDICT（MIT）與 OpenCC 只進建置腳本，不進 bundle。
- 每篇 `source` 欄位記出處；公有領域文本只取 Gutenberg 原文或自家改寫。

## §9 測試（TDD）

- **管線**：tokenize/lemmatize 正確性；「每個可點 token 都能在 glossary 解析」的完整性驗證；題目結構驗證；glossary 短對譯格式驗證。
- **collect API**：冪等；lemma 不在 glossary 被拒；精修字走既有 Word、不重複建；未登入 401。
- **submit API**：判分正確；GET passage payload 不含 answer（防洩題測試）；重複提交不重複發事件；readSeconds clamp。
- **DictionaryService 契約測試**：介面行為可替換。
- **閱讀器元件**：token 渲染、點字開卡、收藏狀態切換。
- **遊戲化**：PassageFinished 首次給 XP、重做不給。

## §10 本輪範圍

**做**：Passage/PassageResult migration、離線管線＋驗證、~30 篇 TOEIC 短文（含題）、5–10 篇公有領域童話（不含題）、`/read` 列表＋閱讀器、點字查詞、收藏→FSRS、作答判分＋閱讀計時、PassageFinished XP。

**不做（留後續）**：使用者自貼文章、YouTube/影片模式、全字典查詢（方案 B/C）、閱讀成就徽章、BYO-key AI 加值。

## §11 路線圖（通用備考 app，目標帶使用者到金色證書 860+；方向性、不綁死）

1. **本輪**：沉浸閱讀＋篇章理解題（Part 7 訓練）＋生字收藏。
2. **下一輪**：Part 5/6 文法題庫——純文字、離線生成、沿用選擇題與 server 判分基礎設施。
3. **再下一輪**：聽力 Part 1–4——TTS 播自製聽力稿＋作答（機器聲為已知取捨）。
4. **最後**：迷你模擬測驗＋分數帶診斷，串起單字／閱讀／文法／聽力四模組。
