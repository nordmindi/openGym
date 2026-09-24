import { describe, it, expect } from 'vitest'
import { latestMeasures } from './measures.js'
import { weeklyReview } from './review.js'

const set = (w, r) => ({ w, r, done: true })
const wo = (d, id, w, r) => ({ d, entries: [{ id, sets: [set(w, r)] }] })

describe('latestMeasures', () => {
  it('keeps the newest tape for each part', () => {
    const m = latestMeasures([
      { d: '2026-01-01', waist: 80, arm: 30 },
      { d: '2026-02-01', waist: 78 },
    ])
    expect(m.waist).toBe(78)
    expect(m.arm).toBe(30)
    expect(m.d).toBe('2026-02-01')
  })
})

describe('weeklyReview', () => {
  const today = '2026-09-24'
  it('calls a heavier estimated set progress and an unchanged one a stall', () => {
    const S = {
      workouts: [
        wo('2026-09-17', '0025', 60, 5),
        wo('2026-09-24', '0025', 62.5, 5),
        wo('2026-09-18', '0031', 20, 8),
        wo('2026-09-24', '0031', 20, 8),
      ],
      routines: [], week: {},
    }
    const r = weeklyReview(S, today)
    expect(r.progressed.map(x => x.id)).toEqual(['0025'])
    expect(r.stalled.map(x => x.id)).toEqual(['0031'])
  })
  it('lists a planned muscle that got no sets this week', () => {
    const S = {
      workouts: [wo('2026-09-24', '0031', 20, 8)],
      routines: [{ id: 'push', ex: [{ id: '0025', sets: 3 }] }],
      week: { 1: 'push' },
    }
    const r = weeklyReview(S, today)
    expect(r.skipped).toContain('chest')
  })
})
