import { describe, it, expect } from 'vitest'
import { accessoryLayerKeys, ACCESSORY_SVG } from '@/components/ui/mascot-accessories'

describe('accessoryLayerKeys', () => {
  it('returns [] for undefined', () => {
    expect(accessoryLayerKeys(undefined)).toEqual([])
  })

  it('filters nulls, orders neck→face→head', () => {
    expect(accessoryLayerKeys({ head: 'hat_party', face: null, neck: 'scarf_orange' }))
      .toEqual(['scarf_orange', 'hat_party'])
  })

  it('drops keys not present in the SVG registry', () => {
    expect(accessoryLayerKeys({ head: 'bogus_key', face: 'glasses_round', neck: null }))
      .toEqual(['glasses_round'])
  })

  it('every catalog-ish key rendered has an SVG entry', () => {
    for (const k of ['freeze_refill']) {
      // consumables never render as a layer; registry only needs accessory keys
      expect(ACCESSORY_SVG[k]).toBeUndefined()
    }
    for (const k of ['hat_party', 'hat_grad', 'glasses_round', 'glasses_star', 'scarf_orange', 'bowtie']) {
      expect(ACCESSORY_SVG[k]).toBeDefined()
    }
  })
})
