import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { getPrisma } from '@/lib/db/client'
import { getEnv } from '@/lib/env'

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv()
  return {
    adapter: PrismaAdapter(getPrisma()),
    session: { strategy: 'database' },
    providers: [
      Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
    ],
    secret: env.AUTH_SECRET,
    pages: { signIn: '/login' },
    callbacks: {
      session({ session, user }) {
        if (session.user) session.user.id = user.id
        return session
      },
    },
  }
})
