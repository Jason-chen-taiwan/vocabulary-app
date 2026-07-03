# 數據儀表板（P5-a）設計文件

- **日期**：2026-07-04
- **狀態**：待核准
- **範圍**：個人學習數據唯讀儀表板 `/stats`——四塊：學習進度/精熟、活躍日曆+連續、正確率趨勢、到期預報。全部從既有資料（`UserCard`/`ReviewLog`/`WordBook`/`GamificationState`）聚合，不新增資料表。圖表全原創 inline SVG/CSS，零新依賴。PWA 安裝引導為獨立後續（P5-b）。

---

## 1. 目的

使用者需要「我學得如何」的全貌：精熟多少、是否維持習慣、答對率趨勢、接下來要複習什麼。首頁已有每日目標環與 streak 卡（迷你儀表板），`/stats` 提供完整回顧，強化正向回饋與黏著。

設計以 CLAUDE.md 第一準則（模組化、可擴充、可維護）為依歸：新增 `lib/stats` 唯讀模組，核心學習/遊戲化不動。

## 2. 模組與邊界

新增 `lib/stats` 服務層模組（唯讀查詢，不訂閱事件、不寫入）：

- `repository.ts`（`StatsRepository`，建構子可注入 db，預設 `getPrisma()`，比照 `lib/leaderboard/repository.ts`）：對 `UserCard`/`ReviewLog`/`WordBook` 做少量聚合查詢，回原始列。
- `aggregate.ts`：**純函式**，把原始列 bucket 成圖表資料（日期分組、正確率視窗、到期分桶、精熟%）。無 I/O，全可單元測試。
- `service.ts`（`StatsService`，注入 repo）：`getDashboard(userId, now, timezone)` 組出四塊 view model。

前端只呈現；所有聚合在 server 端算（資安鐵則：前端只 UI/UX，資料主責後端）。純個人唯讀資料、無共享狀態/排名 → 無防作弊需求，但仍以 server session（`getCurrentUser`）判定身分、只查該 userId 的資料。

## 3. 資料來源與判定規則

- **正確與否**：`ReviewLog.rating`（1-4，ts-fsrs 評級）。`rating === 1`（Again）為錯；`rating >= 2`（Hard/Good/Easy）為對。與既有 active-recall grade() 對應一致。
- **精熟**：`UserCard.mastered: boolean`。
- **卡片狀態**：`UserCard.state`（FSRS：1=Learning、2=Review、3=Relearning）。「新（未開始）」＝該書 `Word` 尚無對應 `UserCard`。`mastered` 為布林覆蓋層（獨立於 state 顯示）。
- **時區**：所有「以日為單位」的分組用使用者時區（`User.timezone`，預設 `Asia/Taipei`），沿用 `lib/gamification/date.ts` 的 `todayYmd(date, tz)` 概念；`aggregate.ts` 的分組函式接受 `timezone` 參數並回 `YYYY-MM-DD` 鍵。
- **streak**：`GamificationState.streak` / `longestStreak`（現值，不重算）。

## 4. 四塊內容

### 4.1 學習進度/精熟
- 頭條數字：已精熟卡數、已開始卡數（有 UserCard）、全庫總字數。
- 每本單字書精熟進度條（精熟數 / 該書總字數），沿用既有 `ProgressBar`。
- FSRS 狀態分佈：新（未開始）/ 學習中 / 複習中 / 精熟——小型長條或分段條。

### 4.2 活躍日曆 + 連續
- 近 ~12 週（84 天）每日複習量熱力圖：自繪格子網格（7×12），色深隨當日複習次數分級（0 / 低 / 中 / 高，用既有橙色階 token）。
- 目前 streak / 最長 streak（`GamificationState`）。

### 4.3 正確率趨勢
- 近 30 天每日答對率（該日 `rating>=2` 佔該日總複習比例）；自繪長條。**只有當日有複習才顯示該點/長條**（無複習的日不畫，避免補 0% 誤導）。
- 附「近 30 天總體答對率」頭條數字（該區間內 `rating>=2` 總數 / 總複習數），標示為近 30 天。

### 4.4 到期預報
- 未來 7 天每日到期卡數長條（`UserCard.due` 落在各日）；今日含逾期（due <= 今日結束）。
- 自繪長條，色用主色階。

## 5. 資料流與 UI

- **`/stats`**（server component）：
  1. `getCurrentUser()`；未登入 `redirect('/login')`。
  2. `StatsService.getDashboard(user.id, new Date(), tz)`（內部平行 `Promise.all` 抓四組聚合）。
  3. 傳 view model 給小型 client 圖表元件（互動極少，主要為呈現；熱力圖 hover tooltip 可選）。
- 頂部沿用 `GamificationBar`；沿用既有 UI 元件（`Card`/`ProgressBar`/`StatPill`）與設計 token。
- **入口**：首頁加 `/stats` 連結（與 `/leaderboard`、`/shop` 入口並列）。
- 圖表元件放 `components/stats/*`（或 `app/stats/*` 內），純表現，接受已算好的 view model，不自行查詢。

## 6. 純函式（`lib/stats/aggregate.ts`）與測試

純函式（皆單元測試）：
- `groupReviewsByDay(logs: {reviewedAt: Date}[], timezone): Map<string, number>` — 每日複習次數。
- `dailyAccuracy(logs: {reviewedAt: Date; rating: number}[], timezone): { day: string; correct: number; total: number }[]` — 每日對/總。
- `dueForecast(cards: {due: Date}[], now: Date, timezone, days=7): { day: string; count: number }[]` — 未來 N 天分桶（今日含逾期）。
- `masteryByBook(rows, books): { slug; name; mastered; total; pct }[]` — 每書精熟%。
- `heatmapCells(byDay: Map<string,number>, now, timezone, weeks=12): { day: string; count: number; level: 0|1|2|3 }[]` — 熱力圖格子（含 level 分級門檻，門檻為可調常數）。

repository 查詢形狀（mock db 測試）：
- `listReviewLogsSince(userId, since): {reviewedAt, rating}[]`（近 ~12 週，供活躍+正確率）。
- `listUserCardStates(userId): {state, mastered, due}[]`（供狀態分佈+到期預報）。
- `masteryCountsByBook(userId): ...` + `listBooksWithWordCounts()`（供每書精熟%）。

service 組裝（注入 mock repo 測試）：`getDashboard` 回 `{ progress, activity, accuracy, dueForecast }` 各 view model。

既有測試全綠；`tsc`+`build` 通過；`/stats` 路由生成。

## 7. 成本

- on-demand 查詢、無 cron、無 runtime AI、無新付費服務、**無新依賴**（圖表全自繪）。
- 沿用 `getCurrentUser` React `cache()`；四組查詢平行化。單使用者資料量小；殘餘冷啟動延遲是 Neon 免費層特性（已知，非本輪範圍）。

## 8. 明確排除（YAGNI / 後續）

- XP-over-time 曲線（未存歷史 XP 快照；需另建 snapshot 表——遞延）。
- 匯出 CSV/PDF、跨使用者比較（排行榜的事）、AI 洞察/建議。
- 深色模式。
- PWA 安裝引導（獨立 P5-b spec）。

## 9. 參數（可調）

- 熱力圖範圍 12 週、正確率趨勢 30 天、到期預報 7 天。
- 熱力圖 level 門檻（0 / 1-2 / 3-5 / 6+ 之類，實作時定為 `aggregate.ts` 常數）。
- 路由 `/stats`。
