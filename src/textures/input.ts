import { createPixels, type Pixels } from '../format/pixels.js'

export type TextureSource =
  HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLVideoElement

export type RemoteImage =
  | string
  | URL
  | {
      src: string | URL
      crossOrigin?: '' | 'anonymous' | 'use-credentials'
      referrerPolicy?: ReferrerPolicy
    }

export type ImageInput = RemoteImage | TextureSource

const SOURCE_TYPES = [
  'HTMLImageElement',
  'HTMLCanvasElement',
  'OffscreenCanvas',
  'ImageBitmap',
  'HTMLVideoElement',
] as const

export function isTextureSource(value: unknown): value is TextureSource {
  // Look the constructors up on globalThis: they don't exist in Node or in
  // workers, and a bare `instanceof HTMLImageElement` would throw there.
  const scope = globalThis as unknown as Record<string, unknown>
  return SOURCE_TYPES.some((name) => {
    const ctor = scope[name]
    return typeof ctor === 'function' && value instanceof ctor
  })
}

function sourceSize(source: TextureSource): [number, number] {
  if ('naturalWidth' in source) return [source.naturalWidth, source.naturalHeight]
  if ('videoWidth' in source) return [source.videoWidth, source.videoHeight]
  return [source.width, source.height]
}

function abortError(): DOMException {
  return new DOMException('Image load aborted', 'AbortError')
}

function loadImage(input: RemoteImage, signal?: AbortSignal): Promise<HTMLImageElement> {
  const options = typeof input === 'object' && !(input instanceof URL) ? input : { src: input }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const image = new Image()
    // Skin hosts usually allow CORS; without crossOrigin the canvas would be
    // tainted and getImageData would throw.
    image.crossOrigin = options.crossOrigin ?? 'anonymous'
    if (options.referrerPolicy) image.referrerPolicy = options.referrerPolicy
    const onAbort = () => {
      image.src = ''
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    image.onload = () => {
      signal?.removeEventListener('abort', onAbort)
      resolve(image)
    }
    image.onerror = () => {
      signal?.removeEventListener('abort', onAbort)
      reject(new Error(`Failed to load image: ${String(options.src)}`))
    }
    image.src = String(options.src)
  })
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Decodes any supported input into an RGBA buffer. Browser only. */
export async function readPixels(input: ImageInput, signal?: AbortSignal): Promise<Pixels> {
  const source = isTextureSource(input) ? input : await loadImage(input, signal)
  if (signal?.aborted) throw abortError()
  const [width, height] = sourceSize(source)
  if (width === 0 || height === 0) return createPixels(width, height)
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!context) throw new Error('2D canvas context unavailable')
  context.drawImage(source, 0, 0)
  const { data } = context.getImageData(0, 0, width, height)
  return { width, height, data }
}
