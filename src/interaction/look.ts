import {
  Raycaster,
  Vector3,
  type Camera,
  type Object3D,
  type Vector2,
} from 'three';

/** How far the head turns from the body: about ±60° sideways and ±40° up and down. */
export const LOOK_LIMITS = {
  yaw: (60 * Math.PI) / 180,
  pitch: (40 * Math.PI) / 180,
};

const local = new Vector3();

/**
 * Head angles that face a world-space point, measured in the head's parent
 * space so a turned or upside-down body is accounted for. Positive yaw turns
 * towards the body's left (+x); positive pitch tilts the head down.
 */
export function lookAngles(
  head: Object3D,
  target: Vector3,
): {yaw: number; pitch: number} {
  const parent = head.parent;
  local.copy(target);
  if (parent) {
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(local);
  }
  // Aim from the centre of the head, 4 above its pivot at the neck.
  local.sub(head.position).y -= 4;
  const yaw = Math.atan2(local.x, local.z);
  const pitch = -Math.atan2(local.y, Math.hypot(local.x, local.z));
  const clamp = (value: number, limit: number) =>
    Math.min(limit, Math.max(-limit, value));
  return {
    yaw: clamp(yaw, LOOK_LIMITS.yaw),
    pitch: clamp(pitch, LOOK_LIMITS.pitch),
  };
}

const raycaster = new Raycaster();

/** The point `distance` along the camera's ray through `ndc` (normalised device coordinates). */
export function pointerTarget(
  camera: Camera,
  ndc: Vector2,
  distance: number,
): Vector3 {
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.at(distance, new Vector3());
}

/**
 * Passive pointer listeners that report where the pointer is: on moves, and
 * on presses, because a touch tap fires no move. They never block scrolling.
 * Returns the cleanup.
 */
export function addPointerListener(
  target: Window | HTMLElement,
  onMove: (event: PointerEvent) => void,
): () => void {
  const handler = onMove as EventListener;
  target.addEventListener('pointermove', handler, {passive: true});
  target.addEventListener('pointerdown', handler, {passive: true});
  return () => {
    target.removeEventListener('pointermove', handler);
    target.removeEventListener('pointerdown', handler);
  };
}
