import { describe, it, expect } from 'vitest'
import { heatmapSpan, activityLevel, quartileCuts } from './heatmap.js'

describe('heatmap span', () => {
  const today = new Date('2026-09-23T12:00:00')

  it('shows at least a year when history is short', () => {
    expect(heatmapSpan('2026-09-01', today).weeks).toBe(53)
  })

  it('extends back to the oldest workout', () => {
    const span = heatmapSpan('2020-01-06', today)
    expect(span.weeks).toBeGreaterThan(53)
    expect(span.start.getFullYear()).toBe(2020)
  })
})

describe('activity shade', () => {
  const cuts = quartileCuts([10, 20, 30, 40])

  it('shades a durationless day by its set count instead of leaving it blank', () => {
    const quiet = activityLevel({ min: 0, sets: 2 }, cuts, quartileCuts([2, 8, 16]))
    const busy = activityLevel({ min: 0, sets: 16 }, cuts, quartileCuts([2, 8, 16]))
    expect(quiet).toBeGreaterThan(0)
    expect(busy).toBeGreaterThan(quiet)
  })

  it('still shades a timed session by minutes', () => {
    expect(activityLevel({ min: 40, sets: 1 }, cuts, [0, 0, 0])).toBe(4)
    expect(activityLevel({ min: 10, sets: 20 }, cuts, [0, 0, 0])).toBeLessThan(4)
  })
})
