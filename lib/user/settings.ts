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

  async getReminder(userId: string): Promise<{ reminderEnabled: boolean; reminderHour: number }> {
    const row = (await this.db.user.findUnique({
      where: { id: userId },
      select: { reminderEnabled: true, reminderHour: true },
    })) as { reminderEnabled: boolean; reminderHour: number } | null
    return row ?? { reminderEnabled: false, reminderHour: 20 }
  }

  async updateReminder(
    userId: string,
    data: { reminderEnabled: boolean; reminderHour: number }
  ): Promise<void> {
    const hour = Math.max(0, Math.min(23, Math.trunc(data.reminderHour)))
    await this.db.user.update({
      where: { id: userId },
      data: { reminderEnabled: data.reminderEnabled, reminderHour: hour },
    })
  }
}
