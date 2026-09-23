// Import a training history exported from another app.
//
// Every one of these apps exports the same thing in a different dialect: one row per
// *set*, carrying a date, an exercise name and some mix of weight/reps/distance/time.
// So this reads a column MAP built from the header rather than fixed positions, which
// means a new app is usually a few header aliases rather than another importer.
//
// Verified against real exports:
//   FitNotes (Android) Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment
//   FitNotes 2 (iOS)   Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind
//   Strong             Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
//   Hevy               title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
// Anything else falls through to loose header matching, which covers Lyfta and the
// spreadsheet round-trips people actually have on disk, as long as the file has a
// date, an exercise name and something measured.
//
// Apple Health is a different animal — an XML dump, often hundreds of MB — and only its
// body-weight records are interesting here. parseBodyweight() scans for those without
// building a DOM.

import { EXDB, EXIDX } from './exercises.js'
import { uid } from './format.js'
import { cleanupSg } from './history.js'

/* ----------------------------------------------------------------- CSV ---- */

/**
 * A real CSV reader: quoted fields, embedded commas and newlines, doubled quotes, BOM
 * and CRLF. Splitting on commas breaks on the first exercise named "Bench Press, Close
 * Grip" — and a whole history would import shifted by one column without ever erroring.
 */
export function parseCSV(text) {
  const rows = []
  let row = [], field = '', quoted = false
  const s = String(text).replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(x => x !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(x => x !== '')) rows.push(row)
  return rows
}

const norm = h => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// header text -> the field we care about. Specific names first; first match wins.
const COLUMNS = [
  ['exercise', ['exercise', 'exercise name', 'exercise title']],
  ['date', ['date', 'workout date']],
  ['startTime', ['start time']],
  ['endTime', ['end time']],
  ['workoutName', ['workout name', 'title']],
  ['category', ['category', 'body part', 'muscle group']],
  ['weightKg', ['weight kg']],
  ['weightLb', ['weight lbs', 'weight lb']],
  ['weight', ['weight']],
  ['weightUnit', ['weight unit', 'weightunit', 'unit']],
  ['reps', ['reps', 'repetitions']],
  // Hevy and Strong both write an RPE per set. Nothing mainstream exports RIR, but read it
  // when it is there rather than dropping the column on the floor.
  ['rpe', ['rpe', 'rpe rating']],
  ['rir', ['rir', 'reps in reserve']],
  ['distanceKm', ['distance km']],
  ['distance', ['distance']],
  // FitNotes Android sometimes writes DistanceUnit / WeightUnit as one CamelCase token
  // (no space); norm() then yields "distanceunit" rather than "distance unit".
  ['distanceUnit', ['distance unit', 'distanceunit']],
  ['seconds', ['seconds', 'duration seconds']],
  ['time', ['time', 'duration']],
  ['setType', ['set type']],
  ['note', ['comment', 'comments', 'notes', 'note', 'exercise notes', 'exercise note']],
]

function mapHeader(header) {
  const map = {}
  header.forEach((h, i) => {
    const n = norm(h)
    for (const [field, names] of COLUMNS) {
      if (map[field] === undefined && names.includes(n)) { map[field] = i; return }
    }
  })
  return map
}

/** Name of the app a header looks like — shown back to the user so they can sanity-check. */
export function detectSource(header) {
  const h = header.map(norm)
  if (h.includes('exercise title') && h.includes('set index')) return 'Hevy'
  if (h.includes('exercise name') && h.includes('set order')) return 'Strong'
  if (h.includes('exercise') && h.includes('kind')) return 'FitNotes (iOS)'
  if (h.includes('exercise') && h.includes('weight unit')) return 'FitNotes'
  if (h.includes('exercise') && h.includes('category')) return 'FitNotes'
  return null
}

/* ------------------------------------------------------ exercise matching -- */

// Other apps bolt qualifiers onto names — Hevy writes "Leg Press (Machine)", Strong
// "Snatch (Barbell)", FitNotes "Lat Pulldown (Pulley)" — while the dataset writes
// "barbell snatch". Strip the parentheses, expand the shorthand, then compare as a
// sorted bag of words so word order stops mattering.
const SYN = [
  [/\bbb\b/g, 'barbell'], [/\bdb\b/g, 'dumbbell'], [/\bkb\b/g, 'kettlebell'],
  [/\bohp\b/g, 'overhead press'], [/\bbw\b/g, 'body weight'], [/\bbodyweight\b/g, 'body weight'],
  [/\bmachine\b/g, 'lever'], [/\bsmith machine\b/g, 'smith'], [/\bez bar\b/g, 'ez barbell'],
  [/\bpull ups?\b/g, 'pull up'], [/\bchin ups?\b/g, 'chin up'], [/\bpush ups?\b/g, 'push up'],
  [/\bsit ups?\b/g, 'sit up'], [/\bdips?\b/g, 'dip'], [/\braises?\b/g, 'raise'],
  [/\bcurls?\b/g, 'curl'], [/\bpresses\b/g, 'press'], [/\bextensions?\b/g, 'extension'],
  [/\bcables?\b/g, 'cable'], [/\bseated\b/g, 'seated'], [/\bassisted\b/g, 'assisted'],
]
// Words that say nothing about which exercise this is, so they shouldn't stop a match.
const FILLER = new Set(['the', 'a', 'with', 'and', 'v', 'variation', 'version', 'pulley', 'weighted'])

function wordsOf(name) {
  // Parentheses are unwrapped rather than dropped: "Bench Press (Barbell)" carries its
  // equipment in there, and the dataset writes that as "barbell bench press".
  let k = String(name || '').toLowerCase()
    .replace(/[()[\]]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  SYN.forEach(([re, to]) => { k = k.replace(re, to) })
  return k.split(' ').filter(w => w && !FILLER.has(w))
}
const keyOf = name => wordsOf(name).sort().join(' ')

let INDEX = null
function buildIndex() {
  if (INDEX) return INDEX
  INDEX = { exact: new Map(), all: [] }
  EXDB.forEach(e => {
    const w = wordsOf(e.n)
    const k = w.slice().sort().join(' ')
    if (!INDEX.exact.has(k)) INDEX.exact.set(k, e.id)
    INDEX.all.push({ id: e.id, set: new Set(w), n: w.length })
  })
  return INDEX
}

// Curated: the names people actually log, mapped by hand to the dataset id they mean.
//
// Other apps let you name a lift "Bench Press"; the dataset only has qualified names
// like "barbell bench press". Word-overlap alone can't resolve that — "bench press" sits
// inside thirty-three entries — and where it *is* unique it tends to be wrong, happily
// resolving "Squat" to "weighted squat" and "Leg Press" to "smith leg press". So the
// common vocabulary is spelled out. The convention is that an unqualified name means the
// canonical barbell version, which is what these apps assume when they show it to you.
// Extending this table is the intended way to improve import accuracy.
const ALIAS_EX = {
  'bench press': '0025', 'barbell bench press': '0025', 'flat bench press': '0025',
  'flat barbell bench press': '0025', 'incline bench press': '0047', 'decline bench press': '0033',
  'close grip bench press': '0030', 'close-grip bench press': '0030',
  'dumbbell bench press': '0289', 'incline dumbbell bench press': '0314',
  'incline dumbbell press': '0314', 'dumbbell incline press': '0314', 'dumbbell incline bench press': '0314',
  squat: '0043', 'back squat': '0043', 'barbell squat': '0043', 'front squat': '0042',
  deadlift: '0032', 'barbell deadlift': '0032', 'romanian deadlift': '0085', rdl: '0085',
  'dumbbell romanian deadlift': '1459', 'sumo deadlift': '0117',
  'lat pulldown': '2330', 'lat pull down': '2330', pulldown: '2330',
  'wide grip lat pulldown': '2330', 'wide-grip lat pulldown': '2330',
  shrug: '0095', shrugs: '0095', 'barbell shrug': '0095',
  'overhead press': '0091', 'military press': '0091', 'shoulder press': '0091', ohp: '0091',
  'barbell row': '0027', 'bent over row': '0027', 'bent-over row': '0027',
  'seated row': '0180', 'cable row': '0180', 'seated cable row': '0180', 'cable seated row': '0180',
  'dumbbell row': '0292', 'one arm dumbbell row': '0292', 'one-arm dumbbell row': '0292',
  'leg curl': '0586', 'lying leg curl': '0586', 'seated leg curl': '0586',
  'leg press': '0739', 'leg extension': '0585',
  'calf raise': '1372', 'standing calf raise': '1372', 'seated calf raise': '0088',
  'lateral raise': '0334', 'side raise': '0334', 'dumbbell lateral raise': '0334',
  'reverse fly': '0348', 'rear delt fly': '0348', 'face pull': '0203', 'facepull': '0203',
  'bicep curl': '0294', 'biceps curl': '0294', 'dumbbell curl': '0294',
  'hammer curl': '0313', 'dumbbell hammer curl': '0313',
  'preacher curl': '0070', 'barbell curl': '0031',
  'tricep pushdown': '0241', 'triceps pushdown': '0241', pushdown: '0241',
  'tricep extension': '0061', 'triceps extension': '0061',
  skullcrusher: '0060', 'skull crusher': '0060', 'lying triceps extension': '0061',
  lunge: '0054', lunges: '0054', 'walking lunge': '0054',
  'cable crossover': '1269', 'cable cross over': '1269',
  'pull up': '0652', 'pull ups': '0652', 'pull-up': '0652', 'pull-ups': '0652',
  'chin up': '1326', 'chin ups': '1326', 'chin-up': '1326', 'chin-ups': '1326',
  'push up': '0662', 'push ups': '0662', 'push-up': '0662', 'push-ups': '0662',
  dip: '0251', dips: '0251', 'chest dip': '0251', 'triceps dip': '0019',
  'good morning': '0044', 'farmers walk': '2133', 'farmer walk': '2133', 'farmer s walk': '2133',
  'hanging leg raise': '0472', crunch: '0274', crunches: '0274',
  'hip thrust': '1409', 'barbell hip thrust': '1409', 'glute bridge': '1409', 'barbell glute bridge': '1409',
}

let ALIAS_IDX = null
const aliasIndex = () => {
  if (!ALIAS_IDX) {
    ALIAS_IDX = new Map()
    for (const k in ALIAS_EX) ALIAS_IDX.set(wordsOf(k).sort().join(' '), ALIAS_EX[k])
  }
  return ALIAS_IDX
}

/**
 * Find the dataset exercise a foreign name refers to, or null.
 *
 * Curated alias first, then an exact word-bag match, then entries that contain every
 * word of the query — but only when exactly one candidate is that close. Guessing
 * between "barbell bench press" and "dumbbell bench press" would file years of training
 * under the wrong lift, which is worse than leaving it as a custom exercise the user can
 * see and fix.
 */
export function matchExercise(name) {
  const idx = buildIndex()
  const w = wordsOf(name)
  if (!w.length) return null
  // Compared as a sorted bag of words, so "Squat (Barbell)" finds the 'barbell squat'
  // alias — the exporters disagree about whether the equipment leads or trails.
  const sorted = w.slice().sort().join(' ')
  const aliased = aliasIndex().get(sorted)
  if (aliased && EXIDX[aliased]) return aliased
  const exact = idx.exact.get(sorted)
  if (exact) return exact
  const q = new Set(w)
  let best = null, bestExtra = Infinity, ties = 0
  for (const c of idx.all) {
    let ok = true
    for (const word of q) if (!c.set.has(word)) { ok = false; break }
    if (!ok) continue
    const extra = c.n - q.size
    if (extra > 2) continue
    if (extra < bestExtra) { best = c.id; bestExtra = extra; ties = 1 }
    else if (extra === bestExtra) ties++
  }
  return ties === 1 ? best : null
}

// Categories the exporters use -> the dataset's body parts, for exercises we invent.
const CATEGORY_BP = {
  chest: 'chest', back: 'back', lats: 'back', shoulders: 'shoulders', delts: 'shoulders',
  legs: 'upper legs', quads: 'upper legs', hamstrings: 'upper legs', glutes: 'upper legs',
  calves: 'lower legs', abs: 'waist', core: 'waist', obliques: 'waist',
  arms: 'upper arms', biceps: 'upper arms', triceps: 'upper arms', forearms: 'lower arms',
  cardio: 'cardio', 'full body': 'upper legs', olympic: 'upper legs', neck: 'neck',
}

/* ----------------------------------------------------------- conversion --- */

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0 }
// An effort rating out of someone else's export. A blank cell means "not rated" and has to
// stay absent rather than becoming 0 — and 0 itself means opposite things on the two scales:
// RIR 0 is a set taken to failure and worth keeping, while RPE has no 0 (the scale is 1–10),
// so an app writing 0 for "nothing here" must not be read as an effort. Ratings above the
// scale are capped rather than dropped — the set was still rated, just written oddly.
const effortNum = (raw, zeroMeansRated) => {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = parseFloat(s.replace(',', '.'))
  if (!isFinite(n) || n < 0 || (n === 0 && !zeroMeansRated)) return null
  return Math.min(10, Math.round(n * 100) / 100)
}
const LB_TO_KG = 0.45359237
const p2 = n => String(n).padStart(2, '0')
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

/** "2020-12-30 18:51:52" · "2024-03-07" · "22 Dec 2025, 08:00" · "07/03/2024" -> { d, t } */
export function parseWhen(s) {
  const v = String(s || '').trim()
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/)
  if (m) return { d: `${m[1]}-${p2(m[2])}-${p2(m[3])}`, t: hm(m[4], m[5]) }
  m = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/)
  if (m && MON[m[2].toLowerCase()]) return { d: `${m[3]}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}`, t: hm(m[4], m[5]) }
  m = v.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/)
  if (m && MON[m[1].toLowerCase()]) return { d: `${m[3]}-${p2(MON[m[1].toLowerCase()])}-${p2(m[2])}`, t: hm(m[4], m[5]) }
  // Day-first when ambiguous: FitNotes/Strong/Hevy all write unambiguous dates, so a
  // bare numeric one came through a spreadsheet, and those are usually European.
  m = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[, ]+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const [, a, b, y] = m
    const day = +a > 12 ? a : +b > 12 ? b : a
    const mon = day === a ? b : a
    return { d: `${y}-${p2(mon)}-${p2(day)}`, t: hm(m[4], m[5]) }
  }
  return null
}
const hm = (h, mi) => (h === undefined ? null : (parseInt(h, 10) || 0) * 3600000 + (parseInt(mi, 10) || 0) * 60000)

/** "HH:MM:SS" · "MM:SS" · "90" -> minutes */
function toMinutes(v) {
  const s = String(v ?? '').trim()
  if (!s) return 0
  if (s.includes(':')) {
    const p = s.split(':').map(x => parseInt(x, 10) || 0)
    const sec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
    return Math.round(sec / 60 * 10) / 10
  }
  const m = s.match(/(\d+)\s*h/i), mm = s.match(/(\d+)\s*m/i)      // Strong's "2h 38m"
  if (m || mm) return (m ? +m[1] * 60 : 0) + (mm ? +mm[1] : 0)
  return Math.round(num(s) * 10) / 10
}
const KM = { m: 0.001, km: 1, cm: 0.00001, in: 0.0000254, ft: 0.0003048, yd: 0.0009144, mi: 1.609344 }
const toKm = (v, unit) => num(v) * (KM[String(unit || 'km').toLowerCase().trim()] ?? 1)

/* --------------------------------------------------------------- parse ---- */

/**
 * Read an export into workouts openGym understands, WITHOUT touching state — the caller
 * shows the summary for confirmation first. Nothing here throws on a bad row: a history
 * of several thousand sets will contain oddities, and losing the file over one of them
 * helps nobody. Bad rows are counted and reported instead.
 */
/** Names the user already corrected, keyed by the normalised source name.
 *  A library match (importAliases) wins over a custom that still carries the same key. */
export function aliasesFromState(S) {
  const a = { ...(S?.importAliases || {}) }
  for (const c of S?.customEx || []) if (c.importKey && a[c.importKey] == null) a[c.importKey] = c.id
  return a
}

export function parseWorkoutCSV(text, { unit = 'kg', aliases = {} } = {}) {
  const rows = parseCSV(text)
  if (rows.length < 2) return { error: 'empty' }
  const map = mapHeader(rows[0])
  const source = detectSource(rows[0])
  const dateCol = map.date !== undefined ? 'date' : map.startTime !== undefined ? 'startTime' : null
  if (!dateCol || map.exercise === undefined) return { error: 'unrecognised' }

  const resolved = new Map()          // source name -> library id | null (stats only)
  const bound = new Map()             // source name -> id actually written on the set
  const byDate = new Map()
  const created = new Map()
  const unmatched = new Set()
  let sets = 0, skipped = 0, matched = 0, warmups = 0, rpeSets = 0, rirSets = 0
  let skippedName = 0, skippedDate = 0, skippedEmpty = 0
  let sawLb = false, sawKg = false

  const cell = (r, f) => (map[f] === undefined ? '' : String(r[map[f]] ?? '').trim())

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = cell(r, 'exercise')
    const when = parseWhen(cell(r, dateCol))
    if (!name || !when) {
      skipped++
      if (!name) skippedName++
      else skippedDate++
      continue
    }

    // explicit kg/lb columns beat a generic column plus a unit column
    let w = 0, rowUnit = ''
    if (map.weightKg !== undefined && cell(r, 'weightKg')) { w = num(cell(r, 'weightKg')); rowUnit = 'kg' }
    else if (map.weightLb !== undefined && cell(r, 'weightLb')) { w = num(cell(r, 'weightLb')); rowUnit = 'lb' }
    else {
      w = num(cell(r, 'weight'))
      const u = cell(r, 'weightUnit').toLowerCase()
      rowUnit = u.startsWith('lb') ? 'lb' : u.startsWith('kg') ? 'kg' : ''
    }
    if (rowUnit === 'lb') sawLb = true
    if (rowUnit === 'kg') sawKg = true

    const reps = Math.round(num(cell(r, 'reps')))
    const secs = num(cell(r, 'seconds'))
    const mins = secs > 0 ? Math.round(secs / 60 * 10) / 10 : toMinutes(cell(r, 'time'))
    const km = map.distanceKm !== undefined && cell(r, 'distanceKm')
      ? num(cell(r, 'distanceKm'))
      : toKm(cell(r, 'distance'), cell(r, 'distanceUnit'))
    if (!w && !reps && !mins && !km) { skipped++; skippedEmpty++; continue }
    if (/warm/i.test(cell(r, 'setType'))) warmups++

    const key = keyOf(name)
    let id = bound.get(key)
    if (id === undefined) {
      // A previous import of this exact name, including one the user has since renamed.
      const known = aliases[key]
      const knownLib = known && EXIDX[known] && !EXIDX[known].custom
      if (known) {
        id = known
        resolved.set(key, knownLib ? known : null)
      } else {
      const libraryId = matchExercise(name)
      resolved.set(key, libraryId || null)
      if (libraryId) id = libraryId
      else {
        const c = {
          id: 'im' + uid(), n: name.toLowerCase(), custom: true, eq: 'custom', tg: '', desc: '',
          importKey: key,
          bp: CATEGORY_BP[cell(r, 'category').toLowerCase()] || (km || (mins && !reps) ? 'cardio' : 'upper legs'),
        }
        created.set(key, c)
        unmatched.add(name)
        id = c.id
      }
      }
      bound.set(key, id)
    }
    if (resolved.get(key)) matched++

    const isCardio = (km > 0 || mins > 0) && !reps
    // `u` carries the row's own unit into the conversion pass below and is dropped there —
    // it never reaches the stored set.
    const set = isCardio
      ? { min: mins || 0, speed: mins > 0 ? Math.round(km / (mins / 60) * 10) / 10 : 0, done: true }
      : { w, r: reps || 0, done: true, u: rowUnit }
    // Effort rides along only where the app can show it again: a weighted rep set. A treadmill
    // row with an RPE would have nowhere to put it. A set is kept on one scale, so a file
    // carrying both columns is read as RIR — the same precedence setLabel reads them back with.
    if (!isCardio) {
      const rir = effortNum(cell(r, 'rir'), true)
      const rpe = rir == null ? effortNum(cell(r, 'rpe'), false) : null
      if (rir != null) { set.rir = rir; rirSets++ }
      else if (rpe != null) { set.rpe = rpe; rpeSets++ }
    }

    let day = byDate.get(when.d)
    if (!day) {
      day = { ex: new Map(), notes: new Map(), name: cell(r, 'workoutName') || '', start: when.t, end: null }
      byDate.set(when.d, day)
    }
    if (!day.name) day.name = cell(r, 'workoutName') || ''
    if (map.endTime !== undefined) { const e = parseWhen(cell(r, 'endTime')); if (e && e.t != null) day.end = e.t }
    else if (map.time !== undefined && !map.seconds && reps) { /* FitNotes' Time is per-set */ }
    if (!day.ex.has(id)) day.ex.set(id, [])
    day.ex.get(id).push(set)
    // One note per exercise per day. The same cue repeated on every set stays once;
    // a later set that says something else is kept on its own line.
    const note = cell(r, 'note')
    if (note) {
      const prev = day.notes.get(id)
      if (!prev) day.notes.set(id, note)
      else if (!prev.split('\n').includes(note)) day.notes.set(id, prev + '\n' + note)
    }
    sets++
  }

  // lb -> kg only where a row disagrees with the profile. The app never converts units on
  // its own, so importing unconverted would silently rewrite someone's numbers.
  // Converting PER ROW matters: apps like FitNotes write the unit next to every set, and a
  // history recorded partly in lb and partly in kg used to be taken over as-is, turning
  // "185 lb" into 185 kg.
  const fileUnit = sawLb && !sawKg ? 'lb' : sawKg && !sawLb ? 'kg' : ''
  const mixedUnits = sawLb && sawKg
  const toKg = x => Math.round(x * LB_TO_KG * 10) / 10
  const toLb = x => Math.round(x / LB_TO_KG * 10) / 10
  // A row without its own unit follows the file's, and a file that says nothing is taken
  // to already be in the profile's unit.
  const convRow = s => {
    const u = s.u || fileUnit
    if (!u || u === unit) return s.w
    return u === 'lb' ? toKg(s.w) : toLb(s.w)
  }
  const converted = (!!fileUnit && fileUnit !== unit) || mixedUnits

  const dates = [...byDate.keys()].sort()
  const workouts = dates.map(d => {
    const day = byDate.get(d)
    const entries = [...day.ex.entries()].map(([id, ss]) => {
      const conv2 = ss.map(({ u, ...s }) => (s.w !== undefined ? { ...s, w: convRow({ ...s, u }) } : s))
      const mx = Math.max(0, ...conv2.map(s => s.w || 0))
      const note = (day.notes.get(id) || '').trim()
      return { id, sets: conv2, topW: mx || null, ...(note ? { note } : {}) }
    })
    const base = new Date(d + 'T00:00:00').getTime()
    const start = base + (day.start ?? 18 * 3600000)
    const end = day.end != null ? base + day.end : start
    const w = {
      id: 'iw' + uid(), d, start, end: end > start ? end : start,
      routineId: null, name: day.name || 'Imported', entries, prs: [],
    }
    w.vol = entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.w || 0) * (s.r || 0), 0), 0)
    return w
  })

  return {
    kind: 'workouts', source, workouts, customEx: [...created.values()],
    // distinct library exercises behind the matched rows — the summary calls this
    // "exercises matched", and counting rows there made three exercises read as five
    matched: new Set([...resolved.values()].filter(Boolean)).size,
    matchedSets: matched,
    created: created.size, unmatchedNames: [...unmatched].sort(),
    sets, skipped, skippedName, skippedDate, skippedEmpty, warmups, fileUnit, mixedUnits, converted, rpeSets, rirSets,
    from: dates[0] || null, to: dates[dates.length - 1] || null,
  }
}

/* ------------------------------------------------------- body weight ------ */

/**
 * Body-weight history from Apple Health, or any CSV with a date and a weight.
 *
 * Health's own export is one big `export.xml` — often several hundred MB, nearly all of
 * it step counts and heart rate. Building a DOM would blow up the tab, so the body-mass
 * records are pulled out with a scan instead. Health writes weights in the unit the
 * phone is set to and labels each record, so the unit is read per record.
 */
export function parseBodyweight(text, { unit = 'kg' } = {}) {
  const s = String(text)
  const out = new Map()          // iso date -> { w, t }  (one weigh-in per day, the last)
  let fileUnit = ''

  if (s.includes('HKQuantityTypeIdentifierBodyMass')) {
    const re = /<Record[^>]*type="HKQuantityTypeIdentifierBodyMass"[^>]*>/g
    let m
    while ((m = re.exec(s))) {
      const tag = m[0]
      const val = /value="([\d.]+)"/.exec(tag)
      const dt = /startDate="([^"]+)"/.exec(tag) || /creationDate="([^"]+)"/.exec(tag)
      const u = /unit="([^"]+)"/.exec(tag)
      if (!val || !dt) continue
      const when = parseWhen(dt[1])
      if (!when) continue
      if (u) fileUnit = /lb/i.test(u[1]) ? 'lb' : 'kg'
      out.set(when.d, { w: parseFloat(val[1]), t: new Date(dt[1]).getTime() || null })
    }
  } else {
    const rows = parseCSV(s)
    if (rows.length < 2) return { error: 'empty' }
    const map = mapHeader(rows[0])
    // a weight-only CSV: whichever weight column it has
    const wCol = map.weightKg ?? map.weightLb ?? map.weight
    const dCol = map.date ?? map.startTime
    if (wCol === undefined || dCol === undefined) return { error: 'unrecognised' }
    if (map.weightKg !== undefined) fileUnit = 'kg'
    else if (map.weightLb !== undefined) fileUnit = 'lb'
    for (let i = 1; i < rows.length; i++) {
      const when = parseWhen(String(rows[i][dCol] ?? ''))
      const w = num(rows[i][wCol])
      if (!when || !w) continue
      out.set(when.d, { w, t: new Date(when.d).getTime() + (when.t ?? 0) })
    }
  }

  if (!out.size) return { error: 'unrecognised' }
  const converted = !!fileUnit && fileUnit !== unit
  const conv = converted
    ? (fileUnit === 'lb' ? x => Math.round(x * LB_TO_KG * 10) / 10 : x => Math.round(x / LB_TO_KG * 10) / 10)
    : x => Math.round(x * 10) / 10
  const dates = [...out.keys()].sort()
  return {
    kind: 'bodyweight', source: 'Apple Health',
    bodyweight: dates.map(d => ({ d, w: conv(out.get(d).w), t: out.get(d).t || new Date(d).getTime() })),
    fileUnit, converted, from: dates[0], to: dates[dates.length - 1],
  }
}

/** Sniff the file and parse it as whatever it is. */
export function parseImport(text, opts) {
  const s = String(text)
  if (s.includes('HKQuantityTypeIdentifier') || /^\s*</.test(s)) return parseBodyweight(s, opts)
  const asWorkouts = parseWorkoutCSV(s, opts)
  if (!asWorkouts.error) return asWorkouts
  const asWeights = parseBodyweight(s, opts)
  return asWeights.error ? asWorkouts : asWeights
}

/* --------------------------------------------------------------- merge ---- */

/** Merge into state. Existing days are kept and new exercises are added into them —
 *  importing twice never duplicates a lift on a day. Days with no local workout yet
 *  are appended as whole workouts. */
export function mergeImport(S, parsed) {
  if (parsed.kind === 'bodyweight') {
    const have = new Set(S.bodyweight.map(b => b.d))
    const fresh = parsed.bodyweight.filter(b => !have.has(b.d))
    S.bodyweight = [...S.bodyweight, ...fresh].sort((a, b) => (a.d < b.d ? -1 : 1))
    return { added: fresh.length, skipped: parsed.bodyweight.length - fresh.length, merged: 0 }
  }

  S.customEx = S.customEx || []
  // Re-imports mint new custom ids each parse — fold them onto an existing custom with
  // the same normalised name so a second import doesn't invent a twin of every unmatched lift.
  const customByName = new Map()
  for (const c of S.customEx) customByName.set(keyOf(c.n), c.id)
  const idMap = new Map()
  for (const c of parsed.customEx || []) {
    const k = keyOf(c.n)
    const existing = customByName.get(k)
    if (existing) {
      idMap.set(c.id, existing)
      const kept = S.customEx.find(x => x.id === existing)
      // Remember the source name even if the user has since renamed the exercise.
      if (kept && c.importKey && !kept.importKey) kept.importKey = c.importKey
    } else {
      S.customEx.push(c)
      customByName.set(k, c.id)
    }
  }
  const remap = id => idMap.get(id) || id

  const byDate = new Map(S.workouts.map(w => [w.d, w]))
  let added = 0, merged = 0, skipped = 0
  const touchWeights = (w, entries) => {
    entries.forEach(e => {
      const mx = Math.max(0, ...e.sets.map(s => s.w || 0), e.topW || 0)
      if (mx > 0) {
        const cur = S.exWeights[e.id]
        if (!cur || w.d >= cur.d) S.exWeights[e.id] = { w: mx, d: w.d }
      }
      // The note you will see on the next session is the newest one in the file.
      // A day you already logged is left alone, so a re-import cannot overwrite a cue
      // you have edited since.
      if (e.note) {
        S.exNotes = S.exNotes || {}
        const curNote = S.exNotes[e.id]
        if (!curNote || String(w.d) >= String(curNote.d || '')) S.exNotes[e.id] = { t: e.note, d: w.d }
      }
    })
  }

  for (const w of parsed.workouts) {
    const entries = w.entries.map(e => ({ ...e, id: remap(e.id) }))
    const existing = byDate.get(w.d)
    if (!existing) {
      const nw = { ...w, entries }
      S.workouts.push(nw)
      byDate.set(w.d, nw)
      touchWeights(nw, entries)
      added++
      continue
    }
    const haveEx = new Set(existing.entries.map(e => e.id))
    const fresh = entries.filter(e => !haveEx.has(e.id))
    if (!fresh.length) { skipped++; continue }
    existing.entries.push(...fresh)
    existing.vol = (existing.vol || 0) + fresh.reduce(
      (a, e) => a + e.sets.reduce((b, s) => b + (s.w || 0) * (s.r || 0), 0), 0)
    touchWeights(existing, fresh)
    merged++
  }
  S.workouts.sort((a, b) => (a.d < b.d ? -1 : 1))
  return { added, merged, skipped }
}

/** Point one imported custom at a library exercise. Logged sets, the plan, and the
 *  next import of that source name all follow. The custom itself is removed. */
export function retargetImport(S, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return false
  const custom = (S.customEx || []).find(c => c.id === fromId)
  if (!custom) return false
  if (custom.importKey) {
    S.importAliases = S.importAliases || {}
    S.importAliases[custom.importKey] = toId
  }
  const rewrite = entries => {
    if (!entries) return
    const from = entries.findIndex(e => e.id === fromId)
    if (from < 0) return
    const [moved] = entries.splice(from, 1)
    const onto = entries.find(e => e.id === toId)
    if (onto) {
      onto.sets = [...(onto.sets || []), ...(moved.sets || [])]
      const tops = [onto.topW, moved.topW].filter(x => x > 0)
      if (tops.length) onto.topW = Math.max(...tops)
      if (moved.note && !onto.note) onto.note = moved.note
    } else {
      moved.id = toId
      delete moved.n
      if (moved.target?.id === fromId) moved.target = { ...moved.target, id: toId }
      entries.splice(from, 0, moved)
    }
  }
  for (const w of S.workouts || []) {
    rewrite(w.entries)
    if (Array.isArray(w.prs)) w.prs = [...new Set(w.prs.map(id => id === fromId ? toId : id))]
  }
  rewrite(S.active?.entries)
  for (const r of S.routines || []) {
    if (!r.ex) continue
    const hasTarget = r.ex.some(e => e.id === toId)
    r.ex = r.ex.filter(e => {
      if (e.id !== fromId) return true
      if (hasTarget) return false
      e.id = toId
      return true
    })
    cleanupSg(r.ex)
  }
  if (S.exWeights?.[fromId]) {
    const moved = S.exWeights[fromId]
    const prev = S.exWeights[toId]
    if (!prev || String(moved.d || '') >= String(prev.d || '')) S.exWeights[toId] = moved
    delete S.exWeights[fromId]
  }
  if (S.exNotes?.[fromId]) {
    const moved = S.exNotes[fromId]
    const prev = S.exNotes[toId]
    if (!prev || String(moved.d || '') >= String(prev.d || '')) S.exNotes[toId] = moved
    delete S.exNotes[fromId]
  }
  S.customEx = S.customEx.filter(c => c.id !== fromId)
  return true
}
