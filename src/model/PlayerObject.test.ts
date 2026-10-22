import {
  Box3,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Texture,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { setPixel } from '../format/pixels.js'
import { opaqueSkin, paint, transparentSkin } from '../format/testPixels.js'
import { PlayerObject, type BodyPart } from './PlayerObject.js'

function classicSkin() {
  const p = opaqueSkin(64, 64)
  setPixel(p, 0, 0, [0, 0, 0, 0]) // keep the outer layers
  return p
}

function slimSkin() {
  const p = classicSkin()
  paint(p, 54, 20, 2, 12, [0, 0, 0, 0])
  return p
}

function innerBox(player: PlayerObject, parts?: BodyPart[]): Box3 {
  player.updateMatrixWorld(true)
  const box = new Box3()
  for (const part of parts ?? player.skin.parts()) box.union(new Box3().setFromObject(part.inner))
  return box
}

function sizeOf(mesh: Mesh): Vector3 {
  mesh.geometry.computeBoundingBox()
  return mesh.geometry.boundingBox!.getSize(new Vector3())
}

describe('PlayerObject', () => {
  it('stands with its feet at 0 and the top of its head at 32', () => {
    const box = innerBox(new PlayerObject())
    expect(box.min.y).toBeCloseTo(0)
    expect(box.max.y).toBeCloseTo(32)
  })

  it('inflates the outer layers by the game amounts', () => {
    const { skin } = new PlayerObject()
    expect(sizeOf(skin.head.outer).toArray()).toEqual([9, 9, 9])
    expect(sizeOf(skin.body.outer).toArray()).toEqual([8.5, 12.5, 4.5])
    expect(sizeOf(skin.rightLeg.outer).toArray()).toEqual([4.5, 12.5, 4.5])
  })

  it('starts hidden until a skin is applied', () => {
    const player = new PlayerObject()
    expect(player.skin.visible).toBe(false)
    player.applySkin(classicSkin())
    expect(player.skin.visible).toBe(true)
  })

  it('detects slim arms and switches back to classic', () => {
    const player = new PlayerObject()
    expect(player.applySkin(slimSkin())).toBe('slim')
    expect(sizeOf(player.skin.rightArm.inner).x).toBe(3)
    expect(sizeOf(player.skin.leftArm.inner).x).toBe(3)
    expect(player.applySkin(classicSkin())).toBe('classic')
    expect(sizeOf(player.skin.rightArm.inner).x).toBe(4)
  })

  it('hangs slim arms half a pixel lower, flush with the shoulder', () => {
    const player = new PlayerObject()
    player.applySkin(slimSkin())
    const arm = innerBox(player, [player.skin.rightArm])
    expect(arm.max.y).toBeCloseTo(23.5)
    expect(arm.max.x).toBeCloseTo(-4)
  })

  it('lets an explicit model override detection', () => {
    expect(new PlayerObject().applySkin(slimSkin(), { model: 'classic' })).toBe('classic')
  })

  it('treats legacy skins as classic', () => {
    const legacy = transparentSkin(64, 32) // transparent arms would read as slim
    expect(new PlayerObject().applySkin(legacy)).toBe('classic')
  })

  it('disposes the previous skin texture on replace', () => {
    const player = new PlayerObject()
    player.applySkin(classicSkin())
    const first = player.skin.map as Texture
    const spy = vi.spyOn(first, 'dispose')
    player.applySkin(classicSkin())
    expect(spy).toHaveBeenCalledOnce()
    expect(player.skin.map).not.toBe(first)
  })

  it('clears the skin with null', () => {
    const player = new PlayerObject()
    player.applySkin(classicSkin())
    expect(player.applySkin(null)).toBeNull()
    expect(player.skin.visible).toBe(false)
    expect(player.skin.map).toBeNull()
  })

  it('switches back equipment between cape, elytra and none', () => {
    const player = new PlayerObject()
    player.applyCape(transparentSkin(64, 32))
    expect([player.cape.visible, player.elytra.visible]).toEqual([true, false])
    player.backEquipment = 'elytra'
    expect([player.cape.visible, player.elytra.visible]).toEqual([false, true])
    player.backEquipment = null
    expect([player.cape.visible, player.elytra.visible]).toEqual([false, false])
  })

  it('loads a cape hidden when makeVisible is false', () => {
    const player = new PlayerObject()
    player.applyCape(transparentSkin(22, 17), { makeVisible: false })
    expect(player.backEquipment).toBeNull()
  })

  it('shows ears from the skin, or loads them hidden', () => {
    const player = new PlayerObject()
    player.applySkin(classicSkin(), { ears: true })
    expect(player.ears.visible).toBe(true)
    const other = new PlayerObject()
    other.applySkin(classicSkin(), { ears: 'load-only' })
    expect(other.ears.visible).toBe(false)
  })

  it('accepts a standalone ear texture', () => {
    const player = new PlayerObject()
    player.applyEars(transparentSkin(14, 7))
    expect(player.ears.visible).toBe(true)
  })

  it('turns upside down in place', () => {
    const player = new PlayerObject()
    const before = innerBox(player)
    player.upsideDown = true
    const head = innerBox(player, [player.skin.head])
    const after = innerBox(player)
    expect(head.max.y).toBeLessThan(16)
    expect(after.min.y).toBeCloseTo(before.min.y)
    expect(after.max.y).toBeCloseTo(before.max.y)
    player.upsideDown = false
    expect(innerBox(player, [player.skin.head]).min.y).toBeCloseTo(24)
  })

  it('restores the rest pose', () => {
    const player = new PlayerObject()
    const restArm = player.skin.rightArm.position.clone()
    player.skin.rightArm.position.x += 3
    player.skin.body.rotation.x = 0.5
    player.position.set(1, 2, 3)
    player.rotation.y = 1
    player.resetPose()
    expect(player.skin.rightArm.position.toArray()).toEqual(restArm.toArray())
    expect(player.skin.body.rotation.x).toBe(0)
    expect(player.position.toArray()).toEqual([0, 0, 0])
    expect(player.rotation.y).toBe(0)
  })

  it('keeps the rest pose right after switching to slim', () => {
    const player = new PlayerObject()
    player.applySkin(slimSkin())
    player.skin.rightArm.position.y = 0
    player.resetPose()
    expect(player.skin.rightArm.position.y).toBe(21.5)
  })

  it('reports the head top including the hat, upright even when upside down', () => {
    const player = new PlayerObject()
    expect(player.headTop(new Vector3()).y).toBeCloseTo(32.5)
    player.upsideDown = true
    expect(player.headTop(new Vector3()).y).toBeCloseTo(32.5)
  })

  it('disposes every geometry, material and texture', () => {
    const player = new PlayerObject()
    player.applySkin(classicSkin(), { ears: true })
    player.applyCape(transparentSkin(64, 32))
    const disposables = new Set<{ dispose(): void }>()
    player.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      disposables.add(mesh.geometry as BufferGeometry)
      disposables.add(mesh.material as Material)
      const map = (mesh.material as Material & { map?: Texture | null }).map
      if (map) disposables.add(map)
    })
    const spies = [...disposables].map((d) => vi.spyOn(d, 'dispose'))
    player.dispose()
    for (const spy of spies) expect(spy).toHaveBeenCalled()
  })

  it('biases the two legs differently so their overlapping faces do not fight', () => {
    const { skin } = new PlayerObject()
    const offset = (part: BodyPart, layer: 'inner' | 'outer') => {
      const material = part[layer].material as Material
      return material.polygonOffset ? material.polygonOffsetUnits : 0
    }
    for (const layer of ['inner', 'outer'] as const) {
      expect(offset(skin.leftLeg, layer)).not.toBe(offset(skin.rightLeg, layer))
      expect(offset(skin.rightLeg, layer)).not.toBe(offset(skin.body, layer))
    }
  })

  it('updates every material when the skin texture changes', () => {
    const player = new PlayerObject()
    player.applySkin(classicSkin())
    const map = player.skin.map
    for (const part of player.skin.parts()) {
      expect((part.inner.material as MeshStandardMaterial).map).toBe(map)
      expect((part.outer.material as MeshStandardMaterial).map).toBe(map)
    }
  })
})

describe('PlayerObject.wearElytra with back-equipment changes during the flight', () => {
  function capeMap(player: PlayerObject) {
    return (player.cape.mesh.material as MeshStandardMaterial).map
  }

  it('keeps the elytra on when a cape loads mid-flight, then shows the cape after', () => {
    const player = new PlayerObject()
    const takeOff = player.wearElytra()
    player.applyCape(transparentSkin(64, 32))
    expect(player.elytra.visible).toBe(true)
    expect(player.cape.visible).toBe(false)
    // The elytra now wears the loaded cape's texture.
    expect(capeMap(player)).not.toBeNull()
    takeOff()
    expect(player.backEquipment).toBe('cape')
  })

  it('remembers a back-equipment change made mid-flight', () => {
    const player = new PlayerObject()
    player.applyCape(transparentSkin(64, 32))
    const takeOff = player.wearElytra()
    player.backEquipment = null
    expect(player.elytra.visible).toBe(true)
    takeOff()
    expect(player.backEquipment).toBeNull()
  })

  it('releases the drawn elytra texture when disposed mid-flight', () => {
    const player = new PlayerObject()
    player.wearElytra()
    const drawn = capeMap(player)!
    const dispose = vi.spyOn(drawn, 'dispose')
    player.dispose()
    expect(dispose).toHaveBeenCalled()
  })
})
