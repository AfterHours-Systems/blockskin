import { createAnimation, type AnimationName } from '../animation/index.js'
import {
  FunctionAnimation,
  PlayerAnimation,
  type AnimationFn,
} from '../animation/PlayerAnimation.js'
import { PART_NAMES, type PartName } from '../model/layout.js'
import type { PlayerObject } from '../model/PlayerObject.js'

export type AnimationProp = AnimationName | PlayerAnimation | AnimationFn | null | undefined

export type LayerVisibility = Partial<Record<PartName, { inner?: boolean; outer?: boolean }>>

// Animations this module created, so a re-render with the same name or a new
// inline function keeps the running animation instead of restarting it.
const created = new WeakMap<PlayerAnimation, AnimationName | 'function'>()

export function resolveAnimation(
  value: AnimationProp,
  previous: PlayerAnimation | null,
): PlayerAnimation | null {
  if (value == null) return null
  if (value instanceof PlayerAnimation) return value
  if (typeof value === 'function') {
    if (previous instanceof FunctionAnimation && created.get(previous) === 'function') {
      previous.fn = value
      return previous
    }
    const animation = new FunctionAnimation(value)
    created.set(animation, 'function')
    return animation
  }
  if (previous && created.get(previous) === value) return previous
  const animation = createAnimation(value)
  created.set(animation, value)
  return animation
}

/** Shows every layer except the ones `layers` turns off. */
export function applyLayers(player: PlayerObject, layers: LayerVisibility | undefined): void {
  for (const name of PART_NAMES) {
    const part = player.skin[name]
    part.inner.visible = layers?.[name]?.inner ?? true
    part.outer.visible = layers?.[name]?.outer ?? true
  }
}
