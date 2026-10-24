import {describe, expect, it} from 'vitest';
import {WalkingAnimation} from '../animation/locomotion.js';
import {FunctionAnimation} from '../animation/player_animation.js';
import {PlayerObject} from '../model/player_object.js';
import {opaqueSkin} from '../format/test_pixels.js';
import type {Pixels} from '../format/pixels.js';
import {applyLayers, loadBackEquipment, resolveAnimation} from './props.js';

describe('resolveAnimation', () => {
  it('creates a built-in animation from its name', () => {
    expect(resolveAnimation('walk', null)).toBeInstanceOf(WalkingAnimation);
  });

  it('keeps the running animation when the same name comes again', () => {
    const walk = resolveAnimation('walk', null);
    expect(resolveAnimation('walk', walk)).toBe(walk);
  });

  it('switches when the name changes', () => {
    const walk = resolveAnimation('walk', null);
    expect(resolveAnimation('run', walk)).not.toBe(walk);
  });

  it('returns a passed animation as is', () => {
    const own = new WalkingAnimation();
    expect(resolveAnimation(own, null)).toBe(own);
  });

  it('wraps a function, and keeps that wrapper when a new inline function arrives', () => {
    const first = resolveAnimation(() => {}, null);
    expect(first).toBeInstanceOf(FunctionAnimation);
    const next = () => {};
    const second = resolveAnimation(next, first);
    expect(second).toBe(first);
    expect((second as FunctionAnimation).fn).toBe(next);
  });

  it('does not reuse a function animation the caller made', () => {
    const own = new FunctionAnimation(() => {});
    expect(resolveAnimation(() => {}, own)).not.toBe(own);
  });

  it('returns null for null and undefined', () => {
    expect(resolveAnimation(null, resolveAnimation('walk', null))).toBeNull();
    expect(resolveAnimation(undefined, null)).toBeNull();
  });
});

describe('applyLayers', () => {
  it('hides only the named layers', () => {
    const player = new PlayerObject();
    applyLayers(player, {head: {outer: false}, leftLeg: {inner: false}});
    expect(player.skin.head.outer.visible).toBe(false);
    expect(player.skin.head.inner.visible).toBe(true);
    expect(player.skin.leftLeg.inner.visible).toBe(false);
    expect(player.skin.body.outer.visible).toBe(true);
  });

  it('shows everything again when layers is cleared', () => {
    const player = new PlayerObject();
    applyLayers(player, {body: {inner: false, outer: false}});
    applyLayers(player, undefined);
    expect(player.skin.body.inner.visible).toBe(true);
    expect(player.skin.body.outer.visible).toBe(true);
  });
});

describe('loadBackEquipment', () => {
  it('shows the equipment chosen while the cape was still loading', async () => {
    const player = new PlayerObject();
    let wanted: 'cape' | 'elytra' | null = 'cape';
    let release!: (p: Pixels) => void;
    const loading = loadBackEquipment(
      player,
      'cape.png',
      () => wanted,
      undefined,
      () => new Promise(r => (release = r)),
    );
    wanted = 'elytra';
    release(opaqueSkin(64, 32));
    await loading;
    expect(player.backEquipment).toBe('elytra');
    expect(player.cape.visible).toBe(false);
    expect(player.elytra.visible).toBe(true);
  });

  it('keeps a loaded cape hidden when none is wanted', async () => {
    const player = new PlayerObject();
    await loadBackEquipment(
      player,
      'cape.png',
      () => null,
      undefined,
      async () => opaqueSkin(64, 32),
    );
    expect(player.backEquipment).toBeNull();
  });

  it('clears the equipment for a null cape', async () => {
    const player = new PlayerObject();
    await loadBackEquipment(
      player,
      'cape.png',
      () => 'cape',
      undefined,
      async () => opaqueSkin(64, 32),
    );
    await loadBackEquipment(player, null, () => 'cape');
    expect(player.backEquipment).toBeNull();
  });
});
