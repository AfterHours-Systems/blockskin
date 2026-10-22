import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import {
  Color,
  EquirectangularReflectionMapping,
  PointLight,
  SRGBColorSpace,
  Texture,
  type Camera,
  type ColorRepresentation,
  type Group,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three'
import type { OrbitControls as ThreeOrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PlayerObject } from '../model/PlayerObject.js'
import { loadTextureSource, type ImageInput } from '../textures/input.js'
import { createLatestWins } from '../textures/sequence.js'
import { watchReducedMotion, type ReducedMotionMode } from '../interaction/motion.js'
import { cameraDistance } from '../viewer/framing.js'
import { MinecraftPlayer, type MinecraftPlayerProps } from './MinecraftPlayer.js'
import { OrbitControls } from './OrbitControls.js'

export interface SkinViewerHandle {
  readonly player: PlayerObject | null
  /** Renders a frame and returns it as a data URL. */
  toDataURL(type?: string, quality?: number): string
  /** Renders a frame and returns it as a Blob. */
  screenshot(type?: string, quality?: number): Promise<Blob>
  resetCameraPose(): void
}

export interface SkinViewerProps extends Omit<MinecraftPlayerProps, 'ref'> {
  width?: number | string
  height?: number | string
  className?: string
  style?: CSSProperties
  pixelRatio?: number | 'match-device'
  /** Transparent by default. */
  background?: ColorRepresentation | null
  backgroundImage?: ImageInput | null
  /** An equirectangular image; wins over backgroundImage, which wins over background. */
  panorama?: ImageInput | null
  fov?: number
  zoom?: number
  controls?: boolean
  autoRotate?: boolean
  /** Radians per second. */
  autoRotateSpeed?: number
  antialias?: boolean
  preserveDrawingBuffer?: boolean
  renderPaused?: boolean
  globalLightIntensity?: number
  cameraLightIntensity?: number
  /** Rendered into the same scene as the player. */
  children?: ReactNode
  ref?: Ref<SkinViewerHandle>
}

interface Internals {
  gl: WebGLRenderer
  scene: Scene
  camera: Camera
}

function useDevicePixelRatio(enabled: boolean): number {
  const [ratio, setRatio] = useState(() =>
    typeof window === 'undefined' ? 1 : window.devicePixelRatio,
  )
  useEffect(() => {
    if (!enabled) return
    let query: MediaQueryList
    const update = () => {
      setRatio(window.devicePixelRatio)
      watch()
    }
    // A resolution query only fires once the ratio moves off its value, so
    // it is re-armed for the new ratio each time.
    const watch = () => {
      query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      query.addEventListener('change', update, { once: true })
    }
    watch()
    return () => query.removeEventListener('change', update)
  }, [enabled])
  return ratio
}

interface StageProps {
  reducedMotion: ReducedMotionMode
  fov: number
  zoom: number
  controls: boolean
  autoRotate: boolean
  autoRotateSpeed: number
  background: ColorRepresentation | null
  backgroundImage: ImageInput | null
  panorama: ImageInput | null
  globalLightIntensity: number
  cameraLightIntensity: number
  internals: RefObject<Internals | null>
  controlsRef: RefObject<ThreeOrbitControls | null>
  playerRef: RefObject<PlayerObject | null>
  playerProps: Omit<MinecraftPlayerProps, 'ref'>
  onError?: (error: unknown) => void
  children?: ReactNode
}

function Stage({
  reducedMotion,
  fov,
  zoom,
  controls,
  autoRotate,
  autoRotateSpeed,
  background,
  backgroundImage,
  panorama,
  globalLightIntensity,
  cameraLightIntensity,
  internals,
  controlsRef,
  playerRef,
  playerProps,
  onError,
  children,
}: StageProps) {
  const { gl, scene, camera } = useThree()
  const wrapper = useRef<Group>(null)
  const dragging = useRef(false)
  // Auto-rotate pauses while motion is reduced; the player handles the rest.
  const motionReduced = useRef(false)
  useEffect(
    () =>
      watchReducedMotion(reducedMotion, (reduced) => {
        motionReduced.current = reduced
      }),
    [reducedMotion],
  )
  // No distance falloff, so the intensity means the same at any zoom.
  const cameraLight = useMemo(() => new PointLight(0xffffff, 0, 0, 0), [])
  const loadBackground = useMemo(() => createLatestWins(), [])

  internals.current = { gl, scene, camera }

  // The default camera isn't part of the scene, and a light attached to it
  // only counts once it is.
  useEffect(() => {
    scene.add(camera)
    camera.add(cameraLight)
    return () => {
      camera.remove(cameraLight)
      scene.remove(camera)
    }
  }, [scene, camera, cameraLight])

  useEffect(() => {
    cameraLight.intensity = cameraLightIntensity
  }, [cameraLight, cameraLightIntensity])

  useEffect(() => {
    const perspective = camera as PerspectiveCamera
    perspective.fov = fov
    if (perspective.position.lengthSq() === 0) perspective.position.set(0, 0, 1)
    perspective.position.setLength(cameraDistance(fov, zoom))
    perspective.updateProjectionMatrix()
  }, [camera, fov, zoom])

  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const image = panorama ?? backgroundImage
  const isPanorama = panorama != null

  // Colour and image are separate effects so a colour change never reloads
  // the image, and an unrelated re-render (say, a new inline onError)
  // triggers neither.
  useEffect(() => {
    if (image) return
    scene.background = background === null ? null : new Color(background)
  }, [scene, background, image])

  useEffect(() => {
    if (!image) {
      loadBackground.cancel()
      return
    }
    let texture: Texture | null = null
    loadBackground(async (signal) => {
      const source = await loadTextureSource(image, signal)
      if (signal.aborted) return
      texture = new Texture(source)
      texture.colorSpace = SRGBColorSpace
      if (isPanorama) texture.mapping = EquirectangularReflectionMapping
      texture.needsUpdate = true
      scene.background = texture
    }).catch((error: unknown) => (onErrorRef.current ?? console.error)(error))
    return () => {
      loadBackground.cancel()
      if (texture && scene.background === texture) scene.background = null
      texture?.dispose()
    }
  }, [scene, image, isPanorama, loadBackground])

  const onDragChange = useCallback((value: boolean) => {
    dragging.current = value
  }, [])

  useFrame((_, delta) => {
    if (
      autoRotate &&
      !motionReduced.current &&
      wrapper.current &&
      !(controls && dragging.current)
    ) {
      wrapper.current.rotation.y += delta * autoRotateSpeed
    }
  })

  return (
    <>
      <ambientLight intensity={globalLightIntensity} />
      <OrbitControls enabled={controls} controlsRef={controlsRef} onDragChange={onDragChange} />
      <group ref={wrapper}>
        {/* Centres the player (feet at 0, head at 32) on the orbit target. */}
        <group position={[0, -16, 0]}>
          <MinecraftPlayer {...playerProps} onError={onError} ref={playerRef} />
        </group>
      </group>
      {children}
    </>
  )
}

/** A ready-made viewer: an R3F canvas with camera framing, controls, lights and the player. */
export function SkinViewer({
  width = 300,
  height = 300,
  className,
  style,
  pixelRatio = 'match-device',
  background = null,
  backgroundImage = null,
  panorama = null,
  fov = 50,
  zoom = 0.9,
  controls = true,
  autoRotate = false,
  autoRotateSpeed = 1,
  antialias = true,
  preserveDrawingBuffer = false,
  renderPaused = false,
  globalLightIntensity = 3,
  cameraLightIntensity = 0,
  children,
  ref,
  ...playerProps
}: SkinViewerProps) {
  const internals = useRef<Internals | null>(null)
  const controlsRef = useRef<ThreeOrbitControls | null>(null)
  const playerRef = useRef<PlayerObject | null>(null)
  const deviceRatio = useDevicePixelRatio(pixelRatio === 'match-device')
  const framing = useRef({ fov, zoom })
  framing.current = { fov, zoom }

  useImperativeHandle(ref, () => {
    const capture = () => {
      const current = internals.current
      if (!current) throw new Error('SkinViewer is not mounted')
      current.gl.render(current.scene, current.camera)
      return current.gl.domElement
    }
    return {
      get player() {
        return playerRef.current
      },
      toDataURL: (type, quality) => capture().toDataURL(type, quality),
      // toBlob copies the bitmap during the call, so the frame rendered
      // just before is captured even without preserveDrawingBuffer.
      screenshot: (type, quality) =>
        new Promise((resolve, reject) =>
          capture().toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Screenshot failed'))),
            type,
            quality,
          ),
        ),
      resetCameraPose: () => {
        const camera = internals.current?.camera as PerspectiveCamera | undefined
        if (!camera) return
        camera.position.set(0, 0, cameraDistance(framing.current.fov, framing.current.zoom))
        camera.rotation.set(0, 0, 0)
        controlsRef.current?.target.set(0, 0, 0)
        controlsRef.current?.update()
      },
    }
  }, [])

  return (
    <div className={className} style={{ width, height, ...style }}>
      <Canvas
        // flat: no tone mapping, so skin colours come out as painted.
        flat
        gl={{ alpha: true, antialias, preserveDrawingBuffer }}
        dpr={pixelRatio === 'match-device' ? deviceRatio : pixelRatio}
        frameloop={renderPaused ? 'never' : 'always'}
        camera={{ fov, position: [0, 0, cameraDistance(fov, zoom)] }}
      >
        <Stage
          reducedMotion={playerProps.reducedMotion ?? 'system'}
          fov={fov}
          zoom={zoom}
          controls={controls}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
          background={background}
          backgroundImage={backgroundImage}
          panorama={panorama}
          globalLightIntensity={globalLightIntensity}
          cameraLightIntensity={cameraLightIntensity}
          internals={internals}
          controlsRef={controlsRef}
          playerRef={playerRef}
          playerProps={playerProps}
          onError={playerProps.onError}
        >
          {children}
        </Stage>
      </Canvas>
    </div>
  )
}
