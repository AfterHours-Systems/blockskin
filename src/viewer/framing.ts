/**
 * How far the camera sits from the player's centre. At zoom 1 the top of the
 * head (16.5 above the centre, hat included) touches the top edge, measured
 * at the front of the head, 4.5 in front of the centre.
 */
export function cameraDistance(fovDegrees: number, zoom: number): number {
  const halfFov = (fovDegrees * Math.PI) / 360;
  const distance = 4.5 + 16.5 / Math.tan(halfFov) / zoom;
  // The orbit controls' default limits; framing never fights them.
  return Math.min(256, Math.max(10, distance));
}
