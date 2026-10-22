import {describe, expect, it} from 'vitest';
import {MC_COLORS, hasFormatting, parseFormatted} from './format.js';

const plain = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  obfuscated: false,
};

describe('parseFormatted', () => {
  it('splits colour runs and resets with §r', () => {
    expect(parseFormatted('§6[Admin] §rSteve')).toEqual([
      {text: '[Admin] ', color: '#FFAA00', ...plain},
      {text: 'Steve', color: null, ...plain},
    ]);
  });

  it('lets a colour code reset styles set before it, as the game does', () => {
    expect(parseFormatted('§l§cHi')).toEqual([
      {text: 'Hi', color: '#FF5555', ...plain},
    ]);
  });

  it('keeps styles set after the colour', () => {
    expect(parseFormatted('§c§lHi')).toEqual([
      {text: 'Hi', color: '#FF5555', ...plain, bold: true},
    ]);
  });

  it('reads every style code', () => {
    const [segment] = parseFormatted('§o§n§m§kX');
    expect(segment).toEqual({
      text: 'X',
      color: null,
      bold: false,
      italic: true,
      underline: true,
      strikethrough: true,
      obfuscated: true,
    });
  });

  it('drops unknown codes', () => {
    expect(parseFormatted('§zX')).toEqual([{text: 'X', color: null, ...plain}]);
  });

  it('keeps a trailing § as text', () => {
    expect(parseFormatted('a§')).toEqual([{text: 'a§', color: null, ...plain}]);
  });

  it('accepts upper-case codes', () => {
    expect(parseFormatted('§CHi')[0]!.color).toBe('#FF5555');
  });

  it('returns plain text as one segment', () => {
    expect(parseFormatted('Steve')).toEqual([
      {text: 'Steve', color: null, ...plain},
    ]);
  });
});

describe('hasFormatting', () => {
  it('is false for plain names and true with a code', () => {
    expect(hasFormatting('Steve')).toBe(false);
    expect(hasFormatting('§aSteve')).toBe(true);
    expect(hasFormatting('a§')).toBe(false);
  });
});

describe('MC_COLORS', () => {
  it("has the game's 16 chat colours", () => {
    expect(Object.keys(MC_COLORS)).toHaveLength(16);
    expect(MC_COLORS.c).toBe('#FF5555');
    expect(MC_COLORS['0']).toBe('#000000');
    expect(MC_COLORS.f).toBe('#FFFFFF');
    expect(MC_COLORS['6']).toBe('#FFAA00');
  });
});
