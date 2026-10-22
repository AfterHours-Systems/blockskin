import { describe, expect, it } from 'vitest'
import * as api from './index.js'

describe('public API', () => {
  it('keeps internal helpers out of the package root', () => {
    for (const name of [
      'capturePose',
      'restorePose',
      'blendFrom',
      'easeOut',
      'addPointerListener',
      'pointerTarget',
      'partReaction',
      'isPoke',
      'pokePointer',
      'createPokeTracker',
    ]) {
      expect(api, name).not.toHaveProperty(name)
    }
  })

  it('names the built-in reactions so they read as reactions', () => {
    for (const name of ['hurt', 'jump', 'waveBack', 'crouchSpam', 'shakeHead']) {
      expect(api, name).not.toHaveProperty(name)
    }
    for (const name of [
      'hurtReaction',
      'shakeHeadReaction',
      'waveBackReaction',
      'jumpReaction',
      'crouchSpamReaction',
      'DEFAULT_REACTIONS',
      'PlayerDriver',
      'RandomActions',
    ]) {
      expect(api, name).toHaveProperty(name)
    }
  })
})
