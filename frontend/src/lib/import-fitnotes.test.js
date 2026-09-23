import { describe, it, expect } from 'vitest'
import { parseWorkoutCSV, matchExercise, mergeImport, aliasesFromState, retargetImport } from './import-csv.js'
import { setLabel } from './history.js'

// FitNotes Android sometimes writes DistanceUnit as one CamelCase token (no space).
const FITNOTES_CAMEL = 'Date,Exercise,Category,Weight (kg),Reps,Distance,DistanceUnit,Time,Comment'
const FITNOTES = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment'

const parse = (head, ...lines) => parseWorkoutCSV([head, ...lines].join('\n'), { unit: 'kg' })

describe('FitNotes import', () => {
  it('reads DistanceUnit without a space (FitNotes Android CamelCase header)', () => {
    const p = parse(FITNOTES_CAMEL,
      '2019-05-31,Cycling,Cardio,,,5,mi,10:00,',
      '2019-05-31,Barbell Bench Press,Chest,60,12,,,')
    expect(p.error).toBeUndefined()
    expect(p.source).toBe('FitNotes')
    expect(p.workouts).toHaveLength(1)
    expect(p.workouts[0].d).toBe('2019-05-31')
    expect(p.workouts[0].entries).toHaveLength(2)
    const cycle = p.workouts[0].entries.find(e => e.sets.some(s => s.min))
    expect(cycle.sets[0].min).toBe(10)
    // 5 mi → ~8.05 km in 10 min → ~48 km/h
    expect(cycle.sets[0].speed).toBeCloseTo(48.3, 0)
  })

  it('keeps every calendar day from the file', () => {
    const p = parse(FITNOTES,
      '2019-05-31,Deadlift,Back,120,kg,5,,,,',
      '2019-06-01,Squat,Legs,100,kg,5,,,,',
      '2019-06-02,Lat Pulldown,Back,50,kg,10,,,,')
    expect(p.workouts.map(w => w.d)).toEqual(['2019-05-31', '2019-06-01', '2019-06-02'])
    expect(p.skipped).toBe(0)
  })

  it('matches common FitNotes-style names to the library', () => {
    expect(matchExercise('Barbell Bench Press')).toBe('0025')
    expect(matchExercise('Pull Ups')).toBe('0652')
    expect(matchExercise('Push-Ups')).toBe('0662')
    expect(matchExercise('Chin-Up')).toBe('1326')
    expect(matchExercise('Seated Cable Row')).toBe('0180')
    expect(matchExercise('Face Pull')).toBe('0203')
    expect(matchExercise('Dumbbell Hammer Curl')).toBe('0313')
  })

  it('merges new exercises into a day that already has a workout', () => {
    const p = parse(FITNOTES,
      '2019-05-31,Deadlift,Back,120,kg,5,,,,',
      '2019-05-31,Squat,Legs,100,kg,5,,,,')
    const S = {
      workouts: [{
        id: 'local', d: '2019-05-31', start: 0, end: 0, name: 'Local',
        entries: [{ id: '0025', sets: [{ w: 60, r: 10, done: true }], topW: 60 }],
        vol: 600, prs: [],
      }],
      customEx: [],
      exWeights: {},
      bodyweight: [],
    }
    const res = mergeImport(S, p)
    expect(res.added).toBe(0)
    expect(res.merged).toBe(1)
    expect(S.workouts).toHaveLength(1)
    expect(S.workouts[0].entries.map(e => e.id).sort()).toEqual(['0025', '0032', '0043'].sort())
  })

  it('says why a row was skipped', () => {
    const p = parse(FITNOTES,
      '2019-06-01,,Chest,40,kg,8,,,,',
      'not-a-date,Squat,Legs,100,kg,5,,,,',
      '2019-06-02,Plank,Abs,0,kg,0,,,,')
    expect(p.skippedName).toBe(1)
    expect(p.skippedDate).toBe(1)
    expect(p.skippedEmpty).toBe(1)
    expect(p.workouts).toHaveLength(0)
  })

  it('reuses a renamed custom exercise for the same source name', () => {
    const first = parse(FITNOTES, '2019-05-31,Weird Lift,Chest,40,kg,8,,,,')
    expect(first.created).toBe(1)
    const custom = { ...first.customEx[0], n: 'smith bench' }
    const again = parseWorkoutCSV(
      [FITNOTES, '2019-06-01,Weird Lift,Chest,42,kg,8,,,,'].join('\n'),
      { unit: 'kg', aliases: aliasesFromState({ customEx: [custom] }) }
    )
    expect(again.created).toBe(0)
    expect(again.workouts[0].entries[0].id).toBe(custom.id)
  })

  it('keeps the date, exercise, weight and reps the history screen shows', () => {
    const p = parse(FITNOTES, '2019-05-31,Barbell Bench Press,Chest,60,kg,8,,,,')
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [], unit: 'kg' }
    mergeImport(S, p)
    const w = S.workouts[0]
    const set = w.entries[0].sets[0]
    expect(w.d).toBe('2019-05-31')
    expect(w.entries[0].id).toBe('0025')
    expect(set).toMatchObject({ w: 60, r: 8 })
    expect(setLabel(w.entries[0].id, set)).toBe('60×8')

    const lb = parseWorkoutCSV(
      [FITNOTES, '2019-06-01,Barbell Bench Press,Chest,60,kg,8,,,,'].join('\n'),
      { unit: 'lb' }
    )
    expect(lb.workouts[0].entries[0].sets[0].w).toBe(132.3)
    expect(setLabel('0025', lb.workouts[0].entries[0].sets[0])).toBe('132.3×8')
  })

  it('points an imported name at a library exercise once', () => {
    const parsed = parse(FITNOTES, '2019-05-31,Weird Lift,Chest,40,kg,8,,,,"tuck the elbows"')
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [], routines: [] }
    mergeImport(S, parsed)
    const customId = S.customEx[0].id
    const key = S.customEx[0].importKey
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: customId, sets: 3, reps: 8 }] }]
    S.exWeights[customId] = { w: 40, d: '2019-05-31' }
    S.workouts[0].prs = [customId]

    expect(retargetImport(S, customId, '0025')).toBe(true)
    expect(S.customEx).toEqual([])
    expect(S.importAliases[key]).toBe('0025')
    const moved = S.workouts[0]
    expect(moved.entries).toHaveLength(1)
    expect(moved.entries[0].id).toBe('0025')
    expect(moved.entries[0].sets[0]).toMatchObject({ w: 40, r: 8 })
    expect(moved.prs).toEqual(['0025'])
    expect(S.routines[0].ex[0].id).toBe('0025')
    expect(S.exWeights['0025']).toEqual({ w: 40, d: '2019-05-31' })
    expect(S.exWeights[customId]).toBeUndefined()
    expect(moved.entries[0].note).toBe('tuck the elbows')
    expect(S.exNotes['0025']).toEqual({ t: 'tuck the elbows', d: '2019-05-31' })
    expect(S.exNotes[customId]).toBeUndefined()

    const again = parseWorkoutCSV(
      [FITNOTES, '2019-06-02,Weird Lift,Chest,45,kg,6,,,,'].join('\n'),
      { unit: 'kg', aliases: aliasesFromState(S) }
    )
    expect(again.created).toBe(0)
    expect(again.workouts[0].entries[0].id).toBe('0025')
  })

  it('folds the imported sets into a day that already has that library exercise', () => {
    const parsed = parse(FITNOTES, '2019-05-31,Weird Lift,Chest,40,kg,8,,,,')
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [], routines: [] }
    mergeImport(S, parsed)
    const customId = S.customEx[0].id
    S.workouts[0].entries.push({ id: '0025', sets: [{ w: 50, r: 5, done: true }], topW: 50 })
    retargetImport(S, customId, '0025')
    expect(S.workouts[0].entries).toHaveLength(1)
    expect(S.workouts[0].entries[0].id).toBe('0025')
    expect(S.workouts[0].entries[0].sets.map(s => s.w)).toEqual([50, 40])
    expect(S.workouts[0].entries[0].topW).toBe(50)
  })

  it('keeps a per-exercise comment, and the newest one is the note next time', () => {
    const p = parse(FITNOTES,
      '2019-05-31,Barbell Bench Press,Chest,60,kg,8,,,,"pause at the bottom"',
      '2019-05-31,Barbell Bench Press,Chest,60,kg,6,,,,"pause at the bottom"',
      '2019-05-31,Barbell Bench Press,Chest,60,kg,4,,,,"wider grip"',
      '2019-06-02,Barbell Bench Press,Chest,62.5,kg,8,,,,"wider grip"')
    const first = p.workouts[0].entries.find(e => e.id === '0025')
    expect(first.note).toBe('pause at the bottom\nwider grip')
    expect(p.workouts[1].entries[0].note).toBe('wider grip')
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [] }
    mergeImport(S, p)
    expect(S.exNotes['0025']).toEqual({ t: 'wider grip', d: '2019-06-02' })
  })

  it('reads a Hevy exercise note', () => {
    const p = parseWorkoutCSV([
      'title,start_time,exercise_title,exercise_notes,set_index,weight_kg,reps',
      'Push,2024-03-01 18:00:00,Barbell Bench Press,elbows in,0,80,5',
    ].join('\n'), { unit: 'kg' })
    expect(p.workouts[0].entries[0].note).toBe('elbows in')
  })

  it('does not duplicate the same lifts on a second import', () => {
    const p = parse(FITNOTES, '2019-05-31,Deadlift,Back,120,kg,5,,,,')
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [] }
    expect(mergeImport(S, p).added).toBe(1)
    expect(mergeImport(S, p).skipped).toBe(1)
    expect(S.workouts).toHaveLength(1)
    expect(S.workouts[0].entries).toHaveLength(1)
  })
})
