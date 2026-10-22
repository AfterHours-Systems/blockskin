import type { ChangeEvent } from 'react'
import { ANIMATION_NAMES, PART_NAMES } from '../src/index.js'
import { PRESETS, type PlaygroundState } from './state.js'

interface PanelProps {
  state: PlaygroundState
  set: (patch: Partial<PlaygroundState>) => void
  onFile: (url: string) => void
  onScreenshot: () => void
  error: string
}

export function Panel({ state, set, onFile, onScreenshot, error }: PanelProps) {
  const num = (key: 'fov' | 'zoom' | 'speed') => (e: ChangeEvent<HTMLInputElement>) =>
    set({ [key]: Number(e.target.value) })
  const check = (key: 'paused' | 'upsideDown' | 'panorama' | 'autoRotate' | 'controls') => (
    <label>
      <input
        type="checkbox"
        checked={state[key]}
        onChange={(e) => set({ [key]: e.target.checked })}
      />{' '}
      {key}
    </label>
  )
  const toggleLayer = (id: string) =>
    set({
      hidden: state.hidden.includes(id)
        ? state.hidden.filter((h) => h !== id)
        : [...state.hidden, id],
    })

  return (
    <form onSubmit={(e) => e.preventDefault()} style={{ width: 320 }}>
      <fieldset>
        <legend>Viewer</legend>
        <label>
          <input
            type="radio"
            checked={state.mode === 'react'}
            onChange={() => set({ mode: 'react' })}
          />{' '}
          R3F
        </label>
        <label>
          <input
            type="radio"
            checked={state.mode === 'vanilla'}
            onChange={() => set({ mode: 'vanilla' })}
          />{' '}
          vanilla SkinViewer
        </label>
      </fieldset>
      <fieldset>
        <legend>Skin</legend>
        <select value={state.skin} onChange={(e) => set({ skin: e.target.value })}>
          <option value="debug">debug (classic)</option>
          <option value="debug-slim">debug (slim)</option>
          <option value="debug-legacy">debug (legacy 64×32)</option>
          <option value="debug-hd">debug (HD 256)</option>
          {PRESETS.map((name) => (
            <option key={name} value={`name:${name}`}>
              {name}
            </option>
          ))}
          <option value="file">local file</option>
        </select>
        <input
          type="file"
          accept="image/png"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(URL.createObjectURL(file))
          }}
        />
        <label>
          URL{' '}
          <input
            defaultValue=""
            placeholder="https://…"
            onKeyDown={(e) => e.key === 'Enter' && set({ skin: e.currentTarget.value })}
          />
        </label>
        <select
          value={state.model}
          onChange={(e) => set({ model: e.target.value as PlaygroundState['model'] })}
        >
          <option value="auto-detect">auto-detect</option>
          <option value="classic">classic</option>
          <option value="slim">slim</option>
        </select>
      </fieldset>
      <fieldset>
        <legend>Layers</legend>
        {PART_NAMES.map((part) => (
          <div key={part}>
            {part}{' '}
            {(['inner', 'outer'] as const).map((layer) => {
              const id = `${part}.${layer}`
              return (
                <label key={id} style={{ display: 'inline' }}>
                  <input
                    type="checkbox"
                    checked={!state.hidden.includes(id)}
                    onChange={() => toggleLayer(id)}
                  />{' '}
                  {layer}{' '}
                </label>
              )
            })}
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend>Extras</legend>
        <select
          value={state.back}
          onChange={(e) => set({ back: e.target.value as PlaygroundState['back'] })}
        >
          <option value="none">no back equipment</option>
          <option value="cape">cape</option>
          <option value="elytra">elytra</option>
        </select>
        <select
          value={state.capeFormat}
          onChange={(e) => set({ capeFormat: e.target.value as PlaygroundState['capeFormat'] })}
        >
          <option value="64x32">cape 64×32</option>
          <option value="22x17">cape 22×17</option>
          <option value="46x22">cape 46×22</option>
        </select>
        <select
          value={state.ears}
          onChange={(e) => set({ ears: e.target.value as PlaygroundState['ears'] })}
        >
          <option value="off">no ears</option>
          <option value="skin">ears from skin</option>
          <option value="standalone">standalone ears</option>
        </select>
        <label>
          name tag{' '}
          <input value={state.nameTag} onChange={(e) => set({ nameTag: e.target.value })} />
        </label>
        {check('upsideDown')}
      </fieldset>
      <fieldset>
        <legend>Animation</legend>
        <select
          value={state.animation}
          onChange={(e) => set({ animation: e.target.value as PlaygroundState['animation'] })}
        >
          <option value="none">none</option>
          {ANIMATION_NAMES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <label>
          speed{' '}
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={state.speed}
            onChange={num('speed')}
          />
        </label>
        {check('paused')}
      </fieldset>
      <fieldset>
        <legend>Scene</legend>
        <label>
          background{' '}
          <input
            value={state.background}
            placeholder="transparent"
            onChange={(e) => set({ background: e.target.value })}
          />
        </label>
        {check('panorama')}
        <label>
          fov <input type="range" min={20} max={110} value={state.fov} onChange={num('fov')} />{' '}
          {state.fov}
        </label>
        <label>
          zoom{' '}
          <input
            type="range"
            min={0.2}
            max={2}
            step={0.05}
            value={state.zoom}
            onChange={num('zoom')}
          />{' '}
          {state.zoom}
        </label>
        {check('autoRotate')}
        {check('controls')}
      </fieldset>
      <button type="button" onClick={onScreenshot}>
        Screenshot
      </button>
      <div id="error">{error}</div>
    </form>
  )
}
