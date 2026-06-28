# 吉祥物與插畫設計文件（小橙狐）

- **日期**：2026-06-28
- **狀態**：待核准
- **範圍**：新增一隻原創 SVG 吉祥物「小橙狐」（含 4 種情境表情）與少量裝飾性場景插畫，整合進既有頁面。**純表現/素材層，不改任何業務邏輯/資料**；沿用既有 design tokens 與「描邊貼紙」慶祝風格。

---

## 1. 目的

讓畫面有角色與情緒，提升正向激勵（呼應 P4a 遊戲化）。目前只有 emoji（🔥🎉）；本設計加入一隻會依情境換表情的吉祥物，並在空狀態/結束畫面加一點裝飾插畫，讓畫面不空、更像成熟產品。

## 2. 限制（硬性）

- **原創**：完全自繪 SVG，不使用任何受版權保護的角色（不得近似 Duolingo 貓頭鷹等）。
- **零成本/不爆帳單**：素材為**靜態 inline SVG**，無外部圖檔託管、無 runtime AI、無外部請求；edge 安全。
- **純表現層**：不改業務邏輯、server action 介面、資料模型、repository。可唯讀沿用既有資料（如 gamification 狀態）推導表情。
- 沿用既有 tokens 與風格：粗黑描邊（ink `#1A1A1A`）、品牌橙 `#FF6A3D`、暖白嘴吻 `#FFF7F2`、淺橙耳內/腮紅 `#FFB68F`；亮色主題。
- 既有測試須維持全綠；新增純函式（表情推導）加單元測試。
- 尊重 `prefers-reduced-motion`（若加入動效）。

## 3. 吉祥物：小橙狐

**造型語言**：橢圓臉、尖耳（外橙內淺橙）、乾淨橢圓嘴吻（**單一鼻子 + 單一嘴**，不畫多餘輪廓線——修正 v1 的「兩張嘴」問題）、雙腮紅、圓眼帶白點高光、粗黑描邊。整體圓潤友善、貼紙感。

**4 種情境表情**（同一份 base SVG，只換少數部件：耳朵、眼、嘴、附加手勢/裝飾）：

| mood | 視覺重點 | 用途 |
|---|---|---|
| `hi` | 立耳、圓眼、微笑、一隻揮手的爪 | 招呼（首頁/登入預設） |
| `cheer` | 立耳、彎月笑眼(^^)、開口笑、雙手上舉、✨ | 慶祝（結束畫面/升級/達標） |
| `encourage` | 立耳、圓眼、微笑、比讚👍手勢 | 鼓勵（複習中/待複習清空） |
| `sad` | 垂耳、圓眼、嘴角下垂、一滴淚 | 溫和安慰（streak 中斷/答對率低），非懲罰 |

> 色彩全部取自既有 token；描邊一律 ink。表情差異以「部件替換」實作，base 共用（DRY）。

## 4. 元件架構

新增 `components/ui/mascot.tsx`（純表現，無業務依賴）：

- `type MascotMood = 'hi' | 'cheer' | 'encourage' | 'sad'`
- `MASCOT_MOODS: MascotMood[]`（設定資料）
- `Mascot({ mood, size = 120, className }): JSX`：回傳單一 inline `<svg>`，內含共用 base group + 依 `mood` 切換的部件。`aria-hidden`（裝飾性）；外層可加 `role="img"` + `aria-label` 視需要。
- 純函式（與 SVG 同檔匯出，供測試，不需 render）：
  - `moodForHome({ goalMet, streak, longestStreak }): MascotMood` — `goalMet` → `cheer`；`streak === 0 && longestStreak > 0` → `sad`（曾有連續、現在歸零＝中斷）；否則 `hi`。
  - `moodForSessionEnd({ correct, total }): MascotMood` — `total > 0 && correct === total` → `cheer`；`total > 0 && correct / total < 0.5` → `encourage`；否則 `cheer`。

> 表情推導為純函式、輸入既有可得的數字、可獨立測試，不依賴系統時間或新查詢。

## 5. 出沒地點（皆唯讀沿用既有資料）

| 頁面/檔案 | 放法 | mood 來源 |
|---|---|---|
| `app/login/page.tsx` | 取代現有 `🔥` emoji | 固定 `hi` |
| `app/page.tsx`（首頁） | 問候區放 `<Mascot>` | `moodForHome({ goalMet: done>=goal, streak, longestStreak })`（done/goal/streak/longestStreak 皆已在頁面取得） |
| `app/learn/[slug]/page.tsx` 空狀態 | 「今天沒單字了」區放 `<Mascot>` | 固定 `cheer`（今天掃完＝好事） |
| `components/review-session.tsx` 結束畫面 | 取代/置於 `🎉` 上方 | `moodForSessionEnd({ correct: correctCount, total: items.length })`（兩者皆為元件既有 state） |

> 不在「複習進行中每題」放吉祥物（避免干擾作答；YAGNI）。`encourage` 由結束畫面的 `moodForSessionEnd` 在「答對率 < 50%」時觸發（溫和鼓勵），不需另設專屬版位。

## 6. 場景插畫（裝飾，極簡）

- **結束慶祝**：`cheer` 狐狸後方一組裝飾性 SVG 星點/彩帶（`aria-hidden`），與 CelebrateCard 並存。可做成小元件 `components/ui/confetti.tsx`（純 SVG，無動畫或僅 CSS pop-in）。
- **空狀態**：`cheer` 狐狸下方一行輕量說明即可，不另做大場景（YAGNI）。
- 其餘頁面暫不加場景插畫，避免雜訊。

## 7. 動效（可選、克制）

- 進場用既有 `.animate-pop-in`（結束畫面狐狸 + 彩帶）。
- 可選：`hi` 的揮手爪做極輕微 CSS 擺動；尊重 `prefers-reduced-motion`。非必要，實作時可省。

## 8. 模組與邊界

- 全部新增於 `components/ui/`：`mascot.tsx`（+ 表情推導純函式）、`confetti.tsx`（裝飾）。純表現、沿用 tokens、無 lib 依賴。
- 頁面只是 import 並放置 `<Mascot>`／`<Confetti>`，傳入由既有資料推導的 mood；**不新增資料查詢、不改 server action**。

## 9. 測試策略

- 純函式 `moodForHome`、`moodForSessionEnd`（各分支）、`MASCOT_MOODS`：單元測試（`components/ui/__tests__/`）。
- `Mascot`/`Confetti` 為視覺元件：build + 手動視覺驗收（4 表情、各出沒頁面、窄視窗）。
- 不改邏輯 → 既有測試全綠。
- 採 TDD（先寫推導函式測試）。

## 10. 明確排除（後續）

- **多角色卡司**（「不同人」）：先做一隻強吉祥物；日後要擴充角色再做（YAGNI）。
- 點陣/3D 角色、委託繪師、AI 生圖。
- 大型場景插畫、複雜動畫（Lottie 等）。
- 依「streak 即將中斷」主動推播提醒（屬通知系統，非本設計）。

## 11. 參數（集中、可調）

- 顏色：橙 `#FF6A3D`、ink `#1A1A1A`、嘴吻 `#FFF7F2`、淺橙 `#FFB68F`、淚珠 `#2BB3C0`（皆與 tokens 一致）。
- mood 清單見 §3；推導門檻（perfect→cheer、<0.5→encourage、streak0&longest>0→sad）見 §4，集中於 `mascot.tsx` 具名函式。
- 預設尺寸 `size=120`。
