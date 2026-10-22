import { afterEach, describe, expect, it, vi } from 'vitest'
import { isReduced, watchReducedMotion } from './motion.js'

describe('isReduced', () => {
  it.each([
    ['system', true, true],
    ['system', false, false],
    ['always', false, true],
    ['always', true, true],
    ['never', true, false],
    ['never', false, false],
  ] as const)('%s with the system preferring reduced=%s gives %s', (mode, system, expected) => {
    expect(isReduced(mode, system)).toBe(expected)
  })
})

describe('watchReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubMatchMedia(matches: boolean) {
    const listeners: ((event: { matches: boolean }) => void)[] = []
    const query = {
      matches,
      addEventListener: vi.fn((_: string, fn: (event: { matches: boolean }) => void) =>
        listeners.push(fn),
      ),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    )
    return { query, change: (value: boolean) => listeners.forEach((fn) => fn({ matches: value })) }
  }

  it('reports the system setting at once and on changes, and cleans up', () => {
    const { query, change } = stubMatchMedia(true)
    const seen: boolean[] = []
    const stop = watchReducedMotion('system', (reduced) => seen.push(reduced))
    change(false)
    expect(seen).toEqual([true, false])
    stop()
    expect(query.removeEventListener).toHaveBeenCalled()
  })

  it('ignores the system with always and never', () => {
    stubMatchMedia(true)
    const seen: boolean[] = []
    watchReducedMotion('never', (reduced) => seen.push(reduced))
    watchReducedMotion('always', (reduced) => seen.push(reduced))
    expect(seen).toEqual([false, true])
  })

  it('reports false for system where matchMedia does not exist', () => {
    const seen: boolean[] = []
    watchReducedMotion('system', (reduced) => seen.push(reduced))
    expect(seen).toEqual([false])
  })
})
