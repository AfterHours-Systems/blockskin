import { useFrame, type ThreeElements } from '@react-three/fiber'
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { Vector3 } from 'three'
import type { PlayerAnimation } from '../animation/PlayerAnimation.js'
import type { ModelType } from '../format/skin.js'
import { PlayerObject, type BackEquipment } from '../model/PlayerObject.js'
import { EARS_EXTRA, NAME_TAG_GAP } from '../nametag/layout.js'
import { NameTagObject } from '../nametag/NameTagObject.js'
import type { ImageInput } from '../textures/input.js'
import { createLatestWins } from '../textures/sequence.js'
import { loadCapeInto, loadEarsInto, loadSkinInto } from '../viewer/loadInto.js'
import { applyLayers, resolveAnimation, type AnimationProp, type LayerVisibility } from './props.js'

export interface MinecraftPlayerProps extends Omit<
  ThreeElements['group'],
  'children' | 'ref' | 'layers'
> {
  /** Keep the value stable between renders (a string, or a memoised object): a new value reloads. */
  skin: ImageInput | null
  model?: ModelType | 'auto-detect'
  cape?: ImageInput | null
  backEquipment?: BackEquipment
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
  const callbacks = useRef({ onLoad, onError, backEquipment })
  callbacks.current = { onLoad, onError, backEquipment }

  useEffect(() => {
    const created = new PlayerObject()
    setPlayer(created)
    return () => {
      created.dispose()
      setPlayer(null)
      setReady(false)
    }
  }, [])

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
        setReady(result.value != null)
        if (result.value) callbacks.current.onLoad?.(result.value)
      })
      .catch(report)
  }, [player, loads, skin, model, earsFromSkin])

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
        .catch(report)
    } else if (earsOff) {
      void loads.ears(async () => player.applyEars(null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, loads, earsTexture?.source, earsTexture?.textureType, earsOff])

  useEffect(() => {
    if (!player) return
    loads
      .cape((signal) =>
        loadCapeInto(player, cape, { backEquipment: callbacks.current.backEquipment }, signal),
      )
      .catch(report)
  }, [player, loads, cape])

  useEffect(() => {
    if (player && player.backEquipment !== null) player.backEquipment = backEquipment
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
