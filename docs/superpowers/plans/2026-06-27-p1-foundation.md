# P1 基礎層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個可部署到 Cloudflare、能用 Google 登入、接上 Neon Postgres、且可安裝為 PWA 的 Next.js app 殼層，作為後續所有功能的地基。

**Architecture:** Next.js（App Router）全端，部署於 Cloudflare Workers（透過 OpenNext）。資料庫為 Neon Postgres，經 Prisma + Neon serverless driver（HTTP）存取，所有資料存取收斂在 `repository` 層。認證用 Auth.js 純 Google OAuth。PWA 由 manifest + service worker 提供安裝與離線殼層。所有後端能力以模組化服務層暴露介面。

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · Auth.js · Prisma · Neon Postgres (serverless driver) · @opennextjs/cloudflare · Vitest

## Global Constraints

- 成本鐵則：只用「免費或固定低月費、無超量自動爆帳單」服務；外部依賴超量必須是限流/暫停，不可自動扣款。
- 不在 runtime 呼叫付費 AI / 付費 TTS。
- edge 環境：DB 一律走 Neon serverless driver（HTTP），不可用傳統 TCP 連線池；DB 存取一律經 `repository` 層，業務邏輯不得出現原生 SQL。
- 跨模組溝通透過介面與型別，不得直接 import 另一模組的內部實作。
- 認證：純 Google OAuth，不做 Email/密碼。
- 採 TDD：邏輯先寫測試；基礎設施/設定以可重現的驗證指令作為驗收。
- 語言：UI 文案繁體中文。
- 套件管理：npm。執行環境 Windows / PowerShell。

---

### Task 1: 專案骨架（Next.js + TypeScript + Tailwind + Vitest）

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `vitest.config.ts`, `lib/__tests__/smoke.test.ts`, `.gitignore`
- Test: `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: 無（首個任務）
- Produces: 可執行的 Next.js 專案；`npm run dev`、`npm run build`、`npm test` 三個指令可用。

- [ ] **Step 1: 用官方腳手架建立專案**

Run（在 `C:\vocabulary_app`，目錄已有 docs/ 與 .git，故用 `.` 並接受非空目錄）:
```
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```
Expected: 產生 `app/`、`next.config.ts`、`tailwind.config.ts` 等檔；既有 `docs/`、`.git`、`CLAUDE.md` 保留。

- [ ] **Step 2: 安裝 Vitest 與測試環境**

Run:
```
npm install -D vitest @vitest/coverage-v8
```
Expected: `package.json` devDependencies 出現 vitest。

- [ ] **Step 3: 建立 Vitest 設定**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 4: 在 package.json 加 test script**

Modify `package.json` 的 `"scripts"`，加入:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 寫冒煙測試（先失敗）**

Create `lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { appName } from '@/lib/meta'

describe('smoke', () => {
  it('exposes the app name', () => {
    expect(appName()).toBe('VocabApp')
  })
})
```

- [ ] **Step 6: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，找不到模組 `@/lib/meta`。

- [ ] **Step 7: 最小實作**

Create `lib/meta.ts`:
```ts
export function appName(): string {
  return 'VocabApp'
}
```

- [ ] **Step 8: 執行測試確認通過**

Run: `npm test`
Expected: PASS（1 passed）。

- [ ] **Step 9: 確認 build 成功**

Run: `npm run build`
Expected: build 成功無錯誤。

- [ ] **Step 10: Commit**

```
git add -A
git commit -m "feat: scaffold Next.js app with Tailwind and Vitest"
```

---

### Task 2: Cloudflare 部署設定（OpenNext + Wrangler）

**Files:**
- Create: `wrangler.toml`, `open-next.config.ts`
- Modify: `package.json`（加部署/預覽 scripts、`.gitignore` 加 `.open-next/`、`.wrangler/`）
- Test: 驗證指令（建置產物產生）

**Interfaces:**
- Consumes: Task 1 的 Next.js 專案
- Produces: `npm run cf:build` 可產出 Cloudflare Workers 部署產物；`npm run cf:preview` 可本地以 workerd 預覽。

- [ ] **Step 1: 安裝 OpenNext Cloudflare 介接與 wrangler**

Run:
```
npm install -D @opennextjs/cloudflare wrangler
```
Expected: devDependencies 出現兩者。

- [ ] **Step 2: 建立 open-next 設定**

Create `open-next.config.ts`:
```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig()
```

- [ ] **Step 3: 建立 wrangler 設定**

Create `wrangler.toml`:
```toml
name = "vocab-app"
main = ".open-next/worker.js"
compatibility_date = "2025-06-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
```

- [ ] **Step 4: 加 scripts 與忽略產物**

Modify `package.json` `"scripts"`:
```json
"cf:build": "opennextjs-cloudflare build",
"cf:preview": "opennextjs-cloudflare build && wrangler dev",
"cf:deploy": "opennextjs-cloudflare build && wrangler deploy"
```
Modify `.gitignore` 末尾加入:
```
.open-next/
.wrangler/
```

- [ ] **Step 5: 驗證 Cloudflare 建置產出**

Run: `npm run cf:build`
Expected: 產生 `.open-next/worker.js` 與 `.open-next/assets/`，無錯誤。

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "build: configure Cloudflare Workers deployment via OpenNext"
```

---

### Task 3: 環境變數與設定模組

**Files:**
- Create: `lib/env.ts`, `lib/__tests__/env.test.ts`, `.env.example`, `.dev.vars.example`
- Modify: `.gitignore`（加 `.env`、`.dev.vars`）
- Test: `lib/__tests__/env.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces: `getEnv(): Env` — 集中、型別安全地讀取環境變數。`Env` 型別含 `DATABASE_URL: string`、`AUTH_SECRET: string`、`AUTH_GOOGLE_ID: string`、`AUTH_GOOGLE_SECRET: string`。缺值時拋出明確錯誤。

- [ ] **Step 1: 寫測試（先失敗）**

Create `lib/__tests__/env.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readEnv } from '@/lib/env'

describe('readEnv', () => {
  it('returns parsed env when all present', () => {
    const env = readEnv({
      DATABASE_URL: 'postgres://x',
      AUTH_SECRET: 's',
      AUTH_GOOGLE_ID: 'id',
      AUTH_GOOGLE_SECRET: 'secret',
    })
    expect(env.DATABASE_URL).toBe('postgres://x')
  })

  it('throws listing all missing keys', () => {
    expect(() => readEnv({})).toThrowError(/DATABASE_URL/)
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- env`
Expected: FAIL，找不到 `@/lib/env`。

- [ ] **Step 3: 最小實作**

Create `lib/env.ts`:
```ts
export interface Env {
  DATABASE_URL: string
  AUTH_SECRET: string
  AUTH_GOOGLE_ID: string
  AUTH_GOOGLE_SECRET: string
}

const REQUIRED: (keyof Env)[] = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
]

export function readEnv(source: Record<string, string | undefined>): Env {
  const missing = REQUIRED.filter((k) => !source[k])
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`)
  }
  return {
    DATABASE_URL: source.DATABASE_URL!,
    AUTH_SECRET: source.AUTH_SECRET!,
    AUTH_GOOGLE_ID: source.AUTH_GOOGLE_ID!,
    AUTH_GOOGLE_SECRET: source.AUTH_GOOGLE_SECRET!,
  }
}

export function getEnv(): Env {
  return readEnv(process.env as Record<string, string | undefined>)
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- env`
Expected: PASS（2 passed）。

- [ ] **Step 5: 建立範例環境檔**

Create `.env.example`:
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
AUTH_SECRET=run: npx auth secret
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```
Create `.dev.vars.example`（Cloudflare 本地預覽用，內容同上鍵名）。
Modify `.gitignore` 加入:
```
.env
.dev.vars
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat: add typed env config module"
```

---

### Task 4: Neon + Prisma 資料層與 repository 基底

**Files:**
- Create: `prisma/schema.prisma`, `lib/db/client.ts`, `lib/db/repository.ts`, `lib/db/__tests__/repository.test.ts`
- Modify: `package.json`（加 prisma scripts）
- Test: `lib/db/__tests__/repository.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `getEnv()`
- Produces:
  - `getPrisma(): PrismaClient` — edge-safe，使用 Neon serverless adapter 建立的單例。
  - `User` 模型（Prisma）：`id String @id`、`email String @unique`、`name String?`、`image String?`、`tier String @default("free")`、`timezone String @default("Asia/Taipei")`、`dailyGoal Int @default(20)`、`createdAt`、`updatedAt`。
  - `BaseRepository<T>` 抽象：`findById(id)`、`create(data)`，供後續模組擴充。

- [ ] **Step 1: 安裝 Prisma 與 Neon adapter**

Run:
```
npm install -D prisma
npm install @prisma/client @prisma/adapter-neon @neondatabase/serverless
```

- [ ] **Step 2: 建立 Prisma schema（含 Auth.js 所需表）**

Create `prisma/schema.prisma`:
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  tier          String    @default("free")
  timezone      String    @default("Asia/Taipei")
  dailyGoal     Int       @default(20)
  emailVerified DateTime?
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

- [ ] **Step 3: 加 prisma scripts**

Modify `package.json` `"scripts"`:
```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:push": "prisma db push"
```

- [ ] **Step 4: 建立 edge-safe Prisma client（Neon adapter）**

Create `lib/db/client.ts`:
```ts
import { Pool } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'
import { getEnv } from '@/lib/env'

let prisma: PrismaClient | undefined

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const pool = new Pool({ connectionString: getEnv().DATABASE_URL })
    const adapter = new PrismaNeon(pool)
    prisma = new PrismaClient({ adapter })
  }
  return prisma
}
```

- [ ] **Step 5: 寫 repository 基底測試（先失敗）**

Create `lib/db/__tests__/repository.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { BaseRepository } from '@/lib/db/repository'

describe('BaseRepository', () => {
  it('delegates findById to the delegate', async () => {
    const delegate = { findUnique: vi.fn().mockResolvedValue({ id: '1' }) }
    const repo = new BaseRepository<any>(delegate as any)
    const result = await repo.findById('1')
    expect(delegate.findUnique).toHaveBeenCalledWith({ where: { id: '1' } })
    expect(result).toEqual({ id: '1' })
  })

  it('delegates create to the delegate', async () => {
    const delegate = { create: vi.fn().mockResolvedValue({ id: '2' }) }
    const repo = new BaseRepository<any>(delegate as any)
    const result = await repo.create({ email: 'a@b.c' })
    expect(delegate.create).toHaveBeenCalledWith({ data: { email: 'a@b.c' } })
    expect(result).toEqual({ id: '2' })
  })
})
```

- [ ] **Step 6: 執行確認失敗**

Run: `npm test -- repository`
Expected: FAIL，找不到 `@/lib/db/repository`。

- [ ] **Step 7: 最小實作**

Create `lib/db/repository.ts`:
```ts
interface Delegate<T> {
  findUnique(args: { where: { id: string } }): Promise<T | null>
  create(args: { data: Partial<T> }): Promise<T>
}

export class BaseRepository<T> {
  constructor(protected readonly delegate: Delegate<T>) {}

  findById(id: string): Promise<T | null> {
    return this.delegate.findUnique({ where: { id } })
  }

  create(data: Partial<T>): Promise<T> {
    return this.delegate.create({ data })
  }
}
```

- [ ] **Step 8: 執行確認通過**

Run: `npm test -- repository`
Expected: PASS（2 passed）。

- [ ] **Step 9: 產生 Prisma client 並推送 schema 到 Neon**

前置：在 Neon 建立專案，把 connection string 放入 `.env` 的 `DATABASE_URL`。
Run:
```
npm run db:generate
npm run db:push
```
Expected: client 產生成功；Neon 出現 User/Account/Session/VerificationToken 表。

- [ ] **Step 10: Commit**

```
git add -A
git commit -m "feat: add Neon+Prisma data layer with repository base"
```

---

### Task 5: Auth.js 純 Google 登入

**Files:**
- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `lib/auth/session.ts`, `lib/auth/__tests__/session.test.ts`, `app/login/page.tsx`, `components/sign-in-button.tsx`, `components/sign-out-button.tsx`
- Test: `lib/auth/__tests__/session.test.ts`

**Interfaces:**
- Consumes: Task 3 `getEnv()`、Task 4 `getPrisma()`
- Produces:
  - `auth`、`signIn`、`signOut`、`handlers`（來自 Auth.js）。
  - `getCurrentUser(): Promise<SessionUser | null>` — `SessionUser = { id: string; email: string; name: string | null; image: string | null }`。供所有需要登入身分的模組使用。

- [ ] **Step 1: 安裝 Auth.js 與 Prisma adapter**

Run:
```
npm install next-auth@beta @auth/prisma-adapter
```

- [ ] **Step 2: 建立 auth 設定**

Create `auth.ts`:
```ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { getPrisma } from '@/lib/db/client'
import { getEnv } from '@/lib/env'

const env = getEnv()

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(getPrisma()),
  session: { strategy: 'database' },
  providers: [
    Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
  ],
  secret: env.AUTH_SECRET,
  pages: { signIn: '/login' },
})
```

- [ ] **Step 3: 建立 auth route handler**

Create `app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

- [ ] **Step 4: 寫 getCurrentUser 測試（先失敗）**

Create `lib/auth/__tests__/session.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { toSessionUser } from '@/lib/auth/session'

describe('toSessionUser', () => {
  it('maps a session to a SessionUser', () => {
    const user = toSessionUser({
      user: { id: '1', email: 'a@b.c', name: 'Amy', image: null },
      expires: 'x',
    } as any)
    expect(user).toEqual({ id: '1', email: 'a@b.c', name: 'Amy', image: null })
  })

  it('returns null when no session', () => {
    expect(toSessionUser(null)).toBeNull()
  })
})
```

- [ ] **Step 5: 執行確認失敗**

Run: `npm test -- session`
Expected: FAIL，找不到 `@/lib/auth/session`。

- [ ] **Step 6: 最小實作**

Create `lib/auth/session.ts`:
```ts
import { auth } from '@/auth'
import type { Session } from 'next-auth'

export interface SessionUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

export function toSessionUser(session: Session | null): SessionUser | null {
  if (!session?.user) return null
  const u = session.user as { id: string; email: string; name?: string | null; image?: string | null }
  return { id: u.id, email: u.email, name: u.name ?? null, image: u.image ?? null }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return toSessionUser(await auth())
}
```

- [ ] **Step 7: 執行確認通過**

Run: `npm test -- session`
Expected: PASS（2 passed）。

- [ ] **Step 8: 建立登入頁與按鈕元件**

Create `components/sign-in-button.tsx`:
```tsx
import { signIn } from '@/auth'

export function SignInButton() {
  return (
    <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }) }}>
      <button type="submit" className="rounded-lg bg-black px-4 py-2 text-white">
        使用 Google 登入
      </button>
    </form>
  )
}
```
Create `components/sign-out-button.tsx`:
```tsx
import { signOut } from '@/auth'

export function SignOutButton() {
  return (
    <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
      <button type="submit" className="text-sm text-gray-500 underline">登出</button>
    </form>
  )
}
```
Create `app/login/page.tsx`:
```tsx
import { SignInButton } from '@/components/sign-in-button'
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">VocabApp</h1>
      <p className="text-gray-500">登入開始背單字</p>
      <SignInButton />
    </main>
  )
}
```

- [ ] **Step 9: 首頁顯示登入身分（驗證登入流程）**

Modify `app/page.tsx`:
```tsx
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-bold">歡迎，{user.name ?? user.email}</h1>
      <SignOutButton />
    </main>
  )
}
```

- [ ] **Step 10: 手動驗證登入**

前置：在 Google Cloud Console 建立 OAuth client，授權重新導向 URI 加 `http://localhost:3000/api/auth/callback/google`，把 ID/secret 與 `AUTH_SECRET`（`npx auth secret`）放入 `.env`。
Run: `npm run dev`，瀏覽 `http://localhost:3000`
Expected: 未登入被導向 `/login`；用 Google 登入後回到首頁顯示姓名；Neon 的 User 表出現一筆。

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "feat: add Google OAuth auth with session helpers"
```

---

### Task 6: PWA 殼層（manifest + service worker + 安裝）

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `components/pwa-register.tsx`, `components/__tests__/sw-cache.test.ts`, `public/sw-strategy.js`
- Modify: `app/layout.tsx`（掛 manifest meta、註冊 SW）
- Test: `components/__tests__/sw-cache.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces: 可安裝的 PWA（通過 Chrome 安裝條件）；`shouldCache(url)` 純函式決定哪些請求走快取，供 service worker 與測試共用。

- [ ] **Step 1: 寫快取策略測試（先失敗）**

Create `components/__tests__/sw-cache.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { shouldCache } from '@/public/sw-strategy'

describe('shouldCache', () => {
  it('caches static assets', () => {
    expect(shouldCache('/icons/icon-192.png')).toBe(true)
    expect(shouldCache('/_next/static/chunk.js')).toBe(true)
  })
  it('never caches auth or api routes', () => {
    expect(shouldCache('/api/auth/session')).toBe(false)
    expect(shouldCache('/api/anything')).toBe(false)
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- sw-cache`
Expected: FAIL，找不到 `@/public/sw-strategy`。

- [ ] **Step 3: 最小實作策略函式**

Create `public/sw-strategy.js`:
```js
export function shouldCache(url) {
  if (url.startsWith('/api/')) return false
  return url.startsWith('/_next/static/') || url.startsWith('/icons/')
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- sw-cache`
Expected: PASS（2 passed）。

- [ ] **Step 5: 建立 manifest**

Create `public/manifest.webmanifest`:
```json
{
  "name": "VocabApp 字彙學習",
  "short_name": "VocabApp",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 6: 建立 service worker（cache-first 靜態資源）**

Create `public/sw.js`:
```js
importScripts('/sw-strategy.js')
const CACHE = 'vocab-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !shouldCache(url.pathname)) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const res = await fetch(event.request)
      cache.put(event.request, res.clone())
      return res
    })
  )
})
```
> 註：`public/sw-strategy.js` 同時被 ESM 測試 import 與 SW 的 `importScripts` 載入；`export` 在 importScripts 環境會被忽略，函式仍掛在全域，可正常運作。

- [ ] **Step 7: 建立 SW 註冊元件**

Create `components/pwa-register.tsx`:
```tsx
'use client'
import { useEffect } from 'react'

export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
```

- [ ] **Step 8: 掛進 layout**

Modify `app/layout.tsx`：在 `<head>` 對應的 metadata 加 manifest，並在 `<body>` 內加入 `<PwaRegister />`。於檔案頂部 import：
```tsx
import { PwaRegister } from '@/components/pwa-register'
```
在 `export const metadata` 加入：
```tsx
manifest: '/manifest.webmanifest',
```
在 `<body>{children}` 之後加入 `<PwaRegister />`。

- [ ] **Step 9: 放入 app 圖示**

建立 `public/icons/icon-192.png` 與 `public/icons/icon-512.png`（暫用純色佔位圖即可，之後設計替換）。

- [ ] **Step 10: 驗證可安裝**

Run: `npm run build && npm run start`，用 Chrome 開 `http://localhost:3000`，DevTools → Application → Manifest。
Expected: Manifest 正常解析、Service Worker 已註冊、網址列出現安裝圖示。

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "feat: add installable PWA shell with offline-capable service worker"
```

---

## Self-Review

**Spec coverage（P1 範圍）：**
- Next.js+TS+Tailwind 骨架 → Task 1 ✅
- Cloudflare 部署（OpenNext/Wrangler）→ Task 2 ✅
- 環境變數集中管理 → Task 3 ✅
- Neon+Prisma 資料層 + repository 模式 + User 模型 → Task 4 ✅
- 純 Google OAuth（Auth.js）+ `getCurrentUser()` → Task 5 ✅
- PWA 殼層（manifest/SW/安裝）→ Task 6 ✅
- 成本鐵則、edge serverless driver、repository 收斂、TDD → Global Constraints 並落實於各 Task ✅
- 內容/FSRS/遊戲化/統計：屬 P2–P5，不在本計畫範圍（已於計畫拆分說明）。

**Placeholder scan：** 無 TBD/TODO；每個 code step 均含完整程式碼與確切指令/預期輸出。

**Type consistency：** `Env`、`getEnv()`、`getPrisma()`、`BaseRepository`、`SessionUser`、`getCurrentUser()`、`toSessionUser()`、`shouldCache()` 於定義與被消費處名稱一致。
