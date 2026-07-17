import { getPrisma } from '@/lib/db/client'
import type { PushSubscriptionData, DueUser } from './types'

interface PushDb {
  pushSubscription: {
    upsert(a: unknown): Promise<unknown>
    delete(a: unknown): Promise<unknown>
  }
  user: {
    findMany(a: unknown): Promise<unknown[]>
  }
}

// listDue returns every reminder-enabled user that has at least one subscription.
// Hour filtering (utcHourFor) happens in the worker, which knows each user's
// tzOffset — the DB layer just narrows to enabled + subscribed. nowUtcHour is
// accepted for a future SQL-side hour filter; kept in the signature now so the
// worker call site is stable.
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

  async listDue(_nowUtcHour: number): Promise<DueUser[]> {
    const rows = (await this.db.user.findMany({
      where: { reminderEnabled: true, pushSubscriptions: { some: {} } },
      select: {
        id: true,
        timezone: true,
        pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
      },
    })) as Array<{ id: string; timezone: string; pushSubscriptions: PushSubscriptionData[] }>

    return rows.map((r) => ({
      userId: r.id,
      timezone: r.timezone,
      subscriptions: r.pushSubscriptions,
    }))
  }
}
