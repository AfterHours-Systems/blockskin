import type { PlayerObject } from '../model/PlayerObject.js'
import { PlayerAnimation } from './PlayerAnimation.js'
import { frac, lerp } from './pose.js'

export const WAVE_PERIOD = 1

export class WaveAnimation extends PlayerAnimation {
  readonly arm: 'left' | 'right'

  /** Accepts skinview3d's `new WaveAnimation('right')` form too. Defaults to the left arm, as there. */
  constructor(opts: { arm?: 'left' | 'right' } | 'left' | 'right' = {}) {
    super()
    this.arm = (typeof opts === 'string' ? opts : opts.arm) ?? 'left'
  }

  protected animate(player: PlayerObject): void {
    const side = this.arm === 'right' ? -1 : 1
    const arm = this.arm === 'right' ? player.skin.rightArm : player.skin.leftArm
    const sway = Math.sin((this.progress / WAVE_PERIOD) * Math.PI * 2) * 0.5
    // Straight up, then rocked side to side; the outward lean keeps the hand
    // clear of the head.
    arm.rotation.set(Math.PI, 0, side * (0.3 + sway))
  }
}

export const HIT_PERIOD = 0.35

/** How far into the current swing the arm is: 0 at rest, 1 at full reach. */
function swing(progress: number): number {
  return Math.sin(Math.PI * frac(progress / HIT_PERIOD))
}

function applyHit(player: PlayerObject, progress: number, crouched: number): void {
  const s = swing(progress)
  const { rightArm, body } = player.skin
  rightArm.rotation.x = -1.8 * s + 0.4 * crouched
  rightArm.rotation.z = 0.3 * s
  body.rotation.y = 0.3 * s
}

/** Repeated punches with the right arm. */
export class HitAnimation extends PlayerAnimation {
  protected animate(player: PlayerObject): void {
    applyHit(player, this.progress, 0)
  }
}

export const CROUCH_PERIOD = 0.5

const DEG = Math.PI / 180

/**
 * The game's sneak pose at depth `d` (0 standing, 1 crouched): the body leans
 * forward around the neck and drops, the legs move back to stay under the
 * hips, and an elytra spreads.
 */
export function applyCrouchPose(player: PlayerObject, d: number): void {
  const { head, body, rightArm, leftArm, rightLeg, leftLeg } = player.skin
  const lean = 0.5 * d
  body.rotation.x = lean
  body.position.y = 24 - 3.2 * d
  head.position.y = 24 - 4.2 * d
  for (const arm of [rightArm, leftArm]) {
    arm.rotation.x = 0.4 * d
    arm.position.y = (player.skin.modelType === 'slim' ? 21.5 : 22) - 3.2 * d
  }
  for (const leg of [rightLeg, leftLeg]) {
    leg.position.z = -4 * d
    leg.position.y = 12 - 0.2 * d
  }
  // The cape and elytra hang from the top of the back, which the lean
  // swings up and back.
  const backY = 24 - 3.2 * d + 2 * Math.sin(lean)
  const backZ = -2 * Math.cos(lean)
  player.cape.position.set(0, backY, backZ)
  player.cape.rotation.x = 6 * DEG + lean
  player.elytra.position.set(0, backY, backZ)
  player.elytra.rotation.x = lean
  const { leftWing } = player.elytra
  leftWing.rotation.set(
    lerp(15 * DEG, 40 * DEG, d),
    lerp(0, -5 * DEG, d),
    lerp(15 * DEG, 45 * DEG, d),
  )
  leftWing.position.y = -3 * d
  player.elytra.updateRightWing()
}

export class CrouchAnimation extends PlayerAnimation {
  /** Run the transition once and stay crouched. */
  runOnce = false
  /**
   * Animate the transition. The game has none, so by default the pose snaps
   * between standing and crouched.
   */
  showProgress = false
  private hitSpeed: number | null = null
  private hitProgress = 0

  /**
   * Punch while crouching. `speed` is the hit's own speed and defaults to
   * this animation's current speed, as in skinview3d. The hit keeps its own
   * clock, so changing `speed` later never makes it jump; at speed 0 both
   * stop.
   */
  addHitAnimation(speed: number = this.speed): void {
    this.hitSpeed = speed
    this.hitProgress = 0
  }

  private depth(): number {
    const cycle = this.progress / CROUCH_PERIOD
    if (this.runOnce && cycle >= 0.5) return 1
    if (!this.showProgress) return Math.floor(cycle * 2) % 2 === 1 ? 1 : 0
    return (1 - Math.cos(cycle * Math.PI * 2)) / 2
  }

  protected animate(player: PlayerObject, delta: number): void {
    const d = this.depth()
    applyCrouchPose(player, d)

    if (this.hitSpeed !== null) {
      // delta is real time scaled by this.speed; undo that, apply the hit's own.
      if (this.speed !== 0) this.hitProgress += (delta / this.speed) * this.hitSpeed
      applyHit(player, this.hitProgress, d)
    }
  }
}
