// Automatic progression (issue #17).
//
// Everything here is a pure function of the workout history. Nothing writes back into a
// finished workout: the log is what happened, and the next prescription is *derived* from
// it every time it is needed. That means changing a policy — or fixing a mistyped set —
// immediately produces the right next target, with no stored counters to drift out of sync.
//
// It replaces a single hard-coded rule ("all reps done → add 2.5") with a small set of named
// policies. The rule that applies is always visible in the app, together with the reason it
// picked this weight, because a suggestion you can't audit is one you stop trusting.
//
// Reading a session honestly is the whole game:
//   · a set checked off with at least its target reps  → hit
//   · a set checked off with fewer reps                → miss (you logged what you got)
//   · a set never checked off                          → miss (it was not performed)
//   · fewer sets than prescribed                       → miss
// So a session that fell apart can never advance the load as though it had succeeded.

import { modeOf, repStep } from './history.js'
import { EXIDX } from './exercises.js'
import { best1RM } from './onerm.js'

export const POLICIES = ['off', 'linear', 'greyskull', 'double', '531', 'time']

// Which policies can sensibly drive which logging mode.
export const POLICIES_FOR = {
  reps: ['off', 'linear', 'greyskull', 'double', '531'],
  time: ['off', 'time'],
  cardio: ['off']
}

export const POLICY_NAME = {
  off: 'No automatic progression',
  linear: 'Linear progression',
  greyskull: 'Greyskull LP',
  double: 'Double progression',
  '531': '5/3/1',
  time: 'Add time'
}
export const POLICY_DESC = {
  off: 'Targets stay where you set them.',
  linear: 'Hit every rep in every set and the weight goes up. Repeated misses trigger a deload.',
  greyskull: 'Two straight sets plus a final set taken to failure. Beat the target on that set and the weight goes up — double if you double the reps. One failure resets 10 %.',
  double: 'Work up through a rep range at the same weight. Reach the top of the range in every set and the weight goes up, reps back to the bottom.',
  time: 'Hold every set for the full duration and the target goes up.',
  '531': 'Three working sets at a percentage of your training max: a week of 5s, a week of 3s, a 5/3/1 week, then a light week. Hit the heavy week and the max goes up.'
}

// Wendler-style wave, as fractions of the training max and the reps that count as a hit.
// The last set of the first three weeks is the one you may take past the target.
const WAVE = [
  [[0.65, 5], [0.75, 5], [0.85, 5]],
  [[0.70, 3], [0.80, 3], [0.90, 3]],
  [[0.75, 5], [0.85, 3], [0.95, 1]],
  [[0.40, 5], [0.50, 5], [0.60, 5]]
]

// Sessions of repeated misses before a deload. Greyskull resets on the first failure by
// design; the general linear policy gives you two more cracks at it first.
export const DELOAD_AFTER = { linear: 3, greyskull: 1, double: 3, time: 3 }
const DELOAD_FACTOR = 0.9

// Body parts where a 5 kg jump is normal rather than brutal.
const HEAVY_BP = ['upper legs', 'lower legs', 'back', 'hips', 'glutes']

// Default load step. Lower-body lifts take the bigger jump — that is the "lift-specific
// increment" a linear program lives on; an exercise can override it with cfg.inc.
export function defaultIncrement(exId, unit) {
  const ex = EXIDX[exId]
  const heavy = ex && HEAVY_BP.includes(ex.bp)
  if (unit === 'lb') return heavy ? 10 : 5
  return heavy ? 5 : 2.5
}
export const DEFAULT_SEC_INCREMENT = 5
// Where adding another set of push-ups stops being progress and starts being a way to spend
// an evening. Past this the honest advice is load or a harder variation (issue #33).
export const MAX_BW_SETS = 6

// The policy in force for one exercise: its own override, else the routine's default, else
// the mode's default. Reps keeps behaving the way the app always did (all reps → add a step).
export function policyFor(cfg, routine, mode) {
  const m = mode || modeOf(cfg || {})
  const allowed = POLICIES_FOR[m] || ['off']
  const pick = (cfg && cfg.prog) || (routine && routine.prog) || (m === 'reps' ? 'linear' : 'off')
  return allowed.includes(pick) ? pick : 'off'
}

const round1 = v => Math.round(v * 10) / 10
// Snap to a loadable multiple of the step.
function snap(v, step) {
  if (!(step > 0)) return round1(v)
  return round1(Math.round(v / step) * step)
}
// Back off by DELOAD_FACTOR, landing on something you can actually load. Rounding to the
// nearest step keeps the cut close to the intended 10 %, but on small weights the nearest
// step can be the weight you started from — so a deload that did not actually reduce
// anything takes one step down instead. Never goes below a single step.
function deloadTo(cur, step) {
  let next = snap(cur * DELOAD_FACTOR, step)
  if (next >= cur) next = snap(cur - step, step)
  return Math.max(step, next)
}

/**
 * Reduce one finished workout entry to what a policy needs to judge it.
 *
 * Workouts only started recording their prescription in v1.2.2, so most existing history has
 * no `target` at all. Judging those against nothing would score every past session as a miss
 * — and then greet a long-standing user with "missed reps 11 sessions running, deload". So an
 * entry without its own target is judged against `fallback`, the exercise's current plan,
 * which is exactly what the app's old weight hint compared against.
 */
export function readSession(entry, fallback) {
  const target = (entry && entry.target) || fallback || {}
  const mode = modeOf({ ...target, id: entry && entry.id })
  // A warm-up is logged, but it is not the work the plan is judging. Leaving it in made a
  // light set of 3 look like a missed working set and held the weight back.
  const sets = ((entry && entry.sets) || []).filter(s => !s.warm)
  const planned = target.sets || sets.length
  const enough = sets.length >= planned

  if (mode === 'time') {
    const goal = target.sec || 0
    const held = sets.map(s => (s.done ? (s.sec || 0) : 0))
    return {
      mode, goal, held,
      weight: Math.max(0, ...sets.filter(s => s.done).map(s => s.w || 0)),
      best: Math.max(0, ...held),
      ok: goal > 0 && enough && held.length > 0 && held.every(h => h >= goal)
    }
  }
  const goal = target.reps || 0
  const reps = sets.map(s => (s.done ? (s.r || 0) : 0))
  // A 5/3/1 set carries the reps it was supposed to hit. The session is a hit only when
  // every one of those sets made its own number — the last set's AMRAP does not excuse
  // a short set in front of it.
  const waved = sets.some(s => s.goal > 0)
  if (waved) {
    return {
      mode, goal, reps, wave: true,
      weight: Math.max(0, ...sets.filter(s => s.done).map(s => s.w || 0)),
      count: reps.length,
      low: reps.length ? Math.min(...reps) : 0,
      amrap: reps.length ? reps[reps.length - 1] : 0,
      ok: sets.length > 0 && sets.every(s => s.done && (!s.goal || (s.r || 0) >= s.goal))
    }
  }
  return {
    mode, goal, reps,
    weight: Math.max(0, ...sets.filter(s => s.done).map(s => s.w || 0)),
    count: reps.length,                                   // the dimension bodyweight work grows (#33)
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,       // Greyskull's final set
    effort: effortOfLast(sets),
    ok: goal > 0 && enough && reps.length > 0 && reps.every(r => r >= goal)
  }
}

// The last working set is the one that says how the weight felt. RIR 3+ (or RPE 7 or
// below) still had reps left; RIR 0–1 (or RPE 9–10) was a grind. Anything in between,
// or a set with no rating, leaves the policy alone.
function effortOfLast(sets) {
  const done = sets.filter(s => s.done)
  const s = done[done.length - 1]
  if (!s) return null
  if (s.rir != null) return { kind: 'rir', v: s.rir }
  if (s.rpe != null) return { kind: 'rpe', v: s.rpe }
  return null
}
export function effortBand(effort) {
  if (!effort) return null
  if (effort.kind === 'rir') return effort.v >= 3 ? 'easy' : effort.v <= 1 ? 'hard' : null
  if (effort.kind === 'rpe') return effort.v <= 7 ? 'easy' : effort.v >= 9 ? 'hard' : null
  return null
}

/** Every past session for one exercise, oldest first. `fallback` — see readSession. */
export function sessionsFor(S, exId, fallback) {
  const out = []
  ;(S.workouts || []).forEach(w => {
    const entry = w.entries.find(e => e.id === exId)
    if (entry && entry.sets.some(s => s.done && !s.warm)) out.push({ d: w.d, ...readSession(entry, fallback) })
  })
  return out
}

// How many sessions in a row ended in a miss, counting back from the most recent.
export function stallCount(sessions) {
  let n = 0
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok) break
    n++
  }
  return n
}

/**
 * The next prescription for one exercise.
 *
 * Returns `{ weight, reps, sec, why, kind }` — `kind` being one of
 * first | up | hold | deload | off, and `why` a translatable template + args so the app can
 * always answer "why this number?". A field the policy has no opinion on comes back
 * undefined and the caller keeps whatever the plan said.
 */
export function nextPrescription(S, cfg, routine) {
  const mode = modeOf(cfg)
  const policy = policyFor(cfg, routine, mode)
  const unit = S.unit || 'kg'
  const inc = cfg.inc > 0 ? cfg.inc : (mode === 'time' ? DEFAULT_SEC_INCREMENT : defaultIncrement(cfg.id, unit))
  if (policy === 'off') return { policy, kind: 'off' }
  if (policy === '531') return prescribe531(S, cfg, inc, unit)

  const sessions = sessionsFor(S, cfg.id, cfg).filter(s => s.mode === mode)
  const last = sessions[sessions.length - 1]
  if (!last) return { policy, kind: 'first', why: ['Nothing logged yet — this session sets the baseline.'] }

  const stalls = stallCount(sessions)
  const deloadAt = DELOAD_AFTER[policy] || 3

  if (mode === 'time') {
    if (last.ok) {
      const sec = (last.goal || cfg.sec || 0) + inc
      return { policy, kind: 'up', sec, why: ['Held every set for the full time — target up by {0}s.', inc] }
    }
    if (stalls >= deloadAt) {
      const sec = deloadTo(last.goal || cfg.sec || 0, 5)
      return { policy, kind: 'deload', sec, why: ['Short {0} sessions in a row — back off to {1}s and build up again.', stalls, sec] }
    }
    return { policy, kind: 'hold', sec: last.goal || cfg.sec, why: ['Last time came up short — same target again.'] }
  }

  const w = last.weight
  // Bodyweight work carries no external load, so there is nothing to add or take away —
  // "deload your push-ups to 2.5 kg" is not advice. Progress in reps instead. This runs ahead
  // of the individual policies because it is true for all of them. Note the trigger is the
  // *logged* weight, not the `bw` flag: a dip done with a belt has a load to progress and
  // belongs on the normal policies, and a barbell lift logged at 0 has nothing to add to.
  if (w <= 0) {
    const goal = last.goal || cfg.reps || 0
    if (!last.ok || goal <= 0) return { policy, kind: 'hold', weight: 0, reps: goal || undefined, why: ['Bodyweight — same target again until every set is clean.'] }
    // A ceiling turns "+1 rep forever" into a plan (issue #33). Past the top of the range the
    // reps go back to the bottom and a set is added instead, which is how bodyweight work
    // actually progresses once a set of 30 push-ups stops being a strength stimulus.
    const top = cfg.repsMax > 0 ? cfg.repsMax : 0
    if (top > 0 && goal >= top) {
      const sets = Math.max(1, cfg.sets || last.count || 1) + 1
      const bottom = Math.max(1, Math.min(cfg.reps || top, top))
      if (sets <= MAX_BW_SETS) return { policy, kind: 'up', weight: 0, reps: bottom, sets, why: ['{0} reps in every set — add a set and go back to {1}.', goal, bottom] }
      // Out of sets worth adding: more volume is no longer the answer, load or a harder
      // variation is — and that is a decision for a person, not a policy.
      return { policy, kind: 'hold', weight: 0, reps: goal, why: ['{0} sets of {1} — time to add weight or move to a harder variation.', sets - 1, goal] }
    }
    // Unilateral work steps by two, so the total stays even and both sides get the rep.
    const next = goal + repStep(cfg)
    return { policy, kind: 'up', weight: 0, reps: next, why: ['Bodyweight — every rep last time, so go for {0} this time.', next] }
  }
  if (policy === 'double') {
    const top = cfg.reps || last.goal || 10
    const bottom = Math.min(cfg.repsMin || Math.max(1, top - 2), top)
    if (last.ok && effortBand(last.effort) === 'hard') return { policy, kind: 'hold', weight: w, reps: top, why: ['Every rep, but the last set was a grind — same weight again.'] }
    if (last.ok) return { policy, kind: 'up', weight: snap(w + inc, inc), reps: bottom, why: ['Top of the rep range in every set — {0} {1} more, back to {2} reps.', inc, unit, bottom] }
    if (stalls >= deloadAt) {
      const dw = deloadTo(w, inc)
      return { policy, kind: 'deload', weight: dw, reps: bottom, why: ['Stalled {0} sessions — deload to {1} {2}.', stalls, dw, unit] }
    }
    const aim = Math.min(top, Math.max(bottom, last.low + repStep(cfg)))
    return { policy, kind: 'hold', weight: w, reps: aim, why: ['Same weight — aim for {0} reps this time.', aim] }
  }

  // linear + greyskull
  if (last.ok) {
    // A rating only steers linear. Greyskull already decides the jump from the AMRAP set.
    const band = policy === 'linear' ? effortBand(last.effort) : null
    if (band === 'easy') return { policy, kind: 'up', weight: snap(w + inc * 2, inc), why: ['Reps left in reserve — {0} {1} more.', inc * 2, unit] }
    if (band === 'hard') return { policy, kind: 'hold', weight: w, why: ['Every rep, but the last set was a grind — same weight again.'] }
    // Greyskull's final set is taken to failure: double the target reps there and you have
    // earned a double jump.
    const dbl = policy === 'greyskull' && last.goal > 0 && last.amrap >= last.goal * 2
    const step = dbl ? inc * 2 : inc
    return {
      policy, kind: 'up', weight: snap(w + step, inc),
      why: dbl
        ? ['Last set hit {0} reps — twice the target, so take a double jump of {1} {2}.', last.amrap, step, unit]
        : ['Every rep last time — {0} {1} more.', step, unit]
    }
  }
  if (stalls >= deloadAt) {
    const dw = deloadTo(w, inc)
    return {
      policy, kind: 'deload', weight: dw,
      why: stalls > 1
        ? ['Missed reps {0} sessions running — reset to {1} {2} and work back up.', stalls, dw, unit]
        : ['Missed reps — reset to {0} {1} and work back up.', dw, unit]
    }
  }
  return { policy, kind: 'hold', weight: w, why: ['Missed reps last time — same weight again ({0} of {1} to go).', deloadAt - stalls, deloadAt] }
}

// Training max, then the week of the wave. A completed cycle raises the max only when the
// heavy week (the third session) was actually hit. Sessions that were not prescribed as a
// wave do not move the calendar — switching the rule on does not inherit a random week.
function prescribe531(S, cfg, inc, unit) {
  const sessions = sessionsFor(S, cfg.id, cfg).filter(s => s.wave)
  const week = sessions.length % 4
  const cycles = Math.floor(sessions.length / 4)
  let bumps = 0
  for (let c = 0; c < cycles; c++) if (sessions[c * 4 + 2]?.ok) bumps++
  let base = 0
  if (cfg.tm > 0) base = snap(cfg.tm, inc)
  else {
    const est = best1RM(S, cfg.id)
    if (est && est.est > 0) base = snap(est.est * 0.9, inc)
    else if (cfg.weight > 0) base = snap(cfg.weight, inc)
  }
  if (!(base > 0)) return { policy: '531', kind: 'first', why: ['Nothing logged yet — this session sets the baseline.'] }
  const tm = snap(base + bumps * inc, inc)
  const steps = WAVE[week]
  const wave = steps.map(([pct, reps]) => ({ w: snap(tm * pct, inc), r: reps }))
  const pcts = steps.map(([pct]) => Math.round(pct * 100))
  return {
    policy: '531',
    kind: week === 3 ? 'deload' : (bumps > 0 && week === 0 ? 'up' : 'hold'),
    wave, sets: wave.length, tm,
    why: ['Week {0} of 4 — {1}% / {2}% / {3}% of a {4} {5} training max.', week + 1, pcts[0], pcts[1], pcts[2], tm, unit]
  }
}

/**
 * Apply a prescription to freshly built sets. Only the fields the policy actually decided
 * are touched, and only on sets that have not been logged yet.
 */
export function applyPrescription(sets, p) {
  if (!p || p.kind === 'off' || p.kind === 'first') return sets
  // Each working set of a wave gets its own weight and its own rep target. A short list
  // grows to the three sets; warm-ups and anything already logged stay as they are.
  if (p.wave && p.wave.length) {
    const out = sets.map(s => ({ ...s }))
    let k = 0
    for (let i = 0; i < out.length; i++) {
      if (out[i].done || out[i].warm) continue
      const step = p.wave[Math.min(k, p.wave.length - 1)]
      k++
      out[i].w = step.w
      out[i].r = step.r
      out[i].goal = step.r
    }
    while (k < p.wave.length) {
      const step = p.wave[k++]
      out.push({ w: step.w, r: step.r, goal: step.r, done: false })
    }
    return out
  }
  const out = sets.map(s => {
    if (s.done) return s
    const o = { ...s }
    if (p.weight != null) o.w = p.weight
    if (p.reps != null) o.r = p.reps
    if (p.sec != null) o.sec = p.sec
    return o
  })
  // A policy that decided on a set count gets to grow the list — bodyweight progression adds
  // a set where a barbell would have added a plate. Only ever upwards, and only by copying a
  // row that is already there: a session in progress must not lose a set it has logged.
  if (p.sets > out.length) {
    const seed = out[out.length - 1]
    while (out.length < p.sets) out.push({ ...seed, done: false })
  }
  return out
}
