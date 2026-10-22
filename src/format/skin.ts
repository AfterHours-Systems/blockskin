import {TextureFormatError} from './errors.js';
import {
  clearRect,
  copyRect,
  createPixels,
  hasTransparency,
  isUniform,
  type Pixels,
  type Rgba,
} from './pixels.js';

export type ModelType = 'classic' | 'slim';

export interface NormalizedSkin {
  /** A square 64s×64s skin in the 1.8 layout. */
  pixels: Pixels;
  /** Texture pixels per skin pixel: 1 for a 64-wide skin, 2 for 128, … */
  scale: number;
  /** Whether the source was the pre-1.8 64×32 layout. */
  legacy: boolean;
}

type Rect = readonly [x: number, y: number, w: number, h: number];

// Pre-1.8 skins have no left limbs; the game mirrors the right ones. Each entry
// is a source rect in the right limb and the matching target corner in the
// left limb, keeping outer side to outer side and inner to inner.
const LEGACY_MIRRORS: readonly (readonly [Rect, number, number])[] = [
  // right leg → left leg
  [[4, 16, 4, 4], 20, 48],
  [[8, 16, 4, 4], 24, 48],
  [[0, 20, 4, 12], 24, 52],
  [[4, 20, 4, 12], 20, 52],
  [[8, 20, 4, 12], 16, 52],
  [[12, 20, 4, 12], 28, 52],
  // right arm → left arm
  [[44, 16, 4, 4], 36, 48],
  [[48, 16, 4, 4], 40, 48],
  [[40, 20, 4, 12], 40, 52],
  [[44, 20, 4, 12], 36, 52],
  [[48, 20, 4, 12], 32, 52],
  [[52, 20, 4, 12], 44, 52],
];

const HAT: Rect = [32, 0, 32, 16];
const OUTER_LAYERS: readonly Rect[] = [
  HAT,
  [0, 32, 64, 16],
  [0, 48, 16, 16],
  [48, 48, 16, 16],
];

function skinScale(width: number, height: number): number {
  const valid =
    width > 0 && width % 64 === 0 && (width === height || width === 2 * height);
  if (!valid) throw new TextureFormatError('skin', width, height);
  return width / 64;
}

export function normalizeSkin(src: Pixels): NormalizedSkin {
  const scale = skinScale(src.width, src.height);
  const legacy = src.width === 2 * src.height;
  const pixels = createPixels(src.width, src.width);
  copyRect(src, 0, 0, src.width, src.height, pixels, 0, 0);
  const s = (r: Rect) =>
    [r[0] * scale, r[1] * scale, r[2] * scale, r[3] * scale] as const;

  if (legacy) {
    for (const [rect, dx, dy] of LEGACY_MIRRORS) {
      const [x, y, w, h] = s(rect);
      copyRect(pixels, x, y, w, h, pixels, dx * scale, dy * scale, {
        flipX: true,
      });
    }
  }

  // Skins painted on an opaque background would show that background as solid
  // outer boxes; skinview3d clears them, and its users expect that.
  if (!hasTransparency(src, 0, 0, src.width, src.height)) {
    for (const rect of legacy ? [HAT] : OUTER_LAYERS)
      clearRect(pixels, ...s(rect));
  }

  return {pixels, scale, legacy};
}

// The columns a slim arm leaves unused, on both arms.
const SLIM_UNUSED: readonly Rect[] = [
  [50, 16, 2, 4],
  [54, 20, 2, 12],
  [42, 48, 2, 4],
  [46, 52, 2, 12],
];
const BLACK: Rgba = [0, 0, 0, 255];
const WHITE: Rgba = [255, 255, 255, 255];

export function detectModel(skin: Pixels): ModelType {
  const scale = skinScale(skin.width, skin.height);
  const areas = SLIM_UNUSED.map(
    r => [r[0] * scale, r[1] * scale, r[2] * scale, r[3] * scale] as const,
  );
  // Inner layers can't be transparent in the game, so any transparency there
  // means the area is unused. Editors also fill unused areas solid black or
  // solid white.
  if (areas.some(a => hasTransparency(skin, ...a))) return 'slim';
  for (const colour of [BLACK, WHITE]) {
    if (areas.every(a => isUniform(skin, ...a, colour))) return 'slim';
  }
  return 'classic';
}
