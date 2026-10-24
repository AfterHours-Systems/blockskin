import {
  CanvasTexture,
  NearestFilter,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import {hasFormatting, parseFormatted, type Segment} from './format.js';
import {nameTagLayout, type Margin} from './layout.js';

export interface NameTagOptions {
  /**
   * A CSS font. The default expects a font-face named "Minecraft"; this
   * package does not ship one, so supply your own or another font.
   */
  font?: string;
  /** Repaint once the font has loaded, in case it was still loading. */
  repaintAfterLoaded?: boolean;
  margin?: Margin;
  textStyle?: string | CanvasGradient | CanvasPattern;
  backgroundStyle?: string | CanvasGradient | CanvasPattern;
  /** Height of the tag in skin pixels. */
  height?: number;
  /** Read Minecraft's `§` colour and style codes. Defaults to true. */
  formatting?: boolean;
}

/** A text label with a translucent background, always facing the camera. */
export class NameTagObject extends Sprite {
  readonly text: string;
  readonly painted: Promise<void>;
  private readonly canvas = document.createElement('canvas');
  private readonly options: Required<NameTagOptions>;
  // Formatted runs, or null for plain text, which renders exactly as before.
  private readonly runs: Segment[] | null;

  constructor(text = '', options: NameTagOptions = {}) {
    const material = new SpriteMaterial({transparent: true, alphaTest: 1e-5});
    super(material);
    this.name = 'nameTag';
    this.text = text;
    this.options = {
      font: '48px Minecraft',
      repaintAfterLoaded: true,
      margin: [5, 10, 5, 10],
      textStyle: 'white',
      backgroundStyle: 'rgba(0,0,0,.25)',
      height: 4,
      formatting: true,
      ...options,
    };
    this.runs =
      this.options.formatting && hasFormatting(text)
        ? parseFormatted(text).map(obfuscate)
        : null;
    const texture = new CanvasTexture(this.canvas);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.colorSpace = SRGBColorSpace;
    material.map = texture;
    this.paint();
    this.painted =
      this.options.repaintAfterLoaded &&
      typeof document !== 'undefined' &&
      document.fonts
        ? document.fonts
            .load(this.options.font, text)
            .then(() => this.paint())
            .catch(() => {})
        : Promise.resolve();
  }

  private paint(): void {
    const {font, margin, textStyle, backgroundStyle, height} = this.options;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.font = font;
    const fontSize = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
    const runs = this.runs;
    // The game draws formatted text with a drop shadow one font pixel down
    // and right (a glyph is 8 font pixels tall).
    const shadow = runs ? fontSize / 8 : 0;
    const widths = runs?.map(run => {
      context.font = runFont(font, run);
      return context.measureText(run.text).width;
    });
    context.font = font;
    const metrics = context.measureText(this.text);
    const fontHeight =
      metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent ||
      fontSize;
    const textWidth = widths
      ? widths.reduce((sum, w) => sum + w, 0)
      : metrics.width;
    const layout = nameTagLayout(
      textWidth + shadow,
      fontHeight + shadow,
      margin,
      height,
    );
    const resized =
      this.canvas.width !== layout.canvasWidth ||
      this.canvas.height !== layout.canvasHeight;
    this.canvas.width = layout.canvasWidth;
    this.canvas.height = layout.canvasHeight;
    // Resizing the canvas resets the context state.
    context.font = font;
    context.fillStyle = backgroundStyle;
    context.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);
    context.textBaseline = 'top';
    if (runs && widths) {
      let x = margin[3];
      runs.forEach((run, i) => {
        context.font = runFont(font, run);
        const width = widths[i]!;
        drawRun(
          context,
          run,
          x + shadow,
          margin[0] + shadow,
          width,
          fontSize,
          shadowColor(run.color),
        );
        drawRun(
          context,
          run,
          x,
          margin[0],
          width,
          fontSize,
          run.color ?? textStyle,
        );
        x += width;
      });
    } else {
      context.fillStyle = textStyle;
      context.fillText(this.text, margin[3], margin[0]);
    }
    this.scale.set(layout.spriteWidth, layout.spriteHeight, 1);
    const map = (this.material as SpriteMaterial).map;
    if (!map) return;
    // three sizes texture storage on first upload and later only writes into
    // it, so a canvas that changed size (a web font arriving) needs the old
    // storage dropped first.
    if (resized) map.dispose();
    map.needsUpdate = true;
  }

  dispose(): void {
    const material = this.material as SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }
}

const GLYPHS =
  'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789#$%&?';

// §k text shows random characters; they are picked once, when the tag is made.
function obfuscate(run: Segment): Segment {
  if (!run.obfuscated) return run;
  const text = [...run.text]
    .map(char =>
      char === ' ' ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    )
    .join('');
  return {...run, text};
}

function runFont(font: string, run: Segment): string {
  return `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}${font}`;
}

// The game's text shadow is the text colour at a quarter brightness.
function shadowColor(color: string | null): string {
  const hex = color ?? '#FFFFFF';
  const channel = (i: number) =>
    Math.floor(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 4)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function drawRun(
  context: CanvasRenderingContext2D,
  run: Segment,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  style: string | CanvasGradient | CanvasPattern,
): void {
  context.fillStyle = style;
  context.fillText(run.text, x, y);
  const line = fontSize / 8;
  if (run.underline) context.fillRect(x, y + fontSize - line / 2, width, line);
  if (run.strikethrough)
    context.fillRect(x, y + fontSize / 2 - line / 2, width, line);
}
