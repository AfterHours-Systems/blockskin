import type { DataTexture, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { PlayerObject } from './PlayerObject.js'
import { createShadow, updateShadow } from './shadow.js'

function material(shadow: ReturnType<typeof createShadow>) {
  return shadow.material as MeshBasicMaterial
}

describe('shadow', () => {
  it('rests under the player at full strength', () => {
    const shadow = createShadow()
    const player = new PlayerObject()
    updateShadow(shadow, player)
    expect(material(shadow).opacity).toBeCloseTo(0.35)
    expect(shadow.scale.x).toBeCloseTo(1)
    expect(shadow.position.x).toBe(0)
    expect(shadow.position.z).toBe(0)
    expect(shadow.position.y).toBeCloseTo(0.01)
  })

  it('fades and shrinks as the player rises', () => {
    const shadow = createShadow()
    const player = new PlayerObject()
    player.position.y = 8
    updateShadow(shadow, player)
    expect(material(shadow).opacity).toBeCloseTo(0.175)
    expect(shadow.scale.x).toBeCloseTo(0.75)
    player.position.y = 20
    updateShadow(shadow, player)
    expect(material(shadow).opacity).toBe(0)
  })

  it('follows the player sideways but not its turn', () => {
    const shadow = createShadow()
    const player = new PlayerObject()
    player.position.set(3, 0, -2)
    player.rotation.y = 1
    updateShadow(shadow, player)
    expect(shadow.position.x).toBe(3)
    expect(shadow.position.z).toBe(-2)
    expect(shadow.rotation.y).toBe(0)
  })

  it('is 16 px across, lying flat, and does not write depth', () => {
    const shadow = createShadow()
    shadow.geometry.computeBoundingBox()
    const box = shadow.geometry.boundingBox!
    expect(box.max.x - box.min.x).toBeCloseTo(16)
    expect(shadow.rotation.x).toBeCloseTo(-Math.PI / 2)
    expect(material(shadow).depthWrite).toBe(false)
    expect(material(shadow).transparent).toBe(true)
  })

  it('is darkest in the middle and clear in the corners', () => {
    const texture = material(createShadow()).map as DataTexture
    const { data, width, height } = texture.image as {
      data: Uint8Array
      width: number
      height: number
    }
    const alpha = (x: number, y: number) => data[(y * width + x) * 4 + 3]!
    expect(alpha(width / 2, height / 2)).toBeGreaterThan(alpha(width / 2, height / 2 + height / 4))
    expect(alpha(0, 0)).toBe(0)
    expect(alpha(width - 1, height - 1)).toBe(0)
  })
})
