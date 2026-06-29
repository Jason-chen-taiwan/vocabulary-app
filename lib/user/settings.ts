import { getPrisma } from '@/lib/db/client'

interface UserDb {
  user: {
    findUnique(a: unknown): Promise<unknown | null>
    update(a: unknown): Promise<unknown>
  }
}

export class UserSettingsRepository {
  private readonly db: UserDb

  constructor(db?: UserDb) {
    this.db = db ?? (getPrisma() as unknown as UserDb)
  }

  async get(userId: string): Promise<{
    displayName: string | null
    leaderboardOptIn: boolean
    name: string | null
  }> {
    const row = (await this.db.user.findUnique({
      where: { id: userId },
      select: { displayName: true, leaderboardOptIn: true, name: true },
    })) as
      | {
          displayName: string | null
          leaderboardOptIn: boolean
          name: string | null
        }
      | null

    return row ?? { displayName: null, leaderboardOptIn: false, name: null }
  }

  async update(
    userId: string,
    data: { displayName: string | null; leaderboardOptIn: boolean }
  ): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data })
  }
}
