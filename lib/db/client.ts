// Edge-safe Prisma client using Neon HTTP adapter (no TCP pool).
// PrismaNeonHttp sends queries over HTTP, compatible with Cloudflare Workers/edge runtime.
//
// Deviation from brief (Prisma 7 breaking change):
//   - Brief used `new Pool(...)` + `new PrismaNeon(pool)` (Prisma 5/6 API).
//   - Prisma 7 adapters are factories; PrismaNeonHttp is the edge-safe HTTP variant.
//   - Datasource `url` is no longer in schema.prisma (Prisma 7 requires it passed via adapter).
import { PrismaNeonHttp } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'

import { getEnv } from '@/lib/env'

let prisma: PrismaClient | undefined

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaNeonHttp(getEnv().DATABASE_URL)
    prisma = new PrismaClient({ adapter })
  }
  return prisma
}
