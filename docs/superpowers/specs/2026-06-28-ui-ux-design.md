# UI/UX 視覺設計文件

- **日期**：2026-06-28
- **狀態**：待核准
- **範圍**：為既有功能（登入、首頁、單字書、單字、複習作答、結束、頂部列）建立一致的視覺設計系統並套用到全部頁面。**不改任何業務邏輯/資料/引擎**，純表現層（CSS、元件、版面、動效）。

---

## 1. 目的

目前 UI 是黑底白字、無設計系統的堪用狀態（`globals.css` 只有 background/foreground，字體實際 fallback 到 Arial，頁面散用 `gray-700/900/...`）。本設計建立**設計 token + 輕量元件層**並重做版面，讓這個「要裝到手機的 PWA」像個成熟產品，並強化 P4a 遊戲化的正向激勵氛圍。

## 2. 設計原則

1. **活潑遊戲化 × 亮底 × 活力橙**（已與使用者定案）。
2. **A 基底 + B 慶祝**：平時頁面用柔和圓潤（大圓角、柔陰影）；慶祝時刻（答對連擊、升級、徽章解鎖、每日達標、複習結束）用「粗黑描邊 + 硬投影」的貼紙感來強調。
3. **Mobile-first**：所有版面先為手機設計（單欄、底部留拇指操作區、tap target ≥ 44px），桌機只是置中加寬。
4. **零新增重依賴**：用 Tailwind v4 + 原生 CSS transition；字體用 `next/font`。不引入動畫庫/UI 套件。
5. **不動邏輯**：server/client 邊界儘量維持；只有頂部列為了「即時更新」需從 server component 改 client（見 §7）。

## 3. 設計 Tokens

於 `app/globals.css` 用 Tailwind v4 `@theme` 定義（取代現有 background/foreground）。實際值：

**品牌橙（primary）**
- `--color-primary-50: #FFF1E8`
- `--color-primary-100: #FFE3D3`
- `--color-primary-300: #FFB68F`
- `--color-primary-500: #FF6A3D`（主色）
- `--color-primary-600: #E8551F`（hover/press）
- `--color-primary-700: #C2410C`

**中性**
- `--color-ink: #1A1A1A`（B 描邊與深字）
- `--color-neutral-900: #2B2B2B`（主要文字）
- `--color-neutral-600: #6B6B6B`（次要文字）
- `--color-neutral-200: #E6E6E6`（邊框/分隔）
- `--color-neutral-100: #F0F0F0`
- `--color-surface: #FFFFFF`（卡面）
- `--color-bg-warm: #FFF7F2`（頁面暖底）

**語義色**
- `--color-success: #22A06B`（答對）
- `--color-error: #E5484D`（答錯）
- `--color-mastery: #7C5CFC`（精熟）
- `--color-coin: #F5B301`（金幣）
- `--color-streak: #FF6A3D`（🔥，沿用 primary-500）

**半徑**：`--radius-card: 20px`、`--radius-control: 14px`、`--radius-pill: 999px`、`--radius-celebrate: 16px`。
**陰影**：`--shadow-soft: 0 12px 30px rgba(255,106,61,.18)`；`--shadow-press: 0 6px 14px rgba(255,106,61,.35)`；`--shadow-hard: 4px 4px 0 var(--color-ink)`（慶祝元件，較小尺寸用 `3px 3px 0`）。
**間距/字級**：沿用 Tailwind 預設刻度（4px 基準）；標題 `text-2xl/3xl` 800、數值 700/800、內文 `text-sm/base` 400/600。

> 深色模式**不在本輪**（YAGNI）：移除現有 `prefers-color-scheme` 的深色覆寫，固定亮色，避免半套深色造成的黑底。

## 4. 字體

`next/font/google` 載入：
- **Nunito**（拉丁/數字，weights 400/600/700/800）→ `--font-display`，用於 UI、headword、數值。
- **Noto Sans TC**（中文，weights 400/500/700）→ 與 Nunito 組成 `font-sans` fallback chain。

於 `layout.tsx` 套用變數類別；`globals.css` 的 `body` 改用 `font-family: var(--font-display), var(--font-zh), system-ui, sans-serif`（移除現有 Arial 覆寫）。

## 5. 元件層（新增 `components/ui/`）

每個小而專注、純表現、可獨立使用：

| 元件 | 檔案 | 職責 / 介面 |
|---|---|---|
| `Button` | `ui/button.tsx` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'celebrate'`、`size`、`fullWidth`；primary=橙底白字柔投影，celebrate=描邊硬投影 |
| `Card` | `ui/card.tsx` | 圓角柔投影容器；`as` 可為 Link |
| `CelebrateCard` | `ui/celebrate-card.tsx` | 描邊+硬投影；`tone: 'reward' \| 'coin' \| 'mastery' \| 'level'` 對應語義色 |
| `StatPill` | `ui/stat-pill.tsx` | 膠囊狀數值（icon + 值），用於頂部列 |
| `ProgressBar` | `ui/progress-bar.tsx` | 橙色進度條（百分比） |
| `GoalRing` | `ui/goal-ring.tsx` | SVG 圓環進度（每日目標 X/N），純 SVG 無依賴 |
| `OptionButton` | `ui/option-button.tsx` | 複習選項卡；`state: 'idle' \| 'correct' \| 'wrong' \| 'dimmed'` |

> 既有 `tts-button.tsx`、`sign-in-button.tsx`、`sign-out-button.tsx`、`pwa-register.tsx` 保留，必要時換上新 Button 樣式。

## 6. 逐頁版面（全 mobile-first）

- **登入 `app/login`**：暖底置中。品牌字標（「VocabApp」+ 🔥 橙）、標語、大顆 Google 登入鈕（secondary 白底描邊或 primary）。
- **首頁/儀表板 `app/page.tsx`**：頂部列；問候（歡迎，<name>）；**每日目標 `GoalRing`**（今天 reviewsToday/dailyGoal，達標顯示 ✓）；streak 火焰卡（🔥 N 天 + longestStreak 小字）；大主鈕「開始學單字」→ /books；下方「今日待複習 N 字」。資料來源：`GamificationRepository.getContext` + 既有複習佇列計數（唯讀，不改邏輯）。
- **單字書列表 `app/books`**：頂部列；標題「單字書」；每本書一張 `Card`（書名、描述、`StatPill` 顯示單字數/等級、進度條=已精熟/總數）。
- **單字書詳情 `app/books/[slug]`**：書資訊頭（名稱/描述/等級）；「開始複習」primary 大鈕 → /learn/[slug]；單字清單（每字小 `Card`：headword、詞性標籤、中譯、精熟✓ 或到期狀態小標）。
- **單字詳情 `app/words/[id]`**：大 headword + 音標 + `TtsButton`；詞性標籤；中譯；例句卡（英＋中＋🔊）；返回連結（補上 P3 待辦的 back-link）。
- **複習作答 `components/review-session.tsx`**：頂部 `ProgressBar`（題序）；單字卡（headword/例句/提示依題型）；MC 用 `OptionButton`、打字用大輸入框；作答後綠/錯紅回饋 + 顯示正解（微動畫）；下一題/完成主鈕。互動邏輯與 server action 介面**不變**。
- **複習結束**：B 風格慶祝（🎉、`CelebrateCard` 列出本輪 +XP / +🪙 / 升級 Lv.N / 解鎖徽章）、「再來一輪」「回單字書」。沿用既有累加的 reward 資料。

## 7. 頂部列即時更新（順手修掉遞延 minor）

現 `GamificationBar` 是 server component，session 後數值要換頁才更新。改為：保留 server component 抓初始值，但複習結束（`finishSessionAction` 回來後）由 `review-session` 觸發 `router.refresh()` 重抓 —— 已是現行 done 流程的延伸，低風險。或將 Bar 包一層 client 包裝，完成時重抓。實作時擇一，spec 要求「結束後頂部列數值正確反映新狀態」。

## 8. 動效（克制、純 CSS）

- 答對/答錯：選項/卡片 150–200ms 顏色與輕微 scale 回饋。
- 升級 / 徽章解鎖 / 達標：`CelebrateCard` 彈入（scale + fade，~250ms）。
- 每日目標環：載入時填充過渡。
- 全部用 Tailwind `transition`/`@keyframes`，尊重 `prefers-reduced-motion`（減弱）。

## 9. 技術方式與模組邊界

- Tokens 在 `globals.css` 的 `@theme`；元件用 Tailwind utility + token 變數。
- 元件層放 `components/ui/`，純表現、無業務依賴（符合模組化準則）。
- 不新增 runtime 依賴；字體經 `next/font`（build 期下載、self-host，edge 安全、零 API 成本，合乎成本鐵則）。
- server/client 邊界：除 §7 頂部列外不變；頁面資料抓取沿用既有 repository（唯讀）。

## 10. 無障礙

- 文字對比符合 WCAG AA（橙底白字、深字於暖底皆達標）。
- tap target ≥ 44×44；focus 可見（focus-visible 外框）。
- `prefers-reduced-motion` 降級動畫。

## 11. 明確排除（後續）

- 深色模式、主題切換。
- 自製吉祥物/插畫資產（先用 emoji + icon；未來可加）。
- 新功能頁（商店 P4b、排行榜 P4c、統計 P5 各自有設計）。
- MC 同幀雙擊的邏輯硬化（屬邏輯非表現，獨立處理）。

## 12. 測試與驗收

- **不改邏輯** → 既有 103 測試須全綠（純表現層變更）。
- `npm run build` 通過、`tsc --noEmit` 乾淨。
- 新增純元件（`GoalRing` 百分比→弧長、`OptionButton` state→class、`Button` variant→class）可加輕量單元測試。
- 手動視覺驗收：各頁在窄視窗（手機寬）下版面正確；複習全流程 + 結束慶祝 + 頂部列結束後即時更新。
- 採漸進式：先 tokens+字體+元件層（全站即換臉），再逐頁套用，每步 build 綠。
