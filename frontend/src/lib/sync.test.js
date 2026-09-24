import { describe, it, expect } from 'vitest'
import { hasSyncLink, mergeByDay, mergeLogs } from './sync.js'

const w = (d, end, id) => ({ id: id || d, d, start: end - 1000, end })

describe('hasSyncLink', () => {
  it('pushes when the phone has a token and no signed-in user', () => {
    expect(hasSyncLink(null, 'tok')).toBe(true)
    expect(hasSyncLink(null, '')).toBe(false)
  })
})

describe('mergeByDay', () => {
  it('keeps a day that only one side has', () => {
    const out = mergeByDay([w('2024-01-01', 10)], [w('2024-01-02', 20)])
    expect(out.map(x => x.d)).toEqual(['2024-01-01', '2024-01-02'])
  })
  it('keeps the newer copy when both sides trained that day', () => {
    const out = mergeByDay([w('2024-01-01', 10, 'a')], [w('2024-01-01', 50, 'b')])
    expect(out.map(x => x.id)).toEqual(['b'])
  })
  it('does not drop either workout when the day was saved at the same moment', () => {
    const out = mergeByDay([w('2024-01-01', 10, 'a')], [w('2024-01-01', 10, 'b')])
    expect(out.map(x => x.id).sort()).toEqual(['a', 'b'])
  })
})

describe('mergeLogs', () => {
  it('takes settings from the newer document and still keeps an older workout day', () => {
    const local = { _ts: 1, unit: 'kg', workouts: [w('2024-01-01', 10)], routines: [{ id: 'r1' }], active: { id: 'now' } }
    const remote = { _ts: 9, unit: 'lb', workouts: [w('2024-02-01', 20)], routines: [{ id: 'r2' }] }
    const m = mergeLogs(local, remote)
    expect(m.unit).toBe('lb')
    expect(m.workouts.map(x => x.d)).toEqual(['2024-01-01', '2024-02-01'])
    expect(m.routines.map(r => r.id).sort()).toEqual(['r1', 'r2'])
    expect(m.active).toEqual({ id: 'now' })
  })
})
