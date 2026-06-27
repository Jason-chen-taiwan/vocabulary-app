# 字彙學習 PWA — 設計文件

- **日期**：2026-06-27
- **狀態**：已核准，待撰寫實作計畫
- **目標族群**：華人學英文，考試導向

---

## 1. 產品定位與範圍

一個可安裝到手機的 PWA 字彙學習 app，服務華人、考試導向的英文學習者。以科學的間隔重複（FSRS）為核心，搭配考綱對齊的內建單字書與完整的遊戲化機制，提供「比 Quizlet/Duolingo 更聰明」的記憶效率與「app 級」的離線體驗。

**首發內容**：多益 TOEIC 分級單字書。

**範圍（一次做齊，不走 MVP 漸進）**：
- 帳號與跨裝置同步
- TOEIC 單字書（分級/主題），多單字書架構
- 單字詳情（釋義、多例句、TTS 發音）
- FSRS 排程引擎（可調目標記憶率）
- 每日複習佇列、多模式複習（辨識/回想/聽辨）
- 離線複習 + 同步佇列
- 完整遊戲化四機制：Streak+每日目標、XP/等級/徽章、虛擬幣+獎勵商店、排行榜/聯賽社交
- 統計儀表板（保留率、複習熱力圖、預估完成日）
- 預留 free/premium 權限欄位（暫不啟用付費）

**明確排除（下一輪）**：
- AI 匯入文章/PDF 自動生卡（架構預留乾淨擴充點，本輪不實作）
- 付費金流

---

## 2. 設計原則（貫穿全案）

**能模組化就模組化，以未來可擴充性與可維護性為第一考量。** 具體落實：

1. **內容與引擎徹底解耦**：單字書內容只是「一份資料」，FSRS 引擎、複習迴圈、遊戲化完全不知道在背什麼考試。新增雅思/托福或 AI 匯入的卡，等於「再餵一份內容」，核心不變。
2. **排程引擎抽象成介面**：定義 `SchedulerService` 介面（輸入複習評分 → 輸出下次到期日/狀態）。目前以 FSRS 實作，未來換演算法或 A/B 測試只換實作。
3. **遊戲化事件驅動、獨立可插拔**：學習核心只發出領域事件（`ReviewCompleted`、`SessionFinished` 等）；遊戲化各機制各自訂閱、互不耦合。新增成就 = 新增訂閱者，不碰學習邏輯。徽章/成就規則以「設定資料」描述，不寫死。
4. **每個模組自帶清楚邊界**：每個模組都能回答「做什麼、怎麼用、依賴誰」，對外只暴露介面，內部可自由改。
5. **AI 匯入預留乾淨擴充點**：因「卡片來源」已抽象，未來新增 `CardSource` 實作 + 生成管線即可插入，不破壞既有功能。
6. **資料存取收斂**：透過 Prisma + repository 模式集中，業務邏輯不直接散落 SQL。
7. **小而專注的單元**：檔案聚焦、可獨立測試；檔案過大視為「責任過多」的訊號。

---

## 3. 技術選型

| 層 | 選擇 |
|---|---|
| 前端/全端框架 | Next.js（App Router）+ React + TypeScript |
| 樣式 | Tailwind CSS |
| 後端 | Next.js Server Actions / Route Handlers |
| 認證 | Auth.js（**純 Google OAuth**，無 Email/密碼，零維護零成本） |
| 資料庫 | **Neon Postgres**（免費起步，serverless driver 適配 Cloudflare Workers） |
| ORM | Prisma（搭配 Neon serverless adapter） |
| 排程演算法 | `ts-fsrs`（開源 FSRS 套件） |
| TTS 發音 | 瀏覽器 Web Speech API（`SpeechSynthesis`，零成本） |
| 部署 | **Cloudflare**（Pages/Workers + OpenNext 適配 Next.js） |
| PWA | Web App Manifest + Service Worker + IndexedDB |
| 測試 | Vitest（單元/整合），採 TDD |

### 成本原則（重要）

全棧以「免費或固定低月費、**無超量自動爆帳單**」為鐵則。避開用量計費型服務（如 Vercel 超量計費）。所有外部依賴的超量行為必須是「限流/暫停」而非「自動扣款」。

- 部署用 Cloudflare（價格可預測，避開 Vercel 超量風險）
- DB 用 Neon 固定方案制（免費額度用完是限流，不偷扣款）
- TTS 用瀏覽器內建，零邊際成本
- TOEIC 詞表與例句用 Claude **一次性離線生成 + 人工校對**，存靜態資料 → 零 API 邊際成本（不在 runtime 呼叫 AI）

### Cloudflare Workers / edge 注意事項

部署環境為 edge，資料庫連線須用 **Neon serverless driver（HTTP）** 搭配對應的 Prisma adapter，不可用傳統 TCP 連線池。此限制影響 `repository` 層實作方式，須在資料存取模組統一處理。

---

## 4. 系統架構

```
┌─────────────────────────────────────────────┐
│  PWA 前端 (Next.js App Router + React)        │
│  - Service Worker（離線複習、快取單字資料）   │
│  - IndexedDB（離線佇列：待同步的複習紀錄）    │
│  - Web App Manifest（加到主畫面、全螢幕）     │
└────────────────┬────────────────────────────┘
                 │ Server Actions / Route Handlers
┌────────────────▼────────────────────────────┐
│  Next.js 後端（模組化服務層）                 │
│  auth · content · scheduler · learning ·      │
│  gamification · leaderboard · stats · sync    │
└────────────────┬────────────────────────────┘
                 │ Prisma ORM（repository 模式）
┌────────────────▼────────────────────────────┐
│  Postgres                                     │
└──────────────────────────────────────────────┘
```

**離線優先策略**：複習所需的單字與排程資料快取在本地；複習結果先寫入 IndexedDB 佇列，恢復連線時批次同步到後端，並處理衝突（以 server 為準的合併策略）。

---

## 5. 模組切分與邊界

| 模組 | 職責 | 對外介面（概念） | 依賴 |
|---|---|---|---|
| `auth` | 帳號、Session、tier | `getCurrentUser()`、Session | Auth.js, db |
| `content` | 單字書、單字、例句、卡片來源抽象 | `getWordBook()`、`CardSource` | db |
| `scheduler` | FSRS 排程，抽象介面 | `SchedulerService.review()`、`getDue()` | ts-fsrs |
| `learning` | 複習迴圈、佇列、多模式出題、發領域事件 | `buildSession()`、`submitReview()` | content, scheduler, events |
| `gamification` | streak/XP/等級/徽章/虛擬幣，訂閱事件 | event handlers、`getState()` | events, db |
| `leaderboard` | 週期排行榜/聯賽 | `getLeaderboard()` | db |
| `stats` | 統計、保留率、熱力圖、預估 | `getStats()` | db |
| `sync` | 離線佇列同步與衝突處理 | `pushQueue()`、`pull()` | db, learning |
| `events` | 領域事件匯流排 | `publish()`、`subscribe()` | — |
| `pwa-shell` | manifest、service worker、安裝引導 | — | — |

模組間以介面與領域事件溝通，避免直接相依內部實作。

---

## 6. 資料模型（核心表）

- **User** — 帳號、`tier`（free/premium，預留）、`dailyGoal`、`timezone`
- **WordBook** — 單字書（TOEIC 首發），分級/主題、`sourceType`（預留 builtin/ai）
- **Word** — 單字、音標、TTS 來源、釋義、詞性、考試標籤
- **Example** — 例句（一字多句）、翻譯、來源
- **UserCard** — 使用者×單字學習狀態，存 FSRS 參數：`difficulty`、`stability`、`due`、`state`、`lastReview`
- **ReviewLog** — 每次複習（評分、用時、複習前後狀態），供 FSRS 重算與分析
- **GamificationState** — `streak`、`lastActiveDate`、`xp`、`level`、`coinBalance`
- **Badge / UserBadge** — 徽章定義（以設定資料描述規則）與解鎖紀錄
- **ShopItem / UserInventory** — 商店品項（主題/外觀）與擁有紀錄
- **LeaderboardEntry** — 週期排行榜（依 XP，可分聯賽組）

---

## 7. 功能模組細節

### 7.1 核心學習迴圈
- 每日「待複習」佇列 = FSRS 到期卡 + 新卡每日配額
- 多模式複習：① 看英選中（辨識）② 看中拼英/選英（回想）③ 聽音辨義
- 每張卡 4 級評分（Again/Hard/Good/Easy）→ scheduler 更新排程
- 例句語境呈現 + TTS 發音

### 7.2 FSRS 排程引擎
- 以 `ts-fsrs` 實作 `SchedulerService` 介面
- 使用者可調「目標記憶率」（預設 90%）——對外主要可信賣點

### 7.3 內容/單字書
- TOEIC 單字書分級（入門/進階）、主題分類
- 單字詳情頁：釋義、多例句、發音、加入學習

### 7.4 遊戲化（事件驅動）
- **Streak + 每日目標**：含補救機制，不採懲罰性設計（不抄 Duolingo hearts/通知轟炸）
- **XP/等級/徽章**：里程碑式，規則以設定資料描述
- **虛擬幣 + 商店**：學習賺幣，解鎖主題/外觀（正向獎勵，不鎖核心功能）
- **排行榜/聯賽**：依 XP 分組週期競賽

### 7.5 帳號與同步
- Auth.js（Email + Google）
- 跨裝置同步學習進度，整合離線佇列

### 7.6 統計儀表板
- 已學/掌握字數、保留率、複習熱力圖、預估完成日

---

## 8. PWA 重點

- Manifest + Service Worker → 可加到主畫面、離線複習
- **iOS 推播限制**：iOS 16.4+ 才支援、須先加到主畫面、權限需點擊觸發。對策：onboarding 引導「加到主畫面 + 開啟提醒」，並以 Email 提醒作後援通道

---

## 9. 建置順序（全部在範圍內，依相依關係分批）

1. **基礎層**：帳號/Auth.js、Postgres+Prisma 資料模型、PWA 殼層
2. **內容層**：TOEIC 單字書匯入、單字詳情、卡片來源抽象
3. **學習核心**：FSRS 引擎、複習佇列、多模式複習、離線同步
4. **遊戲化**：事件匯流排 → streak/XP/徽章 → 虛擬幣商店 → 排行榜社交
5. **數據層**：統計儀表板
6. **打磨**：PWA 安裝引導、提醒、離線體驗

---

## 10. 測試策略

- **TDD**：先寫測試再實作
- FSRS 排程邏輯：單元測試（正確性核心）
- 遊戲化規則（streak 斷掉/補救、升等、發幣、徽章解鎖）：單元測試
- 領域事件訂閱：單元測試（確保解耦正確）
- 離線同步衝突：整合測試
- 模組介面：以介面為界做契約測試，確保可獨立替換

---

## 11. 風險與緩解

| 風險 | 緩解 |
|---|---|
| iOS PWA 推播限制 | onboarding 引導安裝 + Email 提醒後援 |
| TOEIC 單字內容來源/版權 | 使用自編或開放授權詞表，例句自製 |
| 離線同步衝突 | server 為準的合併策略 + ReviewLog 可重算 |
| 遊戲化淪為「假流利」 | 進度以真實保留率呈現，非純數字堆疊 |
