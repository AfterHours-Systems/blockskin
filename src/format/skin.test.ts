import { describe, expect, it } from 'vitest'
import { TextureFormatError } from './errors.js'
import { getPixel, hasTransparency, setPixel, type Rgba } from './pixels.js'
import { detectModel, normalizeSkin } from './skin.js'
import { SKIN_TONE, opaqueSkin, paint } from './testPixels.js'

const RED: Rgba = [255, 0, 0, 255]
const BLACK: Rgba = [0, 0, 0, 255]
const WHITE: Rgba = [255, 255, 255, 255]

// An opaque skin with one transparent corner pixel, so the opaque-background
// fix does not kick in.
function skinWithTransparency(width: number, height = width) {
  const p = opaqueSkin(width, height)
  setPixel(p, 0, 0, [0, 0, 0, 0])
  return p
}

describe('normalizeSkin', () => {
  it.each([
    [64, 48],
    [65, 65],
    [0, 0],
    [32, 32],
  ])('rejects %dx%d with TextureFormatError kind skin', (w, h) => {
    const p = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
    expect(() => normalizeSkin(p)).toThrow(TextureFormatError)
    try {
      normalizeSkin(p)
    } catch (e) {
      expect((e as TextureFormatError).kind).toBe('skin')
    }
  })

  it.each([
    [64, 64, 1, false],
    [128, 128, 2, false],
    [512, 512, 8, false],
    [64, 32, 1, true],
    [128, 64, 2, true],
  ])('accepts %dx%d with scale %d', (w, h, scale, legacy) => {
    const result = normalizeSkin(skinWithTransparency(w, h))
    expect(result.scale).toBe(scale)
    expect(result.legacy).toBe(legacy)
    expect([result.pixels.width, result.pixels.height]).toEqual([w, w])
  })

  // Every legacy mirror: source rect (right limb) → target corner (left
  // limb). A pixel in the source's top-left lands in the target's top-right.
  it.each([
    [4, 16, 4, 20, 48],
    [8, 16, 4, 24, 48],
    [0, 20, 4, 24, 52],
    [4, 20, 4, 20, 52],
    [8, 20, 4, 16, 52],
    [12, 20, 4, 28, 52],
    [44, 16, 4, 36, 48],
    [48, 16, 4, 40, 48],
    [40, 20, 4, 40, 52],
    [44, 20, 4, 36, 52],
    [48, 20, 4, 32, 52],
    [52, 20, 4, 44, 52],
  ])('mirrors legacy (%d,%d) to (%d+…) at (%d,%d)', (sx, sy, w, dx, dy) => {
    const src = paint(skinWithTransparency(64, 32), sx, sy, 1, 1, RED)
    const { pixels } = normalizeSkin(src)
    expect(getPixel(pixels, dx + w - 1, dy)).toEqual(RED)
    expect(getPixel(pixels, dx, dy)).toEqual(SKIN_TONE)
  })

  it('mirrors the legacy right-leg front onto the left-leg front', () => {
    const src = paint(skinWithTransparency(64, 32), 4, 20, 1, 1, RED)
    expect(getPixel(normalizeSkin(src).pixels, 23, 52)).toEqual(RED)
  })

  it('mirrors the legacy right-leg front at HD scale 2', () => {
    const src = paint(skinWithTransparency(128, 64), 8, 40, 1, 1, RED)
    expect(getPixel(normalizeSkin(src).pixels, 47, 104)).toEqual(RED)
  })

  it('maps the legacy right-arm outer column to the left-arm outer column', () => {
    const src = paint(skinWithTransparency(64, 32), 40, 20, 1, 1, RED)
    expect(getPixel(normalizeSkin(src).pixels, 43, 52)).toEqual(RED)
  })

  it('clears the hat of a fully opaque legacy skin but keeps the head', () => {
    const { pixels } = normalizeSkin(opaqueSkin(64, 32))
    expect(getPixel(pixels, 40, 8)[3]).toBe(0)
    expect(getPixel(pixels, 8, 8)).toEqual(SKIN_TONE)
    expect(getPixel(pixels, 20, 52)).toEqual(SKIN_TONE)
  })

  it('removes every outer layer of a fully opaque 64×64 skin', () => {
    const { pixels } = normalizeSkin(opaqueSkin(64, 64))
    for (const [x, y] of [
      [40, 8],
      [20, 36],
      [44, 36],
      [4, 36],
      [4, 52],
      [52, 52],
    ] as const) {
      expect(getPixel(pixels, x, y)[3]).toBe(0)
    }
    for (const [x, y] of [
      [8, 8],
      [20, 20],
      [44, 20],
      [4, 20],
      [20, 52],
      [36, 52],
    ] as const) {
      expect(getPixel(pixels, x, y)).toEqual(SKIN_TONE)
    }
  })

  it('keeps the outer layers of a 64×64 skin with any transparency', () => {
    const { pixels } = normalizeSkin(skinWithTransparency(64))
    expect(getPixel(pixels, 40, 8)).toEqual(SKIN_TONE)
    expect(hasTransparency(pixels, 32, 0, 32, 16)).toBe(false)
  })
})

describe('detectModel', () => {
  it('finds slim from a transparent unused column', () => {
    const p = skinWithTransparency(64)
    setPixel(p, 54, 20, [0, 0, 0, 0])
    expect(detectModel(p)).toBe('slim')
  })

  it.each([
    ['black', BLACK],
    ['white', WHITE],
  ] as const)('finds slim when all four unused areas are %s', (_, colour) => {
    const p = skinWithTransparency(64)
    for (const [x, y, w, h] of [
      [50, 16, 2, 4],
      [54, 20, 2, 12],
      [42, 48, 2, 4],
      [46, 52, 2, 12],
    ] as const) {
      paint(p, x, y, w, h, colour)
    }
    expect(detectModel(p)).toBe('slim')
  })

  it('stays classic when only one unused area is black', () => {
    const p = paint(skinWithTransparency(64), 50, 16, 2, 4, BLACK)
    expect(detectModel(p)).toBe('classic')
  })

  it('detects slim on an HD 128 skin', () => {
    const p = skinWithTransparency(128)
    setPixel(p, 109, 41, [0, 0, 0, 0])
    expect(detectModel(p)).toBe('slim')
  })
})
