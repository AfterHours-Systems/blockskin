import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { WalkingAnimation } from '../animation/locomotion.js'
import { RandomActions } from '../animation/RandomActions.js'
import type { MeshStandardMaterial } from 'three'
import { PlayerObject } from '../model/PlayerObject.js'
import { hand } from '../animation/testProbe.js'
import { PlayerDriver } from './PlayerDriver.js'
import { DEFAULT_REACTIONS, type Reaction } from './reactions.js'

const away = new Vector3(0, 0, -1)

function driverWith(animation: WalkingAnimation | RandomActions | null = null) {
  const driver = new PlayerDriver(new PlayerObject(), { transition: 0 })
  driver.reactions = DEFAULT_REACTIONS
  driver.animation = animation
  driver.update(0)
  return driver
}

function advance(driver: PlayerDriver, seconds: number, step = 0.02) {
  for (let t = 0; t < seconds - 1e-9; t += step) driver.update(Math.min(step, seconds - t))
}

function tint(player: PlayerObject): number[] {
  return (player.skin.head.inner.material as MeshStandardMaterial).color.toArray()
}

describe('poke reactions', () => {
  it('shakes the head when the head is poked, then lets go', () => {
    const driver = driverWith()
    driver.poke('head', away)
    advance(driver, 0.15)
    expect(Math.abs(driver.player.skin.head.rotation.y)).toBeGreaterThan(0.1)
    advance(driver, 0.6)
    expect(driver.player.skin.head.rotation.y).toBeCloseTo(0)
  })

  it('waves back with the poked arm while the other keeps walking', () => {
    const driver = driverWith(new WalkingAnimation())
    const plain = driverWith(new WalkingAnimation())
    advance(driver, 0.2)
    advance(plain, 0.2)
    driver.poke('leftArm', away)
    advance(driver, 0.3)
    advance(plain, 0.3)
    const shoulder = driver.player.skin.leftArm.getWorldPosition(new Vector3())
    expect(hand(driver.player, 'left').y).toBeGreaterThan(shoulder.y)
    expect(driver.player.skin.rightArm.quaternion.toArray()).toEqual(
      plain.player.skin.rightArm.quaternion.toArray(),
    )
  })

  it('knocks the player back and flashes red, both gone after 0.4 s', () => {
    const driver = driverWith()
    driver.poke('body', away)
    driver.update(0)
    expect(tint(driver.player)[1]).toBeLessThan(0.6)
    advance(driver, 0.1)
    expect(driver.player.position.dot(away)).toBeGreaterThan(1)
    advance(driver, 0.31)
    expect(driver.player.position.length()).toBeCloseTo(0)
    expect(tint(driver.player)).toEqual([1, 1, 1])
  })

  it('makes a leg poke jump', () => {
    const driver = driverWith()
    driver.poke('rightLeg', away)
    advance(driver, 0.25)
    expect(driver.player.position.y).toBeGreaterThan(3)
  })

  it('gets annoyed and crouch-spams on the 5th poke within 3 s', () => {
    const driver = driverWith()
    for (let i = 0; i < 5; i++) {
      driver.poke('body', away)
      advance(driver, 0.5)
    }
    let crouched = false
    for (let i = 0; i < 20; i++) {
      advance(driver, 0.02)
      if (driver.player.skin.body.rotation.x > 0.4) crouched = true
    }
    expect(crouched).toBe(true)
  })

  it('does not get annoyed when the pokes are spread over more than 3 s', () => {
    const driver = driverWith()
    for (let i = 0; i < 5; i++) {
      driver.poke('body', away)
      advance(driver, 0.875)
    }
    for (let i = 0; i < 20; i++) {
      advance(driver, 0.02)
      expect(driver.player.skin.body.rotation.x).toBeCloseTo(0)
    }
  })

  it('does nothing with reactions off', () => {
    const driver = driverWith()
    driver.reactions = null
    driver.poke('head', away)
    advance(driver, 0.2)
    expect(driver.player.position.length()).toBe(0)
    expect(driver.player.skin.head.rotation.y).toBe(0)
    expect(tint(driver.player)).toEqual([1, 1, 1])
  })

  it('runs a custom reaction instead of the default for that part', () => {
    const lean: Reaction = {
      duration: 0.5,
      motion: true,
      apply: (player) => {
        player.skin.body.rotation.z = 1
      },
    }
    const driver = driverWith()
    driver.reactions = { ...DEFAULT_REACTIONS, head: lean }
    driver.poke('head', away)
    advance(driver, 0.2)
    expect(driver.player.skin.body.rotation.z).toBeCloseTo(1)
    expect(driver.player.skin.head.rotation.y).toBe(0)
  })

  it('only flashes under reduced motion', () => {
    const driver = driverWith()
    driver.reducedMotion = true
    driver.poke('rightLeg', away)
    advance(driver, 0.1)
    expect(driver.player.position.length()).toBe(0)
    expect(tint(driver.player)[1]).toBeLessThan(1)
  })

  it('leaves no elytra or tint behind when poked mid-flight', () => {
    const driver = driverWith(
      new RandomActions({
        actions: [
          { name: 'fly', weight: 1 },
          { name: 'idle', weight: 1 },
        ],
        random: () => 0,
        minDuration: 1,
        maxDuration: 1,
      }),
    )
    advance(driver, 0.3)
    expect(driver.player.elytra.visible).toBe(true)
    driver.poke('body', away)
    advance(driver, 1.2)
    expect(driver.player.elytra.visible).toBe(false)
    expect(tint(driver.player)).toEqual([1, 1, 1])
  })

  it('clears the tint and the elytra on dispose mid-reaction', () => {
    const driver = driverWith(
      new RandomActions({ actions: [{ name: 'fly', weight: 1 }], random: () => 0 }),
    )
    advance(driver, 0.2)
    driver.poke('body', away)
    advance(driver, 0.05)
    driver.dispose()
    expect(tint(driver.player)).toEqual([1, 1, 1])
    expect(driver.player.elytra.visible).toBe(false)
  })
})
