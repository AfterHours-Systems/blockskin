import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { PlayerObject } from '../model/PlayerObject.js'
import {
  CROUCH_PERIOD,
  CrouchAnimation,
  HIT_PERIOD,
  HitAnimation,
  WaveAnimation,
} from './actions.js'
import { ANIMATION_NAMES, createAnimation } from './index.js'
import { bodyBottom, hand, runTo } from './testProbe.js'

function shoulder(player: PlayerObject, side: 'right' | 'left'): Vector3 {
  player.updateMatrixWorld(true)
  const arm = side === 'right' ? player.skin.rightArm : player.skin.leftArm
  return arm.getWorldPosition(new Vector3())
}

describe('WaveAnimation', () => {
  it.each(['right', 'left'] as const)(
    'raises the %s hand above its shoulder and leaves the other arm',
    (side) => {
      const player = new PlayerObject()
      const wave = new WaveAnimation({ arm: side })
      const other = side === 'right' ? player.skin.leftArm : player.skin.rightArm
      for (let t = 0; t <= 2; t += 0.1) {
        runTo(wave, player, t)
        expect(hand(player, side).y).toBeGreaterThan(shoulder(player, side).y)
        expect(other.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
      }
    },
  )

  it('waves the left arm by default, as skinview3d does', () => {
    expect(new WaveAnimation().arm).toBe('left')
  })

  it("takes skinview3d's string argument", () => {
    expect(new WaveAnimation('right').arm).toBe('right')
    expect(new WaveAnimation('left').arm).toBe('left')
  })
})

describe('HitAnimation', () => {
  it('punches forward and returns to rest each period', () => {
    const player = new PlayerObject()
    const hit = new HitAnimation()
    let reach = -Infinity
    for (let i = 0; i <= 20; i++) {
      runTo(hit, player, (HIT_PERIOD * i) / 20)
      reach = Math.max(reach, hand(player, 'right').z)
    }
    expect(reach).toBeGreaterThan(3)
    runTo(hit, player, HIT_PERIOD)
    expect(player.skin.rightArm.rotation.x).toBeCloseTo(0, 6)
  })
})

describe('CrouchAnimation', () => {
  const full = CROUCH_PERIOD * 0.75

  it('snaps between standing and crouched by default', () => {
    const player = new PlayerObject()
    const crouch = new CrouchAnimation()
    for (let i = 0; i <= 40; i++) {
      runTo(crouch, player, (CROUCH_PERIOD * 2 * i) / 40)
      expect([0, 0.5]).toContainEqual(Number(player.skin.body.rotation.x.toFixed(6)))
    }
  })

  it('leans forward with the hips behind the neck and the head 4.2 lower', () => {
    const player = new PlayerObject()
    runTo(new CrouchAnimation(), player, full)
    expect(player.skin.body.rotation.x).toBeCloseTo(0.5)
    expect(bodyBottom(player).z).toBeLessThan(0)
    expect(player.skin.head.position.y).toBeCloseTo(24 - 4.2)
  })

  it('spreads the elytra wings when crouched', () => {
    const player = new PlayerObject()
    const rest = player.elytra.leftWing.rotation.z
    runTo(new CrouchAnimation(), player, full)
    expect(player.elytra.leftWing.rotation.z).toBeGreaterThan(rest)
  })

  it('stays crouched after the first transition with runOnce', () => {
    const player = new PlayerObject()
    const crouch = new CrouchAnimation()
    crouch.runOnce = true
    runTo(crouch, player, CROUCH_PERIOD * 3.1)
    expect(player.skin.body.rotation.x).toBeCloseTo(0.5)
  })

  it('passes through partial depths with showProgress', () => {
    const player = new PlayerObject()
    const crouch = new CrouchAnimation()
    crouch.showProgress = true
    runTo(crouch, player, CROUCH_PERIOD * 0.25)
    expect(player.skin.body.rotation.x).toBeGreaterThan(0.05)
    expect(player.skin.body.rotation.x).toBeLessThan(0.45)
  })

  it('punches while crouched once a hit is added', () => {
    const player = new PlayerObject()
    const crouch = new CrouchAnimation()
    runTo(crouch, player, full)
    const before = player.skin.rightArm.rotation.x
    crouch.addHitAnimation()
    runTo(crouch, player, full + HIT_PERIOD / 2)
    expect(player.skin.rightArm.rotation.x).toBeLessThan(before - 1)
  })
})

describe('createAnimation', () => {
  it.each(ANIMATION_NAMES)('creates %s', (name) => {
    const animation = createAnimation(name)
    expect(() => animation.update(new PlayerObject(), 0.1)).not.toThrow()
    expect(animation.progress).toBeCloseTo(0.1)
  })

  it('covers every name', () => {
    expect([...ANIMATION_NAMES].sort()).toEqual([
      'crouch',
      'fly',
      'hit',
      'idle',
      'run',
      'swim',
      'walk',
      'wave',
    ])
  })
})
