// Generated textures for checking orientation and formats without shipping
// any real skin. Every face of every box gets its own colour, and the texel in
// each face's top-left corner is white.

type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'
type Rgb = readonly [number, number, number]

const FACE_COLOURS: Record<Face, Rgb> = {
  front: [220, 40, 40],
  back: [40, 80, 220],
  right: [40, 180, 60],
  left: [230, 200, 30],
  top: [200, 60, 200],
  bottom: [40, 200, 210],
}

function faces(u: number, v: number, w: number, h: number, d: number) {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + 2 * d + w, v + d, w, h],
  } as Record<Face, [number, number, number, number]>
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return [c, c.getContext('2d')!] as const
}

function paintBox(
  ctx: CanvasRenderingContext2D,
  scale: number,
  [u, v]: readonly [number, number],
  [w, h, d]: readonly [number, number, number],
  shade: number,
) {
  for (const [face, [x, y, fw, fh]] of Object.entries(faces(u, v, w, h, d)) as [Face, number[]][]) {
    const [r, g, b] = FACE_COLOURS[face].map((c) => Math.round(c * shade))
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(x! * scale, y! * scale, fw! * scale, fh! * scale)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x! * scale, y! * scale, scale, scale)
  }
}

const INNER: [readonly [number, number], readonly [number, number, number], number][] = [
  [[0, 0], [8, 8, 8], 1],
  [[16, 16], [8, 12, 4], 0.85],
  [[40, 16], [4, 12, 4], 0.7],
  [[32, 48], [4, 12, 4], 0.7],
  [[0, 16], [4, 12, 4], 0.55],
  [[16, 48], [4, 12, 4], 0.55],
]

/** A debug skin. `slim` narrows the arms; `legacy` makes a 64×32 skin. */
export function debugSkin({ scale = 1, slim = false, legacy = false } = {}): HTMLCanvasElement {
  const [c, ctx] = canvas(64 * scale, (legacy ? 32 : 64) * scale)
  for (const [uv, size, shade] of INNER) {
    if (legacy && uv[1] >= 32) continue
    const armSize: [number, number, number] = [
      slim && size[1] === 12 && uv[0] >= 32 ? 3 : size[0],
      size[1],
      size[2],
    ]
    paintBox(ctx, scale, uv, armSize, shade)
  }
  // A thin hat brim on the outer head layer: the front-bottom row only.
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(40 * scale, 15 * scale, 8 * scale, scale)
  return c
}

/** A debug cape in one of the three supported layouts. */
export function debugCape(
  format: '64x32' | '22x17' | '46x22' = '64x32',
  scale = 1,
): HTMLCanvasElement {
  const [w, h] = format === '64x32' ? [64, 32] : format === '22x17' ? [22, 17] : [46, 22]
  const [c, ctx] = canvas(w * scale, h * scale)
  paintBox(ctx, scale, [0, 0], [10, 16, 1], 1)
  if (format !== '22x17') paintBox(ctx, scale, [22, 0], [10, 20, 2], 0.8)
  return c
}

export function debugEars(scale = 1): HTMLCanvasElement {
  const [c, ctx] = canvas(14 * scale, 7 * scale)
  paintBox(ctx, scale, [0, 0], [6, 6, 1], 1)
  return c
}

/** A simple sky-to-ground gradient, standing in for a panorama. */
export function debugPanorama(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 256)
  const gradient = ctx.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, '#6af')
  gradient.addColorStop(0.5, '#fff')
  gradient.addColorStop(0.5, '#7a5')
  gradient.addColorStop(1, '#453')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 256)
  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = '#c33'
    ctx.fillRect(x, 120, 8, 16)
  }
  return c
}
