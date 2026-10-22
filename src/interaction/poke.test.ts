import { Group, Mesh, Object3D, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { opaqueSkin } from '../format/testPixels.js'
import { PlayerObject } from '../model/PlayerObject.js'
import { awayFromCamera, findPokedPart, isPoke, partFromObject } from './poke.js'

describe('isPoke', () => {
  const down = { x: 100, y: 100, time: 1000 }

  it('accepts a short, still press', () => {
    expect(isPoke(down, { x: 103, y: 104, time: 1299 })).toBe(true)
  })

  it('rejects a press held 300 ms or longer', () => {
    expect(isPoke(down, { x: 100, y: 100, time: 1301 })).toBe(false)
  })

  it('rejects a press that moved 6 px', () => {
    expect(isPoke(down, { x: 106, y: 100, time: 1100 })).toBe(false)
  })
})

describe('partFromObject', () => {
  const player = new PlayerObject()
  player.applySkin(opaqueSkin(64, 64))
  player.applyCape(opaqueSkin(64, 32))
  player.applyEars(opaqueSkin(14, 7))

  it('ignores a player whose skin has not loaded yet', () => {
    expect(partFromObject(new PlayerObject().skin.head.outer)).toBeNull()
  })

  it('maps layer meshes to their body part', () => {
    expect(partFromObject(player.skin.head.outer)).toBe('head')
    expect(partFromObject(player.skin.rightLeg.inner)).toBe('rightLeg')
    expect(partFromObject(player.skin.leftArm.outer)).toBe('leftArm')
  })

  it('counts ears as the head and the cape as the body', () => {
    expect(partFromObject(player.ears.rightEar)).toBe('head')
    expect(partFromObject(player.cape.mesh)).toBe('body')
  })

  it('ignores meshes outside a player and hidden ones', () => {
    expect(partFromObject(new Mesh())).toBeNull()
    expect(partFromObject(new Object3D())).toBeNull()
    const hidden = new PlayerObject()
    hidden.applyCape(opaqueSkin(64, 32))
    hidden.backEquipment = null
    expect(partFromObject(hidden.cape.mesh)).toBeNull()
  })
})

describe('findPokedPart', () => {
  const player = new PlayerObject()
  player.applySkin(opaqueSkin(64, 64))
  player.updateMatrixWorld(true)

  it('finds the head along a ray through it', () => {
    const ray = new Raycaster(new Vector3(0, 28, 50), new Vector3(0, 0, -1))
    expect(findPokedPart(ray, player)).toBe('head')
  })

  it('finds the right leg', () => {
    const ray = new Raycaster(new Vector3(-2, 6, 50), new Vector3(0, 0, -1))
    expect(findPokedPart(ray, player)).toBe('rightLeg')
  })

  it('finds nothing beside the player', () => {
    const ray = new Raycaster(new Vector3(20, 28, 50), new Vector3(0, 0, -1))
    expect(findPokedPart(ray, player)).toBeNull()
  })
})

describe('awayFromCamera', () => {
  it('points from the camera through the player, flattened, in the parent space', () => {
    const parent = new Group()
    const player = new PlayerObject()
    parent.add(player)
    const camera = new PerspectiveCamera()
    camera.position.set(0, 20, 40)
    parent.updateMatrixWorld(true)
    const away = awayFromCamera(camera, player)
    expect(away.x).toBeCloseTo(0)
    expect(away.y).toBeCloseTo(0)
    expect(away.z).toBeCloseTo(-1)
  })

  it('accounts for a turned parent (auto-rotate)', () => {
    const parent = new Group()
    parent.rotation.y = Math.PI / 2
    const player = new PlayerObject()
    parent.add(player)
    const camera = new PerspectiveCamera()
    camera.position.set(0, 0, 40)
    parent.updateMatrixWorld(true)
    const away = awayFromCamera(camera, player)
    // World −z is the parent's +x after a quarter turn about y.
    expect(away.x).toBeCloseTo(1)
    expect(away.z).toBeCloseTo(0)
  })
})
