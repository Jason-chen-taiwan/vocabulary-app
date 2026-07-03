import { describe, it, expect } from 'vitest'
import { CATALOG, itemByKey, isAccessory, accessoriesBySlot } from '@/lib/shop/catalog'

describe('catalog', () => {
  it('itemByKey finds a known item', () => {
    expect(itemByKey('freeze_refill')?.kind).toBe('consumable')
    expect(itemByKey('hat_party')?.name).toBe('派對帽')
  })

  it('itemByKey returns undefined for unknown key', () => {
    expect(itemByKey('nope')).toBeUndefined()
  })

  it('isAccessory narrows correctly', () => {
    const freeze = itemByKey('freeze_refill')!
    const hat = itemByKey('hat_party')!
    expect(isAccessory(freeze)).toBe(false)
    expect(isAccessory(hat)).toBe(true)
  })

  it('accessoriesBySlot returns only that slot', () => {
    const head = accessoriesBySlot('head')
    expect(head.length).toBeGreaterThan(0)
    expect(head.every((i) => i.slot === 'head')).toBe(true)
  })

  it('all costs are positive integers', () => {
    expect(CATALOG.every((i) => Number.isInteger(i.cost) && i.cost > 0)).toBe(true)
  })

  it('all keys are unique', () => {
    const keys = CATALOG.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
