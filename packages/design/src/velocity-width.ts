/**
 * Velocity Width (docs/motion-spec.md section 5): display headings stretch
 * with scroll speed and always come to rest at wdth 100.
 *
 * Width is applied through `font-stretch`, which drives Archivo Display's
 * width axis. This changes text layout, the one deliberate exception to the
 * transform/opacity-only rule, so it is limited to MAX_HEADINGS elements and
 * only updates headings that are on screen.
 */
import { brakeEase, detectMotion, type MotionEnv } from './motion.ts';
import { duration, easing, fontWidth } from './tokens.ts';

export const MAX_HEADINGS = 4;
/** Smoothing time constant (ms) so width changes read as inertia. */
export const SMOOTHING_MS = 120;
/** Scroll pause (ms) after which the heading brakes back to rest. */
export const IDLE_MS = 100;
/**
 * Faster than any human scroll: treated as a jump (anchor link, End key,
 * scroll restoration, scrollBy), not speed, so headings don't stretch.
 * Width already saturates at 1000 px/s, so nothing visible is lost.
 */
export const JUMP_PX_PER_S = 12000;

const RANGE = fontWidth.max - fontWidth.rest;

/**
 * wdth = 100 + clamp(velocity / 40, -25, +25). Velocity is in px/s, positive
 * when scrolling down (stretch) and negative when scrolling up (compress).
 * Unverified: the spec doesn't state the unit; px/s saturates at 1000 px/s.
 */
export function velocityToWidth(velocity: number): number {
  return fontWidth.rest + Math.min(RANGE, Math.max(-RANGE, velocity / 40));
}

/** One exponential-smoothing step toward `target` after `dtMs`. */
export function smoothWidth(current: number, target: number, dtMs: number, tau = SMOOTHING_MS): number {
  return current + (target - current) * (1 - Math.exp(-dtMs / tau));
}

/** Width `elapsedMs` into the brake back to rest, starting from `from`. */
export function brakeWidth(from: number, elapsedMs: number): number {
  const t = Math.min(1, elapsedMs / duration.slow);
  return from + (fontWidth.rest - from) * brakeEase(t);
}

const setWidth = (el: HTMLElement, w: number) => el.style.setProperty('font-stretch', `${w}%`);

export interface VelocityWidthOptions {
  env?: MotionEnv;
  win?: Window & typeof globalThis;
}

/**
 * Landing page only. Returns a cleanup function. Does nothing (headings stay
 * at 100) under reduced motion or lite mode.
 */
export function velocityWidth(headings: HTMLElement[], opts: VelocityWidthOptions = {}): () => void {
  const win = opts.win ?? window;
  const env = opts.env ?? detectMotion(undefined, win);
  if (env.reducedMotion || env.lite || headings.length === 0) return () => {};
  if (headings.length > MAX_HEADINGS) {
    console.warn(`velocityWidth: only the first ${MAX_HEADINGS} of ${headings.length} headings will move`);
  }
  const els = headings.slice(0, MAX_HEADINGS);

  const visible = new Set<HTMLElement>(els);
  let io: IntersectionObserver | undefined;
  if ('IntersectionObserver' in win) {
    visible.clear();
    io = new win.IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) visible.add(el);
        else {
          visible.delete(el);
          setWidth(el, fontWidth.rest);
        }
      }
    });
    els.forEach((el) => io!.observe(el));
  }

  let width: number = fontWidth.rest;
  let applied = Math.round(width * 2) / 2;
  let target: number = fontWidth.rest;
  let mode: 'rest' | 'follow' | 'brake' = 'rest';
  // Read lazily: reading scrollY at startup forces a synchronous layout.
  let lastY: number | undefined;
  let lastT = 0;
  let lastMoveAt = 0;
  let brakeFrom = width;
  let brakeStart = 0;
  let raf = 0;

  const frame = (now: number) => {
    const dt = lastT ? now - lastT : 16;
    lastT = now;
    const y = win.scrollY;
    const dy = y - (lastY ?? y);
    lastY = y;

    const velocity = (dy / Math.max(dt, 1)) * 1000;
    if (dy !== 0 && Math.abs(velocity) <= JUMP_PX_PER_S) {
      mode = 'follow';
      lastMoveAt = now;
      target = velocityToWidth(velocity);
    } else if (mode === 'follow' && now - lastMoveAt > IDLE_MS) {
      mode = 'brake';
      brakeFrom = width;
      brakeStart = now;
    }

    if (mode === 'follow') width = smoothWidth(width, target, dt);
    else if (mode === 'brake') {
      width = brakeWidth(brakeFrom, now - brakeStart);
      if (now - brakeStart >= duration.slow) {
        width = fontWidth.rest;
        mode = 'rest';
      }
    }

    // Half-step rounding avoids relayout for changes nobody can see.
    const next = Math.round(width * 2) / 2;
    if (next !== applied) {
      applied = next;
      visible.forEach((el) => setWidth(el, next));
    }

    if (mode === 'rest') {
      raf = 0;
      lastT = 0;
    } else raf = win.requestAnimationFrame(frame);
  };

  const onScroll = () => {
    lastY ??= win.scrollY;
    if (!raf) raf = win.requestAnimationFrame(frame);
  };
  win.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    win.removeEventListener('scroll', onScroll);
    if (raf) win.cancelAnimationFrame(raf);
    io?.disconnect();
    els.forEach((el) => setWidth(el, fontWidth.rest));
  };
}

/**
 * Deeper pages: the page title enters at wdth 125 and settles to 100 in
 * `slow` with `brake`. Use once per page.
 */
export function settleWidth(el: HTMLElement, env: MotionEnv = detectMotion()): Animation | null {
  if (env.reducedMotion || env.lite || typeof el.animate !== 'function') return null;
  return el.animate([{ fontStretch: `${fontWidth.max}%` }, { fontStretch: `${fontWidth.rest}%` }], {
    duration: duration.slow,
    easing: easing.brake,
  });
}
