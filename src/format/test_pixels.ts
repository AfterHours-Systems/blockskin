import {createPixels, setPixel, type Pixels, type Rgba} from './pixels.js';

export const SKIN_TONE: Rgba = [200, 150, 120, 255];

export function paint(
  p: Pixels,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: Rgba,
): Pixels {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++) setPixel(p, col, row, rgba);
  return p;
}

export function opaqueSkin(
  width: number,
  height: number,
  rgba: Rgba = SKIN_TONE,
): Pixels {
  return paint(createPixels(width, height), 0, 0, width, height, rgba);
}

export function transparentSkin(width: number, height = width): Pixels {
  return createPixels(width, height);
}
