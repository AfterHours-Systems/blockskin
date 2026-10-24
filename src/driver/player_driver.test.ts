import type {Object3D} from 'three';
import {describe, expect, it} from 'vitest';
import {IdleAnimation, WalkingAnimation} from '../animation/locomotion.js';
import {PlayerAnimation} from '../animation/player_animation.js';
import {PlayerObject} from '../model/player_object.js';
import {PlayerDriver} from './player_driver.js';

function pose(player: PlayerObject): number[] {
  return player
    .poseJoints()
    .flatMap((joint: Object3D) => [
      ...joint.position.toArray(),
      ...joint.quaternion.toArray(),
    ]);
}

function expectSamePose(a: number[], b: number[]) {
  expect(a.length).toBe(b.length);
  a.forEach((value, i) => expect(b[i]).toBeCloseTo(value, 9));
}

function walkFor(driver: PlayerDriver, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) driver.update(0.05);
}

class Switcher extends PlayerAnimation {
  protected animate(player: PlayerObject): void {
    player.skin.body.rotation.x = this.progress < 1 ? 0 : 1;
  }
  flip() {
    this.markSwitch();
  }
}

describe('PlayerDriver transitions', () => {
  it('starts a transition from the pose shown before the switch', () => {
    const driver = new PlayerDriver(new PlayerObject());
    driver.animation = new WalkingAnimation();
    walkFor(driver, 0.3);
    const walking = pose(driver.player);
    driver.animation = new IdleAnimation();
    driver.update(0);
    expectSamePose(walking, pose(driver.player));
  });

  it('shows the new animation alone once the transition time has passed', () => {
    const driver = new PlayerDriver(new PlayerObject());
    driver.animation = new WalkingAnimation();
    walkFor(driver, 0.3);
    driver.animation = new IdleAnimation();
    driver.update(0);
    driver.update(0.25);

    const pure = new PlayerObject();
    const idle = new IdleAnimation();
    idle.update(pure, 0);
    idle.update(pure, 0.25);
    expectSamePose(pose(pure), pose(driver.player));
  });

  it('snaps with transition 0', () => {
    const driver = new PlayerDriver(new PlayerObject(), {transition: 0});
    driver.animation = new WalkingAnimation();
    walkFor(driver, 0.3);
    driver.animation = new IdleAnimation();
    driver.update(0);
    const pure = new PlayerObject();
    new IdleAnimation().update(pure, 0);
    expectSamePose(pose(pure), pose(driver.player));
  });

  it('starts an interrupted transition from what is shown', () => {
    const driver = new PlayerDriver(new PlayerObject());
    driver.animation = new WalkingAnimation();
    walkFor(driver, 0.3);
    driver.animation = new IdleAnimation();
    driver.update(0.1);
    const shown = pose(driver.player);
    driver.animation = new WalkingAnimation();
    driver.update(0);
    expectSamePose(shown, pose(driver.player));
  });

  it('blends back to rest when the animation is removed', () => {
    const driver = new PlayerDriver(new PlayerObject());
    const rest = pose(driver.player);
    driver.animation = new WalkingAnimation();
    walkFor(driver, 0.3);
    driver.animation = null;
    driver.update(0.1);
    expect(pose(driver.player)).not.toEqual(rest);
    driver.update(0.2);
    expectSamePose(rest, pose(driver.player));
  });

  it('leaves a manual pose alone when nothing animates', () => {
    const driver = new PlayerDriver(new PlayerObject());
    driver.player.skin.head.rotation.y = 1;
    for (let i = 0; i < 10; i++) driver.update(0.05);
    expect(driver.player.skin.head.rotation.y).toBe(1);
  });

  it('leaves joints the animation does not touch alone when no overlay runs', () => {
    const driver = new PlayerDriver(new PlayerObject(), {transition: 0});
    driver.animation = new WalkingAnimation();
    driver.update(0);
    driver.player.skin.head.rotation.y = 1;
    for (let i = 0; i < 10; i++) driver.update(0.05);
    expect(driver.player.skin.head.rotation.y).toBe(1);
  });

  it('starts a transition when the animation reports a switch', () => {
    const driver = new PlayerDriver(new PlayerObject());
    const switcher = new Switcher();
    driver.animation = switcher;
    driver.update(0.3);
    driver.update(0.3);
    expect(driver.player.skin.body.rotation.x).toBe(0);
    switcher.progress = 1;
    switcher.flip();
    driver.update(0);
    expect(driver.player.skin.body.rotation.x).toBeCloseTo(0);
    driver.update(0.25);
    expect(driver.player.skin.body.rotation.x).toBeCloseTo(1);
  });

  it('holds the rest pose under reduced motion', () => {
    const driver = new PlayerDriver(new PlayerObject(), {transition: 0});
    const rest = pose(driver.player);
    driver.animation = new WalkingAnimation();
    driver.reducedMotion = true;
    walkFor(driver, 1);
    expectSamePose(rest, pose(driver.player));
  });
});
