import {describe, expect, it} from 'vitest';
import {PlayerObject} from '../model/player_object.js';
import {blendFrom, capturePose, easeOut, restorePose} from './pose.js';

describe('pose snapshots', () => {
  it('restores what was captured', () => {
    const player = new PlayerObject();
    const snapshot = capturePose(player);
    player.skin.head.rotation.y = 1;
    player.position.x = 3;
    restorePose(snapshot);
    expect(player.skin.head.rotation.y).toBeCloseTo(0);
    expect(player.position.x).toBe(0);
  });

  it('blendFrom at 0 shows the snapshot and at 1 the current pose', () => {
    const player = new PlayerObject();
    const snapshot = capturePose(player);
    player.skin.body.rotation.x = Math.PI / 2;
    player.skin.body.updateMatrix();
    blendFrom(snapshot, 1);
    expect(player.skin.body.rotation.x).toBeCloseTo(Math.PI / 2);
    blendFrom(snapshot, 0);
    expect(player.skin.body.rotation.x).toBeCloseTo(0);
  });

  it('blendFrom at 0.5 sits half way', () => {
    const player = new PlayerObject();
    const snapshot = capturePose(player);
    player.skin.body.rotation.x = Math.PI / 2;
    player.position.y = 4;
    blendFrom(snapshot, 0.5);
    expect(player.skin.body.rotation.x).toBeCloseTo(Math.PI / 4);
    expect(player.position.y).toBeCloseTo(2);
  });

  it('eases out between 0 and 1', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeCloseTo(0.875);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(-1)).toBe(0);
  });
});
