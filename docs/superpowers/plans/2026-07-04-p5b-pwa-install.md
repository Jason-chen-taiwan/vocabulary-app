# P5-b PWA 安裝引導 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有 PWA 殼層上加一層安裝引導 UX：首頁可關閉安裝橫幅（攔 `beforeinstallprompt` 觸發原生安裝框）、iOS 手動加入主畫面圖文提示、已安裝即隱藏，並打磨 manifest/apple 標籤。

**Architecture:** 安裝決策邏輯抽成純函式模組 `lib/pwa/install.ts`（可 TDD、Vitest node 環境）；`components/pwa-install-banner.tsx` 為薄客戶端元件，只接瀏覽器事件與呈現；首頁掛入該元件；manifest 與 layout metadata/viewport 做 apple/theme 打磨。無伺服器往返、無資料庫。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind v4（`@theme` tokens）、Vitest（`environment: 'node'`）。既有元件 `components/ui/`（Button/Card/Mascot）。

## Global Constraints

- **模組化**：安裝決策邏輯集中在純函式 `lib/pwa/install.ts`；React 元件只呈現＋接事件，不含分支決策以外的判斷。
- **正向、不騷擾**（CLAUDE.md 範圍提醒）：橫幅可關閉、關閉後寫 localStorage 記住、已安裝（standalone）不顯示。
- **只用 `@theme` 已定義色階**：primary 僅 50/100/300/500/600/700、neutral 僅 100/200/600/900。用未定義色階（如 `bg-primary-200/400`）會被 Tailwind v4 靜默丟棄、build 不報錯但元素隱形。
- **前端呈現 / 後端權威的合理例外**：install 狀態是裝置/瀏覽器本地（`beforeinstallprompt`、`display-mode`、localStorage），不涉及使用者資料或排名/獎勵數值，故不經後端；此為誠實記錄的例外，非違反資安鐵則。
- **theme_color = `#FF6A3D`**（等同 `--color-primary-500`）。
- **測試慣例**：Vitest `environment: 'node'`；純函式寫單元測試，客戶端元件不做 React render 測試（比照專案現況），以 `npx tsc --noEmit` + `npm run build` 為其驗證閘。
- TDD、頻繁提交。

---

### Task 1: 安裝決策純函式模組 `lib/pwa/install.ts`

**Files:**
- Create: `lib/pwa/install.ts`
- Test: `lib/pwa/__tests__/install.test.ts`

**Interfaces:**
- Consumes: 無（純函式，輸入皆為原始值）。
- Produces（Task 2 會用）：
  - `DISMISS_KEY: string`
  - `type InstallBannerState = 'hidden' | 'prompt' | 'ios-hint'`
  - `isIOS(ua: string): boolean`
  - `isInStandalone(opts: { displayModeStandalone: boolean; navigatorStandalone?: boolean }): boolean`
  - `installBannerState(input: { inStandalone: boolean; dismissed: boolean; canPrompt: boolean; ios: boolean }): InstallBannerState`

- [ ] **Step 1: Write the failing test**

Create `lib/pwa/__tests__/install.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isIOS, isInStandalone, installBannerState, DISMISS_KEY } from '@/lib/pwa/install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120'
const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'

describe('isIOS', () => {
  it('detects iPhone/iPad/iPod', () => {
    expect(isIOS(IPHONE)).toBe(true)
    expect(isIOS(IPAD)).toBe(true)
    expect(isIOS('... iPod ...')).toBe(true)
  })
  it('is false for Android and desktop Chrome', () => {
    expect(isIOS(ANDROID)).toBe(false)
    expect(isIOS(WIN_CHROME)).toBe(false)
  })
})

describe('isInStandalone', () => {
  it('true when display-mode standalone', () => {
    expect(isInStandalone({ displayModeStandalone: true })).toBe(true)
  })
  it('true when navigator.standalone (iOS)', () => {
    expect(isInStandalone({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true)
  })
  it('false when neither', () => {
    expect(isInStandalone({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false)
    expect(isInStandalone({ displayModeStandalone: false })).toBe(false)
  })
})

describe('installBannerState', () => {
  const base = { inStandalone: false, dismissed: false, canPrompt: false, ios: false }
  it('hidden when already installed, even if promptable', () => {
    expect(installBannerState({ ...base, inStandalone: true, canPrompt: true })).toBe('hidden')
  })
  it('hidden when dismissed', () => {
    expect(installBannerState({ ...base, dismissed: true, canPrompt: true })).toBe('hidden')
  })
  it('prompt when a beforeinstallprompt event is available', () => {
    expect(installBannerState({ ...base, canPrompt: true })).toBe('prompt')
  })
  it('ios-hint on iOS with no prompt event, not installed, not dismissed', () => {
    expect(installBannerState({ ...base, ios: true })).toBe('ios-hint')
  })
  it('hidden on non-iOS with no prompt event (e.g. Firefox desktop)', () => {
    expect(installBannerState({ ...base })).toBe('hidden')
  })
})

describe('DISMISS_KEY', () => {
  it('is a stable localStorage key', () => {
    expect(DISMISS_KEY).toBe('pwa-install-dismissed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/pwa/__tests__/install.test.ts`
Expected: FAIL — 找不到模組 `@/lib/pwa/install`。

- [ ] **Step 3: Write minimal implementation**

Create `lib/pwa/install.ts`:

```ts
// 安裝橫幅的決策純函式。install 狀態是裝置/瀏覽器本地，不經後端（見 spec 誠實記錄）。

export const DISMISS_KEY = 'pwa-install-dismissed'

export type InstallBannerState = 'hidden' | 'prompt' | 'ios-hint'

// 由 user-agent 判斷 iOS（iPhone/iPad/iPod）。
// 已知限制：iPadOS 13+ Safari 桌面版 UA 會回報 Macintosh，此情況回 false。
export function isIOS(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua)
}

// 是否已以 App（standalone）開啟。呼叫端把瀏覽器值傳入，函式保持純。
export function isInStandalone(opts: { displayModeStandalone: boolean; navigatorStandalone?: boolean }): boolean {
  return opts.displayModeStandalone || opts.navigatorStandalone === true
}

// 集中決策：已裝或已關 → hidden；可自動安裝 → prompt；iOS 無事件 → ios-hint；其餘 → hidden。
export function installBannerState(input: {
  inStandalone: boolean
  dismissed: boolean
  canPrompt: boolean
  ios: boolean
}): InstallBannerState {
  if (input.inStandalone || input.dismissed) return 'hidden'
  if (input.canPrompt) return 'prompt'
  if (input.ios) return 'ios-hint'
  return 'hidden'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/pwa/__tests__/install.test.ts`
Expected: PASS（全部 it 綠）。

- [ ] **Step 5: Commit**

```bash
git add lib/pwa/install.ts lib/pwa/__tests__/install.test.ts
git commit -m "feat(pwa): install-banner decision pure functions"
```

---

### Task 2: 安裝橫幅元件 + 掛入首頁

**Files:**
- Create: `components/pwa-install-banner.tsx`
- Modify: `app/page.tsx`（import + 在 `<h1>` 問候語下方插入 `<PwaInstallBanner />`）

**Interfaces:**
- Consumes（Task 1）：`DISMISS_KEY`、`isIOS`、`isInStandalone`、`installBannerState`、`InstallBannerState`。
- Consumes（既有）：`Button`（`@/components/ui/button`，`variant="primary"`）、`Card`（`@/components/ui/card`）、`Mascot`（`@/components/ui/mascot`，`mood="hi"` `size` number）。
- Produces：`export function PwaInstallBanner()`（React 元件，無 props）。

**驗證閘**：本 task 無單元測試（客戶端元件，比照專案慣例）；以 `npx tsc --noEmit` + `npm run build` 驗證。

- [ ] **Step 1: 建立橫幅元件**

Create `components/pwa-install-banner.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Mascot } from '@/components/ui/mascot'
import { DISMISS_KEY, isIOS, isInStandalone, installBannerState, type InstallBannerState } from '@/lib/pwa/install'

// beforeinstallprompt 尚非標準 lib.dom 型別，最小宣告。
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showIosSteps, setShowIosSteps] = useState(false)
  const [env, setEnv] = useState<{ ios: boolean; inStandalone: boolean } | null>(null)

  useEffect(() => {
    try {
      const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
      const navigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone
      setEnv({
        ios: isIOS(window.navigator.userAgent),
        inStandalone: isInStandalone({ displayModeStandalone, navigatorStandalone }),
      })
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      // 隱私模式等存取失敗：維持 env=null → 不顯示。
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!env || installed) return null

  const state: InstallBannerState = installBannerState({
    inStandalone: env.inStandalone,
    dismissed,
    canPrompt: deferred !== null,
    ios: env.ios,
  })
  if (state === 'hidden') return null

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  const install = async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch { /* ignore */ }
    setDeferred(null) // prompt 只能用一次
  }

  return (
    <Card className="flex w-full items-center gap-3 p-4">
      <Mascot mood="hi" size={48} />
      <div className="flex-1">
        <p className="text-sm font-extrabold text-neutral-900">把 App 裝到主畫面</p>
        {state === 'prompt' && <p className="text-xs text-neutral-600">離線也能背，開啟更快。</p>}
        {state === 'ios-hint' && (
          <>
            <button
              onClick={() => setShowIosSteps((v) => !v)}
              className="text-xs font-semibold text-primary-600 hover:underline"
            >
              iPhone / iPad 怎麼裝？
            </button>
            {showIosSteps && (
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-neutral-600">
                <li>點下方工具列的「分享」<span aria-hidden> ⬆️</span></li>
                <li>捲動選單，點「加入主畫面」</li>
                <li>右上角點「加入」</li>
              </ol>
            )}
          </>
        )}
      </div>
      {state === 'prompt' && <Button variant="primary" onClick={install}>安裝</Button>}
      <button onClick={close} aria-label="關閉安裝提示" className="self-start text-neutral-600 hover:text-neutral-900">
        ✕
      </button>
    </Card>
  )
}
```

- [ ] **Step 2: 掛入首頁**

Modify `app/page.tsx`：在既有 import 區塊末尾加入：

```tsx
import { PwaInstallBanner } from '@/components/pwa-install-banner'
```

在 `<h1 ...>歡迎，{user.name ?? user.email}</h1>` 之後、`<Card className="flex w-full flex-col items-center gap-3 p-6">`（GoalRing 卡）之前，插入：

```tsx
        <PwaInstallBanner />
```

插入後該段落應為：

```tsx
        <h1 className="text-xl font-extrabold text-neutral-900">歡迎，{user.name ?? user.email}</h1>

        <PwaInstallBanner />

        <Card className="flex w-full flex-col items-center gap-3 p-6">
```

- [ ] **Step 3: 型別檢查與建置**

Run: `npx tsc --noEmit`
Expected: 無錯誤。

Run: `npm run build`
Expected: `Compiled successfully`；首頁 `/` 正常。

- [ ] **Step 4: 回歸測試（確認沒弄壞既有）**

Run: `npx vitest run`
Expected: 全部通過（Task 1 新增的測試也在內）。

- [ ] **Step 5: Commit**

```bash
git add components/pwa-install-banner.tsx app/page.tsx
git commit -m "feat(pwa): dismissible install banner on home (prompt + iOS hint)"
```

---

### Task 3: manifest 與 apple/theme 打磨

**Files:**
- Modify: `public/manifest.webmanifest`（`theme_color`）
- Modify: `app/layout.tsx`（`metadata.appleWebApp`、`metadata.icons.apple`、新增 `viewport` 匯出）

**Interfaces:**
- Consumes: 無。
- Produces: 無程式介面（純設定）。

**驗證閘**：無單元測試；以 `npm run build` + 內容檢查驗證。

- [ ] **Step 1: 改 manifest theme_color 為品牌橙**

Modify `public/manifest.webmanifest`：把 `"theme_color": "#000000"` 改為 `"#FF6A3D"`。改後全檔應為：

```json
{
  "name": "VocabApp 字彙學習",
  "short_name": "VocabApp",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#FF6A3D",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: 加 apple 標籤與 viewport themeColor**

Modify `app/layout.tsx`：

第 1 行 import 改為同時引入 `Viewport` 型別：

```tsx
import type { Metadata, Viewport } from "next";
```

把既有 `metadata` 物件（第 20–24 行）改為：

```tsx
export const metadata: Metadata = {
  title: "VocabApp 字彙學習",
  description: "考試導向的英文字彙學習 PWA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "VocabApp" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#FF6A3D",
};
```

- [ ] **Step 3: 建置驗證**

Run: `npx tsc --noEmit`
Expected: 無錯誤。

Run: `npm run build`
Expected: `Compiled successfully`（Next 會據 metadata 產生 `<link rel="apple-touch-icon">`、`<meta name="apple-mobile-web-app-*">`、`<meta name="theme-color" content="#FF6A3D">`）。

- [ ] **Step 4: 內容檢查**

Run: `grep -o '"theme_color": "#FF6A3D"' public/manifest.webmanifest`
Expected: 印出 `"theme_color": "#FF6A3D"`（確認已改）。

- [ ] **Step 5: Commit**

```bash
git add public/manifest.webmanifest app/layout.tsx
git commit -m "chore(pwa): brand theme_color + apple-touch-icon/apple meta polish"
```

---

## Self-Review

**1. Spec coverage：**
- 首頁可關閉橫幅（進首頁即出現）→ Task 2（掛首頁、`close()` 寫 localStorage）。✅
- 攔 `beforeinstallprompt` + 自訂安裝鈕觸發原生框 → Task 2（`onBeforeInstallPrompt` + `install()`）。✅
- iOS 手動加入主畫面圖文提示 → Task 2（`ios-hint` 分支 + 步驟 `<ol>`）。✅
- 已安裝（standalone）或已關閉 → 不顯示 → Task 1（`installBannerState`）+ Task 2（`env.inStandalone`/`dismissed`/`appinstalled`）。✅
- manifest theme_color 橙 + apple 標籤 → Task 3。✅
- 決策邏輯純函式可測 → Task 1。✅
- 已知限制（beforeinstallprompt 支援不一、install 為裝置本地）→ 已在 spec 記錄；程式以「落到 hidden」對應。✅

**2. Placeholder scan：** 無 TBD/TODO/「similar to」；每個改碼步驟都附完整程式。✅

**3. Type consistency：** `InstallBannerState` 三值（`'hidden' | 'prompt' | 'ios-hint'`）在 Task 1 定義、Task 2 使用一致；`installBannerState` 入參 `{ inStandalone, dismissed, canPrompt, ios }` 與 Task 2 呼叫端一致；`isInStandalone` 入參 `{ displayModeStandalone, navigatorStandalone? }` 與 Task 2 一致；`Button`/`Card`/`Mascot` 依既有簽章使用。✅
