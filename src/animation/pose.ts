import type { PlayerObject } from '../model/PlayerObject.js'

export const TAU = Math.PI * 2

/** The fractional part, also for negative values. */
export function frac(x: number): number {
  return x - Math.floor(x)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Pitches the whole player about its middle (y = 16) rather than its feet, so
 * a horizontal pose stays where a viewer framed the standing player.
 */
export function pitchAboutCentre(player: PlayerObject, angle: number): void {
  player.rotation.x = angle
  player.position.set(0, 16 - 16 * Math.cos(angle), -16 * Math.sin(angle))
}

const CAPE_REST = 6 * (Math.PI / 180)

export function liftCape(player: PlayerObject, angle: number): void {
  player.cape.rotation.x = CAPE_REST + angle
}
