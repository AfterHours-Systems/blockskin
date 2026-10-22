import {
  AmbientLight,
  Color,
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  PerspectiveCamera,
  PointLight,
  SRGBColorSpace,
  Scene,
  Texture,
  Raycaster,
  Vector2,
  Vector3,
  WebGLRenderer,
  type ColorRepresentation,
  type Mapping,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PlayerAnimation } from '../animation/PlayerAnimation.js'
import type { ModelType } from '../format/skin.js'
import { PlayerDriver } from '../driver/PlayerDriver.js'
import { DEFAULT_REACTIONS, type ReactionSet } from '../driver/reactions.js'
import { createShadow, disposeShadow, updateShadow } from '../model/shadow.js'
import { addPointerListener, pointerTarget } from '../interaction/look.js'
import {
  awayFromCamera,
  findPokedPart,
  isPoke,
  type PointerSample,
  type PokePart,
} from '../interaction/poke.js'
import { PlayerObject, type BackEquipment } from '../model/PlayerObject.js'
import { EARS_EXTRA, NAME_TAG_GAP } from '../nametag/layout.js'
import { NameTagObject } from '../nametag/NameTagObject.js'
import { loadTextureSource, type ImageInput } from '../textures/input.js'
import { createLatestWins } from '../textures/sequence.js'
import { cameraDistance } from './framing.js'
import { loadCapeInto, loadEarsInto, loadSkinInto } from './loadInto.js'

export interface LoadOptions {
  /** Show the part once it has loaded. Defaults to true. */
  makeVisible?: boolean
}

export interface SkinLoadOptions extends LoadOptions {
  model?: ModelType | 'auto-detect'
  ears?: boolean | 'load-only'
}

export interface CapeLoadOptions extends LoadOptions {
  backEquipment?: BackEquipment
}

export interface EarsLoadOptions extends LoadOptions {
  textureType?: 'standalone' | 'skin'
}

export interface SkinViewerOptions {
  canvas?: HTMLCanvasElement
  width?: number
  height?: number
  pixelRatio?: number | 'match-device'
  skin?: ImageInput
  model?: ModelType | 'auto-detect'
  cape?: ImageInput
  ears?: 'current-skin' | { textureType: 'standalone' | 'skin'; source: ImageInput }
  preserveDrawingBuffer?: boolean
  renderPaused?: boolean
  /** Transparent by default. */
  background?: ColorRepresentation | Texture | null
  panorama?: ImageInput
  fov?: number
  zoom?: number
  enableControls?: boolean
  animation?: PlayerAnimation | null
  /** Seconds to blend between animations; 0 snaps. Defaults to 0.25. */
  transition?: number
  /** React to pokes: true for the default reactions, or your own set. Off by default. */
  reactions?: boolean | ReactionSet
  /** Called for every poke, with the part that was hit, even with reactions off. */
  onPoke?: (part: PokePart) => void
  /** Turn the head towards the pointer: anywhere on the page (true or 'window') or only over the canvas. Off by default. */
  lookAtPointer?: boolean | 'window' | 'canvas'
  /** Draw the outer layer as small blocks, like the "3D Skin Layers" mod. Off by default. */
  layers3d?: boolean
  /** A soft round shadow on the ground under the player. Off by default. */
  shadow?: boolean
  nameTag?: NameTagObject | string | null
  /** Multisample anti-aliasing. Defaults to true. */
  antialias?: boolean
  upsideDown?: boolean
  /** Called when a load passed in the options fails; method calls reject instead. */
  onError?: (error: unknown) => void
}

/** A self-contained viewer: canvas, renderer, scene, camera, controls and loop. */
export class SkinViewer {
  readonly canvas: HTMLCanvasElement
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera()
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  readonly playerObject = new PlayerObject()
  /** Runs the animation and everything layered on it. */
  readonly driver: PlayerDriver
  onPoke: ((part: PokePart) => void) | null = null
  /** Spins for auto-rotate. */
  readonly playerWrapper = new Group()
  readonly globalLight = new AmbientLight(0xffffff, 3)
  /**
   * A light that rides with the camera, for shading that follows the view.
   * It has no distance falloff so its intensity means the same at any zoom.
   * Off by default: skinview3d's 0.6 at the usual distance contributed
   * almost nothing, and the default look matches it.
   */
  readonly cameraLight = new PointLight(0xffffff, 0, 0, 0)

  autoRotate = false
  /** Radians per second. */
  autoRotateSpeed = 1

  // Centres the player (feet at 0, head at 32) on the orbit target.
  private readonly centre = new Group()
  private readonly loads = {
    skin: createLatestWins(),
    cape: createLatestWins(),
    ears: createLatestWins(),
    background: createLatestWins(),
  }
  private backgroundTexture: Texture | null = null
  private _nameTag: NameTagObject | null = null
  private ownsNameTag = false
  private _zoom: number
  private _pixelRatio: number | 'match-device'
  private pixelRatioQuery: MediaQueryList | null = null
  private _renderPaused = false
  private _disposed = false
  private frame: number | null = null
  private lastTime: number | null = null
  private dragging = false

  constructor(options: SkinViewerOptions = {}) {
    this.canvas = options.canvas ?? document.createElement('canvas')
    this.driver = new PlayerDriver(this.playerObject, { transition: options.transition })
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: options.antialias ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    })
    this.renderer.setClearColor(0, 0)

    this.camera.add(this.cameraLight)
    this.scene.add(this.camera, this.globalLight, this.playerWrapper)
    this.centre.position.y = -16
    this.centre.add(this.playerObject)
    this.playerWrapper.add(this.centre)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enablePan = false
    this.controls.minDistance = 10
    this.controls.maxDistance = 256
    this.controls.enabled = options.enableControls ?? true
    this.controls.addEventListener('start', this.onDragStart)
    this.controls.addEventListener('end', this.onDragEnd)

    this._pixelRatio = options.pixelRatio ?? 'match-device'
    this.applyPixelRatio()
    this.setSize(options.width ?? 300, options.height ?? 300)
    this._zoom = options.zoom ?? 0.9
    this.camera.fov = options.fov ?? 50
    this.resetCameraPose()

    if (options.background !== undefined) this.background = options.background
    if (options.upsideDown) this.playerObject.upsideDown = true
    if (options.nameTag) this.nameTag = options.nameTag
    if (options.animation) this.animation = options.animation

    const report = (promise: Promise<unknown>) =>
      promise.catch((error: unknown) => {
        if (options.onError) options.onError(error)
        else console.error(error)
      })
    if (options.skin !== undefined) {
      report(
        this.loadSkin(options.skin, {
          model: options.model,
          ears: options.ears === 'current-skin',
        }),
      )
    }
    if (options.cape !== undefined) report(this.loadCape(options.cape))
    if (options.ears !== undefined && options.ears !== 'current-skin') {
      report(this.loadEars(options.ears.source, { textureType: options.ears.textureType }))
    }
    if (options.panorama !== undefined) report(this.loadPanorama(options.panorama))

    this.reactions = options.reactions ?? false
    this.onPoke = options.onPoke ?? null
    this.lookAtPointer = options.lookAtPointer ?? false
    this.playerObject.layers3d = options.layers3d ?? false
    this.shadow = options.shadow ?? false
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('webglcontextlost', this.onContextLost)
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    this.renderPaused = options.renderPaused ?? false
  }

  private pointerDown: PointerSample | null = null
  private readonly raycaster = new Raycaster()

  private readonly onPointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY, time: event.timeStamp }
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDown
    this.pointerDown = null
    if (!down || !isPoke(down, { x: event.clientX, y: event.clientY, time: event.timeStamp }))
      return
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.scene.updateMatrixWorld()
    this.raycaster.setFromCamera(ndc, this.camera)
    const part = findPokedPart(this.raycaster, this.playerObject)
    if (!part) return
    this.onPoke?.(part)
    this.driver.poke(part, awayFromCamera(this.camera, this.playerObject))
  }

  private _lookAtPointer: false | 'window' | 'canvas' = false
  private stopLooking: (() => void) | null = null

  private shadowMesh: Mesh | null = null

  get shadow(): boolean {
    return this.shadowMesh !== null
  }

  set shadow(value: boolean) {
    if (value === this.shadow) return
    if (value) {
      this.shadowMesh = createShadow()
      this.centre.add(this.shadowMesh)
      updateShadow(this.shadowMesh, this.playerObject)
    } else if (this.shadowMesh) {
      this.centre.remove(this.shadowMesh)
      disposeShadow(this.shadowMesh)
      this.shadowMesh = null
    }
  }

  get layers3d(): boolean {
    return this.playerObject.layers3d
  }

  set layers3d(value: boolean) {
    this.playerObject.layers3d = value
  }

  get lookAtPointer(): false | 'window' | 'canvas' {
    return this._lookAtPointer
  }

  set lookAtPointer(value: boolean | 'window' | 'canvas') {
    const mode = value === true ? 'window' : value
    if (mode === this._lookAtPointer) return
    this.stopLooking?.()
    this.stopLooking = null
    this._lookAtPointer = mode
    if (!mode) {
      this.driver.lookAt(null)
      return
    }
    this.stopLooking = addPointerListener(mode === 'window' ? window : this.canvas, this.onLookMove)
  }

  private readonly onLookMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    // Outside the canvas these run past ±1, which is what window mode wants.
    const ndc = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const head = this.playerObject.skin.head.getWorldPosition(new Vector3())
    this.driver.lookAt(pointerTarget(this.camera, ndc, this.camera.position.distanceTo(head)))
  }

  /** What pokes do: true for the default reactions, false for none, or your own set. */
  get reactions(): ReactionSet | false {
    return this.driver.reactions ?? false
  }

  set reactions(value: boolean | ReactionSet) {
    this.driver.reactions = value === true ? DEFAULT_REACTIONS : value || null
  }

  private readonly onDragStart = () => {
    this.dragging = true
  }

  private readonly onDragEnd = () => {
    this.dragging = false
  }

  private readonly onContextLost = (event: Event) => {
    // Without preventDefault the browser never restores the context.
    event.preventDefault()
    this.stopLoop()
  }

  private readonly onContextRestored = () => {
    this.renderer.setClearColor(0, 0)
    if (!this._renderPaused && !this._disposed) this.startLoop()
  }

  private readonly onPixelRatioChange = () => {
    this.applyPixelRatio()
  }

  private applyPixelRatio(): void {
    this.pixelRatioQuery?.removeEventListener('change', this.onPixelRatioChange)
    this.pixelRatioQuery = null
    if (this._pixelRatio === 'match-device') {
      this.renderer.setPixelRatio(window.devicePixelRatio)
      // A resolution query only fires once the ratio moves off its value,
      // so it is re-armed for the new ratio each time.
      this.pixelRatioQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      this.pixelRatioQuery.addEventListener('change', this.onPixelRatioChange, { once: true })
    } else {
      this.renderer.setPixelRatio(this._pixelRatio)
    }
  }

  private startLoop(): void {
    if (this.frame !== null) return
    this.lastTime = null
    const tick = (time: number) => {
      const dt = this.lastTime === null ? 0 : (time - this.lastTime) / 1000
      this.lastTime = time
      this.step(Math.min(dt, 0.1))
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }

  private step(dt: number): void {
    this.driver.update(dt)
    if (this.shadowMesh) updateShadow(this.shadowMesh, this.playerObject)
    this.placeNameTag()
    if (this.autoRotate && !(this.controls.enabled && this.dragging)) {
      this.playerWrapper.rotation.y += dt * this.autoRotateSpeed
    }
    this.controls.update()
    this.render()
  }

  private placeNameTag(): void {
    if (!this._nameTag) return
    const top = this.playerObject.headTop(new Vector3())
    this._nameTag.position.set(
      top.x,
      top.y + NAME_TAG_GAP + (this.playerObject.ears.visible ? EARS_EXTRA : 0),
      top.z,
    )
  }

  /** Renders one frame without advancing animations. */
  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  loadSkin(input: ImageInput | null, options: SkinLoadOptions = {}): Promise<void> {
    // Ears from this skin replace any standalone ears still loading.
    if (options.ears) this.loads.ears.cancel()
    return this.loads
      .skin(async (signal) => {
        await loadSkinInto(
          this.playerObject,
          input,
          { model: options.model, ears: options.ears },
          signal,
        )
        if (options.makeVisible === false) this.playerObject.skin.visible = false
        this.placeNameTag()
      })
      .then(() => undefined)
  }

  loadCape(input: ImageInput | null, options: CapeLoadOptions = {}): Promise<void> {
    return this.loads
      .cape((signal) =>
        loadCapeInto(
          this.playerObject,
          input,
          { backEquipment: options.backEquipment, makeVisible: options.makeVisible },
          signal,
        ),
      )
      .then(() => undefined)
  }

  loadEars(input: ImageInput | null, options: EarsLoadOptions = {}): Promise<void> {
    return this.loads
      .ears((signal) =>
        loadEarsInto(
          this.playerObject,
          input,
          { textureType: options.textureType, makeVisible: options.makeVisible },
          signal,
        ),
      )
      .then(() => undefined)
  }

  resetSkin(): void {
    void this.loadSkin(null)
  }

  resetCape(): void {
    void this.loadCape(null)
  }

  resetEars(): void {
    void this.loadEars(null)
  }

  /** Loads an image background; a later load or a set `background` supersedes it. */
  loadBackground(input: ImageInput, mapping?: Mapping): Promise<void> {
    return this.loads
      .background(async (signal) => {
        const source = await loadTextureSource(input, signal)
        if (signal.aborted) return
        const texture = new Texture(source)
        texture.colorSpace = SRGBColorSpace
        if (mapping !== undefined) texture.mapping = mapping
        texture.needsUpdate = true
        this.applyBackground(texture)
        this.backgroundTexture = texture
      })
      .then(() => undefined)
  }

  loadPanorama(input: ImageInput): Promise<void> {
    return this.loadBackground(input, EquirectangularReflectionMapping)
  }

  get background(): Color | Texture | null {
    return this.scene.background as Color | Texture | null
  }

  set background(value: ColorRepresentation | Texture | null) {
    this.loads.background.cancel()
    this.applyBackground(value)
  }

  private applyBackground(value: ColorRepresentation | Texture | null): void {
    if (this.backgroundTexture && value !== this.backgroundTexture) {
      this.backgroundTexture.dispose()
      this.backgroundTexture = null
    }
    this.scene.background = value === null || value instanceof Texture ? value : new Color(value)
  }

  get animation(): PlayerAnimation | null {
    return this.driver.animation
  }

  /** Switching blends over from the current pose; the new animation starts from 0. */
  set animation(animation: PlayerAnimation | null) {
    if (animation === this.driver.animation) {
      if (animation) animation.progress = 0
      return
    }
    this.driver.animation = animation
    this.placeNameTag()
  }

  /** Seconds to blend between animations; 0 snaps. */
  get transition(): number {
    return this.driver.transition
  }

  set transition(value: number) {
    this.driver.transition = value
  }

  get nameTag(): NameTagObject | null {
    return this._nameTag
  }

  set nameTag(value: NameTagObject | string | null) {
    if (this._nameTag) {
      this.centre.remove(this._nameTag)
      if (this.ownsNameTag) this._nameTag.dispose()
    }
    this.ownsNameTag = typeof value === 'string'
    this._nameTag = typeof value === 'string' ? new NameTagObject(value) : value
    if (this._nameTag) {
      this.centre.add(this._nameTag)
      this.placeNameTag()
    }
  }

  get fov(): number {
    return this.camera.fov
  }

  set fov(value: number) {
    this.camera.fov = value
    this.adjustCameraDistance()
  }

  get zoom(): number {
    return this._zoom
  }

  set zoom(value: number) {
    this._zoom = value
    this.adjustCameraDistance()
  }

  /** Moves the camera along its current direction to the fov/zoom distance. */
  adjustCameraDistance(): void {
    const distance = cameraDistance(this.camera.fov, this._zoom)
    if (this.camera.position.lengthSq() === 0) this.camera.position.set(0, 0, 1)
    this.camera.position.setLength(distance)
    this.camera.updateProjectionMatrix()
  }

  resetCameraPose(): void {
    this.camera.position.set(0, 0, 1)
    this.camera.rotation.set(0, 0, 0)
    this.controls.target.set(0, 0, 0)
    this.adjustCameraDistance()
    this.controls.update()
  }

  get pixelRatio(): number | 'match-device' {
    return this._pixelRatio
  }

  set pixelRatio(value: number | 'match-device') {
    this._pixelRatio = value
    this.applyPixelRatio()
  }

  get width(): number {
    return this.renderer.getSize(new Vector2()).width
  }

  set width(value: number) {
    this.setSize(value, this.height)
  }

  get height(): number {
    return this.renderer.getSize(new Vector2()).height
  }

  set height(value: number) {
    this.setSize(this.width, value)
  }

  setSize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  get renderPaused(): boolean {
    return this._renderPaused
  }

  set renderPaused(value: boolean) {
    this._renderPaused = value
    if (value) this.stopLoop()
    else if (!this._disposed && !this.renderer.getContext().isContextLost()) this.startLoop()
  }

  get disposed(): boolean {
    return this._disposed
  }

  /** Renders a frame and returns it as a data URL. */
  toDataURL(type?: string, quality?: number): string {
    this.render()
    return this.canvas.toDataURL(type, quality)
  }

  /** Renders a frame and returns it as a Blob. */
  screenshot(type?: string, quality?: number): Promise<Blob> {
    // toBlob copies the bitmap during the call, so the frame rendered just
    // before is captured even without preserveDrawingBuffer.
    this.render()
    return new Promise((resolve, reject) =>
      this.canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Screenshot failed'))),
        type,
        quality,
      ),
    )
  }

  dispose(): void {
    this._disposed = true
    // Loads still in flight must not apply to, or create textures for, a
    // disposed viewer.
    for (const load of Object.values(this.loads)) load.cancel()
    this.stopLoop()
    this.stopLooking?.()
    this.stopLooking = null
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.pixelRatioQuery?.removeEventListener('change', this.onPixelRatioChange)
    this.controls.removeEventListener('start', this.onDragStart)
    this.controls.removeEventListener('end', this.onDragEnd)
    this.controls.dispose()
    this.nameTag = null
    this.background = null
    this.driver.dispose()
    this.shadow = false
    this.playerObject.dispose()
    this.renderer.dispose()
  }
}
