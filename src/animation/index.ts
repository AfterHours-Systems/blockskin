import { CrouchAnimation, HitAnimation, WaveAnimation } from './actions.js'
import {
  FlyingAnimation,
  IdleAnimation,
  RunningAnimation,
  SwimAnimation,
  WalkingAnimation,
} from './locomotion.js'
import type { PlayerAnimation } from './PlayerAnimation.js'
import { RandomActions } from './RandomActions.js'

export * from './actions.js'
export * from './locomotion.js'
export * from './PlayerAnimation.js'
export * from './RandomActions.js'

export type AnimationName =
  'idle' | 'walk' | 'run' | 'fly' | 'swim' | 'wave' | 'crouch' | 'hit' | 'random'

const FACTORIES: Record<AnimationName, () => PlayerAnimation> = {
  idle: () => new IdleAnimation(),
  walk: () => new WalkingAnimation(),
  run: () => new RunningAnimation(),
  fly: () => new FlyingAnimation(),
  swim: () => new SwimAnimation(),
  wave: () => new WaveAnimation(),
  crouch: () => new CrouchAnimation(),
  hit: () => new HitAnimation(),
  random: () => new RandomActions(),
}

export const ANIMATION_NAMES = Object.keys(FACTORIES) as AnimationName[]

export function createAnimation(name: AnimationName): PlayerAnimation {
  return FACTORIES[name]()
}
