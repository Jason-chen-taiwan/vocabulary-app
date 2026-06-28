# UI/UX 視覺改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為既有功能建立一致的視覺設計系統（活潑遊戲化 × 亮底 × 活力橙）並套用到全部頁面，純表現層、不改任何業務邏輯/資料/引擎。

**Architecture:** 於 `app/globals.css` 用 Tailwind v4 `@theme` 定義 design tokens（橙色階/中性/語義色、半徑、陰影、字體變數）；用 `next/font` 載入 Nunito + Noto Sans TC；新增純表現元件層 `components/ui/`（Button/Card/CelebrateCard/StatPill/ProgressBar/GoalRing/OptionButton）；逐頁套用「平時柔和(A) + 慶祝描邊硬投影(B)」。資料一律沿用既有 repository 唯讀方法。

**Tech Stack:** Next.js 16 App Router、React 19、Tailwind CSS v4（`@tailwindcss/postcss`）、`next/font/google`、Vitest。無新增 runtime 依賴。

## Global Constraints

- 純表現層：**不改**業務邏輯、server action 介面、資料模型、repository 既有方法（可唯讀「呼叫」既有方法，不可新增/改寫資料方法）。
- 既有 **103 個測試必須維持全綠**；新增的純元件可加單元測試。
- 不新增 runtime 依賴；字體用 `next/font`（build 期 self-host，edge 安全、零 API 成本）。
- 亮色固定，**移除** `prefers-color-scheme` 深色覆寫（深色模式不在本輪）。
- 設計 token 實際值（verbatim，集中於 `globals.css @theme`）：
  - primary：50 `#FFF1E8`、100 `#FFE3D3`、300 `#FFB68F`、500 `#FF6A3D`、600 `#E8551F`、700 `#C2410C`
  - 中性：ink `#1A1A1A`、neutral-900 `#2B2B2B`、neutral-600 `#6B6B6B`、neutral-200 `#E6E6E6`、neutral-100 `#F0F0F0`、surface `#FFFFFF`、bg-warm `#FFF7F2`
  - 語義：success `#22A06B`、error `#E5484D`、mastery `#7C5CFC`、coin `#F5B301`、streak = primary-500
  - 半徑：card 20px、control 14px、celebrate 16px、pill 999px
  - 陰影：soft `0 12px 30px rgba(255,106,61,.18)`、press `0 6px 14px rgba(255,106,61,.35)`、hard `4px 4px 0 #1A1A1A`
- 字體：Nunito（拉丁/數字，400/600/700/800）+ Noto Sans TC（中文，400/500/700）。
- tap target ≥ 44px；focus-visible 可見；尊重 `prefers-reduced-motion`。
- 跟隨既有寫法：頁面為 server component（除需互動者）、`@/` 路徑別名、繁中文案。

**計畫層面對 spec §6 的微調（資料就近、維持零新查詢）：**
- 單字書「進度（已精熟/總數）」放在**詳情頁**（已載入該書單字，交集既有 `listMasteredWordIds`），列表頁只顯示單字數 + 等級。
- 首頁暫不顯示「今日待複習 N 字」（需新查詢）；每日目標環已表達今日進度。兩者列為未來再加。

---

## File Structure

**新增**
- `components/ui/button.tsx` — `Button`（variant：primary/secondary/ghost/celebrate）+ 匯出 `BUTTON_VARIANT` class map。
- `components/ui/card.tsx` — `Card`（柔和圓角卡，可當 `Link`）。
- `components/ui/stat-pill.tsx` — `StatPill`（膠囊數值）。
- `components/ui/progress-bar.tsx` — `ProgressBar`（百分比橫條）+ 匯出 `clampPct`。
- `components/ui/goal-ring.tsx` — `GoalRing`（SVG 圓環）+ 匯出 `ringGeometry`。
- `components/ui/option-button.tsx` — `OptionButton`（複習選項）+ 匯出 `OPTION_STATE`。
- `components/ui/celebrate-card.tsx` — `CelebrateCard`（描邊硬投影）+ 匯出 `CELEBRATE_TONE`。
- 測試：`components/ui/__tests__/ui.test.ts`（測純函式/映射：`BUTTON_VARIANT`、`clampPct`、`ringGeometry`、`OPTION_STATE`、`CELEBRATE_TONE`）。

**修改**
- `app/globals.css` — tokens、字體、base、reduced-motion。
- `app/layout.tsx` — 載入 Nunito + Noto Sans TC，套變數類別。
- `components/gamification-bar.tsx` — 用 StatPill 重做 + 等級進度小條。
- `components/review-session.tsx` — 套 OptionButton/ProgressBar/CelebrateCard + 完成後 `router.refresh()` + 動效。
- `components/sign-in-button.tsx`、`components/tts-button.tsx` — 換新樣式。
- `app/login/page.tsx`、`app/page.tsx`、`app/books/page.tsx`、`app/books/[slug]/page.tsx`、`app/words/[id]/page.tsx` — 逐頁套版。

---

## Task 1: Design tokens + 字體 + 全域 base

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces：Tailwind utilities `bg-primary-500`/`text-primary-600`/`bg-bg-warm`/`text-neutral-900`/`rounded-card`/`rounded-control`/`shadow-hard`/`shadow-soft`/`font-display` 等；CSS 變數 `--font-nunito`、`--font-noto-tc`。

- [ ] **Step 1: 改寫 `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-primary-50: #FFF1E8;
  --color-primary-100: #FFE3D3;
  --color-primary-300: #FFB68F;
  --color-primary-500: #FF6A3D;
  --color-primary-600: #E8551F;
  --color-primary-700: #C2410C;

  --color-ink: #1A1A1A;
  --color-neutral-900: #2B2B2B;
  --color-neutral-600: #6B6B6B;
  --color-neutral-200: #E6E6E6;
  --color-neutral-100: #F0F0F0;
  --color-surface: #FFFFFF;
  --color-bg-warm: #FFF7F2;

  --color-success: #22A06B;
  --color-error: #E5484D;
  --color-mastery: #7C5CFC;
  --color-coin: #F5B301;
  --color-streak: #FF6A3D;

  --radius-control: 14px;
  --radius-celebrate: 16px;
  --radius-card: 20px;

  --shadow-soft: 0 12px 30px rgba(255, 106, 61, 0.18);
  --shadow-press: 0 6px 14px rgba(255, 106, 61, 0.35);
  --shadow-hard: 4px 4px 0 #1A1A1A;

  --font-display: var(--font-nunito), var(--font-noto-tc), system-ui, sans-serif;
}

@layer base {
  body {
    background: var(--color-bg-warm);
    color: var(--color-neutral-900);
    font-family: var(--font-display);
  }
}

@keyframes pop-in {
  0% { opacity: 0; transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}
.animate-pop-in { animation: pop-in 250ms ease-out both; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: 改寫 `app/layout.tsx` 載入字體**

```tsx
import type { Metadata } from "next";
import { Nunito, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

const notoTC = Noto_Sans_TC({
  weight: ["400", "500", "700"],
  variable: "--font-noto-tc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "VocabApp 字彙學習",
  description: "考試導向的英文字彙學習 PWA",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-Hant"
      className={`${nunito.variable} ${notoTC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<PwaRegister /></body>
    </html>
  );
}
```

- [ ] **Step 3: 驗證 build**

Run: `npm run build`
Expected: 成功（字體下載、Tailwind 編譯通過）。若 `Noto_Sans_TC` 報需要 `subsets`，保留 `preload:false` 即可（不加 subsets）；若仍報錯，加 `subsets:['latin']`。

- [ ] **Step 4: 跑既有測試確認沒壞**

Run: `npx vitest run`
Expected: 103 passed。

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(ui): design tokens + Nunito/Noto Sans TC fonts + light base"
```

---

## Task 2: UI primitives（Button / Card / StatPill）

**Files:**
- Create: `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/stat-pill.tsx`
- Create: `components/ui/__tests__/ui.test.ts`

**Interfaces:**
- Consumes：Task 1 的 utilities。
- Produces：
  - `BUTTON_VARIANT: Record<'primary'|'secondary'|'ghost'|'celebrate', string>`
  - `Button(props: { variant?: Variant; fullWidth?: boolean; className?: string } & ButtonHTMLAttributes)`
  - `Card(props: { className?: string; children })` + `CardLink(props: { href: string; className?; children })`
  - `StatPill(props: { icon: string; value: ReactNode; label?: string })`

- [ ] **Step 1: 寫失敗測試（class map）**

建立 `components/ui/__tests__/ui.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { BUTTON_VARIANT } from '@/components/ui/button'

describe('BUTTON_VARIANT', () => {
  it('has the four variants', () => {
    expect(Object.keys(BUTTON_VARIANT).sort()).toEqual(['celebrate', 'ghost', 'primary', 'secondary'])
  })
  it('primary uses brand orange, celebrate uses ink border', () => {
    expect(BUTTON_VARIANT.primary).toContain('bg-primary-500')
    expect(BUTTON_VARIANT.celebrate).toContain('border-ink')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/ui/__tests__/ui.test.ts`
Expected: FAIL（`@/components/ui/button` 不存在）。

- [ ] **Step 3: 實作 button.tsx**

```tsx
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'celebrate'

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary-500 text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] hover:bg-primary-600',
  secondary: 'bg-surface text-neutral-900 border-2 border-primary-200 hover:bg-primary-50',
  ghost: 'bg-transparent text-neutral-600 hover:text-neutral-900',
  celebrate: 'bg-primary-500 text-white border-[3px] border-ink shadow-hard active:translate-x-[1px] active:translate-y-[1px]',
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  ...props
}: { variant?: ButtonVariant; fullWidth?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-control px-5 py-3 font-bold transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${BUTTON_VARIANT[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    />
  )
}
```

- [ ] **Step 4: 實作 card.tsx**

```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card bg-surface shadow-[0_12px_30px_rgba(255,106,61,.10)] ${className}`}>{children}</div>
}

export function CardLink({ href, className = '', children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`block rounded-card bg-surface shadow-[0_12px_30px_rgba(255,106,61,.10)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(255,106,61,.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${className}`}
    >
      {children}
    </Link>
  )
}
```

- [ ] **Step 5: 實作 stat-pill.tsx**

```tsx
import type { ReactNode } from 'react'

export function StatPill({ icon, value, label }: { icon: string; value: ReactNode; label?: string }) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-pill bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-600"
    >
      <span aria-hidden>{icon}</span>
      <span>{value}</span>
    </span>
  )
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run components/ui/__tests__/ui.test.ts`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add components/ui/button.tsx components/ui/card.tsx components/ui/stat-pill.tsx components/ui/__tests__/ui.test.ts
git commit -m "feat(ui): Button/Card/StatPill primitives"
```

---

## Task 3: UI primitives（ProgressBar / GoalRing / OptionButton / CelebrateCard）

**Files:**
- Create: `components/ui/progress-bar.tsx`, `components/ui/goal-ring.tsx`, `components/ui/option-button.tsx`, `components/ui/celebrate-card.tsx`
- Modify: `components/ui/__tests__/ui.test.ts`

**Interfaces:**
- Produces：
  - `clampPct(value: number, max: number): number`（0–100）
  - `ringGeometry(done: number, goal: number, radius: number): { circumference: number; offset: number }`
  - `OPTION_STATE: Record<'idle'|'correct'|'wrong'|'dimmed', string>`
  - `CELEBRATE_TONE: Record<'reward'|'coin'|'mastery'|'level', string>`
  - `ProgressBar({ value, max })`、`GoalRing({ done, goal })`、`OptionButton({ state, disabled, onClick, children })`、`CelebrateCard({ tone, children })`

- [ ] **Step 1: 追加失敗測試**

在 `components/ui/__tests__/ui.test.ts` 末端追加：

```ts
import { clampPct } from '@/components/ui/progress-bar'
import { ringGeometry } from '@/components/ui/goal-ring'
import { OPTION_STATE } from '@/components/ui/option-button'
import { CELEBRATE_TONE } from '@/components/ui/celebrate-card'

describe('clampPct', () => {
  it('maps value/max to 0..100 and clamps', () => {
    expect(clampPct(5, 20)).toBe(25)
    expect(clampPct(30, 20)).toBe(100)
    expect(clampPct(-5, 20)).toBe(0)
    expect(clampPct(1, 0)).toBe(0)
  })
})

describe('ringGeometry', () => {
  it('full circle offset is 0 at/over goal, full circumference at 0', () => {
    const r = 40
    const c = 2 * Math.PI * r
    expect(ringGeometry(0, 20, r).offset).toBeCloseTo(c)
    expect(ringGeometry(20, 20, r).offset).toBeCloseTo(0)
    expect(ringGeometry(30, 20, r).offset).toBeCloseTo(0)
    expect(ringGeometry(10, 20, r).offset).toBeCloseTo(c / 2)
    expect(ringGeometry(5, 20, r).circumference).toBeCloseTo(c)
  })
  it('treats goal<=0 as empty (offset = full circumference)', () => {
    const r = 40
    expect(ringGeometry(3, 0, r).offset).toBeCloseTo(2 * Math.PI * r)
  })
})

describe('OPTION_STATE / CELEBRATE_TONE', () => {
  it('option states map to colors', () => {
    expect(Object.keys(OPTION_STATE).sort()).toEqual(['correct', 'dimmed', 'idle', 'wrong'])
    expect(OPTION_STATE.correct).toContain('success')
    expect(OPTION_STATE.wrong).toContain('error')
  })
  it('celebrate tones map to semantic colors', () => {
    expect(CELEBRATE_TONE.coin).toContain('coin')
    expect(CELEBRATE_TONE.mastery).toContain('mastery')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/ui/__tests__/ui.test.ts`
Expected: FAIL（新模組不存在）。

- [ ] **Step 3: 實作 progress-bar.tsx**

```tsx
export function clampPct(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)))
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = clampPct(value, max)
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-primary-100">
      <div className="h-full rounded-pill bg-primary-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
```

- [ ] **Step 4: 實作 goal-ring.tsx**

```tsx
export function ringGeometry(done: number, goal: number, radius: number): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * radius
  const pct = goal <= 0 ? 0 : Math.max(0, Math.min(1, done / goal))
  return { circumference, offset: circumference * (1 - pct) }
}

export function GoalRing({ done, goal }: { done: number; goal: number }) {
  const radius = 52
  const { circumference, offset } = ringGeometry(done, goal, radius)
  const reached = goal > 0 && done >= goal
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--color-primary-100)" strokeWidth="12" />
        <circle
          cx="64" cy="64" r={radius} fill="none" stroke="var(--color-primary-500)" strokeWidth="12"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-extrabold text-neutral-900">{reached ? '✓' : done}</span>
        <span className="text-xs font-bold text-neutral-600">/ {goal} 今日</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 實作 option-button.tsx**

```tsx
'use client'
import type { ReactNode } from 'react'

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dimmed'

export const OPTION_STATE: Record<OptionState, string> = {
  idle: 'border-primary-100 bg-surface text-neutral-900 hover:border-primary-300',
  correct: 'border-success bg-[#E9F7F0] text-success',
  wrong: 'border-error bg-[#FDECEC] text-error',
  dimmed: 'border-neutral-200 bg-surface text-neutral-600 opacity-60',
}

export function OptionButton({
  state, disabled, onClick, children,
}: { state: OptionState; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className={`w-full rounded-control border-2 px-4 py-3 text-left font-semibold transition ${OPTION_STATE[state]}`}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 6: 實作 celebrate-card.tsx**

```tsx
import type { ReactNode } from 'react'

export type CelebrateTone = 'reward' | 'coin' | 'mastery' | 'level'

export const CELEBRATE_TONE: Record<CelebrateTone, string> = {
  reward: 'bg-primary-500 text-white',
  coin: 'bg-coin text-ink',
  mastery: 'bg-mastery text-white',
  level: 'bg-success text-white',
}

export function CelebrateCard({ tone, children }: { tone: CelebrateTone; children: ReactNode }) {
  return (
    <div className={`animate-pop-in rounded-celebrate border-[3px] border-ink px-4 py-3 text-center font-extrabold shadow-[3px_3px_0_#1A1A1A] ${CELEBRATE_TONE[tone]}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 7: 跑測試確認通過**

Run: `npx vitest run components/ui/__tests__/ui.test.ts`
Expected: PASS（全部）。

- [ ] **Step 8: Commit**

```bash
git add components/ui/progress-bar.tsx components/ui/goal-ring.tsx components/ui/option-button.tsx components/ui/celebrate-card.tsx components/ui/__tests__/ui.test.ts
git commit -m "feat(ui): ProgressBar/GoalRing/OptionButton/CelebrateCard primitives"
```

---

## Task 4: 頂部列重做 + 結束後即時更新

**Files:**
- Modify: `components/gamification-bar.tsx`
- Modify: `components/review-session.tsx`

**Interfaces:**
- Consumes：`StatPill`（Task 2）、`ProgressBar`（Task 3）、既有 `GamificationRepository.getContext`、既有 `submitAnswerAction`/`finishSessionAction`。
- 行為要求：複習結束後頂部列數值正確反映新狀態。

- [ ] **Step 1: 重做 `components/gamification-bar.tsx`**

維持 server component 與既有 try/catch 取值；改用 StatPill + 等級進度（本級 XP 進度＝`xp % 100`）：

```tsx
import { getCurrentUser } from '@/lib/auth/session'
import { GamificationRepository } from '@/lib/gamification/repository'
import { StatPill } from '@/components/ui/stat-pill'

// 伺服器元件：🔥streak · Lv.N(本級進度) · 🪙coins。無登入/無狀態顯示初始值。
export async function GamificationBar() {
  const user = await getCurrentUser()
  if (!user) return null
  let streak = 0, level = 1, coins = 0, xp = 0
  try {
    const { state } = await new GamificationRepository().getContext(user.id)
    if (state) { streak = state.streak; level = state.level; coins = state.coinBalance; xp = state.xp }
  } catch {
    // 取不到狀態用初始值，不阻斷頁面
  }
  const levelPct = xp % 100
  return (
    <div className="sticky top-0 z-10 border-b border-primary-100 bg-bg-warm/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 px-4 py-2">
        <StatPill icon="🔥" value={streak} label="連續達標天數" />
        <span className="inline-flex items-center gap-2 rounded-pill bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-600">
          Lv.{level}
          <span className="h-1.5 w-10 overflow-hidden rounded-pill bg-primary-300/50">
            <span className="block h-full rounded-pill bg-primary-500" style={{ width: `${levelPct}%` }} />
          </span>
        </span>
        <StatPill icon="🪙" value={coins} label="金幣" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 結束後 refresh（`components/review-session.tsx`）**

於 `next()` 完成分支，`finishSessionAction` 之後、`setDone(true)` 之前加入 `router.refresh()`（`useRouter` 已 import）。把該分支改為：

```tsx
    if (index + 1 >= items.length) {
      setBusy(true)
      try {
        const res = await finishSessionAction(items.length, correctCount)
        if (res.reward) {
          setSessionPerfect(res.reward.perfect)
          if (res.reward.newBadges.length) {
            setRewards((prev) => ({ ...prev, badges: [...prev.badges, ...res.reward!.newBadges] }))
          }
        }
      } catch { /* ignore */ }
      router.refresh()
      setDone(true)
      return
    }
```

- [ ] **Step 3: build + tsc**

Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功。

- [ ] **Step 4: 既有測試**

Run: `npx vitest run`
Expected: 103 passed（含 Task 2/3 新增）。

- [ ] **Step 5: Commit**

```bash
git add components/gamification-bar.tsx components/review-session.tsx
git commit -m "feat(ui): restyle top bar (StatPill + level progress); refresh after session"
```

---

## Task 5: 登入頁 + 首頁儀表板

**Files:**
- Modify: `app/login/page.tsx`, `app/page.tsx`, `components/sign-in-button.tsx`

**Interfaces:**
- Consumes：`GamificationBar`、`GoalRing`（Task 3）、`Card`（Task 2）、`Button`（Task 2）、既有 `GamificationRepository.getContext`、既有 `lib/gamification/date` 的 `todayYmd`。

- [ ] **Step 1: 重做 `components/sign-in-button.tsx`**

```tsx
import { signIn } from '@/auth'

export function SignInButton() {
  return (
    <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }) }}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-control border-2 border-primary-200 bg-surface px-5 py-3 font-bold text-neutral-900 shadow-[0_6px_14px_rgba(255,106,61,.15)] transition hover:bg-primary-50"
      >
        使用 Google 登入
      </button>
    </form>
  )
}
```

- [ ] **Step 2: 重做 `app/login/page.tsx`**

```tsx
import { SignInButton } from '@/components/sign-in-button'
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-5xl">🔥</div>
      <h1 className="text-3xl font-extrabold text-neutral-900">VocabApp</h1>
      <p className="text-neutral-600">考試導向的英文字彙學習，邊背邊解鎖成就。</p>
      <SignInButton />
    </main>
  )
}
```

- [ ] **Step 3: 重做 `app/page.tsx`（儀表板）**

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { GamificationBar } from '@/components/gamification-bar'
import { GamificationRepository } from '@/lib/gamification/repository'
import { todayYmd } from '@/lib/gamification/date'
import { GoalRing } from '@/components/ui/goal-ring'
import { Card } from '@/components/ui/card'
import { SignOutButton } from '@/components/sign-out-button'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  let done = 0, goal = 20, streak = 0, longest = 0
  try {
    const { state, timezone, dailyGoal } = await new GamificationRepository().getContext(user.id)
    goal = dailyGoal
    if (state) {
      streak = state.streak
      longest = state.longestStreak
      // reviewsToday 只在「今天」才算數（懶評估尚未跨日重置時避免顯示昨天的數）
      done = state.lastReviewDate === todayYmd(new Date(), timezone) ? state.reviewsToday : 0
    }
  } catch { /* 用預設值，不阻斷頁面 */ }

  return (
    <>
      <GamificationBar />
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-8">
        <h1 className="text-xl font-extrabold text-neutral-900">歡迎，{user.name ?? user.email}</h1>

        <Card className="flex w-full flex-col items-center gap-3 p-6">
          <GoalRing done={done} goal={goal} />
          <p className="text-sm font-semibold text-neutral-600">今日目標進度</p>
        </Card>

        <Card className="flex w-full items-center justify-between p-5">
          <div>
            <div className="text-2xl font-extrabold text-primary-600">🔥 {streak} 天</div>
            <div className="text-xs font-semibold text-neutral-600">最長 {longest} 天</div>
          </div>
          <span className="text-sm font-semibold text-neutral-600">連續達標</span>
        </Card>

        <Link
          href="/books"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-4 text-lg font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          開始學單字
        </Link>

        <SignOutButton />
      </main>
    </>
  )
}
```

- [ ] **Step 4: build + tsc + 測試**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、103 passed。

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx app/page.tsx components/sign-in-button.tsx
git commit -m "feat(ui): redesign login + home dashboard (goal ring, streak card)"
```

---

## Task 6: 單字書列表 + 詳情

**Files:**
- Modify: `app/books/page.tsx`, `app/books/[slug]/page.tsx`

**Interfaces:**
- Consumes：`GamificationBar`、`CardLink`/`Card`（Task 2）、`StatPill`（Task 2）、`ProgressBar`（Task 3）、既有 `ContentRepository.listWordBooks`/`getWordBookBySlug`/`listWordsByBook`、既有 `LearningRepository.listMasteredWordIds`。

- [ ] **Step 1: 重做 `app/books/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { CardLink } from '@/components/ui/card'
import { StatPill } from '@/components/ui/stat-pill'

export default async function BooksPage() {
  if (!(await getCurrentUser())) redirect('/login')
  const books = await new ContentRepository().listWordBooks()
  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-extrabold text-neutral-900">單字書</h1>
        {books.length === 0 ? (
          <p className="text-neutral-600">目前還沒有單字書。</p>
        ) : (
          <ul className="space-y-3">
            {books.map((b) => (
              <li key={b.id}>
                <CardLink href={`/books/${b.slug}`} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-extrabold text-neutral-900">{b.name}</div>
                    <StatPill icon="📚" value={`${b.wordCount} 字`} />
                  </div>
                  {b.description && <div className="mt-1 text-sm text-neutral-600">{b.description}</div>}
                  {b.level && <div className="mt-1 text-xs font-semibold text-primary-600">{b.level}</div>}
                </CardLink>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 2: 重做 `app/books/[slug]/page.tsx`（含進度 + 每字精熟✓）**

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { LearningRepository } from '@/lib/learning/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { slug } = await params
  const repo = new ContentRepository()
  const book = await repo.getWordBookBySlug(slug)
  if (!book) notFound()
  const words = await repo.listWordsByBook(book.id)
  const masteredSet = new Set(await new LearningRepository().listMasteredWordIds(user.id))
  const masteredHere = words.filter((w) => masteredSet.has(w.id)).length

  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link href="/books" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 所有單字書</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">{book.name}</h1>

        <Card className="my-4 p-5">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-neutral-600">
            <span>已精熟 {masteredHere} / {words.length}</span>
          </div>
          <ProgressBar value={masteredHere} max={words.length} />
        </Card>

        <Link
          href={`/learn/${slug}`}
          className="mb-5 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          開始複習
        </Link>

        <ul className="space-y-2">
          {words.map((w) => (
            <li key={w.id}>
              <Link
                href={`/words/${w.id}`}
                className="flex items-center justify-between gap-3 rounded-control bg-surface px-4 py-3 shadow-[0_6px_16px_rgba(255,106,61,.08)] transition hover:-translate-y-0.5"
              >
                <span className="flex items-center gap-2 font-bold text-neutral-900">
                  {masteredSet.has(w.id) && <span title="已精熟" className="text-success">✓</span>}
                  {w.headword}
                </span>
                <span className="ml-4 truncate text-sm text-neutral-600">{w.definitionZh}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
```

- [ ] **Step 3: build + tsc + 測試**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、103 passed。

- [ ] **Step 4: Commit**

```bash
git add app/books/page.tsx app/books/[slug]/page.tsx
git commit -m "feat(ui): redesign books list + detail (cards, mastery progress)"
```

---

## Task 7: 單字詳情頁

**Files:**
- Modify: `app/words/[id]/page.tsx`, `components/tts-button.tsx`

**Interfaces:**
- Consumes：`Card`（Task 2）、既有 `ContentRepository.getWordWithExamples`、既有 `TtsButton`。

- [ ] **Step 1: 重做 `components/tts-button.tsx`（只換樣式，邏輯不動）**

把回傳 `<button>` 的 `className` 改為：

```tsx
      className="inline-flex min-h-9 items-center gap-1 rounded-pill border-2 border-primary-200 bg-surface px-3 py-1 text-sm font-bold text-primary-600 transition hover:bg-primary-50 disabled:opacity-40"
```

（其餘 `'use client'`、`useEffect`、`speak`、`aria-label`、文字「🔊 發音」維持不變。）

- [ ] **Step 2: 重做 `app/words/[id]/page.tsx`**

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { TtsButton } from '@/components/tts-button'
import { Card } from '@/components/ui/card'

export default async function WordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect('/login')
  const { id } = await params
  const word = await new ContentRepository().getWordWithExamples(id)
  if (!word) notFound()
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href={`/books`} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 單字書</Link>
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-3xl font-extrabold text-neutral-900">{word.headword}</h1>
        <TtsButton text={word.headword} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-neutral-600">
        {word.phonetic && <span>{word.phonetic}</span>}
        {word.partOfSpeech && (
          <span className="rounded-pill bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-600">{word.partOfSpeech}</span>
        )}
      </div>
      <p className="mt-3 text-lg text-neutral-900">{word.definitionZh}</p>

      <h2 className="mt-6 mb-2 text-sm font-bold text-neutral-600">例句</h2>
      <ul className="space-y-3">
        {word.examples.map((e) => (
          <li key={e.id}>
            <Card className="p-4">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-neutral-900">{e.sentence}</p>
                <TtsButton text={e.sentence} />
              </div>
              <p className="mt-1 text-sm text-neutral-600">{e.translationZh}</p>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: build + tsc + 測試**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、103 passed。

- [ ] **Step 4: Commit**

```bash
git add app/words/[id]/page.tsx components/tts-button.tsx
git commit -m "feat(ui): redesign word detail (cards, tags, back-link)"
```

---

## Task 8: 複習作答 + 結束慶祝畫面

**Files:**
- Modify: `components/review-session.tsx`

**Interfaces:**
- Consumes：`OptionButton`/`ProgressBar`/`CelebrateCard`（Task 3）、`TtsButton`、既有 `submitAnswerAction`/`finishSessionAction`/`checkAnswer`/`sample`/`Question`。
- 不改：作答邏輯、`commit`/`evaluate`/`onPick`/`onSubmitText`、reward 累加、busy 守衛、Task 4 已加的 `router.refresh()`。

- [ ] **Step 1: 套版 `components/review-session.tsx`（只換呈現，不動邏輯）**

維持所有 hooks/handler 不變，只替換 JSX 呈現層：
- 外層 `<main>` 改 `className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-8"`。
- 進度：把原本 `{index + 1} / {items.length}` 那行下方加入 `<ProgressBar value={index + 1} max={items.length} />`；返回連結與抽考標籤改用 token 色（`text-neutral-600`、抽考標籤 `bg-mastery text-white rounded-pill px-2 py-0.5 text-xs`）。
- 單字 prompt：`text-neutral-900`，提示 `text-neutral-600`。
- MC 選項：用 `OptionButton`，state 由現有邏輯推導——

```tsx
{q.type === 'mc' && options && (
  <div className="grid gap-2">
    {options.map((opt) => {
      const st = result
        ? opt === q.answer ? 'correct' : opt === picked ? 'wrong' : 'dimmed'
        : 'idle'
      return (
        <OptionButton key={opt} state={st as 'idle'|'correct'|'wrong'|'dimmed'} disabled={!!result} onClick={() => onPick(opt)}>
          {opt}
        </OptionButton>
      )
    })}
  </div>
)}
```

- 打字輸入框：`className="w-full rounded-control border-2 border-primary-200 bg-surface px-4 py-3 text-center text-lg text-neutral-900 focus:border-primary-500 focus:outline-none"`；送出鈕用 `<Button fullWidth>作答</Button>`。
- 作答回饋：答對 `text-success`、答錯 `text-error`；正解列 `text-neutral-900`。
- 「下一個/完成」鈕：用 `<Button variant="primary" fullWidth disabled={busy}>`。

- [ ] **Step 2: 結束慶祝畫面（done 區塊）改為 CelebrateCard**

把 `done` 分支的 `<main>` 內容改為：

```tsx
  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-extrabold text-neutral-900">完成！</h1>
        <p className="text-sm text-neutral-600">本次複習了 {items.length} 個單字</p>
        <div className="mt-2 grid w-full max-w-xs gap-2">
          <CelebrateCard tone="reward">+{rewards.xp} XP</CelebrateCard>
          {rewards.coins > 0 && <CelebrateCard tone="coin">+{rewards.coins} 🪙</CelebrateCard>}
          {rewards.level !== null && <CelebrateCard tone="level">升級到 Lv.{rewards.level}！</CelebrateCard>}
          {sessionPerfect && <CelebrateCard tone="mastery">完美一回，全部答對！</CelebrateCard>}
          {rewards.badges.length > 0 && <CelebrateCard tone="mastery">🏆 {rewards.badges.join('、')}</CelebrateCard>}
        </div>
        <div className="mt-6 flex justify-center gap-4">
          <Link href={`/books/${bookSlug}`} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 回單字書</Link>
          <button onClick={() => router.refresh()} className="text-sm font-bold text-primary-600 hover:underline">再來一輪</button>
        </div>
      </main>
    )
  }
```

於檔案頂部 import 新增：`import { OptionButton } from '@/components/ui/option-button'`、`import { ProgressBar } from '@/components/ui/progress-bar'`、`import { CelebrateCard } from '@/components/ui/celebrate-card'`、`import { Button } from '@/components/ui/button'`。

- [ ] **Step 3: build + tsc + 測試**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: 乾淨、成功、103 passed。

- [ ] **Step 4: Commit**

```bash
git add components/review-session.tsx
git commit -m "feat(ui): redesign review session + celebration end screen"
```

---

## Task 9: 全量驗證 + 手動視覺驗收

**Files:** 無（驗證）

- [ ] **Step 1: 全量測試**

Run: `npx vitest run`
Expected: 全部 passed（103 既有 + UI 純函式新測）。

- [ ] **Step 2: tsc + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 乾淨、成功，6 路由產生。

- [ ] **Step 3: 手動視覺驗收（dev，手機寬視窗）**

`npm run dev`，登入後逐頁檢查（窄視窗模擬手機）：
- 登入頁、首頁儀表板（目標環/streak 卡/主鈕）、單字書列表（卡片）、詳情（進度條 + 每字 ✓）、單字詳情（例句卡）、複習作答（選項配色、答對綠/答錯紅、進度條）、結束慶祝（CelebrateCard 描邊硬投影）。
- 完成一輪後**頂部列數值即時更新**（streak/Lv/🪙）。
- 字體為 Nunito/Noto Sans TC（非 Arial）；底色暖白非黑。
驗證後關閉 dev server（PowerShell 找 port 3000 node 程序結束）。

- [ ] **Step 4: 最終 commit（若手動驗收有微調）**

```bash
git add -A
git commit -m "test(ui): visual verification pass"
```

---

## Self-Review

**1. Spec coverage：**
- §3 tokens → Task 1 ✓；§4 字體 → Task 1 ✓；§5 元件層 → Task 2/3 ✓；§6 逐頁 → Task 5/6/7/8 ✓（books 進度移至詳情、首頁不顯示待複習數＝計畫層面已聲明的微調）；§7 頂部列即時更新 → Task 4 ✓；§8 動效（pop-in/transition/reduced-motion）→ Task 1（keyframes/reduced-motion）+ 各元件 transition ✓；§9 技術/邊界 → 全程唯讀既有 repository、無新依賴 ✓；§10 無障礙（focus-visible、min-h-11、reduced-motion）→ Task 1/2 ✓；§11 排除（深色/吉祥物）→ 未納入 ✓；§12 測試 → Task 2/3 純函式測 + Task 9 全量 ✓。
- 唯一未做：MC 同幀雙擊硬化（spec §11 已明列為「邏輯非表現、獨立處理」），本計畫不含 ✓。

**2. Placeholder scan：** 無 TBD/「適當處理」；每個 code step 皆含完整程式或精確的 className 替換指示。✓

**3. Type consistency：**
- `BUTTON_VARIANT`/`OPTION_STATE`/`CELEBRATE_TONE`/`clampPct`/`ringGeometry` 在 Task 2/3 定義、Task 4–8 使用一致 ✓。
- `OptionButton` 的 `state` union（idle/correct/wrong/dimmed）與 review-session 推導值一致 ✓。
- `GoalRing({done, goal})`、`ProgressBar({value, max})`、`CelebrateCard({tone})` 簽章在定義與使用處一致 ✓。
- 沿用既有 `getContext`→`{state, timezone, dailyGoal}`、`listMasteredWordIds`、`todayYmd(now, timezone)` 皆與現行簽章相符 ✓。
