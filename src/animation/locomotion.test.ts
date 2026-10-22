import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { PlayerObject } from '../model/PlayerObject.js'
import {
  FlyingAnimation,
  IdleAnimation,
  RUN_PERIOD,
  RunningAnimation,
  SWIM_PERIOD,
  SwimAnimation,
  WALK_PERIOD,
  WalkingAnimation,
} from './locomotion.js'
import { foot, hand, runTo } from './testProbe.js'

function limbAngles(player: PlayerObject): number[] {
  const { rightArm, leftArm, rightLeg, leftLeg } = player.skin
  return [rightArm, leftArm, rightLeg, leftLeg].map((part) => part.rotation.x)
}

function peakLegAngle(make: () => WalkingAnimation | RunningAnimation, period: number): number {
  const player = new PlayerObject()
  const animation = make()
  let peak = 0
  for (let i = 0; i <= 40; i++) {
    runTo(animation, player, (period * i) / 40)
    peak = Math.max(peak, Math.abs(player.skin.rightLeg.rotation.x))
  }
  return peak
}

describe('WalkingAnimation', () => {
  it('swings one foot forward while the other and its same-side hand go back', () => {
    const player = new PlayerObject()
    const walk = new WalkingAnimation()
    runTo(walk, player, WALK_PERIOD / 2)
    const forward = foot(player, 'left').z > foot(player, 'right').z ? 'left' : 'right'
    const back = forward === 'left' ? 'right' : 'left'
    expect(foot(player, forward).z).toBeGreaterThan(0.5)
    expect(foot(player, back).z).toBeLessThan(-0.5)
    expect(hand(player, forward).z).toBeLessThan(0)
    expect(hand(player, back).z).toBeGreaterThan(0)
  })

  it('repeats after one period', () => {
    const a = new PlayerObject()
    const b = new PlayerObject()
    runTo(new WalkingAnimation(), a, 0.13)
    runTo(new WalkingAnimation(), b, 0.13 + WALK_PERIOD)
    limbAngles(a).forEach((angle, i) => expect(limbAngles(b)[i]).toBeCloseTo(angle, 6))
  })

  it('keeps every limb within 0.9 rad', () => {
    const player = new PlayerObject()
    const walk = new WalkingAnimation()
    for (let i = 0; i <= 40; i++) {
      runTo(walk, player, (WALK_PERIOD * i) / 40)
      for (const angle of limbAngles(player)) expect(Math.abs(angle)).toBeLessThanOrEqual(0.9)
    }
  })
})

describe('RunningAnimation', () => {
  it('swings legs further, lifts the cape more and cycles faster than walking', () => {
    expect(peakLegAngle(() => new RunningAnimation(), RUN_PERIOD)).toBeGreaterThan(
      peakLegAngle(() => new WalkingAnimation(), WALK_PERIOD),
    )
    const walker = new PlayerObject()
    const runner = new PlayerObject()
    runTo(new WalkingAnimation(), walker, 0.2)
    runTo(new RunningAnimation(), runner, 0.2)
    expect(runner.cape.rotation.x).toBeGreaterThan(walker.cape.rotation.x)
    expect(RUN_PERIOD).toBeLessThan(WALK_PERIOD)
  })
})

describe('IdleAnimation', () => {
  it('sways the arms by at most 0.1 rad without crossing into the body', () => {
    const player = new PlayerObject()
    const idle = new IdleAnimation()
    for (let t = 0; t <= 5; t += 0.1) {
      runTo(idle, player, t)
      expect(Math.abs(player.skin.rightArm.rotation.z)).toBeLessThanOrEqual(0.1)
      expect(Math.abs(player.skin.leftArm.rotation.z)).toBeLessThanOrEqual(0.1)
      expect(hand(player, 'right').x).toBeLessThan(-4)
      expect(hand(player, 'left').x).toBeGreaterThan(4)
    }
  })
})

function bodyAxisAngleFromVertical(player: PlayerObject): number {
  player.updateMatrixWorld(true)
  const top = player.skin.head.localToWorld(new Vector3(0, 8, 0))
  const feet = player.skin.rightLeg.localToWorld(new Vector3(0, -12, 0))
  const axis = top.sub(feet).normalize()
  return Math.acos(Math.abs(axis.y))
}

describe('FlyingAnimation', () => {
  it('lies the body down and spreads the wings past their rest pose', () => {
    const player = new PlayerObject()
    const restWing = player.elytra.leftWing.rotation.z
    runTo(new FlyingAnimation(), player, 0.3)
    expect(bodyAxisAngleFromVertical(player)).toBeGreaterThan((60 * Math.PI) / 180)
    expect(player.elytra.leftWing.rotation.z).toBeGreaterThan(restWing)
    expect(player.elytra.rightWing.rotation.z).toBeCloseTo(-player.elytra.leftWing.rotation.z)
  })

  it('keeps the player centred where it stood', () => {
    const player = new PlayerObject()
    runTo(new FlyingAnimation(), player, 0.3)
    player.updateMatrixWorld(true)
    const centre = new Vector3(0, 16, 0).applyMatrix4(player.matrixWorld)
    expect(centre.y).toBeCloseTo(16)
    expect(centre.z).toBeCloseTo(0)
  })
})

describe('SwimAnimation', () => {
  it('lies near horizontal', () => {
    const player = new PlayerObject()
    runTo(new SwimAnimation(), player, 0.4)
    expect(bodyAxisAngleFromVertical(player)).toBeGreaterThan((60 * Math.PI) / 180)
  })

  it('takes each arm round a full loop per period, half a loop apart', () => {
    const player = new PlayerObject()
    const swim = new SwimAnimation()
    const angles: number[] = []
    for (let i = 0; i < 4; i++) {
      runTo(swim, player, (SWIM_PERIOD * i) / 4 + 0.01)
      angles.push(player.skin.rightArm.rotation.x)
    }
    const quarter = -Math.PI / 2
    for (let i = 1; i < 4; i++) expect(angles[i]! - angles[0]!).toBeCloseTo(quarter * i, 5)
    const diff = player.skin.leftArm.rotation.x - player.skin.rightArm.rotation.x
    expect(Math.abs(Math.cos(diff) + 1)).toBeLessThan(1e-6)
  })
})

describe('lookAround', () => {
  const kinds = [
    ['idle', (o?: { lookAround?: boolean }) => new IdleAnimation(o)],
    ['walk', (o?: { lookAround?: boolean }) => new WalkingAnimation(o)],
    ['run', (o?: { lookAround?: boolean }) => new RunningAnimation(o)],
  ] as const

  it.each(kinds)('%s keeps the head still by default', (_, make) => {
    const player = new PlayerObject()
    const animation = make()
    for (let t = 0; t <= 3; t += 0.25) {
      runTo(animation, player, t)
      expect(player.skin.head.rotation.x).toBe(0)
      expect(player.skin.head.rotation.y).toBe(0)
    }
  })

  it.each(kinds)('%s turns the head gently with lookAround', (_, make) => {
    const player = new PlayerObject()
    const animation = make({ lookAround: true })
    let moved = 0
    for (let t = 0; t <= 3; t += 0.25) {
      runTo(animation, player, t)
      const { x, y } = player.skin.head.rotation
      expect(Math.abs(y)).toBeLessThanOrEqual(0.2)
      expect(Math.abs(x)).toBeLessThanOrEqual(0.1)
      moved = Math.max(moved, Math.abs(y))
    }
    expect(moved).toBeGreaterThan(0.1)
  })

  it('leaves the walk cycle itself unchanged', () => {
    const plain = new PlayerObject()
    const looking = new PlayerObject()
    runTo(new WalkingAnimation(), plain, 0.4)
    runTo(new WalkingAnimation({ lookAround: true }), looking, 0.4)
    expect(limbAngles(looking)).toEqual(limbAngles(plain))
  })
})
