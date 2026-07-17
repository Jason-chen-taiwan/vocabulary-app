import webpush from 'web-push'
import type { Sub } from './reminders'

export interface Vapid { publicKey: string; privateKey: string; subject: string }

const PAYLOAD = JSON.stringify({
  title: '該背單字了 🦊',
  body: '今天還沒達標，來 5 分鐘',
  url: '/learn',
})

// Returns the HTTP status from the push service (201 ok, 410/404 = gone).
export async function sendPush(sub: Sub, vapid: Vapid): Promise<{ status: number }> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      PAYLOAD
    )
    return { status: res.statusCode }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status) return { status }
    throw e
  }
}
