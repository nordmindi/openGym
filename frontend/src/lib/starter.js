// The Push/Pull/Legs starter plan. Shared by the "Load starter plan" action in Settings
// and by the demo build, which seeds a history on top of exactly these routines.
import { uid } from './format.js'

const SPEC = [
  ['Push Day', 'barbell', [['0025', 4, 8], ['0047', 3, 10], ['0426', 3, 10], ['0334', 3, 12], ['0241', 3, 12], ['0251', 3, 10]]],
  ['Pull Day', 'pullup', [['2330', 4, 10], ['0027', 4, 8], ['1323', 3, 10], ['0031', 3, 10], ['0313', 3, 12]]],
  ['Leg Day', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]]
]

const row = (id, sets, reps) => ({ id, sets, reps, weight: 0 })
const build = (name, emoji, list, prog) => ({
  id: uid(), name, emoji, ...(prog ? { prog } : {}), ex: list.map(r => row(...r))
})

// Fresh routine objects (new ids) — [push, pull, legs]. The demo history is built on these.
export const starterRoutines = () =>
  SPEC.map(([name, emoji, list]) => build(name, emoji, list))

// Upper/lower, full body, and a 5×5 barbell plan. Same catalogue ids as the PPL starter,
// so a new user is not sent looking for an exercise the dataset does not have.
const UPPER = [['0025', 4, 8], ['0027', 4, 8], ['0426', 3, 10], ['2330', 3, 10], ['0241', 3, 12], ['0031', 3, 10]]
const LOWER = [['0043', 4, 8], ['0085', 3, 8], ['0739', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]
const FIVE_A = [['0043', 5, 5], ['0025', 5, 5], ['0027', 5, 5]]
const FIVE_B = [['0043', 5, 5], ['0426', 5, 5], ['0032', 1, 5]]

export const STARTER_PLANS = {
  ppl: {
    title: 'Push / Pull / Legs',
    blurb: 'Mon Push · Wed Pull · Fri Legs',
    toast: 'Starter plan loaded — Mon Push · Wed Pull · Fri Legs',
    days: [[1, 0], [3, 1], [5, 2]],
    routines: () => starterRoutines()
  },
  upper: {
    title: 'Upper / lower',
    blurb: 'Mon and Thu upper · Tue and Fri lower',
    toast: 'Starter plan loaded — Mon and Thu upper · Tue and Fri lower',
    days: [[1, 0], [2, 1], [4, 0], [5, 1]],
    routines: () => [build('Upper', 'arm', UPPER), build('Lower', 'legs', LOWER)]
  },
  full: {
    title: 'Full body',
    blurb: 'Mon, Wed and Fri, a different session each day',
    toast: 'Starter plan loaded — Mon, Wed and Fri full body',
    days: [[1, 0], [3, 1], [5, 2]],
    routines: () => [
      build('Full body A', 'figureStrength', [['0043', 3, 8], ['0025', 3, 8], ['0027', 3, 8], ['0251', 3, 10]]),
      build('Full body B', 'figureStrength', [['0085', 3, 8], ['0426', 3, 8], ['2330', 3, 10], ['0031', 3, 10]]),
      build('Full body C', 'figureStrength', [['0043', 3, 8], ['0047', 3, 8], ['1323', 3, 10], ['0605', 3, 15]])
    ]
  },
  five: {
    title: '5×5',
    blurb: 'Squat, bench and row; then squat, press and deadlift. Mon A · Wed B · Fri A.',
    toast: 'Starter plan loaded — Mon and Fri workout A · Wed workout B',
    days: [[1, 0], [3, 1], [5, 0]],
    routines: () => [build('Workout A', 'barbell', FIVE_A, 'linear'), build('Workout B', 'barbell', FIVE_B, 'linear')]
  }
}
