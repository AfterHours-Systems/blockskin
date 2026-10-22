import type { ModelType } from '../format/skin.js'

export type Vec3 = readonly [number, number, number]

export type PartName = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'

export const PART_NAMES: readonly PartName[] = [
  'head',
  'body',
  'rightArm',
  'leftArm',
  'rightLeg',
  'leftLeg',
]

export interface PartLayout {
  /** The joint the part rotates around, in model space. */
  pivot: Vec3
  /** Inner box size in skin pixels. */
  size: Vec3
  /** Box centre relative to the pivot. */
  offset: Vec3
  uv: readonly [number, number]
  outerUv: readonly [number, number]
  /** How far the outer layer stands off the inner box, per side. */
  inflate: number
}

// Model space: 1 unit = 1 skin pixel, +y up, the player faces +z, its right
// side at −x, feet at y = 0. These are the game's player model numbers moved
// into that frame (the game's model space has y down and faces −z).
const HEAD: PartLayout = {
  pivot: [0, 24, 0],
  size: [8, 8, 8],
  offset: [0, 4, 0],
  uv: [0, 0],
  outerUv: [32, 0],
  inflate: 0.5,
}
const BODY: PartLayout = {
  pivot: [0, 24, 0],
  size: [8, 12, 4],
  offset: [0, -6, 0],
  uv: [16, 16],
  outerUv: [16, 32],
  inflate: 0.25,
}

function arm(side: 1 | -1, model: ModelType): PartLayout {
  const slim = model === 'slim'
  return {
    // Slim arms hang half a pixel lower in the game, so the shoulder line
    // stays level with the narrower arm.
    pivot: [5 * side, slim ? 21.5 : 22, 0],
    size: [slim ? 3 : 4, 12, 4],
    offset: [(slim ? 0.5 : 1) * side, -4, 0],
    uv: side < 0 ? [40, 16] : [32, 48],
    outerUv: side < 0 ? [40, 32] : [48, 48],
    inflate: 0.25,
  }
}

function leg(side: 1 | -1): PartLayout {
  return {
    pivot: [1.9 * side, 12, 0],
    size: [4, 12, 4],
    offset: [0, -6, 0],
    uv: side < 0 ? [0, 16] : [16, 48],
    outerUv: side < 0 ? [0, 32] : [0, 48],
    inflate: 0.25,
  }
}

export function partLayout(part: PartName, model: ModelType): PartLayout {
  switch (part) {
    case 'head':
      return HEAD
    case 'body':
      return BODY
    case 'rightArm':
      return arm(-1, model)
    case 'leftArm':
      return arm(1, model)
    case 'rightLeg':
      return leg(-1)
    case 'leftLeg':
      return leg(1)
  }
}

const DEG = Math.PI / 180

export const CAPE = {
  pivot: [0, 24, -2] as Vec3,
  size: [10, 16, 1] as Vec3,
  /** Hangs below and just behind the pivot. */
  offset: [0, -8, -0.5] as Vec3,
  uv: [0, 0] as const,
  /** The game's resting cape angle, hem behind the back. */
  restAngle: 6 * DEG,
}

export const ELYTRA = {
  pivot: [0, 24, -2] as Vec3,
  wingPivotX: 5,
  size: [10, 20, 2] as Vec3,
  inflate: 1,
  wingOffset: [-5, -10, -1] as Vec3,
  uv: [22, 0] as const,
  restRotationX: 15 * DEG,
  restRotationZ: 15 * DEG,
}

export const EARS = {
  /** Centre of the ear pair relative to the head pivot (the neck). */
  offset: [0, 10, 2 / 3] as Vec3,
  spacingX: 6,
  size: [6, 6, 1] as Vec3,
  scale: 4 / 3,
  uv: [0, 0] as const,
}
