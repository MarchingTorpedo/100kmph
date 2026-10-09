import { duration, easing, stagger, type DurationName, type EasingName, type StaggerName } from './tokens.ts';

/**
 * - reducedMotion: the OS setting or the footer toggle. No transforms; opacity
 *   and colour changes only.
 * - lite: Save-Data, 2g, or deviceMemory <= 2. No video, no pinning, CSS-only
 *   reveals.
 */
export interface MotionEnv {
  reducedMotion: boolean;
  lite: boolean;
}

export type MotionPreference = 'system' | 'reduced';

const PREF_KEY = '100kmph:motion';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

type NavigatorLike = Navigator & { connection?: NetworkInformationLike; deviceMemory?: number };

/** The footer toggle's saved choice. Storage can be missing or blocked. */
export function getMotionPreference(): MotionPreference {
  try {
    return localStorage.getItem(PREF_KEY) === 'reduced' ? 'reduced' : 'system';
  } catch {
    return 'system';
  }
}

const CHANGE_EVENT = '100kmph:motionchange';

export function setMotionPreference(pref: MotionPreference, root: HTMLElement = document.documentElement): void {
  try {
    if (pref === 'system') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    // Not persisted; still applied below for this page view.
  }
  applyMotionAttributes(root, detectMotion(pref));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: pref }));
}

/**
 * Calls `cb` with the new environment when the footer toggle or the OS
 * reduced-motion setting changes. `pref` is passed through because storage
 * may be blocked, in which case re-reading it would lose the choice.
 * Returns an unsubscribe function.
 */
export function onMotionChange(cb: (env: MotionEnv) => void, win: Window = window): () => void {
  let pref = getMotionPreference();
  const fire = () => {
    const env = detectMotion(pref, win);
    applyMotionAttributes(win.document.documentElement, env);
    cb(env);
  };
  const onToggle = (e: Event) => {
    pref = (e as CustomEvent<MotionPreference>).detail;
    fire();
  };
  const mq = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  mq?.addEventListener('change', fire);
  win.addEventListener(CHANGE_EVENT, onToggle);
  return () => {
    mq?.removeEventListener('change', fire);
    win.removeEventListener(CHANGE_EVENT, onToggle);
  };
}

/**
 * Inline <head> script that sets the same attributes as
 * `applyMotionAttributes(detectMotion())` before first paint, so a saved
 * "reduce motion" choice never flashes animation. Kept in sync with
 * detectMotion by test/motion.test.ts.
 */
export const motionBootScript =
  `(function(){var d=document.documentElement,n=navigator,c=n.connection,m=window.matchMedia,` +
  `r=!!m&&m("(prefers-reduced-motion: reduce)").matches;` +
  `try{r=r||localStorage.getItem(${JSON.stringify(PREF_KEY)})==="reduced"}catch(e){}` +
  `if(r)d.dataset.motion="reduced";` +
  `if(c&&(c.saveData===true||c.effectiveType==="2g"||c.effectiveType==="slow-2g")||n.deviceMemory<=2)d.dataset.lite=""})()`;

export function detectMotion(pref: MotionPreference = getMotionPreference(), win: Window = window): MotionEnv {
  const nav = win.navigator as NavigatorLike;
  const conn = nav.connection;
  const reducedMotion = pref === 'reduced' || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const lite =
    conn?.saveData === true ||
    conn?.effectiveType === '2g' ||
    conn?.effectiveType === 'slow-2g' ||
    (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2);
  return { reducedMotion, lite };
}

/** Sets `data-motion="reduced"` and `data-lite` on <html> for styles/base.css to key off. */
export function applyMotionAttributes(root: HTMLElement, env: MotionEnv): void {
  if (env.reducedMotion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
  if (env.lite) root.dataset.lite = '';
  else delete root.dataset.lite;
}

/**
 * Delay in ms for item `index` of a staggered group, or null when the item is
 * past the token's cap (s3 animates the first 6 cards only) and should simply
 * appear.
 */
export function staggerDelay(index: number, name: StaggerName): number | null {
  const s = stagger[name];
  return index < s.max ? index * s.step : null;
}

const MOTION_PROPS = new Set(['transform', 'translate', 'rotate', 'scale', 'clipPath', 'offsetDistance']);

/** Removes transform-like properties, keeping opacity and colour. */
export function stripMotion(keyframes: Keyframe[]): Keyframe[] {
  return keyframes
    .map((kf) => Object.fromEntries(Object.entries(kf).filter(([k]) => !MOTION_PROPS.has(k))) as Keyframe)
    .filter((kf) => Object.keys(kf).some((k) => k !== 'offset' && k !== 'easing' && k !== 'composite'));
}

export interface AnimateOptions {
  duration?: DurationName;
  easing?: EasingName;
  delay?: number;
  fill?: FillMode;
  env?: MotionEnv;
}

/**
 * WAAPI with token names. Under reduced motion, transforms are dropped and
 * only opacity/colour animate; returns null if nothing is left to animate.
 */
export function animate(el: Element, keyframes: Keyframe[], opts: AnimateOptions = {}): Animation | null {
  const env = opts.env ?? detectMotion();
  const frames = env.reducedMotion ? stripMotion(keyframes) : keyframes;
  if (frames.length < 2 || typeof el.animate !== 'function') return null;
  return el.animate(frames, {
    duration: duration[opts.duration ?? 'base'],
    easing: easing[opts.easing ?? 'brake'],
    delay: opts.delay ?? 0,
    fill: opts.fill ?? 'both',
  });
}

/**
 * CSS cubic-bezier(x1, y1, x2, y2) as a function of progress t in [0, 1].
 * Used where an easing must be sampled per frame (Velocity Width).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  const dBez = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = bez(x1, x2, s) - t;
      if (Math.abs(err) < 1e-6) break;
      const d = dBez(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    // Bisection fallback for flat spots the Newton steps can't escape.
    if (Math.abs(bez(x1, x2, s) - t) > 1e-4) {
      let lo = 0;
      let hi = 1;
      s = t;
      for (let i = 0; i < 30; i++) {
        if (bez(x1, x2, s) < t) lo = s;
        else hi = s;
        s = (lo + hi) / 2;
      }
    }
    return bez(y1, y2, s);
  };
}

/** The `brake` easing token, sampled. */
export const brakeEase = cubicBezier(0.05, 0.7, 0.1, 1);
