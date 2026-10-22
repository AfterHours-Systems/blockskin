import { describe, expect, it } from 'vitest'
import { cameraDistance } from './framing.js'

describe('cameraDistance', () => {
  it('puts the head top on the edge at zoom 1', () => {
    expect(cameraDistance(50, 1)).toBeCloseTo(39.885, 2)
  })

  it('moves back as zoom drops', () => {
    expect(cameraDistance(50, 0.5)).toBeGreaterThan(cameraDistance(50, 1))
  })

  it('clamps to the orbit limits', () => {
    expect(cameraDistance(50, 0.01)).toBe(256)
    expect(cameraDistance(120, 100)).toBe(10)
  })
})
