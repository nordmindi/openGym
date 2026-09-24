import { describe, it, expect } from 'vitest'
import { STARTER_PLANS, starterRoutines } from './starter.js'

describe('starter plans', () => {
  it('keeps the original push pull legs routines for the demo history', () => {
    const [push, pull, legs] = starterRoutines()
    expect([push, pull, legs].map(r => r.name)).toEqual(['Push Day', 'Pull Day', 'Leg Day'])
    expect(push.ex).toHaveLength(6)
  })
  it('offers upper/lower, full body and 5×5 beside PPL', () => {
    expect(Object.keys(STARTER_PLANS)).toEqual(['ppl', 'upper', 'full', 'five'])
  })
  it('puts upper and lower on four days', () => {
    const plan = STARTER_PLANS.upper
    const routines = plan.routines()
    expect(routines.map(r => r.name)).toEqual(['Upper', 'Lower'])
    expect(plan.days).toEqual([[1, 0], [2, 1], [4, 0], [5, 1]])
  })
  it('builds the 5×5 days as five sets of five, with a single deadlift set', () => {
    const [a, b] = STARTER_PLANS.five.routines()
    expect(a.ex.map(e => [e.sets, e.reps])).toEqual([[5, 5], [5, 5], [5, 5]])
    expect(b.ex[2]).toMatchObject({ id: '0032', sets: 1, reps: 5 })
    expect(a.prog).toBe('linear')
  })
})
