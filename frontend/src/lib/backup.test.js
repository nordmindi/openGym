import { describe, it, expect } from 'vitest'
import { restoreBackup } from './backup.js'

const BASE = {
  unit: 'kg', restSec: 90, sound: true, lang: 'en',
  routines: [], workouts: [], bodyweight: [], customEx: [],
}

describe('backup round-trip', () => {
  const saved = {
    ...BASE,
    unit: 'lb',
    restSec: 120,
    lang: 'de',
    targetW: 180,
    routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8 }] }],
    week: { 1: 'r1' },
    workouts: [{
      id: 'w1', d: '2019-05-31', name: 'Imported',
      entries: [{ id: '0025', sets: [{ w: 132.3, r: 8, done: true }] }],
    }],
    bodyweight: [{ d: '2019-05-31', w: 180, t: 1 }],
    importAliases: { 'lift weird': '0025' },
  }

  it('restores the plan, workouts, body weight and settings from the exported JSON', () => {
    const file = JSON.parse(JSON.stringify(saved))
    const back = restoreBackup(file, BASE)
    expect(back.routines).toEqual(saved.routines)
    expect(back.week).toEqual(saved.week)
    expect(back.workouts).toEqual(saved.workouts)
    expect(back.bodyweight).toEqual(saved.bodyweight)
    expect(back.unit).toBe('lb')
    expect(back.restSec).toBe(120)
    expect(back.lang).toBe('de')
    expect(back.targetW).toBe(180)
    expect(back.importAliases).toEqual({ 'lift weird': '0025' })
    expect(back.sound).toBe(true)
  })

  it('keeps a default the file never mentioned', () => {
    const without = JSON.parse(JSON.stringify(saved))
    delete without.sound
    const back = restoreBackup(without, BASE)
    expect(back.sound).toBe(true)
    expect(back.unit).toBe('lb')
  })

  it('rejects a file that is not a profile backup', () => {
    expect(() => restoreBackup({ workouts: [] }, BASE)).toThrow('not an openGym backup')
    expect(() => restoreBackup(null, BASE)).toThrow('not an openGym backup')
  })
})
