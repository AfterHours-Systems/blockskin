import {describe, expect, it} from 'vitest';
import {nameTagLayout} from './layout.js';

describe('nameTagLayout', () => {
  it('adds the margins around the text', () => {
    const layout = nameTagLayout(100.2, 40, [5, 10, 6, 11], 4);
    expect(layout.canvasWidth).toBe(101 + 21);
    expect(layout.canvasHeight).toBe(40 + 11);
  });

  it('keeps the sprite at the canvas aspect for the given height', () => {
    const layout = nameTagLayout(200, 48, [5, 10, 5, 10], 4);
    expect(layout.spriteHeight).toBe(4);
    expect(layout.spriteWidth / layout.spriteHeight).toBeCloseTo(
      layout.canvasWidth / layout.canvasHeight,
    );
  });
});
