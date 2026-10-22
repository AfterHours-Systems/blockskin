import {describe, expect, it} from 'vitest';
import {earsFromSkin, normalizeEars} from './ears.js';
import {TextureFormatError} from './errors.js';
import {getPixel, setPixel, type Rgba} from './pixels.js';
import {transparentSkin} from './test_pixels.js';

const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];

describe('normalizeEars', () => {
  it.each([
    [14, 7, 1],
    [28, 14, 2],
  ])('accepts %dx%d at scale %d', (w, h, scale) => {
    const result = normalizeEars(transparentSkin(w, h));
    expect(result.scale).toBe(scale);
    expect([result.pixels.width, result.pixels.height]).toEqual([w, h]);
  });

  it.each([
    [14, 8],
    [16, 8],
    [0, 0],
  ])('rejects %dx%d with kind ears', (w, h) => {
    const attempt = () => normalizeEars(transparentSkin(w, h));
    expect(attempt).toThrow(TextureFormatError);
    expect(attempt).toThrow(expect.objectContaining({kind: 'ears'}));
  });
});

describe('earsFromSkin', () => {
  it('copies (24,0,14,7) of a 64×64 skin', () => {
    const skin = transparentSkin(64);
    setPixel(skin, 24, 0, RED);
    setPixel(skin, 37, 6, RED);
    // Neighbours just outside the region on each side must not shift in.
    setPixel(skin, 23, 1, BLUE);
    setPixel(skin, 38, 1, BLUE);
    setPixel(skin, 30, 7, BLUE);
    const {pixels, scale} = earsFromSkin(skin);
    expect(scale).toBe(1);
    expect(getPixel(pixels, 0, 0)).toEqual(RED);
    expect(getPixel(pixels, 13, 6)).toEqual(RED);
    expect(getPixel(pixels, 0, 1)[3]).toBe(0);
    expect(getPixel(pixels, 13, 1)[3]).toBe(0);
    expect(getPixel(pixels, 6, 6)[3]).toBe(0);
  });

  it('copies (48,0,28,14) of a 128×128 skin', () => {
    const skin = transparentSkin(128);
    setPixel(skin, 48, 0, RED);
    setPixel(skin, 75, 13, RED);
    const {pixels, scale} = earsFromSkin(skin);
    expect(scale).toBe(2);
    expect([pixels.width, pixels.height]).toEqual([28, 14]);
    expect(getPixel(pixels, 0, 0)).toEqual(RED);
    expect(getPixel(pixels, 27, 13)).toEqual(RED);
  });

  it('works on a legacy 64×32 skin', () => {
    expect(earsFromSkin(transparentSkin(64, 32)).pixels.width).toBe(14);
  });
});
