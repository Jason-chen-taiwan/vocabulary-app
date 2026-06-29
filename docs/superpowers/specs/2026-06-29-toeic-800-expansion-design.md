# 多益 800 進階字擴充設計文件

- **日期**：2026-06-29
- **狀態**：待核准
- **範圍**：把現有 9 本主題書（~949 字）擴充到 **~2000 字**，新增約 1035 個「800 分級」進階字，附加在各書既有字之後。延續既有內容管線；無 schema/程式改動。

---

## 1. 目的

現有詞包（~949 字）對應 600–750 分。擴充到 ~2000 字、加入次高頻的進階商務詞彙，讓使用者能備考 **多益 800+**。沿用既有架構（內容與引擎解耦），純內容工作。

## 2. 結構

- 9 本主題書各從 ~105 擴到 **~220 字**：每本新增 **~115 個進階字**（9 × ~115 ≈ +1035），總計 **~1985 ≈ 2000**。
- 書單維持 9 本（不新增書）。
- 進階字**附加在各書 `words` 陣列既有字之後**。seed 以陣列索引設 `order`，且 `listNewWordIds` 依 `order asc` 取新卡，故核心字（order 小）會先於進階字（order 大）出現 —— 自然形成「核心 → 進階」學習進度。**無需任何程式改動。**

## 3. 選字（800 級進階字）

- **依據**：知識為本的「次高頻商務/多益詞彙」（核心 ~949 字之外、800 級常見的進階字；例如 tentative、discrepancy、streamline、contingency、liaison、defer、mitigate、remittance、appraisal、procurement 細分用語等）。非語料庫頻率排序（spec 允許的 fallback；於報告標註）。
- 小寫原形（lemma）；單一單字，無片語/連字號/縮寫。
- **去重**：每本新進階字必須
  1. 不與**該書既有字**重複；
  2. 不與**任何其他書既有字**重複（全 ~949 既有 headword）；
  3. 不與本批其他書的新字重複。
  以小寫正規化比對；`check-content` 為最終把關。

## 4. 每字內容（離線原創生成）

同既有規格（`SeedWord`）：
- `headword`、`partOfSpeech`、`definitionZh`（繁中精簡）、`examples`（1–2 句商務情境英文 + 繁中翻譯）；**不放 `phonetic`**。
- `examTags`：`["TOEIC", "<topic>", "advanced"]` —— 比既有字多一個 `"advanced"` 標記，標示 800 層，方便日後篩選/分級（既有核心字維持 `["TOEIC","<topic>"]`，不回頭改）。

**品質規則（重點）**：
- 進階字釋義要與**同書既有 ~105 字的釋義夠區別**（同書擴到 ~220 字後，MC 干擾項池變大，定義撞車風險升高）。生成時須參照該書既有定義避免語意重複；`check-content` 偵測同書 `definitionZh` 重複。
- 定義/例句正確、自然、句長 ≤ 90。

## 5. 流程（沿用既有管線）

- 每本書一個 `content/toeic-<topic>.json`（既有檔，附加）。
- **分批/平行生成**：一本書一個 subagent，先讀該書既有字（headword + definitionZh）以避免重複，產 ~115 個進階字，**附加**到該書 `words` 之後（寫檔、不 echo、不 commit）。
- **驗證**：`parseSeedBook`（每檔）+ `npm run check-content`（跨書 headword 去重、同書定義去重、例句存在、句長）。抽查品質。
- **入庫**：逐本 `npm run seed content/toeic-<topic>.json`（idempotent；~2000 字較久，分批/背景執行）。

## 6. 模組與邊界

- 純內容（`content/*.json`）+ 既有 seed 管線；core/scheduler/learning/content 程式不動。
- 無 schema 變更（`order`、book-scoping、examTags 皆已就緒）。
- `check-content`、seed 為既有工具，不改。

## 7. 測試與驗收

- `check-content` 通過（~2000 字、無重複 headword、無同書重複定義、無超長句）。
- `parseSeedBook` 對每檔通過；抽查進階字品質（釋義正確、例句自然、與既有字不撞義）。
- 既有測試全綠；`tsc` + `build` 通過（內容不影響）。
- 入庫：每本 `npm run seed` 成功；Neon 各書字數 ~220。
- 端到端：`/books` 各書顯示 ~220 字；`/learn/<topic>` 新卡先出核心、後出進階（order 正確）；較大詞庫下三題型與 MC 干擾項仍合理。

## 8. 明確排除（後續）

- 音標、AI runtime 生成、付費資料源。
- 再往上（2000+ / 其他考試）；本輪到 ~2000。
- 內容 CMS、分級篩選 UI（`advanced` 標記已預留，UI 之後再做）。

## 9. 參數（可調）

- 每本新增 ~115（區間 100–125）；總計目標 ~2000。
- 例句 1–2 句；句長 ≤ 90。
- 進階標記 `examTags` 含 `"advanced"`。
