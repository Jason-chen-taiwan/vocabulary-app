// Lazy-import auth to avoid loading next-auth at module-load time.
// This keeps toSessionUser as a pure, independently testable function.
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

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { auth } = await import('@/auth')
  return toSessionUser(await auth())
}
