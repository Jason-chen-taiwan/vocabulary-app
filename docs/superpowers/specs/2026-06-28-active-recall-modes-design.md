# 作答模式（主動回憶複習）設計文件

- **日期**：2026-06-28
- **狀態**：已核准，待撰寫實作計畫
- **接續**：P3 學習核心（FSRS 排程 + 翻卡複習）之後的增量

---

## 1. 目的與背景

P3 的複習採 Anki 式「翻卡 + 自我評分」，沒有真正的主動作答（使用者只自評是否記得）。本設計把複習互動升級為**主動回憶作答**（選擇題 / 克漏字 / 拼寫），讓使用者真的產出答案，並以「次數階梯」累積到「記憶完成」，同時保留 P3 的 FSRS 時間排程。

**取代**：純自評翻卡的複習互動由本設計的作答流程取代（自評翻卡不再是一種模式）。

---

## 2. 核心機制：FSRS 排時間 × 次數階梯畢業

每個 `UserCard` 新增兩個欄位：
- `consecutiveCorrect: Int`（連續答對數；答錯歸 0）
- `mastered: Boolean`（記憶完成 / 畢業）

**每次作答推導 FSRS 評分（答對時依「更新後的連續答對數」）：**

| 連續答對數（更新後） | FSRS 評分 | 動作 |
|---|---|---|
| 答錯 | Again | `consecutiveCorrect = 0` |
| 1 | Hard | — |
| 2 | Good | — |
| 3 | Good | — |
| 4 | Easy | — |
| 5（含以上） | Easy | 標記 `mastered = true`，移出正常佇列 |

**關鍵性質**：FSRS 負責「何時該複習」，間隔隨成功複習而拉長（分鐘→天→週）。因此累積 5 次答對是**分散在數天/數週**達成的，不是當場連按；「記憶完成」代表長期保留。中途答錯 → `consecutiveCorrect` 歸 0、評分 Again、FSRS 很快再排，重新累積。

評分仍透過 P3 既有的 `SchedulerService.review(card, rating, now)` 套用；本設計只改變「rating 從哪裡來」（由 correctness + streak 推導，而非使用者自評）。

---

## 3. 題型隨熟練度遞增

依該卡作答**前**的 `consecutiveCorrect` 決定題型：

| consecutiveCorrect | 題型 | 呈現 |
|---|---|---|
| 0–1 | **選擇題（MC）** | 看英文單字 + 🔊，從 4 個中文釋義選正確的 |
| 2–3 | **克漏字（Cloze）** | 例句挖空（目標字以 ___ 代替）+ 中文翻譯提示 → 打字填入英文字 |
| 4+ | **拼寫（Typing）** | 只看中文釋義（+🔊 可選）→ 打字寫出英文字 |

- 選擇題干擾項：取自**同一本單字書**的其他單字之中文釋義（隨機 3 個）。
- 抽考（見 §5）一律用選擇題（低摩擦）。

---

## 4. 答案判定

- **選擇題**：點選即判定對錯。
- **打字（克漏字 / 拼寫）**：比對時**忽略大小寫、去頭尾空白**，其餘需**完全相符**（拼字必須正確）。答錯時顯示正確拼法。
- 判定為純函式 `checkAnswer(input: string, expected: string): boolean`（可獨立測試）。

---

## 5. 記憶完成字的隨機抽考

- 每次 session 結束前，從該使用者的「記憶完成」字池**隨機抽最多 3 個**作為抽考，題型用選擇題。
- 抽考**答錯** → `mastered = false`、`consecutiveCorrect = 0`、評分 Again（FSRS 重新排入佇列）。
- 抽考選取與 FSRS 到期無關（mastered 字已不在正常到期佇列），直接從 mastered 字池隨機取樣。

---

## 6. 每日 session 組成

`buildSession` 回傳的順序：
1. **到期卡**：FSRS 到期且 `mastered = false`（主要工作量）
2. **新卡**：尚無 UserCard 的字，配額內（newLimit）
3. **抽考**：mastered 字池隨機取樣（最多 3）

每個項目附帶其題型（依 §3）與作答所需資料（選項 / 挖空句 / 期望答案）。

---

## 7. 模組與邊界（沿用 P3 模組化原則）

新增/修改於 `lib/learning`：

| 單元 | 職責 | 介面（概念） |
|---|---|---|
| `grading.ts`（新） | 純函式：依 (isCorrect, prevStreak) → 評分階梯 | `grade(isCorrect, prevStreak): { rating: Rating; nextStreak: number; mastered: boolean }` |
| `question.ts`（新） | 純函式：題型選擇、出題、答案比對 | `pickQuestionType(streak): QuestionType`；`checkAnswer(input, expected)`；`buildQuestion(word, type, distractors): Question` |
| `submit.ts`（改） | 由「答對與否」推導評分並持久化、發事件 | `submitAnswer({ userId, wordId, correct, now }, deps): Promise<CardState & {mastered}>` |
| `repository.ts`（改） | 到期查詢排除 mastered；新增 mastered 取樣；存 streak/mastered | `listDueCards`（+ `mastered:false`）、`listMasteredSample(userId, n)`、`saveCard`（含 streak/mastered） |
| `session.ts`（改） | 加入抽考；依 streak 指派題型 | `buildSession` 回傳含 `questionType` 與抽考項 |
| schema | `UserCard` + `consecutiveCorrect Int @default(0)`、`mastered Boolean @default(false)`（+ `@@index` 視查詢需要） | — |

UI：`components/review-session.tsx` 由「翻卡+自評」改為「作答（MC 點選 / 打字輸入 / 克漏字輸入）→ 判定回饋（對/錯 + 顯示正解）→ 自動前進」；server action 由 `submitReviewAction(wordId, rating)` 改為 `submitAnswerAction(wordId, correct)`。

題型/評分推導為純函式，UI 只負責呈現與蒐集作答；correctness 在 UI 端（MC/打字）判定後送 `correct: boolean` 給 server action，server 端再推導評分（避免信任前端評分，但 correctness 本身可由前端比對——拼字比對邏輯共用同一純函式，前後端一致）。

> 安全備註：correct 由前端送出，理論上可偽造。影響僅限使用者**自己**的 UserCard 進度（無跨使用者影響），且本 app 非競技計分核心，故接受；若日後排行榜需防作弊，再在 server 端重做答案比對。

---

## 8. 事件

沿用 P3 事件匯流排。作答完成仍發 `ReviewCompleted`（P4 遊戲化據此給 XP/連續答對獎勵），session 結束發 `SessionFinished`。可考慮在事件加上 `correct: boolean`／`mastered: boolean` 供 P4 做「答對連擊」「精熟徽章」——本設計預留，實作時於計畫定案。

---

## 9. 測試策略

- `grade`（評分階梯，含答錯歸零、第 5 次畢業）：單元測試。
- `pickQuestionType`（門檻 0-1/2-3/4+）：單元測試。
- `checkAnswer`（大小寫/空白/拼錯）：單元測試。
- `buildQuestion`（MC 選項組裝、克漏字挖空、期望答案）：單元測試（干擾項以注入方式測）。
- `submitAnswer`（推導評分→FSRS→持久化 streak/mastered→發事件；答錯歸零；第 5 次標記 mastered；抽考答錯取消 mastered）：單元測試（注入 mock）。
- repository 查詢（排除 mastered、mastered 取樣）：單元測試（mock）。
- UI：build + 手動驗證三種題型流程。
- 採 TDD。

---

## 10. 數字參數（可調）

- 畢業門檻：連續答對 **5** 次。
- 題型門檻：**0–1 選擇 / 2–3 克漏字 / 4+ 拼寫**。
- 每次抽考數：**3**。

以上以常數集中定義，方便日後調整（符合「規則用設定資料」準則）。

---

## 11. 明確排除（不在本設計）

- 遊戲化規則/UI（P4）；本設計只發事件。
- 離線同步（獨立計畫）。
- server 端答案重新驗證的防作弊（日後排行榜再做）。
- 聽音作答題型（P3 的 listening 正面已移除；本設計三題型不含純聽力作答，可日後增強）。
