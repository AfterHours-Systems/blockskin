import { BoxGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { applyBoxUV, boxUV, type Face } from './uv.js'

describe('boxUV', () => {
  it('lays out the head the way the skin template does', () => {
    expect(boxUV(0, 0, 8, 8, 8)).toEqual({
      top: { x: 8, y: 0, w: 8, h: 8 },
      bottom: { x: 16, y: 0, w: 8, h: 8 },
      right: { x: 0, y: 8, w: 8, h: 8 },
      front: { x: 8, y: 8, w: 8, h: 8 },
      left: { x: 16, y: 8, w: 8, h: 8 },
      back: { x: 24, y: 8, w: 8, h: 8 },
    })
  })

  it('lays out a 4×12×4 limb', () => {
    const rects = boxUV(40, 16, 4, 12, 4)
    expect(rects.front).toEqual({ x: 44, y: 20, w: 4, h: 12 })
    expect(rects.back).toEqual({ x: 52, y: 20, w: 4, h: 12 })
  })
})

type Corner = readonly [number, number, number]

// Where each face's image top-left and top-right corners must sit on the box.
const CORNERS: Record<Face, { group: number; topLeft: Corner; topRight: Corner }> = {
  left: { group: 0, topLeft: [1, 1, 1], topRight: [1, 1, -1] },
  right: { group: 1, topLeft: [-1, 1, -1], topRight: [-1, 1, 1] },
  top: { group: 2, topLeft: [-1, 1, -1], topRight: [1, 1, -1] },
  bottom: { group: 3, topLeft: [-1, -1, -1], topRight: [1, -1, -1] },
  front: { group: 4, topLeft: [-1, 1, 1], topRight: [1, 1, 1] },
  back: { group: 5, topLeft: [1, 1, -1], topRight: [-1, 1, -1] },
}

describe('applyBoxUV', () => {
  const geometry = new BoxGeometry(8, 8, 8)
  const rects = boxUV(0, 0, 8, 8, 8)
  applyBoxUV(geometry, rects, 64, 64)
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const index = geometry.getIndex()!

  function uvAt(group: number, corner: Corner): [number, number] {
    const { start, count } = geometry.groups[group]!
    for (let i = start; i < start + count; i++) {
      const v = index.getX(i)
      const matches = [0, 1, 2].every((a) => Math.sign(position.getComponent(v, a)) === corner[a])
      if (matches) return [uv.getX(v), uv.getY(v)]
    }
    throw new Error(`no vertex at ${corner.join(',')} in group ${group}`)
  }

  it.each(Object.entries(CORNERS))(
    'maps the %s face corners',
    (face, { group, topLeft, topRight }) => {
      const rect = rects[face as Face]
      expect(uvAt(group, topLeft)).toEqual([rect.x / 64, 1 - rect.y / 64])
      expect(uvAt(group, topRight)).toEqual([(rect.x + rect.w) / 64, 1 - rect.y / 64])
    },
  )

  it('scales by the texture height for 64×32 cape textures', () => {
    const cape = new BoxGeometry(10, 16, 1)
    applyBoxUV(cape, boxUV(0, 0, 10, 16, 1), 64, 32)
    const v = cape.getAttribute('uv')
    let minV = 1
    for (let i = 0; i < v.count; i++) minV = Math.min(minV, v.getY(i))
    expect(minV).toBeCloseTo(1 - 17 / 32)
  })
})
