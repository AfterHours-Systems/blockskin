// A plain RGBA buffer, row 0 at the top. Everything that inspects or rewrites
// skin textures works on this instead of a canvas so it runs in Node too.
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Rgba = readonly [number, number, number, number];

export function createPixels(width: number, height: number): Pixels {
  return {width, height, data: new Uint8ClampedArray(width * height * 4)};
}

function checkRect(
  p: Pixels,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (x < 0 || y < 0 || w < 0 || h < 0 || x + w > p.width || y + h > p.height) {
    throw new RangeError(
      `rect ${x},${y} ${w}x${h} outside ${p.width}x${p.height}`,
    );
  }
}

export function getPixel(
  p: Pixels,
  x: number,
  y: number,
): [number, number, number, number] {
  checkRect(p, x, y, 1, 1);
  const i = (y * p.width + x) * 4;
  return [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!, p.data[i + 3]!];
}

export function setPixel(p: Pixels, x: number, y: number, rgba: Rgba): void {
  checkRect(p, x, y, 1, 1);
  p.data.set(rgba, (y * p.width + x) * 4);
}

export function copyRect(
  src: Pixels,
  sx: number,
  sy: number,
  w: number,
  h: number,
  dst: Pixels,
  dx: number,
  dy: number,
  opts: {flipX?: boolean} = {},
): void {
  checkRect(src, sx, sy, w, h);
  checkRect(dst, dx, dy, w, h);
  // Read the whole source rect first so overlapping copies within one buffer
  // (legacy conversion copies inside the same skin) never read written pixels.
  const rows: Uint8ClampedArray[] = [];
  for (let row = 0; row < h; row++) {
    const start = ((sy + row) * src.width + sx) * 4;
    rows.push(src.data.slice(start, start + w * 4));
  }
  for (let row = 0; row < h; row++) {
    const line = rows[row]!;
    for (let col = 0; col < w; col++) {
      const from = (opts.flipX ? w - 1 - col : col) * 4;
      dst.data.set(
        line.subarray(from, from + 4),
        ((dy + row) * dst.width + dx + col) * 4,
      );
    }
  }
}

export function clearRect(
  p: Pixels,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  checkRect(p, x, y, w, h);
  for (let row = y; row < y + h; row++) {
    p.data.fill(0, (row * p.width + x) * 4, (row * p.width + x + w) * 4);
  }
}

function everyPixel(
  p: Pixels,
  x: number,
  y: number,
  w: number,
  h: number,
  test: (i: number) => boolean,
): boolean {
  checkRect(p, x, y, w, h);
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      if (!test((row * p.width + col) * 4)) return false;
    }
  }
  return true;
}

export function hasTransparency(
  p: Pixels,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return !everyPixel(p, x, y, w, h, i => p.data[i + 3] === 255);
}

export function isUniform(
  p: Pixels,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: Rgba,
): boolean {
  return everyPixel(
    p,
    x,
    y,
    w,
    h,
    i =>
      p.data[i] === rgba[0] &&
      p.data[i + 1] === rgba[1] &&
      p.data[i + 2] === rgba[2] &&
      p.data[i + 3] === rgba[3],
  );
}
