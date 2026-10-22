export type Margin = readonly [
  top: number,
  right: number,
  bottom: number,
  left: number,
];

export interface NameTagLayout {
  canvasWidth: number;
  canvasHeight: number;
  spriteWidth: number;
  spriteHeight: number;
}

/** Sizes the label canvas around the text and the sprite to the same aspect. */
export function nameTagLayout(
  textWidth: number,
  fontHeight: number,
  margin: Margin,
  height: number,
): NameTagLayout {
  const [top, right, bottom, left] = margin;
  const canvasWidth = Math.ceil(textWidth) + left + right;
  const canvasHeight = Math.ceil(fontHeight) + top + bottom;
  return {
    canvasWidth,
    canvasHeight,
    spriteWidth: (height * canvasWidth) / canvasHeight,
    spriteHeight: height,
  };
}

/** Gap between the top of the head and the tag's centre: the game's 0.5 blocks above a 1.8 block player. */
export const NAME_TAG_GAP = 4.3;
/** Extra lift when ears are shown, so the tag clears them. */
export const EARS_EXTRA = 5;
