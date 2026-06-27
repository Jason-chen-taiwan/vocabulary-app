import { ContentRepository } from './repository'
import type { WordWithExamples } from './types'

export interface CardSource {
  readonly id: string
  listCards(): Promise<WordWithExamples[]>
}

export class BuiltinWordBookSource implements CardSource {
  readonly id: string
  private readonly slug: string
  private readonly repo: ContentRepository

  constructor(slug: string, repo: ContentRepository = new ContentRepository()) {
    this.slug = slug
    this.repo = repo
    this.id = `builtin:${slug}`
  }

  async listCards(): Promise<WordWithExamples[]> {
    const book = await this.repo.getWordBookBySlug(this.slug)
    if (!book) return []
    return this.repo.listWordsByBookWithExamples(book.id)
  }
}
