import { createPixels, setPixel, type Pixels, type Rgba } from '../format/pixels.js'

const MEMBRANE: Rgba = [138, 140, 160, 255]
const RIB: Rgba = [92, 94, 114, 255]
const EDGE: Rgba = [178, 180, 198, 255]

/**
 * blockskin's own elytra texture, in the cape layout (the wing box at
 * (22,0), 10×20×2), for flying without a cape. Drawn here rather than
 * shipped, so no game asset is involved: a grey membrane with darker ribs
 * and a lighter rim.
 */
export function drawDefaultElytra(): Pixels {
  const pixels = createPixels(64, 32)
  const paint = (x0: number, y0: number, w: number, h: number, ribbed: boolean) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const rim = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1
        const rib = ribbed && (x - x0) % 3 === 1
        setPixel(pixels, x, y, rim ? EDGE : rib ? RIB : MEMBRANE)
      }
    }
  }
  // Faces of a 10×20×2 box at (22,0): top, bottom, the two sides, front, back.
  paint(24, 0, 10, 2, false)
  paint(34, 0, 10, 2, false)
  paint(22, 2, 2, 20, false)
  paint(34, 2, 2, 20, false)
  paint(24, 2, 10, 20, true)
  paint(36, 2, 10, 20, true)
  return pixels
}
