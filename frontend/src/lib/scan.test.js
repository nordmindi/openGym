import { describe, it, expect } from 'vitest'
import { resolveScan, textFromCode } from './scan.js'

describe('textFromCode', () => {
  it('reads an exercise name out of a link', () => {
    expect(textFromCode('https://gym.example/machines/lat-pulldown')).toBe('lat pulldown')
    expect(textFromCode('https://gym.example/m?name=leg+press')).toBe('leg press')
  })
  it('leaves a printed name alone', () => {
    expect(textFromCode('Lat Pulldown')).toBe('Lat Pulldown')
  })
})

describe('resolveScan', () => {
  it('uses a code this phone already confirmed', () => {
    const raw = 'https://gym.example/q/abc123def4567890abcd'
    const hit = resolveScan({ raw, machines: { [raw]: '0043' } })
    expect(hit).toMatchObject({ kind: 'remembered', id: '0043' })
  })
  it('matches one name on a plate and ignores the brand line', () => {
    const hit = resolveScan({ raw: 'TECHNOGYM\nLAT PULLDOWN\nADJUST THE SEAT' })
    expect(hit).toMatchObject({ kind: 'one', id: '2330' })
  })
  it('lists both exercises when the plate names two', () => {
    const hit = resolveScan({ raw: 'LEG PRESS\nLEG EXTENSION' })
    expect(hit.kind).toBe('many')
    expect(hit.ids).toEqual(['0739', '0585'])
  })
  it('does not invent a match for a code with no name', () => {
    const hit = resolveScan({ raw: 'https://gym.example/q/abc123def4567890abcd' })
    expect(hit.kind).toBe('none')
    expect(hit.query).toBe('')
  })
})
