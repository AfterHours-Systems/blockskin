import { describe, expect, it } from 'vitest'
import { TextureFormatError } from '../format/errors.js'
import { setPixel, type Pixels } from '../format/pixels.js'
import { opaqueSkin, paint } from '../format/testPixels.js'
import { PlayerObject } from '../model/PlayerObject.js'
import { createLatestWins } from '../textures/sequence.js'
import { loadCapeInto, loadSkinInto, type PixelReader } from './loadInto.js'

function skin(): Pixels {
  const p = opaqueSkin(64, 64)
  setPixel(p, 0, 0, [0, 0, 0, 0])
  return p
}

function slim(): Pixels {
  return paint(skin(), 54, 20, 2, 12, [0, 0, 0, 0])
}

const readsAs =
  (pixels: Pixels): PixelReader =>
  async () =>
    pixels

describe('loadSkinInto', () => {
  it('applies what the reader returns', async () => {
    const player = new PlayerObject()
    expect(await loadSkinInto(player, 'a.png', {}, undefined, readsAs(slim()))).toBe('slim')
    expect(player.skin.visible).toBe(true)
  })

  it('keeps the previous skin when the read fails', async () => {
    const player = new PlayerObject()
    await loadSkinInto(player, 'a.png', {}, undefined, readsAs(skin()))
    const previous = player.skin.map
    const failing: PixelReader = async () => {
      throw new Error('404')
    }
    await expect(loadSkinInto(player, 'b.png', {}, undefined, failing)).rejects.toThrow('404')
    expect(player.skin.map).toBe(previous)
    expect(player.skin.visible).toBe(true)
  })

  it('keeps the previous skin when the image has the wrong size', async () => {
    const player = new PlayerObject()
    await loadSkinInto(player, 'a.png', {}, undefined, readsAs(skin()))
    const previous = player.skin.map
    const wrongSize = opaqueSkin(64, 48)
    await expect(
      loadSkinInto(player, 'b.png', {}, undefined, readsAs(wrongSize)),
    ).rejects.toBeInstanceOf(TextureFormatError)
    expect(player.skin.map).toBe(previous)
  })

  it('applies only the newer of two overlapping loads', async () => {
    const player = new PlayerObject()
    const run = createLatestWins()
    let releaseFirst!: () => void
    const firstRead: PixelReader = () =>
      new Promise((resolve) => {
        releaseFirst = () => resolve(slim())
      })
    const first = run((signal) => loadSkinInto(player, 'old.png', {}, signal, firstRead))
    const second = run((signal) => loadSkinInto(player, 'new.png', {}, signal, readsAs(skin())))
    expect(await second).toEqual({ stale: false, value: 'classic' })
    releaseFirst()
    expect(await first).toEqual({ stale: true })
    expect(player.skin.modelType).toBe('classic')
  })

  it('clears the skin for null input', async () => {
    const player = new PlayerObject()
    await loadSkinInto(player, 'a.png', {}, undefined, readsAs(skin()))
    expect(await loadSkinInto(player, null)).toBeNull()
    expect(player.skin.visible).toBe(false)
  })
})

describe('loadCapeInto', () => {
  it('keeps the previous cape when the image has the wrong size', async () => {
    const player = new PlayerObject()
    await loadCapeInto(player, 'cape.png', {}, undefined, readsAs(opaqueSkin(64, 32)))
    await expect(
      loadCapeInto(player, 'bad.png', {}, undefined, readsAs(opaqueSkin(50, 30))),
    ).rejects.toThrow()
    expect(player.backEquipment).toBe('cape')
  })
})
