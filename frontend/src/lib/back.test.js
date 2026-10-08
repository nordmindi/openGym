import { describe, it, expect } from 'vitest'
import { nextBack, pathFromHash } from './back.js'

const sheet = (id, locked = false) => ({ id, locked })

describe('pathFromHash', () => {
  it('reads the route out of the hash', () => {
    expect(pathFromHash('#/plan/r/abc')).toBe('/plan/r/abc')
    expect(pathFromHash('#/settings?x=1')).toBe('/settings')
    expect(pathFromHash('')).toBe('/')
  })
})

describe('nextBack', () => {
  it('closes the top sheet and leaves the one under it', () => {
    expect(nextBack({ pathname: '/workout', sheets: [sheet('a'), sheet('b')], authed: true })).toEqual({ type: 'close', id: 'b' })
  })
  it('leaves a locked sheet up', () => {
    expect(nextBack({ pathname: '/home', sheets: [sheet('done', true)], authed: true })).toEqual({ type: 'stay' })
  })
  it('steps from a nested screen to its parent', () => {
    expect(nextBack({ pathname: '/plan/r/push', sheets: [], authed: true })).toEqual({ type: 'go', to: '/plan' })
    expect(nextBack({ pathname: '/history', sheets: [], authed: true })).toEqual({ type: 'go', to: '/stats' })
    expect(nextBack({ pathname: '/settings', sheets: [], authed: true })).toEqual({ type: 'go', to: '/home' })
    expect(nextBack({ pathname: '/admin', sheets: [], authed: true })).toEqual({ type: 'go', to: '/home' })
  })
  it('returns to Home from any other tab without ending a workout', () => {
    for (const pathname of ['/plan', '/workout', '/stats', '/library']) {
      expect(nextBack({ pathname, sheets: [], authed: true })).toEqual({ type: 'go', to: '/home' })
    }
  })
  it('leaves the app from Home, and from the sign-in screen', () => {
    expect(nextBack({ pathname: '/home', sheets: [], authed: true })).toEqual({ type: 'exit' })
    expect(nextBack({ pathname: '/home', sheets: [], authed: false })).toEqual({ type: 'exit' })
  })
})
