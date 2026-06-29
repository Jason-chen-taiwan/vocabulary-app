# 排行榜（P4c）設計文件

- **日期**：2026-06-29
- **狀態**：待核准
- **範圍**：每週 XP 榜 + 全時 XP 總榜（分頁籤）、暱稱 + opt-in 隱私、**後端權威判定答案**（防作弊）。好友/聯賽分組/社交動態為後續。

---

## 1. 目的

加入正向競爭以提升黏著度：使用者比較「本週 XP」與「累計 XP」名次。因為是競技排名，**XP 必須可信** —— 答案正確與否改為後端權威判定（前端送的值不可信任）。

## 2. 安全：後端權威判定（先決，最重要）

目前 `correct` 由前端計算後送出，可偽造。改為：
- `submitAnswerAction(wordId: string, questionType: 'mc'|'cloze'|'typing', userAnswer: string)`：server 載入該字，依題型在**後端**判定 `correct`：
  - `mc`：`correct = (userAnswer === word.definitionZh)`（MC 正解＝該字中文定義）。
  - `cloze`/`typing`：`correct = checkAnswer(userAnswer, word.headword)`（沿用既有純函式）。
- 之後 grade/scheduler/gamification/事件流程**不變**（學習核心 `submit.ts` 仍只收已判定的 `correct`；判定移到組合根 server action）。
- 回傳新增 `correct`（authoritative），前端可對齊顯示。前端**仍可本地算一次**只為即時 UX 回饋，但記錄/XP/排名一律以 server 為準。
- 需要輕量取字方法：`ContentRepository.getWordCore(id): { headword: string; definitionZh: string } | null`（單查詢、不含例句）。

> **CLAUDE.md 已新增「資安鐵則」**：前端只呈現；資料/登入/計分/答案判定主責後端；影響共享狀態或排名的值一律後端權威、不信任前端。

### 既有程式碼盤點（同類問題）

盤點所有 server action 與前端送出的值：
- `submitAnswerAction(wordId, correct)` — **前端決定答對與否**，影響 XP/排程/精熟＋（本輪）排行榜。**屬排名關鍵 → 本輪改後端判定（見上）。**
- `finishSessionAction(reviewed, correct)` — 前端送本回合題數/答對數，用於：(a) `SessionFinished` 事件、(b) 結束畫面顯示、(c)「完美一回」徽章。**非排名**（徽章為個人虛榮、不上榜）。完全後端化需 server 端 session 實體（基礎建設）。**本輪決策：保留前端數值僅供顯示/事件；「完美一回」徽章標記為非權威虛榮項並記錄；排名相關（XP）已後端權威 → 不被影響。** 日後加 session 實體再硬化。
- 登入/身分：`getCurrentUser` 走 server `auth()`，**已後端權威**，無前端信任問題。
- 其他前端決定值（題型、佇列組成、streak/每日目標、MC 選項洗牌）皆已在 server 端決定，無問題。
- **誠實限制**：題庫內容對前端可見，後端判定答案可擋「直接送 correct:true」的粗暴偽造，但無法防腳本化送出已知正解刷 XP。徹底防需 server 發題 + 不外洩答案 + 限流（見 §10，後續）。

## 3. 資料模型

`GamificationState` 新增：
- `weeklyXp Int @default(0)`
- `weekStartDate String?`（YYYY-MM-DD，使用者時區當週**週一**；用於懶評估跨週重置）

`User` 新增：
- `displayName String?`（榜上暱稱；預設取 `name`，可改）
- `leaderboardOptIn Boolean @default(false)`（預設不上榜）

`db:push` 同步（純新增欄位，無破壞性）。

## 4. 每週 XP 追蹤（懶評估，無 cron）

於既有 `applyReview`（`lib/gamification/service.ts`）內：
- `weekStart = weekStartYmd(now, ctx.timezone)`（新純函式，見 §7）。
- `weeklyXp = (prev.weekStartDate === weekStart ? prev.weeklyXp : 0) + xpGained`；`weekStartDate = weekStart`。
- 寫入 `GamificationState`。`ReviewReward` 可選擇性帶 `weeklyXp`（顯示用，非必要）。
- 與既有 `reviewsToday`/streak 的懶重置同模式；不需排程。

## 5. leaderboard 模組（`lib/leaderboard`）

新增模組（符合 CLAUDE.md 模組邊界；唯讀查詢，不訂閱事件）：

- `repository.ts`（`LeaderboardRepository`，建構子可注入 db，預設 `getPrisma()`）：
  - `topAllTime(limit): Promise<{ userId; name; xp }[]>` — `gamificationState.findMany({ where: { user: { leaderboardOptIn: true } }, orderBy: { xp: 'desc' }, take: limit, select: { userId, xp, user: { select: { displayName, name } } } })`。
  - `topWeekly(limit, weekStart): Promise<{ userId; name; weeklyXp }[]>` — 同上但 `where` 加 `weekStartDate: weekStart`、`orderBy: { weeklyXp: 'desc' }`。
  - `countAbove(field, value, weekStart?): Promise<number>` — opted-in 中該欄位 > value 的人數（週榜另含 `weekStartDate: weekStart`）。
- `service.ts`（`LeaderboardService`，注入 repo + gamification repo）：
  - `getBoard(userId, tab: 'weekly'|'allTime', now, timezone): Promise<{ entries: { rank; name; value; isMe }[]; myRank: number | null; optedIn: boolean }>`。
  - 名次：`rank = countAbove(...) + 1`（純計算，見 §7）。`name = displayName ?? name ?? '匿名'`。
- 純函式（`lib/leaderboard/rank.ts`，可測）：`rankFromCountAbove(countAbove: number): number`（= count+1）、`displayNameOf({displayName,name})`。`weekStartYmd` 放 `lib/gamification/date.ts`。

## 6. UI

- **`/leaderboard`**（server component 抓資料 + 小型 client 元件切頁籤）：
  - 兩頁籤：**本週**（weekly）/ **總榜**（allTime）。各列：`#名次`・暱稱・數值（本週 XP / 累計 XP）；醒目標出自己。
  - 不在前 50 → 底部顯示「你的排名 #X」。
  - 未 opt-in → 顯示提示與前往 `/settings` 的連結（仍可瀏覽他人榜）。
  - 沿用既有 UI 元件（Card/StatPill 風格）；不顯示真名/頭像。
- **`/settings`**（小頁）：表單編輯 `displayName`（暱稱）+ `leaderboardOptIn` 開關；server action 更新 `User`。
- **入口**：首頁與/或頂部列加 `/leaderboard` 連結。

## 7. 純函式與測試

- `weekStartYmd(now: Date, timezone: string): string` — 回該時區當週週一的 YYYY-MM-DD（`lib/gamification/date.ts`）。單元測試（含跨週日/週一邊界）。
- `applyReview` 週欄位：跨週重置、同週累加 → service 單元測試（注入 mock repo）。
- 後端判定：`submitAnswerAction` 依題型用 word 推導 correct（mc/cloze/typing 各分支）→ 測試（mock content + learning deps）。
- `LeaderboardService.getBoard`：排序、名次計算、isMe、optedIn、週榜只含本週活躍者 → 單元測試（mock repo）。
- `rankFromCountAbove`/`displayNameOf` → 純函式測試。
- repository 查詢（where/orderBy/select、opt-in 篩選、週界線）→ mock db 測試。
- 既有測試全綠；`tsc`+`build` 通過。

## 8. 模組與邊界

- 新 `lib/leaderboard` 唯讀查詢 gamification/user 資料；不改排程/遊戲化規則。
- 安全判定在組合根 server action（`app/learn/[slug]/actions.ts`）＋ `lib/content` 輕量取字；`lib/learning/submit.ts` 介面（收 `correct`）不變。
- DB 經 repository；Neon HTTP 單筆寫入、無交易（沿用）。

## 9. 成本

- 週榜懶重置、無 cron；排行榜查詢 on-demand（Neon），零額外成本；無付費服務、無 runtime AI。

## 10. 明確排除（後續）

- 好友系統、聯賽分組（cohort/晉降級）、社交動態、通知。
- 頭像/真名顯示。
- 防作弊再強化（如答題節流、伺服器端題目發放）—— 本輪做到「後端判定答案」即達基本不可作弊；更強的反自動化日後再評估。

## 11. 參數（可調）

- 榜單長度 Top 50。
- 週界線：使用者時區當週週一。
- 預設 `leaderboardOptIn=false`、`displayName` 預設 `name`。
