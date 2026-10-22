import {
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
} from 'three'
import type { PlayerObject } from './PlayerObject.js'

const SIZE = 16
const OPACITY = 0.35
const TEXTURE_SIZE = 32

/** A soft black disc: opaque-ish in the middle, fully clear at the rim. */
function shadowTexture(): DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4)
  const half = TEXTURE_SIZE / 2
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half
      data[(y * TEXTURE_SIZE + x) * 4 + 3] = r < 1 ? Math.round(255 * (1 - r) ** 1.5) : 0
    }
  }
  const texture = new DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, RGBAFormat)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/**
 * The round shadow mobs cast in the game: a soft disc on the ground under
 * the player. Add it next to the player (same parent), not inside it, so it
 * doesn't turn with the player, and call updateShadow each frame.
 */
export function createShadow(): Mesh {
  const shadow = new Mesh(
    new PlaneGeometry(SIZE, SIZE),
    new MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: OPACITY,
      color: 0x000000,
    }),
  )
  shadow.name = 'shadow'
  shadow.rotation.x = -Math.PI / 2
  // Just above the ground so it doesn't fight a floor at y = 0.
  shadow.position.y = 0.01
  return shadow
}

/** Keeps the shadow under the player, fading and shrinking as it leaves the ground. */
export function updateShadow(shadow: Mesh, player: PlayerObject): void {
  const height = Math.max(0, player.position.y)
  shadow.position.x = player.position.x
  shadow.position.z = player.position.z
  shadow.scale.setScalar(Math.max(0.4, 1 - height / 32))
  ;(shadow.material as MeshBasicMaterial).opacity = OPACITY * Math.max(0, 1 - height / 16)
}

export function disposeShadow(shadow: Mesh): void {
  const material = shadow.material as MeshBasicMaterial
  material.map?.dispose()
  material.dispose()
  shadow.geometry.dispose()
}
