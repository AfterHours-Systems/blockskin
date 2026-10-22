/** The game's chat colours, by formatting code. */
export const MC_COLORS: Readonly<Record<string, string>> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF',
}

export interface Segment {
  text: string
  /** A chat colour, or null for the tag's own text style. */
  color: string | null
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  obfuscated: boolean
}

type Style = Omit<Segment, 'text'>

const STYLE_CODES: Readonly<Record<string, keyof Omit<Style, 'color'>>> = {
  l: 'bold',
  o: 'italic',
  n: 'underline',
  m: 'strikethrough',
  k: 'obfuscated',
}

const reset = (color: string | null = null): Style => ({
  color,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  obfuscated: false,
})

/**
 * Splits text with `§` formatting codes into styled runs. As in the game, a
 * colour code also clears bold, italic and the other styles, `§r` clears
 * everything, unknown codes are dropped, and a `§` at the very end is text.
 */
export function parseFormatted(text: string): Segment[] {
  const segments: Segment[] = []
  let style = reset()
  let run = ''
  const flush = () => {
    if (run) segments.push({ text: run, ...style })
    run = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char !== '§' || i === text.length - 1) {
      run += char
      continue
    }
    const code = text[++i]!.toLowerCase()
    flush()
    const color = MC_COLORS[code]
    if (color) style = reset(color)
    else if (code === 'r') style = reset()
    else if (STYLE_CODES[code]) style = { ...style, [STYLE_CODES[code]]: true }
  }
  flush()
  return segments
}

export function hasFormatting(text: string): boolean {
  return /§[0-9a-fk-or]/i.test(text)
}
