export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs a 0..1 animation on requestAnimationFrame; returns a cancel function. */
export function animate(duration: number, onFrame: (t: number) => void, ease = easeOutQuart): () => void {
  if (duration <= 0 || prefersReducedMotion()) {
    onFrame(1);
    return () => {};
  }
  const start = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    onFrame(ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
