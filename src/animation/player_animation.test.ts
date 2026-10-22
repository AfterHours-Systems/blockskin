import {describe, expect, it} from 'vitest';
import {PlayerObject} from '../model/player_object.js';
import {FunctionAnimation} from './player_animation.js';

describe('PlayerAnimation', () => {
  it('does not advance while paused', () => {
    const animation = new FunctionAnimation(() => {});
    animation.paused = true;
    animation.update(new PlayerObject(), 1);
    expect(animation.progress).toBe(0);
  });

  it('scales elapsed time by speed', () => {
    const animation = new FunctionAnimation(() => {});
    animation.speed = 2;
    animation.update(new PlayerObject(), 0.5);
    expect(animation.progress).toBe(1);
  });

  it('passes progress and delta to a function animation', () => {
    const calls: [number, number][] = [];
    const animation = new FunctionAnimation((player, progress, delta) =>
      calls.push([progress, delta]),
    );
    const player = new PlayerObject();
    animation.update(player, 0.25);
    animation.update(player, 0.25);
    expect(calls).toEqual([
      [0, 0.25],
      [0.25, 0.25],
    ]);
  });

  it('gives stacked animations progress from when they were added, until removed', () => {
    const animation = new FunctionAnimation(() => {});
    const player = new PlayerObject();
    animation.update(player, 1);
    const seen: number[] = [];
    const id = animation.addAnimation((player, progress) =>
      seen.push(progress),
    );
    animation.update(player, 0.5);
    animation.update(player, 0.5);
    animation.removeAnimation(id);
    animation.update(player, 0.5);
    expect(seen).toEqual([0, 0.5]);
  });

  it('ignores removeAnimation(undefined)', () => {
    expect(() =>
      new FunctionAnimation(() => {}).removeAnimation(undefined),
    ).not.toThrow();
  });
});
