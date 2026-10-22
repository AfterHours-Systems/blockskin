import {Quaternion, Vector3, type Object3D} from 'three';
import type {PlayerObject} from '../model/player_object.js';

export type PoseSnapshot = Map<
  Object3D,
  {position: Vector3; quaternion: Quaternion}
>;

/** Records every joint's transform, reusing `into`'s objects when given. */
export function capturePose(
  player: PlayerObject,
  into: PoseSnapshot = new Map(),
): PoseSnapshot {
  for (const joint of player.poseJoints()) {
    const entry = into.get(joint);
    if (entry) {
      entry.position.copy(joint.position);
      entry.quaternion.copy(joint.quaternion);
    } else {
      into.set(joint, {
        position: joint.position.clone(),
        quaternion: joint.quaternion.clone(),
      });
    }
  }
  return into;
}

export function restorePose(snapshot: PoseSnapshot): void {
  for (const [joint, {position, quaternion}] of snapshot) {
    joint.position.copy(position);
    joint.quaternion.copy(quaternion);
  }
}

const target = new Quaternion();

/** Blends every joint between the snapshot (weight 0) and its current transform (weight 1). */
export function blendFrom(snapshot: PoseSnapshot, weight: number): void {
  for (const [joint, {position, quaternion}] of snapshot) {
    joint.position.lerpVectors(position, joint.position, weight);
    // slerpQuaternions copies its first argument into the target first, so
    // the current rotation has to be read out before.
    target.copy(joint.quaternion);
    joint.quaternion.slerpQuaternions(quaternion, target, weight);
  }
}

export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}
