# 多益核心詞包設計文件

- **日期**：2026-06-28
- **狀態**：待核准
- **範圍**：把詞庫從 12 字擴充為 **~1000 字的多益核心詞包**，分成多本主題書；並順手修好複習佇列的單字書範圍。內容為**離線一次性生成的靜態資料**，runtime 零成本。

---

## 1. 目的

目前只有 12 個單字，導致已建好的學習引擎與遊戲化（每日目標 20、streak、精熟、徽章、三種題型）幾乎無法真正體驗。本設計提供有份量、可信、考試導向的內容，讓整個 app 真正可用。架構本已預留「再餵一份資料、核心不動」，故為純內容工作 + 一處小型 learning 修正。

## 2. 範圍與結構

- 目標 **~1000 字**，分成 **8–10 本主題書**，每本約 100–130 字。可隨時新增書擴充。
- 主題（暫定，可調）：辦公室與溝通、會議與簡報、人事與招聘、財務與會計、合約與法務、行銷與業務、物流與採購、旅遊與接待、製造與品管、科技與 IT。
- 每本書是一個獨立 `WordBook`（既有模型），`slug` 形如 `toeic-office`、`toeic-finance` …；`level: "TOEIC"`；`examTags` 含 `"TOEIC"` 與主題標籤。

## 3. 選字（依權威頻率詞表）

- **依據**：公開免費、商業/多益導向的頻率詞表——**TOEIC Service List（TSL，~1.2k）** 或 **NGSL + BSL（Business Service List）**——作為 headword 選取骨幹（覆蓋有依據、與多益吻合）。
- **取得方式**：實作時上網（WebFetch/WebSearch）取得清單 headword；**若無法取得乾淨來源**，退而以「對這些清單與多益商務領域的知識」產出等價 headword 清單，並在 spec/PR 誠實標註實際來源。
- **授權**：只用「字表（headword 選取）」，不抄任何字典的定義/例句；中譯與例句一律原創生成。NGSL/BSL 為 CC 授權，使用詞表選字並標註來源即可。
- **去重**：所有書跨書 headword 不重複（以小寫正規化比對）。

## 4. 每個字的內容（離線原創生成）

每筆 `SeedWord`（沿用既有 `lib/content/seed-schema.ts`）：
- `headword`：來自選字清單（小寫、原形）。
- `partOfSpeech`：詞性（`n.`/`v.`/`adj.`/`adv.` 等；多詞性以 `/` 連接）。
- `definitionZh`：繁體中文定義，精簡、口語、貼近商務語意。
- `examples`：**1–2 句**，每句商務情境英文 + 繁中翻譯（`sentence` + `translationZh`），例句須自然且用到該字的商務常見用法。
- `phonetic`：**省略**（發音由 Web Speech TTS 即時念出）。
- `examTags`：`["TOEIC", "<主題>"]`。

**品質規則（重要）**：
- 同一本書內各字的 `definitionZh` 要**夠區別**——因為選擇題干擾項取自同書其他字的中文定義，定義太相近會讓 MC 出現多個合理答案。
- 定義與例句正確、無明顯錯字；例句長度適中（適合手機顯示）。

## 5. 生成 / 校對 / 入庫流程

- 每本書一個檔：`content/toeic-<topic>.json`（符合 `SeedBook` 格式）。
- **分批生成**：一次處理一本書（~100–130 字），不一次倒上千條未校對的資料。
- **驗證**：
  - 現有 `parseSeedBook` 結構驗證。
  - 新增一支檢查腳本 `scripts/check-content.mjs`（純 Node，零 runtime 依賴）：跨檔 headword 去重、同書 `definitionZh` 重複偵測、每字至少一例句、基本長度健檢。輸出問題清單。
- **抽查**：人工/我抽樣檢查每本書數筆品質。
- **入庫**：逐本 `npm run seed content/toeic-<topic>.json`（idempotent，按 slug + headword upsert，可安全重跑/修正後重跑）。

## 6. 程式修正（learning 模組，TDD）

複習到期佇列目前**未依單字書**（已知問題）。本輪修正：
- `LearningRepository.listDueCards(userId, now, limit, wordBookId)`：`where` 加上 `word: { wordBookId }`（Prisma 關聯過濾），只回該書到期卡。
- `buildSession` 與 `app/learn/[slug]/page.tsx`：把 `wordBookId` 傳入 `listDueCards`。
- `listMasteredWordIds`（抽考池來源）同樣加上 `wordBookId` 選用篩選，使抽考限於該書。
- 單元測試更新/新增：驗證 `listDueCards`/抽考查詢帶 `wordBookId`。
- 維持單筆寫入、無交易（Neon HTTP 規範不變）。

## 7. 模組與邊界

- 內容只是 `content/*.json` 靜態資料 + 既有 `seed` 管線（content/scheduler/learning 核心不動，符合「內容與引擎解耦」準則）。
- 唯一程式改動在 `learning` 的查詢層（範圍篩選），對外介面相容（新增選用參數）。
- `check-content.mjs` 為獨立開發期工具，不進 runtime。

## 8. 測試與驗收

- 內容：`scripts/check-content.mjs` 通過（無重複/缺例句）；`parseSeedBook` 對每檔通過；抽查品質。
- 程式：`listDueCards`/抽考的 book-scoping 單元測試通過；既有測試全綠；`tsc` + `npm run build` 通過。
- 入庫：每本書 `npm run seed` 成功；Neon 出現對應 WordBook 與字數。
- 端到端：`/books` 看到多本主題書，各自有進度；`/learn/<topic>` 的複習只出現該書的字（驗證 book-scoping）；三種題型在較大詞庫下運作；可累積到每日目標/streak。

## 9. 明確排除（後續）

- 音標、AI runtime 生成、付費資料源。
- ~1500–2000 完整包（本輪 ~1000，之後可加書擴充）。
- 其他語言、其他考試（TOEFL/IELTS 等）——架構支援，未來再餵資料。
- 內容的線上管理後台（CMS）；本輪以 JSON + seed 管理。

## 10. 參數（可調）

- 總量 ~1000；每本 100–130；書數 8–10；每字例句 1–2。
- 主題分類見 §2（可增刪）。
