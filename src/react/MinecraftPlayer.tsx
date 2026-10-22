import { useFrame, useThree, type ThreeElements, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { Vector2, Vector3, type Mesh } from 'three'
import type { ModelType } from '../format/skin.js'
import { PlayerDriver } from '../driver/PlayerDriver.js'
import { DEFAULT_REACTIONS, type ReactionSet } from '../driver/reactions.js'
import { addPointerListener, pointerTarget } from '../interaction/look.js'
import {
  awayFromCamera,
  isPoke,
  partFromObject,
  type PointerSample,
  type PokePart,
} from '../interaction/poke.js'
import { PlayerObject, type BackEquipment } from '../model/PlayerObject.js'
import { createShadow, disposeShadow, updateShadow } from '../model/shadow.js'
import { EARS_EXTRA, NAME_TAG_GAP } from '../nametag/layout.js'
import { NameTagObject } from '../nametag/NameTagObject.js'
import type { ImageInput } from '../textures/input.js'
import { createLatestWins } from '../textures/sequence.js'
import { loadEarsInto, loadSkinInto } from '../viewer/loadInto.js'
import {
  applyLayers,
  loadBackEquipment,
  resolveAnimation,
  type AnimationProp,
  type LayerVisibility,
} from './props.js'

export interface MinecraftPlayerProps extends Omit<
  ThreeElements['group'],
  'children' | 'ref' | 'layers'
> {
  /** Keep the value stable between renders (a string, or a memoised object): a new value reloads. */
  skin: ImageInput | null
  model?: ModelType | 'auto-detect'
  cape?: ImageInput | null
  /** Which item the cape texture shows as; `null` hides it without unloading. */
  backEquipment?: BackEquipment | null
  /** `true` shows the ears drawn on the skin. */
  ears?: boolean | { textureType: 'standalone' | 'skin'; source: ImageInput }
  layers?: LayerVisibility
  nameTag?: string | NameTagObject | null
  animation?: AnimationProp
  animationSpeed?: number
  paused?: boolean
  upsideDown?: boolean
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
  onLoad?: (model: ModelType) => void
  onError?: (error: unknown) => void
  ref?: Ref<PlayerObject | null>
}

const scratch = new Vector3()

/** A player for your own R3F scene, standing with its feet at the group's origin. */
export function MinecraftPlayer({
  skin,
  model = 'auto-detect',
  cape = null,
  backEquipment = 'cape',
  ears = false,
  layers,
  nameTag = null,
  animation = null,
  animationSpeed,
  paused,
  upsideDown = false,
  transition = 0.25,
  reactions = false,
  onPoke,
  lookAtPointer = false,
  layers3d = false,
  shadow = false,
  onLoad,
  onError,
  ref,
  ...group
}: MinecraftPlayerProps) {
  // Created inside an effect, not useMemo, so StrictMode's mount, unmount,
  // mount cycle disposes the first player and renders a fresh one.
  const [rig, setRig] = useState<{ player: PlayerObject; driver: PlayerDriver } | null>(null)
  const player = rig?.player ?? null
  const driver = rig?.driver ?? null
  const [ready, setReady] = useState(false)
  const [tag, setTag] = useState<NameTagObject | null>(null)
  const loads = useMemo(
    () => ({ skin: createLatestWins(), cape: createLatestWins(), ears: createLatestWins() }),
    [],
  )
  // Canvases with frameloop="demand" only redraw when asked; texture loads
  // and the mutations below change nothing React can see.
  const invalidate = useThree((state) => state.invalidate)
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const pointerDown = useRef<PointerSample | null>(null)
  const capeLoaded = useRef(false)
  const callbacks = useRef({ onLoad, onError, backEquipment, onPoke })
  callbacks.current = { onLoad, onError, backEquipment, onPoke }

  useEffect(() => {
    const created = new PlayerObject()
    const createdDriver = new PlayerDriver(created)
    setRig({ player: created, driver: createdDriver })
    return () => {
      // Nothing still loading may apply to the disposed player or call back.
      for (const load of Object.values(loads)) load.cancel()
      createdDriver.dispose()
      created.dispose()
      setRig(null)
      setReady(false)
    }
  }, [loads])

  useImperativeHandle<PlayerObject | null, PlayerObject | null>(ref, () => player, [player])

  const report = (error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (callbacks.current.onError) callbacks.current.onError(error)
    else console.error(error)
  }

  const earsFromSkin = ears === true
  useEffect(() => {
    if (!player) return
    loads
      .skin((signal) => loadSkinInto(player, skin, { model, ears: earsFromSkin }, signal))
      .then((result) => {
        if (result.stale) return
        invalidate()
        setReady(result.value != null)
        if (result.value) callbacks.current.onLoad?.(result.value)
      })
      .catch(report)
  }, [player, loads, skin, model, earsFromSkin, invalidate])

  const earsTexture = typeof ears === 'object' ? ears : null
  const earsOff = ears === false
  useEffect(() => {
    if (!player) return
    if (earsTexture) {
      loads
        .ears((signal) =>
          loadEarsInto(
            player,
            earsTexture.source,
            { textureType: earsTexture.textureType },
            signal,
          ),
        )
        .then(() => invalidate())
        .catch(report)
    } else if (ears === true) {
      // The skin effect reads these ears; a standalone load still in flight
      // must not land on top of them.
      loads.ears.cancel()
    } else if (earsOff) {
      void loads.ears(async () => player.applyEars(null)).then(() => invalidate())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, loads, earsTexture?.source, earsTexture?.textureType, earsOff, earsFromSkin])

  useEffect(() => {
    if (!player) return
    loads
      .cape((signal) =>
        loadBackEquipment(player, cape, () => callbacks.current.backEquipment, signal),
      )
      .then((result) => {
        if (result.stale) return
        capeLoaded.current = cape !== null
        invalidate()
      })
      .catch(report)
  }, [player, loads, cape, invalidate])

  useEffect(() => {
    if (player && capeLoaded.current) player.backEquipment = backEquipment
  }, [player, backEquipment])

  useEffect(() => {
    if (player) applyLayers(player, layers)
  })

  useEffect(() => {
    if (player) player.upsideDown = upsideDown
  }, [player, upsideDown])

  useEffect(() => {
    if (player) player.layers3d = layers3d
  }, [player, layers3d])

  const [shadowMesh, setShadowMesh] = useState<Mesh | null>(null)
  useEffect(() => {
    if (!shadow) return
    const created = createShadow()
    setShadowMesh(created)
    return () => {
      setShadowMesh(null)
      disposeShadow(created)
    }
  }, [shadow])

  useEffect(() => {
    if (typeof nameTag !== 'string') {
      setTag(nameTag)
      return
    }
    const created = new NameTagObject(nameTag)
    setTag(created)
    return () => created.dispose()
  }, [nameTag])

  useEffect(() => {
    if (!driver) return
    const next = resolveAnimation(animation, driver.animation)
    if (next !== driver.animation) driver.animation = next
  }, [driver, animation])

  useEffect(() => {
    if (driver) driver.transition = transition
  }, [driver, transition])

  useEffect(() => {
    if (!driver || !player || !lookAtPointer) return
    const mode = lookAtPointer === true ? 'window' : lookAtPointer
    const stop = addPointerListener(mode === 'window' ? window : domElement, (event) => {
      const rect = domElement.getBoundingClientRect()
      const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const head = player.skin.head.getWorldPosition(new Vector3())
      const distance = camera.getWorldPosition(new Vector3()).distanceTo(head)
      driver.lookAt(pointerTarget(camera, ndc, distance))
      invalidate()
    })
    return () => {
      stop()
      driver.lookAt(null)
    }
  }, [driver, player, lookAtPointer, camera, domElement, invalidate])

  useEffect(() => {
    if (driver) driver.reactions = reactions === true ? DEFAULT_REACTIONS : reactions || null
  }, [driver, reactions])

  type PointerHandler = ((event: ThreeEvent<PointerEvent>) => void) | undefined
  const { onPointerDown, onPointerUp, ...groupProps } = group
  // R3F types its event props as Readonly functions, which TypeScript won't call.
  const userPointerDown = onPointerDown as PointerHandler
  const userPointerUp = onPointerUp as PointerHandler

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    userPointerDown?.(event)
    const { clientX, clientY, timeStamp } = event.nativeEvent
    pointerDown.current = { x: clientX, y: clientY, time: timeStamp }
  }

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    userPointerUp?.(event)
    const down = pointerDown.current
    const { clientX, clientY, timeStamp } = event.nativeEvent
    if (!player || !driver || !down) return
    if (!isPoke(down, { x: clientX, y: clientY, time: timeStamp })) return
    // R3F calls this for each object along the ray, nearest first; the first
    // one that belongs to a visible part takes the poke.
    const part = partFromObject(event.object)
    if (!part) return
    event.stopPropagation()
    pointerDown.current = null
    callbacks.current.onPoke?.(part)
    driver.poke(part, awayFromCamera(camera, player))
    invalidate()
  }

  // Declared last so it runs after every other effect of a commit.
  useEffect(() => {
    invalidate()
  })

  useFrame((_, delta) => {
    if (!player || !driver) return
    const current = driver.animation
    if (current) {
      if (animationSpeed !== undefined) current.speed = animationSpeed
      if (paused !== undefined) current.paused = paused
    }
    // A demand-driven canvas reports the whole idle time as the first frame's
    // delta; capped, a poke's flash and knockback still play out visibly.
    driver.update(Math.min(delta, 0.1))
    if (shadowMesh) updateShadow(shadowMesh, player)
    // Reactions and transitions play out over several frames, which a
    // demand-driven canvas would otherwise not draw.
    if (driver.busy) invalidate()
    if (tag) {
      const top = player.headTop(scratch)
      tag.position.set(top.x, top.y + NAME_TAG_GAP + (player.ears.visible ? EARS_EXTRA : 0), top.z)
    }
  })

  return (
    <group
      {...groupProps}
      visible={ready && group.visible !== false}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {player && <primitive object={player} />}
      {player && tag && <primitive object={tag} />}
      {player && shadowMesh && <primitive object={shadowMesh} />}
    </group>
  )
}
