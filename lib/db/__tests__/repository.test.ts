import { describe, it, expect, vi } from 'vitest'
import { BaseRepository } from '@/lib/db/repository'

describe('BaseRepository', () => {
  it('delegates findById to the delegate', async () => {
    const delegate = { findUnique: vi.fn().mockResolvedValue({ id: '1' }) }
    const repo = new BaseRepository<any>(delegate as any)
    const result = await repo.findById('1')
    expect(delegate.findUnique).toHaveBeenCalledWith({ where: { id: '1' } })
    expect(result).toEqual({ id: '1' })
  })

  it('delegates create to the delegate', async () => {
    const delegate = { create: vi.fn().mockResolvedValue({ id: '2' }) }
    const repo = new BaseRepository<any>(delegate as any)
    const result = await repo.create({ email: 'a@b.c' })
    expect(delegate.create).toHaveBeenCalledWith({ data: { email: 'a@b.c' } })
    expect(result).toEqual({ id: '2' })
  })
})
