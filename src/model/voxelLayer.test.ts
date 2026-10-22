import { Box3, Vector3, type BufferGeometry } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createPixels, setPixel } from '../format/pixels.js'
import { opaqueSkin, paint } from '../format/testPixels.js'
import { PlayerObject } from './PlayerObject.js'
import { buildVoxelLayer } from './voxelLayer.js'

const OPAQUE = [200, 150, 120, 255] as const

function triangles(geometry: BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3
}

function bounds(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox()
  return geometry.boundingBox!
}

describe('buildVoxelLayer', () => {
  it('turns one hat texel into a block with five visible faces', () => {
    const skin = createPixels(64, 64)
    setPixel(skin, 40, 8, OPAQUE)
    const geometry = buildVoxelLayer(skin, 1, 'head', 'classic')
    expect(triangles(geometry)).toBe(10)
    const box = bounds(geometry)
    expect(box.min.toArray()).toEqual([-4, 7, 4])
    expect(box.max.toArray()).toEqual([-3, 8, 5])
  })

  it('culls the side shared by two neighbouring texels', () => {
    const skin = createPixels(64, 64)
    setPixel(skin, 40, 8, OPAQUE)
    setPixel(skin, 41, 8, OPAQUE)
    expect(triangles(buildVoxelLayer(skin, 1, 'head', 'classic'))).toBe(16)
  })

  it('builds nothing from a transparent layer', () => {
    expect(triangles(buildVoxelLayer(createPixels(64, 64), 1, 'body', 'classic'))).toBe(0)
  })

  it('uses half-pixel footprints on a 128 skin', () => {
    const skin = createPixels(128, 128)
    setPixel(skin, 80, 16, OPAQUE)
    const size = bounds(buildVoxelLayer(skin, 2, 'head', 'classic')).getSize(new Vector3())
    expect(size.x).toBeCloseTo(0.5)
    expect(size.y).toBeCloseTo(0.5)
    expect(size.z).toBeCloseTo(1)
  })

  it('keeps semi-transparent texels', () => {
    const skin = createPixels(64, 64)
    setPixel(skin, 40, 8, [200, 0, 0, 128])
    expect(triangles(buildVoxelLayer(skin, 1, 'head', 'classic'))).toBe(10)
  })

  it('stands half a pixel proud on the body and limbs', () => {
    const skin = createPixels(64, 64)
    setPixel(skin, 20, 36, OPAQUE) // jacket front, top-left
    const box = bounds(buildVoxelLayer(skin, 1, 'body', 'classic'))
    expect(box.max.z - box.min.z).toBeCloseTo(0.5)
    expect(box.min.z).toBeCloseTo(2)
  })
})

describe('PlayerObject.layers3d', () => {
  function skinWithLayers(slim = false) {
    const p = opaqueSkin(64, 64)
    setPixel(p, 0, 0, [0, 0, 0, 0])
    if (slim) paint(p, 54, 20, 2, 12, [0, 0, 0, 0])
    return p
  }

  it('rebuilds the voxel arms when the skin switches between slim and classic', () => {
    const player = new PlayerObject()
    player.layers3d = true
    player.applySkin(skinWithLayers(true))
    const slimGeometry = player.skin.rightArm.outer.geometry
    // A flat box has 12 triangles; blocks for every texel make far more.
    expect(triangles(slimGeometry)).toBeGreaterThan(12)
    const slimWidth = bounds(slimGeometry).getSize(new Vector3()).x
    const dispose = vi.spyOn(slimGeometry, 'dispose')
    player.applySkin(skinWithLayers(false))
    const classicWidth = bounds(player.skin.rightArm.outer.geometry).getSize(new Vector3()).x
    expect(triangles(player.skin.rightArm.outer.geometry)).toBeGreaterThan(12)
    expect(classicWidth - slimWidth).toBeCloseTo(1)
    expect(dispose).toHaveBeenCalled()
  })

  it('swaps back to the flat 9×9×9 hat when turned off', () => {
    const player = new PlayerObject()
    player.applySkin(skinWithLayers())
    player.layers3d = true
    expect(triangles(player.skin.head.outer.geometry)).toBeGreaterThan(12)
    player.layers3d = false
    expect(bounds(player.skin.head.outer.geometry).getSize(new Vector3()).toArray()).toEqual([
      9, 9, 9,
    ])
  })
})
