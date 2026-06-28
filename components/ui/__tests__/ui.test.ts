import { describe, it, expect } from 'vitest'
import { BUTTON_VARIANT } from '@/components/ui/button'
import { clampPct } from '@/components/ui/progress-bar'
import { ringGeometry } from '@/components/ui/goal-ring'
import { OPTION_STATE } from '@/components/ui/option-button'
import { CELEBRATE_TONE } from '@/components/ui/celebrate-card'

describe('BUTTON_VARIANT', () => {
  it('has the four variants', () => {
    expect(Object.keys(BUTTON_VARIANT).sort()).toEqual(['celebrate', 'ghost', 'primary', 'secondary'])
  })
  it('primary uses brand orange, celebrate uses ink border', () => {
    expect(BUTTON_VARIANT.primary).toContain('bg-primary-500')
    expect(BUTTON_VARIANT.celebrate).toContain('border-ink')
  })
})

describe('clampPct', () => {
  it('maps value/max to 0..100 and clamps', () => {
    expect(clampPct(5, 20)).toBe(25)
    expect(clampPct(30, 20)).toBe(100)
    expect(clampPct(-5, 20)).toBe(0)
    expect(clampPct(1, 0)).toBe(0)
  })
})

describe('ringGeometry', () => {
  it('full circle offset is 0 at/over goal, full circumference at 0', () => {
    const r = 40
    const c = 2 * Math.PI * r
    expect(ringGeometry(0, 20, r).offset).toBeCloseTo(c)
    expect(ringGeometry(20, 20, r).offset).toBeCloseTo(0)
    expect(ringGeometry(30, 20, r).offset).toBeCloseTo(0)
    expect(ringGeometry(10, 20, r).offset).toBeCloseTo(c / 2)
    expect(ringGeometry(5, 20, r).circumference).toBeCloseTo(c)
  })
  it('treats goal<=0 as empty (offset = full circumference)', () => {
    const r = 40
    expect(ringGeometry(3, 0, r).offset).toBeCloseTo(2 * Math.PI * r)
  })
})

describe('OPTION_STATE / CELEBRATE_TONE', () => {
  it('option states map to colors', () => {
    expect(Object.keys(OPTION_STATE).sort()).toEqual(['correct', 'dimmed', 'idle', 'wrong'])
    expect(OPTION_STATE.correct).toContain('success')
    expect(OPTION_STATE.wrong).toContain('error')
  })
  it('celebrate tones map to semantic colors', () => {
    expect(CELEBRATE_TONE.coin).toContain('coin')
    expect(CELEBRATE_TONE.mastery).toContain('mastery')
  })
})
