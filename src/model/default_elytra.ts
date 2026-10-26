import {
  createPixels,
  setPixel,
  type Pixels,
  type Rgba,
} from '../format/pixels.js';

// The wing face is W×H: column W−1 is the leading edge (on the hinge), row 0
// the shoulder and row H−1 the wingtip.
const W = 10;
const H = 20;

const ROOT: Rgba = [104, 106, 128, 255];
const TIP: Rgba = [176, 178, 198, 255];
const LEADING: Rgba = [206, 208, 224, 255];
const BONE: Rgba = [84, 86, 108, 255];
const VANE: Rgba = [118, 120, 144, 255];

function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const m = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * t);
  return [m(0), m(1), m(2), m(3)];
}

/**
 * How many columns of row `r` the wing covers, counted from the leading
 * edge: full at the shoulder, then tapering towards the tip with a notch
 * between feathers every third row.
 */
export function wingWidth(r: number): number {
  if (r < 4) return W;
  const taper = Math.round(W - ((r - 4) * 7) / 15);
  return Math.max(2, taper - (r % 3 === 0 ? 1 : 0));
}

/** The wing's colour at (c, r) on its outer face, or null where it is cut away. */
export function wingPixel(c: number, r: number): Rgba | null {
  if (c < W - wingWidth(r)) return null;
  // The tip narrows to a point on the leading edge.
  if (r === H - 1 && c !== W - 1) return null;
  const t = r / (H - 1);
  if (c === W - 1) return mix(LEADING, TIP, t / 2);
  if (c === W - 2 && r < 14) return BONE;
  if (c === W - wingWidth(r)) return mix(BONE, VANE, t);
  // Flight feathers: slanted shafts running back towards the tip.
  if (c < W - 3 && (r + c) % 4 === 0) return mix(VANE, BONE, 0.4 - 0.3 * t);
  return mix(ROOT, TIP, t);
}

/**
 * blockskin's own elytra texture, in the cape layout (the wing box at
 * (22,0), 10×20×2), for flying without a cape. Drawn here rather than
 * shipped, so no game asset is involved: a feathered wing that tapers from
 * the shoulder to the tip, cut out of the box the way the game's texture is.
 */
export function drawDefaultElytra(): Pixels {
  const pixels = createPixels(64, 32);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const colour = wingPixel(c, r);
      if (!colour) continue;
      setPixel(pixels, 24 + c, 2 + r, colour);
      // The back face is drawn mirrored, so it matches the front's outline.
      setPixel(pixels, 36 + (W - 1 - c), 2 + r, colour);
    }
    for (let z = 0; z < 2; z++) {
      // The +x side runs along the leading edge; the −x side only exists
      // where the wing is still full width.
      setPixel(pixels, 34 + z, 2 + r, mix(BONE, VANE, r / (H - 1)));
      if (wingWidth(r) === W) {
        setPixel(pixels, 22 + z, 2 + r, mix(ROOT, TIP, r / (H - 1)));
      }
    }
  }
  for (let c = 0; c < W; c++) {
    const tip = wingPixel(c, H - 1);
    for (let z = 0; z < 2; z++) {
      // Top at the shoulder, bottom at the tip.
      setPixel(pixels, 24 + c, z, c === W - 1 ? LEADING : ROOT);
      if (tip) setPixel(pixels, 34 + c, z, tip);
    }
  }
  return pixels;
}
