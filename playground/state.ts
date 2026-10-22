import type { AnimationName, ImageInput, PartName } from '../src/index.js'
import { debugCape, debugEars, debugSkin } from './fixtures.js'

export interface PlaygroundState {
  /** 'player' is MinecraftPlayer in its own <Canvas frameloop="demand">. */
  mode: 'react' | 'vanilla' | 'player'
  /** 'debug', 'debug-slim', 'debug-legacy', 'debug-hd', 'name:<player>' or a URL. */
  skin: string
  model: 'auto-detect' | 'classic' | 'slim'
  /** Hidden layers as 'head.outer', 'body.inner', … */
  hidden: string[]
  back: 'none' | 'cape' | 'elytra'
  capeFormat: '64x32' | '22x17' | '46x22'
  ears: 'off' | 'skin' | 'standalone'
  nameTag: string
  animation: AnimationName | 'none'
  speed: number
  transition: number
  paused: boolean
  upsideDown: boolean
  /** '' for transparent. */
  background: string
  panorama: boolean
  cameraLight: number
  fov: number
  zoom: number
  autoRotate: boolean
  controls: boolean
}

export const DEFAULT_STATE: PlaygroundState = {
  mode: 'react',
  skin: 'debug',
  model: 'auto-detect',
  hidden: [],
  back: 'none',
  capeFormat: '64x32',
  ears: 'off',
  nameTag: '',
  animation: 'walk',
  speed: 1,
  transition: 0.25,
  paused: false,
  upsideDown: false,
  background: '',
  panorama: false,
  cameraLight: 0,
  fov: 50,
  zoom: 0.85,
  autoRotate: true,
  controls: true,
}

/** Reads overrides from the query string, e.g. ?mode=vanilla&animation=none. */
export function stateFromUrl(search: string): PlaygroundState {
  const params = new URLSearchParams(search)
  const state: PlaygroundState = { ...DEFAULT_STATE, hidden: [] }
  for (const [key, raw] of params) {
    if (!(key in DEFAULT_STATE)) continue
    const k = key as keyof PlaygroundState
    const current = DEFAULT_STATE[k]
    const value =
      typeof current === 'number'
        ? Number(raw)
        : typeof current === 'boolean'
          ? raw === 'true' || raw === '1'
          : Array.isArray(current)
            ? raw.split(',').filter(Boolean)
            : raw
    Object.assign(state, { [k]: value })
  }
  return state
}

export const PRESETS = ['Notch', 'jeb_', 'Technoblade', 'deadmau5', 'MHF_Alex', 'MHF_Steve']

export function skinInput(skin: string, file: string | null): ImageInput {
  if (skin === 'file' && file) return file
  if (skin === 'debug') return debugSkin()
  if (skin === 'debug-slim') return debugSkin({ slim: true })
  if (skin === 'debug-legacy') return debugSkin({ legacy: true })
  if (skin === 'debug-hd') return debugSkin({ scale: 4 })
  if (skin.startsWith('name:'))
    return `https://mc-heads.net/skin/${encodeURIComponent(skin.slice(5))}`
  return skin
}

export function capeInput(state: Pick<PlaygroundState, 'back' | 'capeFormat'>): ImageInput | null {
  return state.back === 'none' ? null : debugCape(state.capeFormat)
}

export function earsInput(ears: PlaygroundState['ears']) {
  if (ears === 'standalone') return { textureType: 'standalone' as const, source: debugEars() }
  return ears === 'skin'
}

export function layersFromHidden(hidden: string[]) {
  const layers: Partial<Record<PartName, { inner?: boolean; outer?: boolean }>> = {}
  for (const entry of hidden) {
    const [part, layer] = entry.split('.') as [PartName, 'inner' | 'outer']
    layers[part] = { ...layers[part], [layer]: false }
  }
  return layers
}
