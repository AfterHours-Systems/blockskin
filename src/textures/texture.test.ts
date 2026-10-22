import { NearestFilter, SRGBColorSpace } from 'three'
import { describe, expect, it } from 'vitest'
import { createPixels, setPixel } from '../format/pixels.js'
import { isTextureSource } from './input.js'
import { createPixelTexture } from './texture.js'

describe('createPixelTexture', () => {
  it('stores image row 0 last, so it maps to v = 1', () => {
    const p = createPixels(2, 3)
    setPixel(p, 0, 0, [9, 8, 7, 255])
    setPixel(p, 1, 2, [1, 2, 3, 255])
    const data = createPixelTexture(p).image.data as Uint8Array
    expect([...data.subarray(2 * 2 * 4, 2 * 2 * 4 + 4)]).toEqual([9, 8, 7, 255])
    expect([...data.subarray(4, 8)]).toEqual([1, 2, 3, 255])
  })

  it('uses sRGB, nearest filtering and no mipmaps', () => {
    const texture = createPixelTexture(createPixels(64, 64))
    expect(texture.colorSpace).toBe(SRGBColorSpace)
    expect(texture.magFilter).toBe(NearestFilter)
    expect(texture.minFilter).toBe(NearestFilter)
    expect(texture.generateMipmaps).toBe(false)
    expect(texture.flipY).toBe(false)
    expect(texture.version).toBeGreaterThan(0)
  })
})

describe('isTextureSource', () => {
  it('is false for strings, URLs and plain objects in Node', () => {
    expect(isTextureSource('https://example.com/skin.png')).toBe(false)
    expect(isTextureSource(new URL('https://example.com/skin.png'))).toBe(false)
    expect(isTextureSource({ width: 64, height: 64 })).toBe(false)
  })
})
