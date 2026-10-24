import {BufferGeometry, Float32BufferAttribute} from 'three';
import type {Pixels} from '../format/pixels.js';
import type {ModelType} from '../format/skin.js';
import {partLayout, type PartName} from './layout.js';
import {boxUV, type Face} from './uv.js';

type Axis = 0 | 1 | 2;
type Direction = readonly [axis: Axis, sign: 1 | -1];

// Each box face: the direction it faces, which 3D directions the image's
// rightward and downward run along (the same table applyBoxUV uses), and the
// axes along which its edge blocks reach over the box's edges.
//
// Blocks on neighbouring faces would otherwise leave an empty strip along
// every box edge. Each edge is filled by exactly one of its two faces: the
// sides fill the vertical edges, and the sides, front and back fill the edges
// with the top and bottom. The sides reach both ways, so they also fill the
// corners.
const FACES: readonly (readonly [
  Face,
  Direction,
  Direction,
  Direction,
  readonly Axis[],
])[] = [
  ['left', [0, 1], [2, -1], [1, -1], [2, 1]],
  ['right', [0, -1], [2, 1], [1, -1], [2, 1]],
  ['top', [1, 1], [0, 1], [2, 1], []],
  ['bottom', [1, -1], [0, 1], [2, 1], []],
  ['front', [2, 1], [0, 1], [1, -1], [1]],
  ['back', [2, -1], [0, -1], [1, -1], [1]],
];

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

/** Adds one axis-aligned quad facing `sign` along `axis`, with every vertex on the same texel. */
function quad(
  out: Builder,
  axis: Axis,
  sign: 1 | -1,
  plane: number,
  [a0, a1]: readonly [number, number],
  [b0, b1]: readonly [number, number],
  u: number,
  v: number,
): void {
  // The two in-plane axes in cyclic order, so (a, b) winds counter-clockwise
  // seen from +axis; reversed for faces pointing the other way.
  const a = ((axis + 1) % 3) as Axis;
  const b = ((axis + 2) % 3) as Axis;
  const corners: [number, number][] = [
    [a0, b0],
    [a1, b0],
    [a1, b1],
    [a0, b1],
  ];
  if (sign < 0) corners.reverse();
  const start = out.positions.length / 3;
  for (const [ca, cb] of corners) {
    const p = [0, 0, 0];
    p[axis] = plane;
    p[a] = ca;
    p[b] = cb;
    out.positions.push(p[0]!, p[1]!, p[2]!);
    const n = [0, 0, 0];
    n[axis] = sign;
    out.normals.push(n[0]!, n[1]!, n[2]!);
    out.uvs.push(u, v);
  }
  out.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

const sorted = (x: number, y: number): [number, number] =>
  x < y ? [x, y] : [y, x];

/**
 * The outer layer of one body part as small blocks, one per non-transparent
 * texel, the way the "3D Skin Layers" mod draws it. Each block stands on its
 * texel's square of the inner box and reaches out by twice the flat layer's
 * inflation. Inner faces are never emitted, and sides only where the
 * neighbouring texel on the same face is empty. Positions are relative to
 * the part's pivot, like the flat outer mesh with its offset applied.
 */
export function buildVoxelLayer(
  skin: Pixels,
  scale: number,
  part: PartName,
  model: ModelType,
): BufferGeometry {
  const layout = partLayout(part, model);
  const [w, h, d] = layout.size;
  const size = [w, h, d] as const;
  // As deep as the flat layer stands off (1 px on the head, 0.5 px
  // elsewhere), scaled with the texel so HD blocks keep their proportions.
  const thickness = (2 * layout.inflate) / scale;
  const rects = boxUV(layout.outerUv[0], layout.outerUv[1], w, h, d);
  const out: Builder = {positions: [], normals: [], uvs: [], indices: []};

  for (const [face, [nAxis, nSign], across, down, reach] of FACES) {
    const rect = rects[face];
    const cols = rect.w * scale;
    const rows = rect.h * scale;
    const opaque = (c: number, r: number) =>
      c >= 0 &&
      r >= 0 &&
      c < cols &&
      r < rows &&
      skin.data[
        ((rect.y * scale + r) * skin.width + rect.x * scale + c) * 4 + 3
      ]! > 0;
    // Where a fraction f (0 at the image's left or top edge) lands along an axis.
    const at = ([axis, sign]: Direction, f: number) =>
      sign * (f - 0.5) * size[axis];
    const inner = (nSign * size[nAxis]) / 2;
    const outer = inner + nSign * thickness;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!opaque(c, r)) continue;
        const u = (rect.x * scale + c + 0.5) / skin.width;
        const v = 1 - (rect.y * scale + r + 0.5) / skin.height;
        const aRange = sorted(at(across, c / cols), at(across, (c + 1) / cols));
        const bRange = sorted(at(down, r / rows), at(down, (r + 1) / rows));
        // Edge blocks reach over the box edge by the layer's thickness.
        for (const [axis, range] of [
          [across[0], aRange],
          [down[0], bRange],
        ] as const) {
          if (!reach.includes(axis)) continue;
          const half = size[axis] / 2;
          if (Math.abs(range[0] + half) < 1e-9) range[0] -= thickness;
          if (Math.abs(range[1] - half) < 1e-9) range[1] += thickness;
        }
        const nRange = sorted(inner, outer);
        // Lay the ranges onto x, y, z by axis.
        const ranges: [number, number][] = [];
        ranges[nAxis] = nRange;
        ranges[across[0]] = aRange;
        ranges[down[0]] = bRange;
        const add = (axis: Axis, sign: 1 | -1) => {
          const plane = sign > 0 ? ranges[axis]![1] : ranges[axis]![0];
          const a = ((axis + 1) % 3) as Axis;
          const b = ((axis + 2) % 3) as Axis;
          quad(out, axis, sign, plane, ranges[a]!, ranges[b]!, u, v);
        };
        add(nAxis, nSign);
        // Sides: towards each neighbour that has no block of its own. Moving
        // one column right goes along `across`, one row down along `down`.
        if (!opaque(c - 1, r)) add(across[0], -across[1] as 1 | -1);
        if (!opaque(c + 1, r)) add(across[0], across[1]);
        if (!opaque(c, r - 1)) add(down[0], -down[1] as 1 | -1);
        if (!opaque(c, r + 1)) add(down[0], down[1]);
      }
    }
  }

  const geometry = new BufferGeometry();
  const [ox, oy, oz] = layout.offset;
  for (let i = 0; i < out.positions.length; i += 3) {
    out.positions[i]! += ox;
    out.positions[i + 1]! += oy;
    out.positions[i + 2]! += oz;
  }
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(out.positions, 3),
  );
  geometry.setAttribute('normal', new Float32BufferAttribute(out.normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(out.uvs, 2));
  geometry.setIndex(out.indices);
  return geometry;
}
