# CLAUDE.md

字彙學習 PWA — 給 Claude 的專案準則與慣例。

完整設計見 `docs/superpowers/specs/2026-06-27-vocabulary-app-design.md`。本檔只放「如何寫這個專案的程式」的準則，不重複設計細節。

---

## 第一準則：模組化、可擴充、可維護

**能模組化就模組化，以未來可擴充性與可維護性為第一考量。** 這是凌駕一切的準則，任何取捨以它為依歸。

落實規則：

1. **內容與引擎解耦**：核心引擎（排程、複習、遊戲化）不得知道在背什麼考試。新增單字書/考試/卡片來源，只是「再餵一份資料」，核心程式不動。
2. **依介面而非實作**：跨模組溝通透過介面與型別。排程器以 `SchedulerService` 介面對外（FSRS 只是其中一種實作），上層不得直接依賴 `ts-fsrs`。
3. **遊戲化事件驅動**：學習核心只 `publish` 領域事件（`ReviewCompleted`、`SessionFinished` 等）。遊戲化各機制各自 `subscribe`，互不耦合。新增成就/機制 = 新增訂閱者，不得修改學習邏輯。
4. **規則用設定資料、不寫死**：徽章、成就、商店品項、等級曲線等以設定資料描述，不散落在程式分支裡。
5. **資料存取收斂**：一律透過 Prisma + repository 模式。業務邏輯不得散落原生 SQL 或直接拼裝查詢。
6. **小而專注**：每個檔案/模組單一職責，能回答「做什麼、怎麼用、依賴誰」。檔案變大 = 責任過多的訊號，應拆分。
7. **乾淨擴充點**：AI 匯入（下一輪）將以新增 `CardSource` 實作 + 生成管線接入。現在寫的程式不得做出會阻擋此擴充的假設。

---

## 模組邊界

服務層模組（對外只暴露介面，內部可自由改）：

`auth` · `content` · `scheduler` · `learning` · `gamification` · `leaderboard` · `stats` · `sync` · `events` · `pwa-shell`

模組間以介面與領域事件溝通，**不得**直接 import 另一模組的內部實作。

---

## 技術棧

- Next.js（App Router）+ React + TypeScript
- Tailwind CSS
- Auth.js（Email + Google）
- Postgres + Prisma（repository 模式）
- `ts-fsrs`（藏在 `scheduler` 模組後）
- PWA：Manifest + Service Worker + IndexedDB（離線複習 + 同步佇列）
- 測試：Vitest

---

## 開發紀律

- **TDD**：先寫測試再寫實作。FSRS 排程、遊戲化規則、事件訂閱、離線同步衝突都必須有測試。
- **契約測試**：模組介面以介面為界測試，確保實作可替換。
- 跟隨既有檔案的命名、註解密度與慣用寫法。
- 不做與當前目標無關的重構。

---

## 範圍提醒

- 本輪做齊：帳號同步、TOEIC 單字書、FSRS、四種遊戲化、統計、離線 PWA。
- 本輪**不做**：AI 匯入生卡、付費金流（但資料模型/權限欄位預留）。
- 遊戲化採正向設計：不抄 Duolingo 的 hearts 扣命與通知轟炸；不把核心功能鎖付費牆。
