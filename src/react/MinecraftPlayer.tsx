import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { Vector3 } from 'three'
import type { PlayerAnimation } from '../animation/PlayerAnimation.js'
import type { ModelType } from '../format/skin.js'
import { PlayerObject, type BackEquipment } from '../model/PlayerObject.js'
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
  onLoad,
  onError,
  ref,
  ...group
}: MinecraftPlayerProps) {
  // Created inside an effect, not useMemo, so StrictMode's mount, unmount,
  // mount cycle disposes the first player and renders a fresh one.
  const [player, setPlayer] = useState<PlayerObject | null>(null)
  const [ready, setReady] = useState(false)
  const [tag, setTag] = useState<NameTagObject | null>(null)
  const loads = useMemo(
    () => ({ skin: createLatestWins(), cape: createLatestWins(), ears: createLatestWins() }),
    [],
  )
  const animationRef = useRef<PlayerAnimation | null>(null)
  // Canvases with frameloop="demand" only redraw when asked; texture loads
  // and the mutations below change nothing React can see.
  const invalidate = useThree((state) => state.invalidate)
  const capeLoaded = useRef(false)
  const callbacks = useRef({ onLoad, onError, backEquipment })
  callbacks.current = { onLoad, onError, backEquipment }

  useEffect(() => {
    const created = new PlayerObject()
    setPlayer(created)
    return () => {
      // Nothing still loading may apply to the disposed player or call back.
      for (const load of Object.values(loads)) load.cancel()
      created.dispose()
      setPlayer(null)
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
    if (typeof nameTag !== 'string') {
      setTag(nameTag)
      return
    }
    const created = new NameTagObject(nameTag)
    setTag(created)
    return () => created.dispose()
  }, [nameTag])

  useEffect(() => {
    if (!player) return
    const next = resolveAnimation(animation, animationRef.current)
    if (next !== animationRef.current) {
      player.resetPose()
      if (next) next.progress = 0
      animationRef.current = next
    }
  }, [player, animation])

  // Declared last so it runs after every other effect of a commit.
  useEffect(() => {
    invalidate()
  })

  useFrame((_, delta) => {
    if (!player) return
    const current = animationRef.current
    if (current) {
      if (animationSpeed !== undefined) current.speed = animationSpeed
      if (paused !== undefined) current.paused = paused
      current.update(player, delta)
    }
    if (tag) {
      const top = player.headTop(scratch)
      tag.position.set(top.x, top.y + NAME_TAG_GAP + (player.ears.visible ? EARS_EXTRA : 0), top.z)
    }
  })

  return (
    <group {...group} visible={ready && group.visible !== false}>
      {player && <primitive object={player} />}
      {player && tag && <primitive object={tag} />}
    </group>
  )
}
