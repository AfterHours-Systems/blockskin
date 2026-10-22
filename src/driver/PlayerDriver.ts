import type { PlayerAnimation } from '../animation/PlayerAnimation.js'
import type { PlayerObject } from '../model/PlayerObject.js'
import { blendFrom, capturePose, easeOut, restorePose, type PoseSnapshot } from './pose.js'

export interface PlayerDriverOptions {
  /** Seconds to blend between animations; 0 snaps. Defaults to 0.25. */
  transition?: number
}

/**
 * Runs a player's animation each frame and layers the extras on top. While
 * nothing is layered it does exactly what a bare animation does, so manual
 * poses keep working as in v1.
 */
export class PlayerDriver {
  readonly player: PlayerObject
  transition: number

  private _animation: PlayerAnimation | null = null
  private _reducedMotion = false
  private lastSwitch = 0
  // The pose the animation produced, before anything was layered on it.
  private readonly base: PoseSnapshot = new Map()
  // The pose actually shown last frame; transitions start from it.
  private readonly shown: PoseSnapshot
  private from: PoseSnapshot | null = null
  private transitionTime = 0
  private layeredLastFrame = false

  constructor(player: PlayerObject, options: PlayerDriverOptions = {}) {
    this.player = player
    this.transition = options.transition ?? 0.25
    this.shown = capturePose(player)
  }

  get animation(): PlayerAnimation | null {
    return this._animation
  }

  /** Switching resets the pose, as v1 did, and blends over from what was shown. */
  set animation(animation: PlayerAnimation | null) {
    if (animation === this._animation) return
    this._animation?.stop(this.player)
    this.startTransition()
    this.player.resetPose()
    // The stored base pose belongs to the old animation.
    this.layeredLastFrame = false
    if (animation) animation.progress = 0
    this._animation = animation
    this.lastSwitch = animation?.switchCount ?? 0
  }

  get reducedMotion(): boolean {
    return this._reducedMotion
  }

  /** Holds the rest pose instead of animating. */
  set reducedMotion(value: boolean) {
    if (value === this._reducedMotion) return
    this._reducedMotion = value
    if (value) {
      this.startTransition()
      this.player.resetPose()
      this.layeredLastFrame = false
    }
  }

  private startTransition(): void {
    if (this.transition <= 0) {
      this.from = null
      return
    }
    this.from = new Map(
      [...this.shown].map(([joint, { position, quaternion }]) => [
        joint,
        { position: position.clone(), quaternion: quaternion.clone() },
      ]),
    )
    this.transitionTime = 0
  }

  update(deltaSeconds: number): void {
    if (this.layeredLastFrame) restorePose(this.base)

    const animation = this._animation
    if (animation && !this._reducedMotion) {
      animation.update(this.player, deltaSeconds)
      if (animation.switchCount !== this.lastSwitch) {
        this.lastSwitch = animation.switchCount
        this.startTransition()
      }
    }

    const layered = this.from !== null
    if (layered) capturePose(this.player, this.base)

    if (this.from) {
      this.transitionTime += deltaSeconds
      const t = this.transitionTime / this.transition
      if (t >= 1) this.from = null
      else blendFrom(this.from, easeOut(t))
    }

    capturePose(this.player, this.shown)
    this.layeredLastFrame = layered
  }

  dispose(): void {
    this._animation?.stop(this.player)
    this.from = null
  }
}
