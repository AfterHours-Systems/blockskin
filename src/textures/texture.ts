import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import type {Pixels} from '../format/pixels.js';

/**
 * A texture for skin-style pixel art. Rows are stored bottom-up so image row 0
 * lands at v = 1, the same convention canvas textures use, without relying on
 * UNPACK_FLIP_Y for typed arrays.
 */
export function createPixelTexture(pixels: Pixels): DataTexture {
  const {width, height} = pixels;
  const rowBytes = width * 4;
  const data = new Uint8Array(pixels.data.length);
  for (let row = 0; row < height; row++) {
    const from = row * rowBytes;
    data.set(
      pixels.data.subarray(from, from + rowBytes),
      (height - 1 - row) * rowBytes,
    );
  }
  const texture = new DataTexture(
    data,
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.flipY = false;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
