// What to put on the bar for a working weight.
// Greedy, heaviest plate first, same plates each side. A remainder that no plate
// covers is reported rather than rounded away — 61 kg on a 20 kg bar is 20 per
// side with 0.5 kg still in hand.

export const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

export const DEFAULT_BAR = { kg: 20, lb: 45 }
export const BAR_OPTIONS = { kg: [20, 15, 10], lb: [45, 35, 15] }

const BAR_EQ = new Set(['barbell', 'olympic barbell', 'ez barbell', 'trap bar'])

export const usesBar = ex => BAR_EQ.has(ex?.eq)

export function barWeightOf(S) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  return S?.barWeight > 0 ? S.barWeight : DEFAULT_BAR[unit]
}

const milli = n => Math.round(n * 1000)

/** @returns {{ bar: number, perSide: number[], leftover: number } | null} */
export function loadPlates(total, bar, plates) {
  if (!(total > 0) || !(bar >= 0) || !plates?.length) return null
  let side = milli(total) - milli(bar)
  if (side < 0) return { bar, perSide: [], leftover: side / 1000 }
  if (side % 2) side -= 1
  side = Math.floor(side / 2)
  const perSide = []
  for (const p of plates) {
    const pm = milli(p)
    if (pm <= 0) continue
    while (side >= pm) {
      perSide.push(p)
      side -= pm
    }
  }
  return { bar, perSide, leftover: side / 1000 }
}

/** "2×20 + 5" — a count only when the same plate is used more than once. */
export function formatSide(perSide) {
  const groups = []
  for (const p of perSide) {
    const last = groups[groups.length - 1]
    if (last && last.p === p) last.n++
    else groups.push({ p, n: 1 })
  }
  return groups.map(g => (g.n > 1 ? g.n + '×' + g.p : String(g.p))).join(' + ')
}
