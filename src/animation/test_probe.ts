import {Vector3} from 'three';
import type {PlayerObject} from '../model/player_object.js';

function endOf(
  player: PlayerObject,
  part: 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg' | 'body',
) {
  player.updateMatrixWorld(true);
  const mesh = player.skin[part].inner;
  mesh.geometry.computeBoundingBox();
  const bottom = new Vector3(0, mesh.geometry.boundingBox!.min.y, 0);
  return mesh.localToWorld(bottom);
}

export const hand = (player: PlayerObject, side: 'right' | 'left') =>
  endOf(player, side === 'right' ? 'rightArm' : 'leftArm');
export const foot = (player: PlayerObject, side: 'right' | 'left') =>
  endOf(player, side === 'right' ? 'rightLeg' : 'leftLeg');
export const bodyBottom = (player: PlayerObject) => endOf(player, 'body');

/** Runs an animation forward to `progress` seconds in small steps. */
export function runTo(
  animation: {update(player: PlayerObject, dt: number): void; progress: number},
  player: PlayerObject,
  progress: number,
): void {
  while (animation.progress < progress - 1e-9) {
    animation.update(player, Math.min(1 / 120, progress - animation.progress));
  }
  // One more zero-length step applies the pose for exactly this progress.
  animation.update(player, 0);
}
