import { describe, it, expect } from 'vitest'
import { loadPlates, formatSide, usesBar, barWeightOf, PLATES } from './plates.js'

const kg = w => loadPlates(w, 20, PLATES.kg)
const lb = w => loadPlates(w, 45, PLATES.lb)

describe('plate loading', () => {
  it('loads the heaviest plates that fit, the same on each side', () => {
    expect(kg(100).perSide).toEqual([25, 15])
    expect(kg(60).perSide).toEqual([20])
    expect(kg(62.5).perSide).toEqual([20, 1.25])
    expect(lb(225).perSide).toEqual([45, 45])
    expect(formatSide(lb(225).perSide)).toBe('2×45')
    expect(formatSide(kg(100).perSide)).toBe('25 + 15')
  })

  it('says when the bar is already the whole weight, or the weight is under it', () => {
    expect(kg(20)).toEqual({ bar: 20, perSide: [], leftover: 0 })
    expect(kg(15).leftover).toBeLessThan(0)
  })

  it('keeps a remainder no plate can make', () => {
    const odd = kg(61)
    expect(odd.perSide).toEqual([20])
    expect(odd.leftover).toBe(0.5)
  })

  it('only offers a bar for equipment you load', () => {
    expect(usesBar({ eq: 'barbell' })).toBe(true)
    expect(usesBar({ eq: 'ez barbell' })).toBe(true)
    expect(usesBar({ eq: 'dumbbell' })).toBe(false)
    expect(usesBar({ eq: 'body weight' })).toBe(false)
  })

  it('uses a 20 kg or 45 lb bar until the profile picks one', () => {
    expect(barWeightOf({ unit: 'kg' })).toBe(20)
    expect(barWeightOf({ unit: 'lb' })).toBe(45)
    expect(barWeightOf({ unit: 'kg', barWeight: 15 })).toBe(15)
  })
})
