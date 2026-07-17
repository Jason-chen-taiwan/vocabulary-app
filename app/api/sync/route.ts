import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { ContentRepository } from '@/lib/content/repository'
import { scheduler } from '@/lib/learning/scheduler'
import { eventBus } from '@/lib/events/bus'
import { gamificationService } from '@/lib/gamification/service'
import { handleSync } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser()
  const body = await req.json().catch(() => ({}))
  const content = new ContentRepository()
  const res = await handleSync(user, body, {
    learning: new LearningRepository(),
    scheduler,
    bus: eventBus,
    // ContentRepository.getWordCore 不含 id（既有契約）；handler 只用 headword/definitionZh，
    // id 補回只是為了滿足 SyncDeps 型別，不影響判定邏輯。
    getWordCore: async (id) => {
      const word = await content.getWordCore(id)
      return word ? { id, ...word } : null
    },
    applyReview: (i) => gamificationService.applyReview(i),
    applySessionFinish: (i) => gamificationService.applySessionFinish(i),
  }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}
