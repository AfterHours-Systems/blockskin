import {describe, expect, it} from 'vitest';
import {getPixel} from '../format/pixels.js';
import {drawDefaultElytra, wingPixel, wingWidth} from './default_elytra.js';

describe('drawDefaultElytra', () => {
  const pixels = drawDefaultElytra();

  it('is a 64×32 cape-layout texture', () => {
    expect([pixels.width, pixels.height]).toEqual([64, 32]);
  });

  it('paints the elytra wing front', () => {
    expect(getPixel(pixels, 24, 2)[3]).toBe(255);
  });

  it('tapers from the shoulder to the tip', () => {
    const covered = (r: number) =>
      [...Array(10).keys()].filter(c => wingPixel(c, r)).length;
    expect(covered(0)).toBe(10);
    expect(covered(19)).toBe(1);
    for (let r = 1; r < 20; r++) {
      expect(covered(r)).toBeLessThanOrEqual(wingWidth(r));
    }
  });

  it('keeps the leading edge whole', () => {
    for (let y = 2; y < 22; y++) {
      expect(getPixel(pixels, 33, y)[3]).toBe(255);
      expect(getPixel(pixels, 34, y)[3]).toBe(255);
    }
  });

  it('cuts the wing out of the box rather than filling it', () => {
    expect(getPixel(pixels, 24, 21)[3]).toBe(0);
  });

  it('mirrors the back face onto the front', () => {
    for (let y = 2; y < 22; y++) {
      for (let c = 0; c < 10; c++) {
        expect(getPixel(pixels, 36 + 9 - c, y)).toEqual(
          getPixel(pixels, 24 + c, y),
        );
      }
    }
  });

  it('leaves the cape region transparent', () => {
    expect(getPixel(pixels, 1, 1)[3]).toBe(0);
    expect(getPixel(pixels, 5, 10)[3]).toBe(0);
  });

  it('stays inside the elytra region', () => {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 64; x++) {
        const inside = x >= 22 && x < 46 && y < 22;
        if (!inside) expect(getPixel(pixels, x, y)[3]).toBe(0);
      }
    }
  });
});
