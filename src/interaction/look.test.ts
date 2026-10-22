import { Group, PerspectiveCamera, Vector2, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { PlayerDriver } from '../driver/PlayerDriver.js'
import { PlayerObject } from '../model/PlayerObject.js'
import { LOOK_LIMITS, addPointerListener, lookAngles, pointerTarget } from './look.js'

// The head's centre sits 28 above the feet.
function setup() {
  const parent = new Group()
  const player = new PlayerObject()
  parent.add(player)
  parent.updateMatrixWorld(true)
  return { parent, player, head: player.skin.head }
}

describe('lookAngles', () => {
  it('looks straight ahead at a target in front', () => {
    const { head } = setup()
    const { yaw, pitch } = lookAngles(head, new Vector3(0, 28, 50))
    expect(yaw).toBeCloseTo(0)
    expect(pitch).toBeCloseTo(0)
  })

  it('turns towards a target on its left (+x)', () => {
    const { head } = setup()
    expect(lookAngles(head, new Vector3(30, 28, 30)).yaw).toBeCloseTo(Math.PI / 4)
  })

  it('tilts up (negative pitch) towards a target above', () => {
    const { head } = setup()
    expect(lookAngles(head, new Vector3(0, 48, 30)).pitch).toBeCloseTo(-Math.atan2(20, 30))
  })

  it('clamps targets behind and far below', () => {
    const { head } = setup()
    expect(Math.abs(lookAngles(head, new Vector3(5, 28, -50)).yaw)).toBeCloseTo(LOOK_LIMITS.yaw)
    expect(lookAngles(head, new Vector3(0, -500, 10)).pitch).toBeCloseTo(LOOK_LIMITS.pitch)
  })

  it('measures relative to a turned body', () => {
    const { parent, head } = setup()
    parent.rotation.y = Math.PI / 2
    parent.updateMatrixWorld(true)
    // The body now faces world +x, so a world +z target is on its right.
    // It sits on the body's right, beyond the limit, so the yaw clamps there.
    expect(lookAngles(head, new Vector3(0, 28, 50)).yaw).toBeCloseTo(-LOOK_LIMITS.yaw)
  })

  it('looks the right way when upside down', () => {
    const { parent, player, head } = setup()
    player.upsideDown = true
    parent.updateMatrixWorld(true)
    // Upside down, the head hangs near the ground; a target far above in
    // world terms lies towards its chin, which is positive pitch.
    expect(lookAngles(head, new Vector3(0, 200, 30)).pitch).toBeGreaterThan(0)
  })
})

describe('pointerTarget', () => {
  it('puts the point on the pointer ray at the given distance', () => {
    const camera = new PerspectiveCamera(50, 1)
    camera.position.set(0, 0, 40)
    camera.updateMatrixWorld(true)
    const point = pointerTarget(camera, new Vector2(0, 0), 40)
    expect(point.x).toBeCloseTo(0)
    expect(point.z).toBeCloseTo(0)
    expect(pointerTarget(camera, new Vector2(1, 0), 40).x).toBeGreaterThan(5)
  })
})

describe('addPointerListener', () => {
  it('listens passively and cleans up', () => {
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const handler = () => {}
    const stop = addPointerListener(target as unknown as HTMLElement, handler)
    expect(target.addEventListener).toHaveBeenCalledWith('pointermove', handler, { passive: true })
    // A touch tap fires no pointermove, so the last touch counts through pointerdown.
    expect(target.addEventListener).toHaveBeenCalledWith('pointerdown', handler, { passive: true })
    stop()
    expect(target.removeEventListener).toHaveBeenCalledWith('pointermove', handler)
    expect(target.removeEventListener).toHaveBeenCalledWith('pointerdown', handler)
  })
})

describe('PlayerDriver.lookAt', () => {
  it('turns the head towards the target and hands back after 2 s of quiet', () => {
    const parent = new Group()
    const driver = new PlayerDriver(new PlayerObject(), { transition: 0 })
    parent.add(driver.player)
    parent.updateMatrixWorld(true)
    for (let i = 0; i < 30; i++) {
      driver.lookAt(new Vector3(40, 28, 40))
      driver.update(0.05)
    }
    expect(driver.player.skin.head.rotation.y).toBeGreaterThan(0.5)
    for (let t = 0; t < 2.5; t += 0.05) driver.update(0.05)
    expect(driver.player.skin.head.rotation.y).toBeCloseTo(0)
  })
})
