import {
  Matrix4,
  Vector3,
  type Camera,
  type Object3D,
  type Raycaster,
} from 'three';
import {
  BodyPart,
  CapeObject,
  ElytraObject,
  PlayerObject,
} from '../model/player_object.js';

export type PokePart =
  'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';

export interface PointerSample {
  /** CSS pixels. */
  x: number;
  y: number;
  /** Milliseconds. */
  time: number;
}

/** A press counts as a poke when it is short and still; anything else is a drag. */
const POKE_MS = 300;
const POKE_PX = 6;

export function isPoke(down: PointerSample, up: PointerSample): boolean {
  return (
    up.time - down.time < POKE_MS &&
    Math.hypot(up.x - down.x, up.y - down.y) < POKE_PX
  );
}

/**
 * The body part a hit object belongs to. Ears sit on the head; a cape or an
 * elytra counts as the body. Hidden objects (or ones with a hidden ancestor)
 * and objects outside a player give null.
 */
export function partFromObject(object: Object3D): PokePart | null {
  let part: PokePart | null = null;
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return null;
    if (!part && node instanceof BodyPart) part = node.name as PokePart;
    if (!part && (node instanceof CapeObject || node instanceof ElytraObject))
      part = 'body';
    if (node instanceof PlayerObject) return part;
  }
  return null;
}

/** The body part the ray hits first, skipping hidden objects. */
export function findPokedPart(
  raycaster: Raycaster,
  player: PlayerObject,
): PokePart | null {
  for (const hit of raycaster.intersectObject(player, true)) {
    const part = partFromObject(hit.object);
    if (part) return part;
  }
  return null;
}

const inverse = new Matrix4();

/**
 * The horizontal direction from the camera through the player, in the
 * player's parent space: the way a poke should push it.
 */
export function awayFromCamera(camera: Camera, player: Object3D): Vector3 {
  const from = camera.getWorldPosition(new Vector3());
  const direction = player.getWorldPosition(new Vector3()).sub(from);
  if (player.parent)
    direction.transformDirection(
      inverse.copy(player.parent.matrixWorld).invert(),
    );
  direction.y = 0;
  // A camera straight above the player has no horizontal direction to use.
  return direction.lengthSq() > 1e-9
    ? direction.normalize()
    : direction.set(0, 0, -1);
}

export interface PokePointer extends PointerSample {
  pointerId: number;
  /** 0 is the primary button (and every touch or pen contact). */
  button: number;
}

export interface PokeTracker {
  down(pointer: PokePointer): void;
  /** Whether this release completes a poke. */
  up(pointer: PokePointer): boolean;
  cancel(pointerId: number): void;
}

/**
 * Tells pokes from everything else, per pointer: only the primary button
 * counts, and a gesture with more than one pointer down (a pinch, a
 * two-finger tap) is never a poke.
 */
export function createPokeTracker(): PokeTracker {
  const downs = new Map<number, PointerSample>();
  let multiTouch = false;
  const settle = () => {
    if (downs.size === 0) multiTouch = false;
  };
  return {
    down(pointer) {
      if (pointer.button !== 0) return;
      // A press older than a poke can last is only a leftover whose release
      // went elsewhere; it can't be part of the same gesture.
      for (const [id, earlier] of downs) {
        if (pointer.time - earlier.time >= POKE_MS) downs.delete(id);
      }
      settle();
      downs.set(pointer.pointerId, pointer);
      if (downs.size > 1) multiTouch = true;
    },
    up(pointer) {
      const down = downs.get(pointer.pointerId);
      downs.delete(pointer.pointerId);
      const gesture = multiTouch;
      settle();
      return down !== undefined && !gesture && isPoke(down, pointer);
    },
    cancel(pointerId) {
      downs.delete(pointerId);
      settle();
    },
  };
}

/** The parts of a DOM pointer event the tracker needs. */
export function pokePointer(event: PointerEvent): PokePointer {
  return {
    pointerId: event.pointerId,
    button: event.button,
    x: event.clientX,
    y: event.clientY,
    time: event.timeStamp,
  };
}
