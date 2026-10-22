import {
  AmbientLight,
  Color,
  EquirectangularReflectionMapping,
  Group,
  PerspectiveCamera,
  PointLight,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  type ColorRepresentation,
  type Mapping,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PlayerAnimation } from '../animation/PlayerAnimation.js'
import type { ModelType } from '../format/skin.js'
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
  /** Spins for auto-rotate. */
  readonly playerWrapper = new Group()
  readonly globalLight = new AmbientLight(0xffffff, 3)
  readonly cameraLight = new PointLight(0xffffff, 0.6)

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
  private _animation: PlayerAnimation | null = null
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

    this.canvas.addEventListener('webglcontextlost', this.onContextLost)
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    this.renderPaused = options.renderPaused ?? false
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
    this._animation?.update(this.playerObject, dt)
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
    return this._animation
  }

  /** Switching animation resets the pose; the new animation starts from 0. */
  set animation(animation: PlayerAnimation | null) {
    if (animation !== this._animation) {
      this.playerObject.resetPose()
      this.placeNameTag()
    }
    if (animation) animation.progress = 0
    this._animation = animation
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
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.pixelRatioQuery?.removeEventListener('change', this.onPixelRatioChange)
    this.controls.removeEventListener('start', this.onDragStart)
    this.controls.removeEventListener('end', this.onDragEnd)
    this.controls.dispose()
    this.nameTag = null
    this.background = null
    this.playerObject.dispose()
    this.renderer.dispose()
  }
}
