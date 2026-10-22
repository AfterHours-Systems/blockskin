import { describe, expect, it } from 'vitest'
import { opaqueSkin } from '../format/testPixels.js'
import { PlayerDriver } from '../driver/PlayerDriver.js'
import { PlayerObject } from '../model/PlayerObject.js'
import { createAnimation } from './index.js'
import {
  DEFAULT_RANDOM_ACTIONS,
  RandomActions,
  pickAction,
  type ActionName,
  type RandomAction,
} from './RandomActions.js'

// A small deterministic generator, so sequences are repeatable.
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function run(animation: RandomActions, player: PlayerObject, seconds: number, step = 0.05) {
  for (let t = 0; t < seconds; t += step) animation.update(player, step)
}

describe('pickAction', () => {
  it('never picks the previous action', () => {
    const random = seeded(1)
    let previous: ActionName | null = null
    for (let i = 0; i < 500; i++) {
      const next = pickAction(DEFAULT_RANDOM_ACTIONS, previous, random)
      expect(next).not.toBe(previous)
      previous = next
    }
  })

  it('follows the weights', () => {
    const random = seeded(7)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 1000; i++) {
      const name = pickAction(DEFAULT_RANDOM_ACTIONS, null, random)
      counts[name] = (counts[name] ?? 0) + 1
    }
    expect(counts.idle! / 1000).toBeGreaterThan(0.25)
    expect((counts.fly ?? 0) / 1000).toBeLessThan(0.15)
    expect((counts.wave ?? 0) / 1000).toBeLessThan(0.15)
  })

  it('repeats the only action in a pool of one', () => {
    expect(pickAction([{ name: 'walk', weight: 1 }], 'walk', seeded(3))).toBe('walk')
  })

  it('uses the default weights', () => {
    const weights = Object.fromEntries(DEFAULT_RANDOM_ACTIONS.map((a) => [a.name, a.weight]))
    expect(weights).toEqual({ idle: 3, walk: 2, run: 1, crouch: 1, wave: 0.5, fly: 0.5 })
  })
})

describe('RandomActions', () => {
  it('changes action every 3 to 6 seconds, never repeating, marking each switch', () => {
    const player = new PlayerObject()
    const animation = new RandomActions({ random: seeded(42) })
    const step = 0.05
    let previous = animation.current
    let since = 0
    let switches = 0
    const startCount = animation.switchCount
    for (let i = 0; i < 201 * 6 * 20 && switches < 200; i++) {
      animation.update(player, step)
      since += step
      if (animation.current !== previous) {
        if (previous !== null) {
          switches++
          expect(animation.current).not.toBe(previous)
          expect(since).toBeGreaterThanOrEqual(3 - 1e-9)
          expect(since).toBeLessThanOrEqual(6 + step + 1e-9)
        }
        previous = animation.current
        since = 0
      }
    }
    expect(switches).toBe(200)
    expect(animation.switchCount - startCount).toBe(200)
  })

  const flyFirst: RandomAction[] = [
    { name: 'fly', weight: 1 },
    { name: 'idle', weight: 1 },
  ]

  it('wears a drawn elytra while flying without a cape, then takes it off', () => {
    const player = new PlayerObject()
    const animation = new RandomActions({
      actions: flyFirst,
      random: () => 0,
      minDuration: 1,
      maxDuration: 1,
    })
    run(animation, player, 0.5)
    expect(animation.current).toBe('fly')
    expect(player.elytra.visible).toBe(true)
    expect(player.hasCapeTexture).toBe(false)
    run(animation, player, 1)
    expect(animation.current).toBe('idle')
    expect(player.elytra.visible).toBe(false)
    expect(player.backEquipment).toBeNull()
  })

  it('flies with the loaded cape texture and puts the cape back afterwards', () => {
    const player = new PlayerObject()
    player.applyCape(opaqueSkin(64, 32))
    const animation = new RandomActions({
      actions: flyFirst,
      random: () => 0,
      minDuration: 1,
      maxDuration: 1,
    })
    run(animation, player, 0.5)
    expect(player.backEquipment).toBe('elytra')
    expect(player.hasCapeTexture).toBe(true)
    run(animation, player, 1)
    expect(player.backEquipment).toBe('cape')
  })

  it('takes the elytra off when a driver switches away mid-flight', () => {
    const driver = new PlayerDriver(new PlayerObject())
    driver.animation = new RandomActions({ actions: flyFirst, random: () => 0 })
    driver.update(0.5)
    expect(driver.player.elytra.visible).toBe(true)
    driver.animation = null
    expect(driver.player.elytra.visible).toBe(false)
  })

  it("is created by the name 'random'", () => {
    expect(createAnimation('random')).toBeInstanceOf(RandomActions)
  })
})
