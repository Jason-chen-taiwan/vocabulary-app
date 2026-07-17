import { getPrisma } from '@/lib/db/client'
import type { PushSubscriptionData } from './types'

interface PushDb {
  pushSubscription: {
    upsert(a: unknown): Promise<unknown>
    delete(a: unknown): Promise<unknown>
  }
}

// Stores/removes a device's push subscription. The reminder worker reads
// subscriptions directly via its own SQL (separate build), so this repo only
// owns the write path from the subscribe/unsubscribe routes.
export class PushSubscriptionRepository {
  private readonly db: PushDb
  constructor(db?: PushDb) {
    this.db = db ?? (getPrisma() as unknown as PushDb)
  }

  async upsert(userId: string, sub: PushSubscriptionData): Promise<void> {
    await this.db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth },
    })
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db.pushSubscription.delete({ where: { endpoint } })
  }
}
