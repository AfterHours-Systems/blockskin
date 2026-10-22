import { Matrix4, Vector3, type Camera, type Object3D, type Raycaster } from 'three'
import { BodyPart, CapeObject, ElytraObject, PlayerObject } from '../model/PlayerObject.js'

export type PokePart = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'

export interface PointerSample {
  /** CSS pixels. */
  x: number
  y: number
  /** Milliseconds. */
  time: number
}

/** A press counts as a poke when it is short and still; anything else is a drag. */
export function isPoke(down: PointerSample, up: PointerSample): boolean {
  return up.time - down.time < 300 && Math.hypot(up.x - down.x, up.y - down.y) < 6
}

/**
 * The body part a hit object belongs to. Ears sit on the head; a cape or an
 * elytra counts as the body. Hidden objects (or ones with a hidden ancestor)
 * and objects outside a player give null.
 */
export function partFromObject(object: Object3D): PokePart | null {
  let part: PokePart | null = null
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return null
    if (!part && node instanceof BodyPart) part = node.name as PokePart
    if (!part && (node instanceof CapeObject || node instanceof ElytraObject)) part = 'body'
    if (node instanceof PlayerObject) return part
  }
  return null
}

/** The body part the ray hits first, skipping hidden objects. */
export function findPokedPart(raycaster: Raycaster, player: PlayerObject): PokePart | null {
  for (const hit of raycaster.intersectObject(player, true)) {
    const part = partFromObject(hit.object)
    if (part) return part
  }
  return null
}

const inverse = new Matrix4()

/**
 * The horizontal direction from the camera through the player, in the
 * player's parent space: the way a poke should push it.
 */
export function awayFromCamera(camera: Camera, player: Object3D): Vector3 {
  const from = camera.getWorldPosition(new Vector3())
  const direction = player.getWorldPosition(new Vector3()).sub(from)
  if (player.parent) direction.transformDirection(inverse.copy(player.parent.matrixWorld).invert())
  direction.y = 0
  // A camera straight above the player has no horizontal direction to use.
  return direction.lengthSq() > 1e-9 ? direction.normalize() : direction.set(0, 0, -1)
}
