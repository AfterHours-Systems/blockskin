import type { BoxGeometry } from 'three'

export type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Minecraft's box UV layout for a w×h×d box whose texture starts at (u, v).
 * "right" and "left" are the player's own sides, so "right" is the −x face.
 */
export function boxUV(u: number, v: number, w: number, h: number, d: number): Record<Face, Rect> {
  return {
    top: { x: u + d, y: v, w, h: d },
    bottom: { x: u + d + w, y: v, w, h: d },
    right: { x: u, y: v + d, w: d, h },
    front: { x: u + d, y: v + d, w, h },
    left: { x: u + d + w, y: v + d, w: d, h },
    back: { x: u + 2 * d + w, y: v + d, w, h },
  }
}

type Axis = 0 | 1 | 2
type Direction = readonly [axis: Axis, sign: 1 | -1]

// For each BoxGeometry face group (px, nx, py, ny, pz, nz): which skin face it
// shows, and which 3D directions the image's +x (rightwards) and +y
// (downwards) run along. Deriving UVs from vertex positions keeps this
// independent of the vertex order inside three's BoxGeometry.
const FACES: readonly (readonly [Face, Direction, Direction])[] = [
  ['left', [2, -1], [1, -1]],
  ['right', [2, 1], [1, -1]],
  ['top', [0, 1], [2, 1]],
  ['bottom', [0, 1], [2, 1]],
  ['front', [0, 1], [1, -1]],
  ['back', [0, -1], [1, -1]],
]

/** Writes Minecraft box UVs (in texture pixels of a texWidth×texHeight image) onto a box. */
export function applyBoxUV(
  geometry: BoxGeometry,
  rects: Record<Face, Rect>,
  texWidth: number,
  texHeight: number,
): void {
  const { width, height, depth } = geometry.parameters
  const size = [width, height, depth]
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const index = geometry.getIndex()
  geometry.groups.forEach((group, faceIndex) => {
    const [face, across, down] = FACES[faceIndex]!
    const rect = rects[face]
    const along = ([axis, sign]: Direction, vertex: number) =>
      (sign * position.getComponent(vertex, axis)) / size[axis]! + 0.5
    for (let i = group.start; i < group.start + group.count; i++) {
      const vertex = index ? index.getX(i) : i
      uv.setXY(
        vertex,
        (rect.x + along(across, vertex) * rect.w) / texWidth,
        1 - (rect.y + along(down, vertex) * rect.h) / texHeight,
      )
    }
  })
  uv.needsUpdate = true
}
