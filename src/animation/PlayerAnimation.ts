import type { PlayerObject } from '../model/PlayerObject.js'

export type AnimationFn = (player: PlayerObject, progress: number, delta: number) => void

type LayerFn = (player: PlayerObject, progress: number, id: number) => void

/**
 * Something that poses a player over time. `progress` counts seconds scaled by
 * `speed`, so every built-in animation's curves are written in seconds.
 */
export abstract class PlayerAnimation {
  speed = 1
  paused = false
  progress = 0

  private _switchCount = 0
  private nextId = 0
  private readonly layers = new Map<number, { fn: LayerFn; start: number }>()

  protected abstract animate(player: PlayerObject, delta: number): void

  /** Increases whenever the animation jumps to a different motion, so a driver can blend. */
  get switchCount(): number {
    return this._switchCount
  }

  protected markSwitch(): void {
    this._switchCount++
  }

  update(player: PlayerObject, deltaSeconds: number): void {
    if (this.paused) return
    const delta = deltaSeconds * this.speed
    this.animate(player, delta)
    for (const [id, layer] of this.layers) layer.fn(player, this.progress - layer.start, id)
    this.progress += delta
  }

  /** Stacks an extra motion on top; it sees progress counted from when it was added. */
  addAnimation(fn: LayerFn): number {
    const id = this.nextId++
    this.layers.set(id, { fn, start: this.progress })
    return id
  }

  removeAnimation(id: number | undefined): void {
    if (id !== undefined) this.layers.delete(id)
  }
}

export class FunctionAnimation extends PlayerAnimation {
  constructor(public fn: AnimationFn) {
    super()
  }

  protected animate(player: PlayerObject, delta: number): void {
    this.fn(player, this.progress, delta)
  }
}
