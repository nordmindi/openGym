// This week against last week. A lift progressed when its best estimated set went up.
// The same exercise on both weeks with no higher estimate stalled. A muscle on the
// weekly plan that received no completed set was skipped; with no plan, a muscle
// trained last week and missing this week counts as skipped.

import { isoOf, weekKey } from './format.js'
import { bestSetOf } from './onerm.js'
import { EXIDX } from './exercises.js'
import { MUSCLES, loadOfWorkouts, musclesOf } from './muscles.js'

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoOf(d)
}

function bestIn(workouts, id) {
  let best = null
  for (const w of workouts) {
    const entry = (w.entries || []).find(e => e.id === id)
    const b = bestSetOf(entry)
    if (b && (!best || b.est > best.est)) best = b
  }
  return best
}

function plannedMuscles(S, prevWorkouts) {
  const planned = []
  const add = slug => { if (slug && !planned.includes(slug)) planned.push(slug) }
  for (const rid of Object.values(S.week || {})) {
    const routine = (S.routines || []).find(r => r.id === rid)
    if (!routine) continue
    for (const c of routine.ex || []) {
      const m = musclesOf(EXIDX[c.id])
      for (const slug in m) if (m[slug] >= 1) add(slug)
    }
  }
  if (planned.length) return planned
  const prev = loadOfWorkouts(prevWorkouts)
  return MUSCLES.filter(m => (prev[m] || 0) > 0)
}

export function weeklyReview(S, today) {
  const thisKey = weekKey(today)
  const prevKey = weekKey(addDays(today, -7))
  const thisW = (S.workouts || []).filter(w => weekKey(w.d) === thisKey)
  const prevW = (S.workouts || []).filter(w => weekKey(w.d) === prevKey)
  const ids = new Set()
  for (const w of [...thisW, ...prevW]) for (const e of w.entries || []) ids.add(e.id)
  const progressed = []
  const stalled = []
  for (const id of ids) {
    const now = bestIn(thisW, id)
    const then = bestIn(prevW, id)
    if (!now || !then) continue
    ;(now.est > then.est ? progressed : stalled).push({ id, now, then })
  }
  progressed.sort((a, b) => (b.now.est - b.then.est) - (a.now.est - a.then.est))
  const load = loadOfWorkouts(thisW)
  const skipped = plannedMuscles(S, prevW).filter(m => !(load[m] > 0))
  return { progressed, stalled, skipped }
}
