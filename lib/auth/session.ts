// Lazy-import auth to avoid loading next-auth at module-load time.
// This keeps toSessionUser as a pure, independently testable function.
import { cache } from 'react'
import type { Session } from 'next-auth'

export interface SessionUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

export function toSessionUser(session: Session | null): SessionUser | null {
  if (!session?.user) return null
  const u = session.user as { id: string; email: string; name?: string | null; image?: string | null }
  return { id: u.id, email: u.email, name: u.name ?? null, image: u.image ?? null }
}

// Cached per-request: multiple server components (e.g. a page + GamificationBar)
// calling getCurrentUser in the same render share a single auth/session lookup.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const { auth } = await import('@/auth')
  return toSessionUser(await auth())
})
