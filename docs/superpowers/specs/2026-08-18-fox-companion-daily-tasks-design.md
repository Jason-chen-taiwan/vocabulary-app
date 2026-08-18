# 狐狸養成＋每日任務寶箱（單人留存遊戲化）設計

日期：2026-08-18
狀態：設計已核可，待寫實作計畫

## 目標

讓單人使用者（沒有朋友一起用）每天想回來：小橙狐從幼狐養到智者狐（學習自動成長＋金幣買點心餵食加速），每天 3 個小任務全完成開寶箱（server RNG：金幣／點心／寶箱限定配件）。兩者互餵——任務給目標感、寶箱給驚喜、獎勵餵狐狸成長。

本輪是「單人遊戲化」路線圖第一輪；後續輪次：冒險地圖／關卡旅程、自我挑戰與個人紀錄、貼紙圖鑑（見 §10）。

## 鐵則落點

- **正向設計**：狐狸**永不退化、永無愧疚勾子**。幾天沒上線回來時狐狸開心迎接（「好想你！」），靠思念不靠罪惡感。成長值只增不減。
- **後端權威**：任務完成判定、寶箱開獎 RNG、金幣與點心入帳全在 server；前端只送「開寶箱」「餵一次」意圖，不信任前端進度或獎勵內容。
- **虛擬經濟收斂**：所有金幣變動一律經 gamification 服務層——本設計新增 `grantCoins(userId, amount)` 服務方法供寶箱入帳；點心購買走既有 shop 服務層扣幣。他處不得直接動 `coinBalance`。
- **模組化／事件驅動**：新增獨立 `companion` 模組，**訂閱**既有領域事件更新成長與任務進度（`lib/events/register.ts`——事件匯流排自 P4a 預留至今的第一批真正訂閱者）。學習核心零改動；gamification 只加 `grantCoins`。新增機制＝新增訂閱者。
- **規則用設定資料**：進化門檻、成長值率、任務池、寶箱機率與獎池全部是 config，不寫死在程式分支。
- **成本**：零新依賴、零外部服務；兩張小表。

## §1 資料模型

```prisma
model CompanionState {
  id        String   @id @default(cuid())
  userId    String   @unique
  growth    Int      @default(0)   // 累積成長值，只增不減；進化階段由 config 門檻推導，不另存
  treats    Int      @default(0)   // 持有點心數
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model DailyTaskState {
  id          String   @id @default(cuid())
  userId      String
  ymd         String   // 使用者時區當日（沿用 gamification todayYmd）
  tasks       Json     // TaskSnapshot[]：{ key, title, target, progress, done }
  chestOpened Boolean  @default(false)  // 冪等鎖：一天最多開一次
  chestReward Json?    // 開出內容（審計）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, ymd])
}
```

- 寶箱限定配件**沿用既有 `UserItem` 與 shop catalog**：catalog 項目加 `source: 'shop' | 'chest'`；`chest` 款在商店顯示「🎁 寶箱限定」、不可購買，只能由開箱獲得。
- 進化階段不存欄位（單一真相＝growth＋config）；升階慶祝由「本次成長前後階段比較」即時回傳。

## §2 成長與進化（config：`lib/companion/rules.ts`）

- 進化 5 階：幼狐 0 → 小狐 150 → 少年狐 500 → 成年狐 1200 → 智者狐 2500（門檻陣列，可調）。
- 成長值來源：
  - `SessionFinished`：每複習 1 字 +2；全對加成 +10。
  - `PassageFinished`：+15（首次完成該篇才發事件，天然防刷）。
  - 餵點心：每個 +25（`POST /api/companion/feed`，server 驗證 treats>0 才扣）。
- 點心：商店消耗品，40 金幣/個——給金幣消耗循環（現況配件買完金幣就沒用途）。
- **不做每題 DB 寫入**：每題寫一次 DB 會讓每次作答多一個 Neon round-trip 拖慢答題；成長與任務進度以 session 結束一次結算為原則（`ReviewCompleted` 訂閱者僅在 `mastered === true` 的罕見時刻寫 DB，見 §3）。
- 滿級後點心照樣可餵（數值繼續累積）；「寵愛值徽章」列後續，不在本輪。

## §3 每日任務

- 任務池（config，各任務含 key/標題/目標/事件對應）：複習 15 字、答對 12 題、讀完 1 篇文章、收藏 3 個生字、精熟 1 字、達成每日目標。
- 每天以 `hash(userId + ymd)` **確定性抽 3 個**（seededRng 沿用 `lib/learning/question.ts` 的 xmur3+mulberry32）；首次讀取當日狀態時生成落表（顯式 find→create，無交易）。
- 進度更新：companion 訂閱者收事件 → 讀當日列 → 累加對應任務 progress → 存回。事件與任務對應：
  - `SessionFinished { reviewed, correct }` → 複習字數、答對題數；`correct === reviewed` 且 reviewed>0 的場次也用於全對加成。
  - `PassageFinished` → 讀完文章。
  - `WordCollected`（**新增事件**，collect API 成功建卡時發佈）→ 收藏生字。
  - 精熟 1 字：訂閱 `ReviewCompleted` 但**僅在 `mastered === true` 時**寫 DB（精熟是罕見事件，平時 handler 立即 return，不產生額外 round-trip——與 §2「不做每題寫入」並不矛盾）。
  - 達成每日目標：`SessionFinished` 訂閱者結算時讀 `GamificationState.lastGoalDate === 當日`（server 權威資料源，僅 session 結束多一次讀取）。
- 昨天沒完成的任務直接過期，不補做、不懲罰（正向設計）。

## §4 寶箱

- 解鎖條件：當日 3 任務全 `done` 且 `chestOpened === false`。
- `POST /api/companion/chest`：server 驗證 → RNG（注入式，測試可控）依 config 權重開獎：
  - 金幣 20–60（權重 ~55%）→ 經 `gamificationService.grantCoins`
  - 點心 1–3 個（權重 ~35%）→ companion.treats
  - 寶箱限定配件（權重 ~10%）：從**未擁有**的 chest 款抽一件授予（`UserItem`）；全擁有時 fallback 金幣。
- 寫 `chestOpened = true` ＋ `chestReward`（顯式 find→update 冪等；重複請求回已開內容、不重複給獎）。

## §5 事件接線

- `lib/events/bus.ts` union 加 `WordCollected { userId, wordId, at }`。
- 新增 `lib/events/register.ts`：`registerSubscribers()` 冪等（module guard），把 companion 訂閱者掛上 bus；由發佈事件的組合根（learn action、/api/sync、/api/passage/submit、/api/vocab/collect）import。
- 訂閱者失敗由 bus 既有 try/catch 吞掉，不阻斷學習主流程。

## §6 UI（首頁狐狸小屋）

登入後首頁新增「狐狸小屋」區塊（不開新頁——留存機制要在第一屏）：

- 階段對應狐狸圖（5 階，沿用既有 SVG 吉祥物風格新畫；已裝備配件照常疊加）。
- 成長條：目前階段名＋距下一階進度；升階時慶祝動畫（沿用 confetti／celebrate-card）。
- 點心列：持有數＋「餵點心 🍖」鈕（無點心時導向商店）；餵食有吃東西回饋動畫。
- 每日任務卡：3 條任務進度；全完成時寶箱亮起可點；開箱動畫揭曉內容。
- 回歸迎接：距上次活動 ≥2 天時狐狸顯示「好想你！」開心動畫（純前端判斷顯示，不涉獎勵）。
- 商店：新增「點心」消耗品分區（購買走既有 shop 服務層，數量入 `CompanionState.treats`）；寶箱限定配件展示但不可購買。

## §7 API

- 首頁 server component 直讀 companion repo（當日任務不存在即生成）。
- `POST /api/companion/feed`：treats>0 → 扣 1、growth+25，回傳新成長值與是否升階；無點心回 `{ ok: false }`。
- `POST /api/companion/chest`：見 §4。
- 皆為 thin route ＋ injectable handler、`getCurrentUser()`、手寫驗證、`res.ok ? 200 : 400`。

## §8 測試（TDD）

- rules：growth→stage 推導（邊界值）；任務確定性生成（同人同日同結果、不同日不同組合）。
- 訂閱者：各事件正確累加進度與成長；跨日寫入當日列；失敗不外拋。
- feed：無點心拒絕；升階偵測正確。
- chest：未全完成拒絕；一天一次冪等（重複回已開內容）；RNG 注入下各獎項路徑；配件全擁有 fallback；金幣走 `grantCoins`。
- grantCoins：只加不減、負數拒絕。
- 契約：companion repository 介面測試（DI 假 db）。

## §9 已知限制（誠實記錄）

- 任務進度為 session 結算粒度：進行中 session 的複習數不即時反映在任務卡（結束才更新）——效能取捨。
- 升階動畫依賴回傳值，多裝置同時餵食可能各自看到升階（資料無害，growth 單調遞增）。

## §10 路線圖（後續輪次，不綁死）

1. **本輪**：狐狸養成＋每日任務＋寶箱。
2. 冒險地圖／關卡旅程（TOEIC 場景章節化，進度視覺化）。
3. 自我挑戰與個人紀錄（最長連對、答題速度、閱讀 WPM、週回顧）。
4. 貼紙圖鑑收集（寶箱掉落擴充）。
