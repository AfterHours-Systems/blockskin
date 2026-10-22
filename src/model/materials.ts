import { DoubleSide, FrontSide, MeshStandardMaterial } from 'three'

// Depth bias per part. Limbs sit flush against the body and the legs overlap
// each other a little, as in the game, so their coplanar faces would fight.
// The body gets none, the limbs 1, and the left leg 2 so it also settles
// against the right leg.
export type Bias = 0 | 1 | 2

function biasProps(bias: Bias) {
  return { polygonOffset: bias > 0, polygonOffsetFactor: bias, polygonOffsetUnits: bias }
}

export function innerMaterial(bias: Bias): MeshStandardMaterial {
  return new MeshStandardMaterial({ side: FrontSide, ...biasProps(bias) })
}

export function outerMaterial(bias: Bias): MeshStandardMaterial {
  // Fully transparent pixels are discarded, semi-transparent ones blend, which
  // is how the game draws the outer layer. Both sides render so the inside of
  // a hat brim shows from below.
  return new MeshStandardMaterial({
    side: DoubleSide,
    transparent: true,
    alphaTest: 1e-5,
    ...biasProps(bias),
  })
}

export function accessoryMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ side: DoubleSide, transparent: true, alphaTest: 1e-5 })
}
