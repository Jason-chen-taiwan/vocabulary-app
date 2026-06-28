import { describe, it, expect } from 'vitest'
import { BUTTON_VARIANT } from '@/components/ui/button'

describe('BUTTON_VARIANT', () => {
  it('has the four variants', () => {
    expect(Object.keys(BUTTON_VARIANT).sort()).toEqual(['celebrate', 'ghost', 'primary', 'secondary'])
  })
  it('primary uses brand orange, celebrate uses ink border', () => {
    expect(BUTTON_VARIANT.primary).toContain('bg-primary-500')
    expect(BUTTON_VARIANT.celebrate).toContain('border-ink')
  })
})
