import type { Vector3 } from 'three'
import { applyCrouchPose } from '../animation/actions.js'
import type { PokePart } from '../interaction/poke.js'
import type { PlayerObject } from '../model/PlayerObject.js'

export interface ReactionContext {
  part: PokePart
  /** Unit vector pointing away from the viewer, in the player's parent space. */
  away: Vector3
}

export interface Reaction {
  /** Seconds. */
  duration: number
  /** Whether it moves the player; such reactions are skipped under reduced motion. */
  motion: boolean
  /** Poses the player at `t` seconds into the reaction, on top of the animation's pose. */
  apply(player: PlayerObject, t: number, ctx: ReactionContext): void
}

/** The game's hurt knockback: a small step away from the viewer with a hop. */
export const hurt: Reaction = {
  duration: 0.4,
  motion: true,
  apply(player, t, { away }) {
    const s = Math.sin(Math.PI * Math.min(1, t / 0.4))
    player.position.addScaledVector(away, 3 * s)
    player.position.y += 2 * s
  },
}

export const shakeHead: Reaction = {
  duration: 0.6,
  motion: true,
  apply(player, t) {
    const progress = t / 0.6
    // Added to whatever the head is doing, so it shakes while looking around.
    player.skin.head.rotation.y += 0.5 * Math.sin(progress * Math.PI * 2 * 3) * (1 - progress)
  },
}

export const waveBack: Reaction = {
  duration: 1,
  motion: true,
  apply(player, t, { part }) {
    const left = part === 'leftArm'
    const arm = left ? player.skin.leftArm : player.skin.rightArm
    const side = left ? 1 : -1
    arm.rotation.set(Math.PI, 0, side * (0.3 + 0.5 * Math.sin(t * Math.PI * 4)))
  },
}

export const jump: Reaction = {
  duration: 0.5,
  motion: true,
  apply(player, t) {
    player.position.y += 4 * Math.sin(Math.PI * Math.min(1, t / 0.5))
  },
}

/** Minecraft's crouch-spam "hello": in and out four times a second. */
export const crouchSpam: Reaction = {
  duration: 2,
  motion: true,
  apply(player, t) {
    applyCrouchPose(player, Math.floor(t * 8) % 2)
  },
}

export interface ReactionSet {
  /** Runs on every poke. */
  any?: Reaction | null
  head?: Reaction | null
  body?: Reaction | null
  /** Either arm; the context says which. */
  arm?: Reaction | null
  /** Either leg. */
  leg?: Reaction | null
  /** Replaces the part reaction on the 5th poke within 3 seconds. */
  annoyed?: Reaction | null
}

export const DEFAULT_REACTIONS: ReactionSet = {
  any: hurt,
  head: shakeHead,
  body: null,
  arm: waveBack,
  leg: jump,
  annoyed: crouchSpam,
}

export function partReaction(set: ReactionSet, part: PokePart): Reaction | null | undefined {
  switch (part) {
    case 'head':
      return set.head
    case 'body':
      return set.body
    case 'rightArm':
    case 'leftArm':
      return set.arm
    case 'rightLeg':
    case 'leftLeg':
      return set.leg
  }
}
