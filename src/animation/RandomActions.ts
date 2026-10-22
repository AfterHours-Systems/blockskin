import type { PlayerObject } from '../model/PlayerObject.js'
import { CrouchAnimation, HitAnimation, WaveAnimation } from './actions.js'
import {
  FlyingAnimation,
  IdleAnimation,
  RunningAnimation,
  SwimAnimation,
  WalkingAnimation,
} from './locomotion.js'
import { PlayerAnimation } from './PlayerAnimation.js'

export type ActionName = 'idle' | 'walk' | 'run' | 'fly' | 'swim' | 'wave' | 'crouch' | 'hit'

export interface RandomAction {
  name: ActionName
  /** Relative chance of being picked. */
  weight: number
}

export const DEFAULT_RANDOM_ACTIONS: readonly RandomAction[] = [
  { name: 'idle', weight: 3 },
  { name: 'walk', weight: 2 },
  { name: 'run', weight: 1 },
  { name: 'crouch', weight: 1 },
  { name: 'wave', weight: 0.5 },
  { name: 'fly', weight: 0.5 },
]

// Built here rather than through createAnimation, which itself creates
// RandomActions.
const ACTIONS: Record<ActionName, () => PlayerAnimation> = {
  idle: () => new IdleAnimation(),
  walk: () => new WalkingAnimation(),
  run: () => new RunningAnimation(),
  fly: () => new FlyingAnimation(),
  swim: () => new SwimAnimation(),
  wave: () => new WaveAnimation(),
  crouch: () => new CrouchAnimation(),
  hit: () => new HitAnimation(),
}

/** A weighted pick that avoids `previous`, unless it is the only choice. */
export function pickAction(
  actions: readonly RandomAction[],
  previous: ActionName | null,
  random: () => number,
): ActionName {
  const candidates = actions.filter((a) => a.name !== previous && a.weight > 0)
  const pool = candidates.length > 0 ? candidates : actions
  const total = pool.reduce((sum, a) => sum + a.weight, 0)
  let roll = random() * total
  for (const action of pool) {
    roll -= action.weight
    if (roll < 0) return action.name
  }
  return pool[pool.length - 1]!.name
}

export interface RandomActionsOptions {
  actions?: readonly RandomAction[]
  /** Seconds. Defaults to 3. */
  minDuration?: number
  /** Seconds. Defaults to 6. */
  maxDuration?: number
  /** Defaults to Math.random; pass a seeded one for repeatable sequences. */
  random?: () => number
}

/** Keeps picking actions at random, a few seconds each, and puts on what they need. */
export class RandomActions extends PlayerAnimation {
  private readonly actions: readonly RandomAction[]
  private readonly minDuration: number
  private readonly maxDuration: number
  private readonly random: () => number
  private _current: ActionName | null = null
  private action: PlayerAnimation | null = null
  private remaining = 0
  private takeOff: (() => void) | null = null

  constructor(options: RandomActionsOptions = {}) {
    super()
    this.actions = options.actions ?? DEFAULT_RANDOM_ACTIONS
    this.minDuration = options.minDuration ?? 3
    this.maxDuration = options.maxDuration ?? 6
    this.random = options.random ?? Math.random
  }

  /** The action running now, or null before the first frame. */
  get current(): ActionName | null {
    return this._current
  }

  protected animate(player: PlayerObject, delta: number): void {
    if (!this.action || this.remaining <= 0) this.next(player)
    this.action!.update(player, delta)
    this.remaining -= delta
  }

  private next(player: PlayerObject): void {
    this.takeOff?.()
    this.takeOff = null
    const first = this.action === null
    const name = pickAction(this.actions, this._current, this.random)
    this._current = name
    this.action = ACTIONS[name]()
    this.remaining = this.minDuration + this.random() * (this.maxDuration - this.minDuration)
    // Each action starts from rest; the driver blends over from what was shown.
    player.resetPose()
    if (!first) this.markSwitch()
    if (name === 'fly') this.takeOff = player.wearElytra()
  }

  stop(player: PlayerObject): void {
    this.takeOff?.()
    this.takeOff = null
    this.action?.stop(player)
  }
}
