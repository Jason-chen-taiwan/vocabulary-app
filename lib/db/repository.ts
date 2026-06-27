export interface Delegate<T> {
  findUnique(args: { where: { id: string } }): Promise<T | null>
  create(args: { data: Partial<T> }): Promise<T>
}

export class BaseRepository<T> {
  constructor(protected readonly delegate: Delegate<T>) {}

  findById(id: string): Promise<T | null> {
    return this.delegate.findUnique({ where: { id } })
  }

  create(data: Partial<T>): Promise<T> {
    return this.delegate.create({ data })
  }
}
