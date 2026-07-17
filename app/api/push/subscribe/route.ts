import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { PushSubscriptionRepository } from '@/lib/push/subscription-repo'
import { handleSubscribe } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const res = await handleSubscribe(user, body, new PushSubscriptionRepository())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
