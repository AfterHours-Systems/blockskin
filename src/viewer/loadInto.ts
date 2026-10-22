import type {
  CapeApplyOptions,
  EarsApplyOptions,
  PlayerObject,
  SkinApplyOptions,
} from '../model/PlayerObject.js'
import type { ModelType } from '../format/skin.js'
import type { Pixels } from '../format/pixels.js'
import { readPixels, type ImageInput } from '../textures/input.js'

export type PixelReader = (input: ImageInput, signal?: AbortSignal) => Promise<Pixels>

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Load superseded', 'AbortError')
}

// Each loader reads first and applies last. A read that fails, or an image the
// format rejects, leaves the player exactly as it was.

export async function loadSkinInto(
  player: PlayerObject,
  input: ImageInput | null,
  opts?: SkinApplyOptions,
  signal?: AbortSignal,
  read: PixelReader = readPixels,
): Promise<ModelType | null> {
  if (input === null) return player.applySkin(null)
  const pixels = await read(input, signal)
  throwIfAborted(signal)
  return player.applySkin(pixels, opts)
}

export async function loadCapeInto(
  player: PlayerObject,
  input: ImageInput | null,
  opts?: CapeApplyOptions,
  signal?: AbortSignal,
  read: PixelReader = readPixels,
): Promise<void> {
  if (input === null) return player.applyCape(null)
  const pixels = await read(input, signal)
  throwIfAborted(signal)
  player.applyCape(pixels, opts)
}

export async function loadEarsInto(
  player: PlayerObject,
  input: ImageInput | null,
  opts?: EarsApplyOptions,
  signal?: AbortSignal,
  read: PixelReader = readPixels,
): Promise<void> {
  if (input === null) return player.applyEars(null)
  const pixels = await read(input, signal)
  throwIfAborted(signal)
  player.applyEars(pixels, opts)
}
