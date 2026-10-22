import { describe, expect, it } from 'vitest'
import { normalizeCape } from './cape.js'
import { TextureFormatError } from './errors.js'
import { getPixel, setPixel, type Rgba } from './pixels.js'
import { transparentSkin } from './testPixels.js'

const RED: Rgba = [255, 0, 0, 255]

describe('normalizeCape', () => {
  it.each([
    [64, 32, 1],
    [128, 64, 2],
    [22, 17, 1],
    [44, 34, 2],
    [46, 22, 1],
    [92, 44, 2],
  ])('normalises %dx%d to a 64s×32s buffer at scale %d', (w, h, scale) => {
    const src = transparentSkin(w, h)
    setPixel(src, 0, 0, RED)
    setPixel(src, w - 1, h - 1, RED)
    const result = normalizeCape(src)
    expect(result.scale).toBe(scale)
    expect([result.pixels.width, result.pixels.height]).toEqual([64 * scale, 32 * scale])
    expect(getPixel(result.pixels, 0, 0)).toEqual(RED)
    expect(getPixel(result.pixels, w - 1, h - 1)).toEqual(RED)
  })

  it.each([
    [50, 30],
    [0, 0],
    [66, 33],
  ])('rejects %dx%d', (w, h) => {
    expect(() => normalizeCape(transparentSkin(w, h))).toThrow(TextureFormatError)
  })
})
