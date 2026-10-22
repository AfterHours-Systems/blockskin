import { Color, Euler, Quaternion, Vector3 } from 'three'
import type { PlayerAnimation } from '../animation/PlayerAnimation.js'
import { lookAngles } from '../interaction/look.js'
import type { PokePart } from '../interaction/poke.js'
import type { PlayerObject } from '../model/PlayerObject.js'
import { blendFrom, capturePose, easeOut, restorePose, type PoseSnapshot } from './pose.js'
import { partReaction, type Reaction, type ReactionContext, type ReactionSet } from './reactions.js'

const FLASH_SECONDS = 0.4
const FLASH_COLOR = new Color(1, 0.45, 0.45)
// A reaction fades in and out over this long against the pose beneath it.
const REACTION_FADE = 0.08
const ANNOYED_POKES = 5
const ANNOYED_WINDOW = 3
// The head follows the pointer until it has been still this long.
const LOOK_IDLE = 2
const LOOK_FADE = 0.4
const LOOK_RATE = 10

interface ActiveReaction {
  reaction: Reaction
  ctx: ReactionContext
  time: number
}

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
  /** What pokes do; null (the default) turns reactions off. */
  reactions: ReactionSet | null = null

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
  private clock = 0
  private pokeTimes: number[] = []
  private active: ActiveReaction[] = []
  private flash = 0
  private readonly beneath: PoseSnapshot = new Map()
  private readonly tint = new Color()
  private lookTarget: Vector3 | null = null
  private lastLook = -Infinity
  private lookWeight = 0
  private readonly look = { yaw: 0, pitch: 0 }
  private readonly lookRotation = new Quaternion()

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

  /** Whether something is still playing out (a transition, a reaction or the flash). */
  get busy(): boolean {
    return this.from !== null || this.active.length > 0 || this.flash > 0 || this.lookWeight > 0
  }

  /** Reacts to a poke on `part`; `away` points away from the viewer in the player's parent space. */
  poke(part: PokePart, away: Vector3): void {
    const set = this.reactions
    if (!set) return
    this.pokeTimes = this.pokeTimes.filter((time) => this.clock - time < ANNOYED_WINDOW)
    this.pokeTimes.push(this.clock)
    const annoyed = this.pokeTimes.length >= ANNOYED_POKES
    if (annoyed) this.pokeTimes = []
    this.flash = FLASH_SECONDS
    const ctx = { part, away: away.clone() }
    for (const reaction of [set.any, annoyed ? set.annoyed : partReaction(set, part)]) {
      if (!reaction || (reaction.motion && this._reducedMotion)) continue
      this.active.push({ reaction, ctx, time: 0 })
    }
  }

  /** Turns the head towards a world-space point; call again as it moves. null lets go. */
  lookAt(target: Vector3 | null): void {
    if (target) {
      this.lookTarget = (this.lookTarget ?? new Vector3()).copy(target)
      this.lastLook = this.clock
    } else {
      this.lastLook = -Infinity
    }
  }

  update(deltaSeconds: number): void {
    this.clock += deltaSeconds
    if (this.layeredLastFrame) restorePose(this.base)

    const animation = this._animation
    if (animation && !this._reducedMotion) {
      animation.update(this.player, deltaSeconds)
      if (animation.switchCount !== this.lastSwitch) {
        this.lastSwitch = animation.switchCount
        this.startTransition()
      }
    }

    const looking = this.lookTarget !== null && this.clock - this.lastLook < LOOK_IDLE
    const fade = deltaSeconds / LOOK_FADE
    this.lookWeight = Math.min(1, Math.max(0, this.lookWeight + (looking ? fade : -fade)))
    const layered = this.from !== null || this.active.length > 0 || this.lookWeight > 0
    if (layered) capturePose(this.player, this.base)

    for (const entry of this.active) {
      entry.time += deltaSeconds
      const { reaction, ctx, time } = entry
      if (time >= reaction.duration) continue
      const weight = Math.min(1, time / REACTION_FADE, (reaction.duration - time) / REACTION_FADE)
      capturePose(this.player, this.beneath)
      reaction.apply(this.player, time, ctx)
      blendFrom(this.beneath, weight)
    }
    this.active = this.active.filter((entry) => entry.time < entry.reaction.duration)

    if (this.lookWeight > 0 && this.lookTarget) this.applyLook(deltaSeconds)

    if (this.from) {
      this.transitionTime += deltaSeconds
      const t = this.transitionTime / this.transition
      if (t >= 1) this.from = null
      else blendFrom(this.from, easeOut(t))
    }

    this.applyFlash(deltaSeconds)
    capturePose(this.player, this.shown)
    this.layeredLastFrame = layered
  }

  private applyLook(deltaSeconds: number): void {
    const { head } = this.player.skin
    const goal = lookAngles(head, this.lookTarget!)
    // Ease towards the goal so the head never snaps to a jumping pointer.
    const k = 1 - Math.exp(-LOOK_RATE * deltaSeconds)
    this.look.yaw += (goal.yaw - this.look.yaw) * k
    this.look.pitch += (goal.pitch - this.look.pitch) * k
    this.lookRotation.setFromEuler(new Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'))
    head.quaternion.slerp(this.lookRotation, this.lookWeight)
  }

  private applyFlash(deltaSeconds: number): void {
    if (this.flash <= 0) return
    const strength = this.flash / FLASH_SECONDS
    this.player.setTint(this.tint.setRGB(1, 1, 1).lerp(FLASH_COLOR, strength))
    this.flash = Math.max(0, this.flash - deltaSeconds)
    if (this.flash === 0) this.player.setTint(null)
  }

  dispose(): void {
    this._animation?.stop(this.player)
    this.from = null
    this.active = []
    this.flash = 0
    this.player.setTint(null)
  }
}
