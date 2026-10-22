/**
 * 'system' follows the user's "reduce motion" setting; 'always' reduces
 * motion for everyone. There is deliberately no way to override a user who
 * asked for less motion.
 */
export type ReducedMotionMode = 'system' | 'always';

export function isReduced(
  mode: ReducedMotionMode,
  systemPrefersReduced: boolean,
): boolean {
  return mode === 'always' || (mode === 'system' && systemPrefersReduced);
}

/**
 * Calls `onChange` right away with whether motion should be reduced, and
 * again whenever the system setting changes. Returns the cleanup.
 */
export function watchReducedMotion(
  mode: ReducedMotionMode,
  onChange: (reduced: boolean) => void,
): () => void {
  if (mode !== 'system' || typeof matchMedia !== 'function') {
    onChange(isReduced(mode, false));
    return () => {};
  }
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const listener = (event: {matches: boolean}) => onChange(event.matches);
  onChange(query.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
