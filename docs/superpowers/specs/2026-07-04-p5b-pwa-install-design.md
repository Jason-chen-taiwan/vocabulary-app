# P5-b PWA 安裝引導打磨 — 設計

日期：2026-07-04
狀態：設計核可，待寫 plan

## 目標

在既有 PWA 殼層（manifest + service worker 已存在）之上，加一層**安裝引導 UX**：讓能安裝的裝置看到一個溫和、可關閉的安裝提示，並替 iOS（無自動安裝事件）提供手動加入主畫面的圖文指引。屬 P5 的第二半（P5-a 數據儀表板已完成）。

## 範圍

**做：**
- 首頁可關閉安裝橫幅（進首頁即出現）。
- 攔 `beforeinstallprompt`、以自訂安裝鈕觸發原生安裝框（Android/Chrome/Edge 桌面）。
- iOS Safari 手動加入主畫面圖文提示。
- 已安裝（display-mode: standalone）或已關閉 → 不顯示。
- manifest / apple 標籤打磨（theme_color 改品牌橙、加 apple-touch-icon 與 apple meta）。

**不做（YAGNI）：**
- 設定頁的安裝入口（只做首頁橫幅；未來要多入口再升級為全域 provider）。
- 推播通知、安裝後續追蹤、A2HS 成效統計。
- 「完成一次複習後才顯示」的 engagement gating（採「進首頁即顯示」）。

## 設計原則對齊

- **CLAUDE.md 第一準則（模組化）**：安裝決策邏輯抽成純函式模組 `lib/pwa/install.ts`，與 React 元件解耦，可獨立單元測試。
- **正向、不騷擾**（CLAUDE.md 範圍提醒：不抄 Duolingo 通知轟炸）：橫幅可關閉、關了記住（localStorage）、已安裝不再顯示。
- **前端只呈現 / 後端權威** 的例外與誠實記錄：install 狀態本質是**裝置/瀏覽器本地**的事（`beforeinstallprompt`、`display-mode`、localStorage），**不涉及使用者資料或共享狀態**，因此不經後端。這是合理例外，不違反資安鐵則（沒有可被偽造而影響排名/獎勵的數值）。

## 架構

採「純函式判斷 + 薄客戶端元件」：

```
lib/pwa/install.ts            純函式決策（可 TDD）
components/pwa-install-banner.tsx  'use client' 薄呈現 + 瀏覽器事件接線
app/page.tsx                  掛入 <PwaInstallBanner />
public/manifest.webmanifest   theme_color 打磨
app/layout.tsx                apple meta / apple-touch-icon
```

### 單元：`lib/pwa/install.ts`（純函式，無 DOM 副作用）

決策集中於此，元件只呼叫它並呈現結果。

- `DISMISS_KEY = 'pwa-install-dismissed'` — localStorage 記號鍵。
- `isIOS(ua: string): boolean` — 由 user-agent 判斷是否 iOS（iPhone/iPad/iPod；含 iPadOS 桌面版 UA 的 `Macintosh` + touch 之類無法純由 UA 判定者以 UA 為主，touch 由呼叫端補）。
- `isInStandalone(opts: { displayModeStandalone: boolean; navigatorStandalone?: boolean }): boolean` — 是否已以 App 開啟（`matchMedia('(display-mode: standalone)')` 或 iOS 的 `navigator.standalone`）。呼叫端把瀏覽器值傳進來，函式保持純。
- `installBannerState(input: { inStandalone: boolean; dismissed: boolean; canPrompt: boolean; ios: boolean }): 'hidden' | 'prompt' | 'ios-hint'`
  - `inStandalone || dismissed` → `'hidden'`
  - `canPrompt`（已收到 `beforeinstallprompt`）→ `'prompt'`
  - `ios`（且非 standalone、未 dismissed、無 prompt 事件）→ `'ios-hint'`
  - 其餘（例如 Firefox 桌面等不觸發事件也非 iOS）→ `'hidden'`

**回傳型別 `InstallBannerState = 'hidden' | 'prompt' | 'ios-hint'`。**

### 單元：`components/pwa-install-banner.tsx`（`'use client'`）

- `useEffect` 掛載時：
  - 監聽 `window` 的 `beforeinstallprompt`：`e.preventDefault()`，把 event 存進 state（`deferredPrompt`），設 `canPrompt = true`。
  - 讀取瀏覽器值算 `inStandalone`（`window.matchMedia('(display-mode: standalone)').matches` 或 `navigator.standalone`）、`ios = isIOS(navigator.userAgent)`、`dismissed = localStorage.getItem(DISMISS_KEY) === '1'`。
  - 監聽 `appinstalled` 事件：安裝完成即隱藏。
- 以 `installBannerState(...)` 決定渲染：
  - `'hidden'` → 回傳 `null`。
  - `'prompt'` → 橫幅文案「把 App 裝到主畫面，離線也能背」+「安裝」鈕。點鈕：`deferredPrompt.prompt()`；等 `userChoice`；不論結果都收起橫幅（避免重複彈）。
  - `'ios-hint'` → 橫幅可展開步驟：「點下方分享 ↑ → 加入主畫面」，含 emoji/圖示示意。
- 關閉鈕（✕）：`localStorage.setItem(DISMISS_KEY, '1')`，隱藏。
- 視覺：沿用既有設計語言（`components/ui` 的 Card/Button 橙色圓潤風、`rounded-card`、`shadow-soft`），可放小橙狐 `Mascot mood="hi"` 增親和。只用 `@theme` 已定義色階（避免未定義色階靜默丟棄的既知陷阱）。

### 掛載點：`app/page.tsx`

首頁問候語下方插入 `<PwaInstallBanner />`。首頁為 server component，橫幅為 client component（島狀嵌入），不影響其餘 SSR。

### manifest / apple 打磨

- `public/manifest.webmanifest`：`theme_color` `#000000` → `#FF6A3D`（品牌橙，對齊 `--color-primary-500`）。其餘（name/short_name/icons/display/start_url）維持。
- `app/layout.tsx` `metadata`（Next.js Metadata API）：
  - `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'VocabApp' }`
  - `icons.apple: '/icons/icon-192.png'`（apple-touch-icon）
- `app/layout.tsx` `viewport` 匯出（Next 16 將 themeColor 移到 `viewport`，非 `metadata`）：`themeColor: '#FF6A3D'`（若已存在 viewport 匯出則併入）。
- 不新增圖檔（重用現有 icon-192/512）。

## 資料流

無伺服器往返、無資料庫。純瀏覽器事件 → 純函式決策 → 呈現；關閉狀態存 localStorage（裝置本地）。

## 錯誤處理

- 所有瀏覽器 API 存取包防護（`typeof window`、`'onbeforeinstallprompt' in window`、try/catch localStorage 以防隱私模式丟例外），失敗即視為「不顯示」而非壞頁。
- `deferredPrompt.prompt()` 只能呼叫一次；呼叫後清掉 event。

## 測試

TDD，比照專案「純函式單元測試、元件薄呈現不測 render」慣例（Vitest）。

`lib/pwa/__tests__/install.test.ts`：
- `isIOS`：iPhone/iPad/iPod UA → true；Android/Windows/Mac Chrome UA → false。
- `isInStandalone`：`displayModeStandalone: true` → true；`navigatorStandalone: true` → true；皆 false → false。
- `installBannerState` 各組合：
  - 已 standalone → `'hidden'`（即使 canPrompt）。
  - 已 dismissed → `'hidden'`。
  - canPrompt 且未裝未關 → `'prompt'`。
  - ios 且未裝未關且無 prompt → `'ios-hint'`。
  - 非 ios、無 prompt、未裝未關 → `'hidden'`。

`components/pwa-install-banner.tsx`：不做 React render 測試（比照現況）；邏輯已由純函式覆蓋。

## 已知限制（誠實記錄）

- install 狀態是裝置/瀏覽器本地，非後端資料（合理例外，見設計原則）。
- `beforeinstallprompt` 支援不一：Firefox 桌面、部分瀏覽器不觸發 → 那些平台不顯示可安裝橫幅（非 iOS 者落到 `'hidden'`）。屬 web 平台限制，非 app 缺陷。
- 使用者清掉 localStorage 或換裝置，關閉記號會重置（可接受）。

## 驗收

- Android/Chrome 桌面：進首頁看到橫幅，按安裝→原生安裝框；裝完/關閉後不再出現。
- iOS Safari：進首頁看到 iOS 加入主畫面圖文提示。
- 以 App（standalone）開啟：無任何安裝橫幅。
- manifest theme 橙、iOS 加到主畫面圖示與標題正常。
- 純函式測試全綠、tsc/build 通過。
