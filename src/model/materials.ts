import { DoubleSide, FrontSide, MeshStandardMaterial } from 'three'

export function innerMaterial(limb: boolean): MeshStandardMaterial {
  return new MeshStandardMaterial({
    side: FrontSide,
    // Limbs sit flush against the body; a small depth bias keeps their faces
    // from fighting the body's where they touch.
    polygonOffset: limb,
    polygonOffsetFactor: limb ? 1 : 0,
    polygonOffsetUnits: limb ? 1 : 0,
  })
}

export function outerMaterial(limb: boolean): MeshStandardMaterial {
  // Fully transparent pixels are discarded, semi-transparent ones blend, which
  // is how the game draws the outer layer. Both sides render so the inside of
  // a hat brim shows from below.
  return new MeshStandardMaterial({
    side: DoubleSide,
    transparent: true,
    alphaTest: 1e-5,
    polygonOffset: limb,
    polygonOffsetFactor: limb ? 1 : 0,
    polygonOffsetUnits: limb ? 1 : 0,
  })
}

export function accessoryMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ side: DoubleSide, transparent: true, alphaTest: 1e-5 })
}
