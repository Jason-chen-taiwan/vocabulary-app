import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { eventBus } from '@/lib/events/bus'
import { gamificationService } from '@/lib/gamification/service'
import { PassageRepository } from '@/lib/reading/repository'
import { handlePassageSubmit } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const repo = new PassageRepository()
  const res = await handlePassageSubmit(user, body, {
    getPassageBySlug: (slug) => repo.getPassageBySlug(slug),
    saveResult: (userId, passageId, data) => repo.saveResult(userId, passageId, data),
    bus: eventBus,
    applyPassageFinish: (i) => gamificationService.applyPassageFinish(i),
  }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
