// Tape measurements logged beside body weight. Numbers are stored as entered.
// kg profiles read them as centimetres, lb profiles as inches — the same rule as
// weights: switching the unit does not convert what was already written down.

export const MEASURES = [
  ['waist', 'Waist'],
  ['arm', 'Arm'],
  ['chest', 'Chest'],
  ['hips', 'Hips'],
  ['thigh', 'Thigh'],
]

export const lengthUnit = unit => (unit === 'lb' ? 'in' : 'cm')

// The newest value of each tape, which may come from different days.
export function latestMeasures(list) {
  const out = {}
  let d = null
  for (const row of [...(list || [])].reverse()) {
    for (const [k] of MEASURES) {
      if (out[k] == null && row[k] > 0) {
        out[k] = row[k]
        if (!d) d = row.d
      }
    }
  }
  return d ? { ...out, d } : null
}
