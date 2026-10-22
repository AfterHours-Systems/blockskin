import { describe, expect, it } from 'vitest'
import {
  clearRect,
  copyRect,
  createPixels,
  getPixel,
  hasTransparency,
  isUniform,
  setPixel,
  type Rgba,
} from './pixels.js'

const A: Rgba = [1, 0, 0, 255]
const B: Rgba = [2, 0, 0, 255]
const C: Rgba = [3, 0, 0, 255]
const D: Rgba = [4, 0, 0, 255]
const BLACK: Rgba = [0, 0, 0, 255]

function strip(): ReturnType<typeof createPixels> {
  const p = createPixels(4, 1)
  ;[A, B, C, D].forEach((c, x) => setPixel(p, x, 0, c))
  return p
}

describe('pixels', () => {
  it('copyRect copies columns in order', () => {
    const dst = createPixels(4, 1)
    copyRect(strip(), 0, 0, 4, 1, dst, 0, 0)
    expect([0, 1, 2, 3].map((x) => getPixel(dst, x, 0))).toEqual([A, B, C, D])
  })

  it('copyRect with flipX mirrors columns', () => {
    const dst = createPixels(4, 1)
    copyRect(strip(), 0, 0, 4, 1, dst, 0, 0, { flipX: true })
    expect([0, 1, 2, 3].map((x) => getPixel(dst, x, 0))).toEqual([D, C, B, A])
  })

  it('copyRect within one buffer reads the source before writing', () => {
    const p = strip()
    copyRect(p, 0, 0, 3, 1, p, 1, 0)
    expect([0, 1, 2, 3].map((x) => getPixel(p, x, 0))).toEqual([A, A, B, C])
  })

  it('clearRect zeroes RGBA', () => {
    const p = strip()
    clearRect(p, 1, 0, 2, 1)
    expect(getPixel(p, 1, 0)).toEqual([0, 0, 0, 0])
    expect(getPixel(p, 2, 0)).toEqual([0, 0, 0, 0])
    expect(getPixel(p, 3, 0)).toEqual(D)
  })

  it('hasTransparency is false on an opaque area and true with one alpha-254 pixel', () => {
    const p = strip()
    expect(hasTransparency(p, 0, 0, 4, 1)).toBe(false)
    setPixel(p, 2, 0, [3, 0, 0, 254])
    expect(hasTransparency(p, 0, 0, 4, 1)).toBe(true)
    expect(hasTransparency(p, 0, 0, 2, 1)).toBe(false)
  })

  it('isUniform detects all-black and rejects one off pixel', () => {
    const p = createPixels(2, 2)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) setPixel(p, x, y, BLACK)
    expect(isUniform(p, 0, 0, 2, 2, BLACK)).toBe(true)
    setPixel(p, 1, 1, [1, 0, 0, 255])
    expect(isUniform(p, 0, 0, 2, 2, BLACK)).toBe(false)
  })

  it('throws RangeError for out-of-range coordinates', () => {
    const p = createPixels(4, 4)
    expect(() => getPixel(p, 4, 0)).toThrow(RangeError)
    expect(() => clearRect(p, 2, 2, 3, 1)).toThrow(RangeError)
    expect(() => copyRect(p, 0, 0, 2, 2, createPixels(1, 1), 0, 0)).toThrow(RangeError)
    expect(() => hasTransparency(p, -1, 0, 1, 1)).toThrow(RangeError)
  })
})
