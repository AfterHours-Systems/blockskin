import { CanvasTexture, NearestFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'
import { nameTagLayout, type Margin } from './layout.js'

export interface NameTagOptions {
  /**
   * A CSS font. The default expects a font-face named "Minecraft"; this
   * package does not ship one, so supply your own or another font.
   */
  font?: string
  /** Repaint once the font has loaded, in case it was still loading. */
  repaintAfterLoaded?: boolean
  margin?: Margin
  textStyle?: string | CanvasGradient | CanvasPattern
  backgroundStyle?: string | CanvasGradient | CanvasPattern
  /** Height of the tag in skin pixels. */
  height?: number
}

/** A text label with a translucent background, always facing the camera. */
export class NameTagObject extends Sprite {
  readonly text: string
  readonly painted: Promise<void>
  private readonly canvas = document.createElement('canvas')
  private readonly options: Required<NameTagOptions>

  constructor(text = '', options: NameTagOptions = {}) {
    const material = new SpriteMaterial({ transparent: true, alphaTest: 1e-5 })
    super(material)
    this.name = 'nameTag'
    this.text = text
    this.options = {
      font: '48px Minecraft',
      repaintAfterLoaded: true,
      margin: [5, 10, 5, 10],
      textStyle: 'white',
      backgroundStyle: 'rgba(0,0,0,.25)',
      height: 4,
      ...options,
    }
    const texture = new CanvasTexture(this.canvas)
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.colorSpace = SRGBColorSpace
    material.map = texture
    this.paint()
    this.painted =
      this.options.repaintAfterLoaded && typeof document !== 'undefined' && document.fonts
        ? document.fonts
            .load(this.options.font, text)
            .then(() => this.paint())
            .catch(() => {})
        : Promise.resolve()
  }

  private paint(): void {
    const { font, margin, textStyle, backgroundStyle, height } = this.options
    const context = this.canvas.getContext('2d')
    if (!context) return
    context.font = font
    const metrics = context.measureText(this.text)
    const fontHeight =
      metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent ||
      Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
    const layout = nameTagLayout(metrics.width, fontHeight, margin, height)
    const resized =
      this.canvas.width !== layout.canvasWidth || this.canvas.height !== layout.canvasHeight
    this.canvas.width = layout.canvasWidth
    this.canvas.height = layout.canvasHeight
    // Resizing the canvas resets the context state.
    context.font = font
    context.fillStyle = backgroundStyle
    context.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight)
    context.fillStyle = textStyle
    context.textBaseline = 'top'
    context.fillText(this.text, margin[3], margin[0])
    this.scale.set(layout.spriteWidth, layout.spriteHeight, 1)
    const map = (this.material as SpriteMaterial).map
    if (!map) return
    // three sizes texture storage on first upload and later only writes into
    // it, so a canvas that changed size (a web font arriving) needs the old
    // storage dropped first.
    if (resized) map.dispose()
    map.needsUpdate = true
  }

  dispose(): void {
    const material = this.material as SpriteMaterial
    material.map?.dispose()
    material.dispose()
  }
}
