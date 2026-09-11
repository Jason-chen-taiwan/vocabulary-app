# CLAUDE.md

雅思／多益單字學習 PWA — 給 Claude 的專案準則與慣例。

**這是一個純靜態、單人使用的個人工具。** 沒有帳號、沒有後端、沒有資料庫。
整個 app build 成靜態檔案部署到 Cloudflare Pages，學習進度存在使用者自己的瀏覽器。

---

## 第一準則：模組化、可擴充、可維護

**能模組化就模組化，以未來可擴充性與可維護性為第一考量。**

落實規則：

1. **內容與引擎解耦**：核心引擎（排程、複習）不得知道在背什麼考試。新增單字書/考試，只是「在 `content/` 再放一份 JSON 並登記到 `lib/content/static.ts`」，核心程式不動。
2. **依介面而非實作**：排程器以 `SchedulerService` 介面對外（FSRS 只是其中一種實作），上層不得直接依賴 `ts-fsrs`。
3. **規則用設定資料、不寫死**：等級曲線、每日題數等以設定資料描述（`lib/progress/config.ts`），不散落在程式分支裡。
4. **小而專注**：每個檔案單一職責。檔案變大 = 責任過多的訊號，應拆分。
5. **進度存取收斂**：所有 localStorage 讀寫一律經過 `lib/progress/store.ts`，業務他處不得自己碰 `localStorage`。

---

## 架構

```
content/*.json          單字資料（唯一的內容來源）
lib/content/static.ts   載入 JSON、建索引、產生穩定 wordId
lib/learning/           純邏輯：出題、判定、FSRS 排程（無 I/O）
lib/progress/store.ts   進度讀寫（localStorage）＋ 佇列組成
app/*                   頁面；需要進度的一律是 client component
```

**單字 id 是 `<bookSlug>:<headword>`**，內容衍生而非陣列索引——進度存在本機，id 必須跨 build 穩定，否則使用者的複習紀錄會全部對不上。修改 JSON 時可以改釋義、例句，但**改 headword 或 slug 等同於讓那張卡的進度歸零**。

## 技術棧

- Next.js（App Router，`output: 'export'`）+ React + TypeScript
- Tailwind CSS
- `ts-fsrs`（藏在 `lib/learning/scheduler.ts` 後）
- TTS：瀏覽器 Web Speech API（不呼叫付費 TTS）
- 部署：Cloudflare Pages（純靜態，`npm run build` → `out/`）
- PWA：Manifest + Service Worker（離線可用）
- 測試：Vitest

## 成本鐵則

- 零 runtime 成本：沒有伺服器、沒有資料庫、沒有 API 呼叫。
- **不在 runtime 呼叫 AI**：詞表與例句一次性離線生成後存靜態 JSON。

---

## 資安與正確性

- 這是單人工具，**沒有共享狀態、沒有排名，因此不存在「防作弊」問題**；對錯在前端判定即可（使用者作弊只是騙自己）。
- 進度只存在本機 localStorage。**這是唯一一份資料**，所以統計頁必須一直保留匯出／匯入備份功能。
- 讀取 localStorage 一律要能承受「不存在／格式壞掉／配額滿」三種情況，壞了就當作空進度，不可讓頁面整個爆掉。
- 需要進度的元件用 `lib/progress/use-progress.ts`（`useSyncExternalStore`），不要在 `useEffect` 裡 `setState`——會觸發 lint 錯誤也會多一次 render。

---

## 開發紀律

- **TDD**：先寫測試再寫實作。FSRS 排程、進度存取、連續天數計算都必須有測試。
- 跟隨既有檔案的命名、註解密度與慣用寫法。
- 不做與當前目標無關的重構。
- 改完 `content/` 一定要跑 `npm run check-content`（檢查重複字、缺例句、句子過長）。
- 重複字檢查以「同一考試內」為範圍：同一個字同時出現在雅思與多益是正常的。

## 範圍提醒

- 本輪做齊：雅思 AWL 570 字、多益既有 1998 字、FSRS 排程、統計、離線 PWA、進度備份。
- 本輪**不做**：帳號、跨裝置同步、排行榜、商店/虛擬經濟、AI 匯入生卡。
