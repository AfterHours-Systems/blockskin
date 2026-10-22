import { BoxGeometry, Euler, Group, Mesh, Vector3, type Material, type Texture } from 'three'
import { normalizeCape } from '../format/cape.js'
import { earsFromSkin, normalizeEars } from '../format/ears.js'
import type { Pixels } from '../format/pixels.js'
import { detectModel, normalizeSkin, type ModelType } from '../format/skin.js'
import { createPixelTexture } from '../textures/texture.js'
import {
  CAPE,
  EARS,
  ELYTRA,
  PART_NAMES,
  partLayout,
  type PartLayout,
  type PartName,
} from './layout.js'
import { accessoryMaterial, innerMaterial, outerMaterial, type Bias } from './materials.js'
import { applyBoxUV, boxUV } from './uv.js'

export type BackEquipment = 'cape' | 'elytra'

function box(
  size: readonly [number, number, number],
  uv: readonly [number, number],
  inflate: number,
  texWidth: number,
  texHeight: number,
): BoxGeometry {
  const [w, h, d] = size
  const geometry = new BoxGeometry(w + 2 * inflate, h + 2 * inflate, d + 2 * inflate)
  applyBoxUV(geometry, boxUV(uv[0], uv[1], w, h, d), texWidth, texHeight)
  return geometry
}

/** One body part. The group's origin is the joint it rotates around. */
export class BodyPart extends Group {
  readonly inner: Mesh<BoxGeometry, Material>
  readonly outer: Mesh<BoxGeometry, Material>

  constructor(name: PartName, layout: PartLayout, inner: Material, outer: Material) {
    super()
    this.name = name
    this.inner = new Mesh(new BoxGeometry(), inner)
    this.inner.name = `${name}Inner`
    this.outer = new Mesh(new BoxGeometry(), outer)
    this.outer.name = `${name}Outer`
    this.add(this.inner, this.outer)
    this.setLayout(layout)
  }

  setLayout(layout: PartLayout): void {
    this.position.set(...layout.pivot)
    this.inner.geometry.dispose()
    this.outer.geometry.dispose()
    this.inner.geometry = box(layout.size, layout.uv, 0, 64, 64)
    this.outer.geometry = box(layout.size, layout.outerUv, layout.inflate, 64, 64)
    this.inner.position.set(...layout.offset)
    this.outer.position.set(...layout.offset)
  }
}

export class SkinObject extends Group {
  readonly head: BodyPart
  readonly body: BodyPart
  readonly rightArm: BodyPart
  readonly leftArm: BodyPart
  readonly rightLeg: BodyPart
  readonly leftLeg: BodyPart
  private readonly materials = ([0, 1, 2] as const).map((bias) => ({
    inner: innerMaterial(bias),
    outer: outerMaterial(bias),
  }))
  private _modelType: ModelType = 'classic'
  private _map: Texture | null = null

  constructor() {
    super()
    this.name = 'skin'
    const part = (name: PartName, bias: Bias) => {
      const { inner, outer } = this.materials[bias]!
      return new BodyPart(name, partLayout(name, this._modelType), inner, outer)
    }
    this.head = part('head', 0)
    this.body = part('body', 0)
    this.rightArm = part('rightArm', 1)
    this.leftArm = part('leftArm', 1)
    this.rightLeg = part('rightLeg', 1)
    this.leftLeg = part('leftLeg', 2)
    this.add(...this.parts())
  }

  parts(): BodyPart[] {
    return PART_NAMES.map((name) => this[name])
  }

  private allMaterials() {
    return this.materials.flatMap(({ inner, outer }) => [inner, outer])
  }

  get modelType(): ModelType {
    return this._modelType
  }

  set modelType(value: ModelType) {
    if (value === this._modelType) return
    this._modelType = value
    this.rightArm.setLayout(partLayout('rightArm', value))
    this.leftArm.setLayout(partLayout('leftArm', value))
  }

  get map(): Texture | null {
    return this._map
  }

  set map(texture: Texture | null) {
    this._map = texture
    for (const material of this.allMaterials()) {
      material.map = texture
      material.needsUpdate = true
    }
  }

  setInnerLayerVisible(visible: boolean): void {
    for (const part of this.parts()) part.inner.visible = visible
  }

  setOuterLayerVisible(visible: boolean): void {
    for (const part of this.parts()) part.outer.visible = visible
  }

  dispose(): void {
    for (const part of this.parts()) {
      part.inner.geometry.dispose()
      part.outer.geometry.dispose()
    }
    for (const material of this.allMaterials()) material.dispose()
  }
}

/** The cape. The group's origin is its top edge, where it hangs from the back. */
export class CapeObject extends Group {
  readonly mesh: Mesh<BoxGeometry, Material>

  constructor(material: Material) {
    super()
    this.name = 'cape'
    this.mesh = new Mesh(box(CAPE.size, CAPE.uv, 0, 64, 32), material)
    this.mesh.position.set(...CAPE.offset)
    // The texture's front is the side seen from behind the player.
    this.mesh.rotation.y = Math.PI
    this.add(this.mesh)
    this.position.set(...CAPE.pivot)
    this.rotation.x = CAPE.restAngle
  }
}

export class ElytraObject extends Group {
  readonly leftWing: Group
  readonly rightWing: Group
  private readonly geometry = box(ELYTRA.size, ELYTRA.uv, ELYTRA.inflate, 64, 32)

  constructor(material: Material) {
    super()
    this.name = 'elytra'
    this.position.set(...ELYTRA.pivot)
    const wing = (name: string, mirror: boolean) => {
      const group = new Group()
      group.name = name
      const mesh = new Mesh(this.geometry, material)
      mesh.position.set(...ELYTRA.wingOffset)
      // The right wing is the left one mirrored, texture included.
      if (mirror) mesh.scale.x = -1
      group.add(mesh)
      return group
    }
    this.leftWing = wing('leftWing', false)
    this.rightWing = wing('rightWing', true)
    this.add(this.leftWing, this.rightWing)
    this.leftWing.position.x = ELYTRA.wingPivotX
    this.leftWing.rotation.x = ELYTRA.restRotationX
    this.leftWing.rotation.z = ELYTRA.restRotationZ
    this.updateRightWing()
  }

  /** Mirrors the left wing's pose onto the right wing. */
  updateRightWing(): void {
    this.rightWing.position.set(
      -this.leftWing.position.x,
      this.leftWing.position.y,
      this.leftWing.position.z,
    )
    this.rightWing.rotation.set(
      this.leftWing.rotation.x,
      -this.leftWing.rotation.y,
      -this.leftWing.rotation.z,
    )
  }

  dispose(): void {
    this.geometry.dispose()
  }
}

/** Ears drawn the way the game draws deadmau5's, scaled up by 4/3. */
export class EarsObject extends Group {
  readonly rightEar: Mesh<BoxGeometry, Material>
  readonly leftEar: Mesh<BoxGeometry, Material>
  private readonly geometry = box(EARS.size, EARS.uv, 0, 14, 7)

  constructor(material: Material) {
    super()
    this.name = 'ears'
    this.position.set(...EARS.offset)
    const ear = (side: 1 | -1) => {
      const mesh = new Mesh(this.geometry, material)
      mesh.position.x = EARS.spacingX * side
      mesh.scale.setScalar(EARS.scale)
      return mesh
    }
    this.rightEar = ear(-1)
    this.leftEar = ear(1)
    this.add(this.rightEar, this.leftEar)
  }

  dispose(): void {
    this.geometry.dispose()
  }
}

export interface SkinApplyOptions {
  model?: ModelType | 'auto-detect'
  /** Show the ears drawn on this skin; 'load-only' loads them hidden. */
  ears?: boolean | 'load-only'
}

export interface CapeApplyOptions {
  backEquipment?: BackEquipment
  makeVisible?: boolean
}

export interface EarsApplyOptions {
  textureType?: 'standalone' | 'skin'
  makeVisible?: boolean
}

type Pose = { position: Vector3; rotation: Euler }

/**
 * A Minecraft player: skin, cape, elytra and ears, built in model space with
 * the feet at the origin. Animations may move this group itself; upside-down
 * lives on an inner group so the two never overwrite each other.
 */
export class PlayerObject extends Group {
  readonly skin = new SkinObject()
  readonly cape: CapeObject
  readonly elytra: ElytraObject
  readonly ears: EarsObject
  private readonly flip = new Group()
  private readonly capeMaterial = accessoryMaterial()
  private readonly earsMaterial = accessoryMaterial()
  private textures: { skin: Texture | null; cape: Texture | null; ears: Texture | null } = {
    skin: null,
    cape: null,
    ears: null,
  }
  private _backEquipment: BackEquipment | null = null
  private restPose = new Map<Group, Pose>()

  constructor() {
    super()
    this.name = 'player'
    this.cape = new CapeObject(this.capeMaterial)
    this.elytra = new ElytraObject(this.capeMaterial)
    this.ears = new EarsObject(this.earsMaterial)
    this.flip.name = 'flip'
    this.flip.add(this.skin, this.cape, this.elytra)
    // Ears ride on the head so they follow it when it turns.
    this.skin.head.add(this.ears)
    this.add(this.flip)
    this.skin.visible = false
    this.cape.visible = false
    this.elytra.visible = false
    this.ears.visible = false
    this.captureRestPose()
  }

  /** Every transform an animation may move, the player itself included. */
  poseJoints(): Group[] {
    const { leftWing, rightWing } = this.elytra
    return [this, ...this.skin.parts(), this.cape, this.elytra, leftWing, rightWing, this.ears]
  }

  private captureRestPose(): void {
    this.restPose = new Map(
      this.poseJoints().map((joint) => [
        joint,
        { position: joint.position.clone(), rotation: joint.rotation.clone() },
      ]),
    )
  }

  /** Puts every joint, and this group itself, back to the rest pose. */
  resetPose(): void {
    for (const [joint, pose] of this.restPose) {
      joint.position.copy(pose.position)
      joint.rotation.copy(pose.rotation)
    }
  }

  get backEquipment(): BackEquipment | null {
    return this._backEquipment
  }

  set backEquipment(value: BackEquipment | null) {
    this._backEquipment = value
    this.cape.visible = value === 'cape'
    this.elytra.visible = value === 'elytra'
  }

  get upsideDown(): boolean {
    return this.flip.rotation.z !== 0
  }

  /** Renders the player upside down, the way the game does for Dinnerbone and Grumm. */
  set upsideDown(value: boolean) {
    // A half turn about z around the player's middle (y = 16) keeps it in
    // the same space, so framing doesn't change.
    this.flip.rotation.z = value ? Math.PI : 0
    this.flip.position.y = value ? 32 : 0
  }

  private replaceTexture(
    slot: keyof PlayerObject['textures'],
    pixels: Pixels | null,
  ): Texture | null {
    this.textures[slot]?.dispose()
    const texture = pixels ? createPixelTexture(pixels) : null
    this.textures[slot] = texture
    return texture
  }

  /** Applies a skin texture and returns the model it uses, or null when cleared. */
  applySkin(pixels: Pixels | null, opts: SkinApplyOptions = {}): ModelType | null {
    if (!pixels) {
      this.skin.map = this.replaceTexture('skin', null)
      this.skin.visible = false
      return null
    }
    const normalized = normalizeSkin(pixels)
    const model =
      opts.model && opts.model !== 'auto-detect'
        ? opts.model
        : normalized.legacy
          ? 'classic' // slim arms didn't exist yet
          : detectModel(normalized.pixels)
    if (model !== this.skin.modelType) {
      this.skin.modelType = model
      this.captureArmRest()
    }
    this.skin.map = this.replaceTexture('skin', normalized.pixels)
    this.skin.visible = true
    if (opts.ears === true || opts.ears === 'load-only') {
      // Read the ears from the source: the opaque-background fix may have
      // cleared hat pixels that overlap the ear region.
      this.applyEars(earsFromSkin(pixels).pixels, { makeVisible: opts.ears === true })
    }
    return model
  }

  private captureArmRest(): void {
    for (const arm of [this.skin.rightArm, this.skin.leftArm]) {
      this.restPose.set(arm, { position: arm.position.clone(), rotation: new Euler() })
    }
  }

  applyCape(pixels: Pixels | null, opts: CapeApplyOptions = {}): void {
    const texture = this.replaceTexture('cape', pixels && normalizeCape(pixels).pixels)
    this.capeMaterial.map = texture
    this.capeMaterial.needsUpdate = true
    if (!texture) this.backEquipment = null
    else if (opts.makeVisible !== false) this.backEquipment = opts.backEquipment ?? 'cape'
  }

  applyEars(pixels: Pixels | null, opts: EarsApplyOptions = {}): void {
    const normalized =
      pixels && (opts.textureType === 'skin' ? earsFromSkin(pixels) : normalizeEars(pixels))
    const texture = this.replaceTexture('ears', normalized ? normalized.pixels : null)
    this.earsMaterial.map = texture
    this.earsMaterial.needsUpdate = true
    if (!texture) this.ears.visible = false
    else if (opts.makeVisible !== false) this.ears.visible = true
  }

  /**
   * The top of the head (hat included) in this.parent's space, ignoring
   * upside-down so a name tag stays above the player either way.
   */
  headTop(target: Vector3): Vector3 {
    const { head } = this.skin
    target.set(0, partLayout('head', this.skin.modelType).size[1] + 0.5, 0)
    head.updateMatrix()
    this.skin.updateMatrix()
    this.updateMatrix()
    return target.applyMatrix4(head.matrix).applyMatrix4(this.skin.matrix).applyMatrix4(this.matrix)
  }

  dispose(): void {
    this.skin.dispose()
    this.cape.mesh.geometry.dispose()
    this.elytra.dispose()
    this.ears.dispose()
    this.capeMaterial.dispose()
    this.earsMaterial.dispose()
    for (const slot of ['skin', 'cape', 'ears'] as const) this.replaceTexture(slot, null)
  }
}
