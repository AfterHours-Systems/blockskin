export type TextureKind = 'skin' | 'cape' | 'ears'

// Thrown for images whose size matches no known layout, so callers can tell a
// wrong file apart from a network failure.
export class TextureFormatError extends Error {
  readonly kind: TextureKind
  readonly width: number
  readonly height: number

  constructor(kind: TextureKind, width: number, height: number) {
    super(`Unsupported ${kind} size: ${width}x${height}`)
    this.name = 'TextureFormatError'
    this.kind = kind
    this.width = width
    this.height = height
  }
}
