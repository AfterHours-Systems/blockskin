import type { PlayerObject } from '../model/PlayerObject.js'
import { PlayerAnimation } from './PlayerAnimation.js'
import { TAU, frac, liftCape, pitchAboutCentre } from './pose.js'

// Limb angles follow the game's walk: arms and the opposite legs swing in
// counter-phase, legs 1.4× as far as arms. A positive x rotation swings a
// hanging limb backwards.
function swingLimbs(player: PlayerObject, phase: number, arm: number, leg: number): void {
  const { rightArm, leftArm, rightLeg, leftLeg } = player.skin
  const c = Math.cos(phase)
  rightArm.rotation.x = -c * arm
  leftArm.rotation.x = c * arm
  rightLeg.rotation.x = c * leg
  leftLeg.rotation.x = -c * leg
}

export interface LocomotionOptions {
  /** Let the head turn and nod gently. Off by default. */
  lookAround?: boolean
}

// A slow look around, at periods unrelated to the limbs so it never looks
// mechanical.
function lookAround(player: PlayerObject, progress: number): void {
  player.skin.head.rotation.y = Math.sin(progress * 2) * 0.2
  player.skin.head.rotation.x = Math.sin(progress * 1.6) * 0.1
}

abstract class LocomotionAnimation extends PlayerAnimation {
  lookAround: boolean

  constructor(opts: LocomotionOptions = {}) {
    super()
    this.lookAround = opts.lookAround ?? false
  }

  protected abstract pose(player: PlayerObject): void

  protected animate(player: PlayerObject): void {
    this.pose(player)
    if (this.lookAround) lookAround(player, this.progress)
  }
}

export const IDLE_PERIOD = TAU / 1.8

/** Standing still: arms drift slightly, as they do in the game. */
export class IdleAnimation extends LocomotionAnimation {
  protected pose(player: PlayerObject): void {
    const t = this.progress
    const sway = 0.05 + 0.05 * Math.cos(t * 1.8)
    const drift = 0.05 * Math.sin(t * 1.34)
    // Negative z swings the right arm outwards, positive the left.
    player.skin.rightArm.rotation.set(drift, 0, -sway)
    player.skin.leftArm.rotation.set(-drift, 0, sway)
  }
}

const WALK_SPEED = 8
export const WALK_PERIOD = TAU / WALK_SPEED

export class WalkingAnimation extends LocomotionAnimation {
  protected pose(player: PlayerObject): void {
    const phase = this.progress * WALK_SPEED
    swingLimbs(player, phase, 0.5, 0.7)
    liftCape(player, 0.2 + 0.03 * Math.sin(phase * 2))
  }
}

const RUN_SPEED = 15
export const RUN_PERIOD = TAU / RUN_SPEED

export class RunningAnimation extends LocomotionAnimation {
  protected pose(player: PlayerObject): void {
    const phase = this.progress * RUN_SPEED
    swingLimbs(player, phase, 1.0, 1.3)
    // Sprinting leans the body into the run.
    player.skin.body.rotation.x = 0.1
    liftCape(player, 0.5 + 0.06 * Math.sin(phase * 2))
  }
}

export const FLY_PERIOD = 1

/** Elytra gliding: body horizontal, head up, wings spread. */
export class FlyingAnimation extends PlayerAnimation {
  protected animate(player: PlayerObject): void {
    const t = (this.progress / FLY_PERIOD) * TAU
    pitchAboutCentre(player, Math.PI / 2)
    player.skin.head.rotation.x = -Math.PI / 4
    player.skin.rightArm.rotation.z = -0.15
    player.skin.leftArm.rotation.z = 0.15
    const { leftWing } = player.elytra
    leftWing.rotation.x = 0.35
    leftWing.rotation.z = 1.3 + 0.05 * Math.sin(t)
    player.elytra.updateRightWing()
    liftCape(player, 1.2)
  }
}

export const SWIM_PERIOD = 1.3

/** Front crawl: body horizontal, arms circling half a cycle apart, legs fluttering. */
export class SwimAnimation extends PlayerAnimation {
  protected animate(player: PlayerObject): void {
    const cycle = frac(this.progress / SWIM_PERIOD)
    pitchAboutCentre(player, Math.PI / 2)
    player.skin.head.rotation.x = -Math.PI / 3
    // A full turn per cycle, forwards over the head.
    player.skin.rightArm.rotation.x = -cycle * TAU
    player.skin.leftArm.rotation.x = -frac(cycle + 0.5) * TAU
    const kick = 0.3 * Math.sin(cycle * 2 * TAU)
    player.skin.rightLeg.rotation.x = kick
    player.skin.leftLeg.rotation.x = -kick
  }
}
