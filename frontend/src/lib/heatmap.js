// How far back the activity grid goes, and how a day is shaded.
// A year is the minimum. Older history extends the grid so an import is not clipped.
// Days with no clock (FitNotes writes a date and nothing else) are shaded by set
// count, otherwise every imported day sits on the faintest colour.

function mondayOf(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Monday the grid starts on, and how many week-columns to draw. */
export function heatmapSpan(earliestISO, today = new Date()) {
  const end = mondayOf(today)
  let start = new Date(end)
  start.setDate(end.getDate() - 52 * 7)
  if (earliestISO) {
    const first = mondayOf(new Date(earliestISO + 'T12:00:00'))
    if (first < start) start = first
  }
  const weeks = Math.round((end - start) / (7 * 86400000)) + 1
  return { start, weeks }
}

export function quartileCuts(values) {
  const vals = values.filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0)
  return [q(0.25), q(0.5), q(0.75)]
}

/** 0 = no session. 1–4 = shade. Zero-duration days use set count. */
export function activityLevel(day, minuteCuts, setCuts) {
  if (!day) return 0
  const [v, cuts] = day.min > 0 ? [day.min, minuteCuts] : [day.sets || 0, setCuts]
  if (!v) return 1
  const [t1, t2, t3] = cuts
  if (v >= t3) return 4
  if (v >= t2) return 3
  if (v >= t1) return 2
  return 1
}
