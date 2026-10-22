import type { NormalizedTexture } from './cape.js'
import { TextureFormatError } from './errors.js'
import { copyRect, createPixels, type Pixels } from './pixels.js'

/** A standalone 14×7 ear texture (or an HD multiple). */
export function normalizeEars(src: Pixels): NormalizedTexture {
  if (!(src.height > 0 && src.width === 2 * src.height && src.height % 7 === 0)) {
    throw new TextureFormatError('ears', src.width, src.height)
  }
  const scale = src.height / 7
  const pixels = createPixels(14 * scale, 7 * scale)
  copyRect(src, 0, 0, src.width, src.height, pixels, 0, 0)
  return { pixels, scale }
}

/** The ears drawn into a skin at (24,0), the layout deadmau5's skin uses. */
export function earsFromSkin(skin: Pixels): NormalizedTexture {
  const valid =
    skin.width > 0 &&
    skin.width % 64 === 0 &&
    (skin.width === skin.height || skin.width === 2 * skin.height)
  if (!valid) throw new TextureFormatError('skin', skin.width, skin.height)
  const scale = skin.width / 64
  const pixels = createPixels(14 * scale, 7 * scale)
  copyRect(skin, 24 * scale, 0, 14 * scale, 7 * scale, pixels, 0, 0)
  return { pixels, scale }
}
