import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { LearningRepository } from '@/lib/learning/repository'
import { ContentRepository } from '@/lib/content/repository'
import { handleOfflinePack } from './handler'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const user = await getCurrentUser()
  const res = await handleOfflinePack(user, { learning: new LearningRepository(), content: new ContentRepository() }, new Date())
  return NextResponse.json(res, { status: res.ok ? 200 : 401 })
}
