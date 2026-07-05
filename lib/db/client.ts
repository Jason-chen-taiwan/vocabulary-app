// Edge-safe Prisma client using the Neon HTTP adapter (no TCP pool).
// PrismaNeonHTTP sends queries over HTTP, compatible with Cloudflare Workers/edge runtime.
//
// Prisma 6.19: pinned because Prisma 7 dynamically compiles its query-compiler
// WASM at runtime, which Cloudflare Workers forbid ("Wasm code generation
// disallowed by embedder"). 6.19.x is the last line that runs on Workers.
// The adapter is a factory here (`PrismaNeonHTTP`, capital HTTP in v6).
import { PrismaNeonHTTP } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'

import { getEnv } from '@/lib/env'

let prisma: PrismaClient | undefined

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaNeonHTTP(getEnv().DATABASE_URL, {})
    prisma = new PrismaClient({ adapter })
  }
  return prisma
}
