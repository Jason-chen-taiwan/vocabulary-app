import type { SessionUser } from '@/lib/auth/session'
import type { PushSubscriptionRepository } from '@/lib/push/subscription-repo'

interface SubscribeBody {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

export async function handleSubscribe(
  user: SessionUser | null,
  body: SubscribeBody,
  repo: Pick<PushSubscriptionRepository, 'upsert'>
): Promise<{ ok: boolean }> {
  if (!user) return { ok: false }
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return { ok: false }
  }
  await repo.upsert(user.id, { endpoint, p256dh, auth })
  return { ok: true }
}

export async function handleUnsubscribe(
  user: SessionUser | null,
  body: { endpoint?: unknown },
  repo: Pick<PushSubscriptionRepository, 'deleteByEndpoint'>
): Promise<{ ok: boolean }> {
  if (!user) return { ok: false }
  if (typeof body?.endpoint !== 'string') return { ok: false }
  await repo.deleteByEndpoint(body.endpoint)
  return { ok: true }
}
