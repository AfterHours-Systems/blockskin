import {TextureFormatError} from './errors.js';
import {copyRect, createPixels, type Pixels} from './pixels.js';

export interface NormalizedTexture {
  pixels: Pixels;
  scale: number;
}

function capeScale(w: number, h: number): number | null {
  // skinview3d accepts any 2:1 size; the UVs are fractions, so a
  // noninteger scale still maps correctly.
  if (w === 2 * h) return w / 64;
  // The original cape texture: 22×17, the cape plus its edges and nothing else.
  if (17 * w === 22 * h && w % 22 === 0) return w / 22;
  // OptiFine's layout: the cape plus the elytra region.
  if (11 * w === 23 * h && w % 46 === 0) return w / 46;
  return null;
}

/** Places any supported cape layout in the top-left of a 64s×32s buffer. */
export function normalizeCape(src: Pixels): NormalizedTexture {
  const scale = src.width > 0 ? capeScale(src.width, src.height) : null;
  if (scale === null)
    throw new TextureFormatError('cape', src.width, src.height);
  const pixels = createPixels(Math.round(64 * scale), Math.round(32 * scale));
  copyRect(src, 0, 0, src.width, src.height, pixels, 0, 0);
  return {pixels, scale};
}
