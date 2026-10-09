// The landing page's only initial script. Velocity Width on the display
// headings, the footer motion toggle, and the crossing scene's per-mode setup.
// GSAP is imported dynamically, after `load`, only where CSS scroll-driven
// animations are missing.
import {
  detectMotion,
  getMotionPreference,
  onMotionChange,
  setMotionPreference,
  type MotionEnv,
} from '@100kmph/design/motion';
import { velocityWidth } from '@100kmph/design/velocity-width';

const noop = () => {};
const root = document.documentElement;

/** `?scrub=gsap` forces the GSAP fallback so it can be tested in any browser. */
const forceGsap = new URLSearchParams(location.search).get('scrub') === 'gsap';

function afterLoad(fn: () => void) {
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(() => fn(), { timeout: 2000 }) : setTimeout(fn, 200));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

function setupCrossing(env: MotionEnv): () => void {
  const section = document.getElementById('crossing');
  if (!section || env.reducedMotion) return noop;

  if (env.lite) {
    // One 600 ms translate on enter; styles in crossing.css. Without
    // IntersectionObserver the rider just stays parked.
    if (!('IntersectionObserver' in window)) return noop;
    section.classList.add('crossing--armed');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          section.classList.add('crossing--in');
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(section);
    return () => {
      io.disconnect();
      section.classList.remove('crossing--armed', 'crossing--in');
    };
  }

  if (!forceGsap && CSS.supports('animation-timeline: view()')) return noop; // CSS handles it.

  if (forceGsap) section.dataset.scrub = 'gsap';
  let cancelled = false;
  let kill = noop;
  afterLoad(() => {
    import('./crossing-gsap.ts')
      .then(({ crossingScrub }) => {
        if (!cancelled) kill = crossingScrub(section);
      })
      // A failed chunk leaves the static frame, which is a correct fallback.
      .catch(noop);
  });
  return () => {
    cancelled = true;
    kill();
  };
}

const toggle = document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
const note = document.querySelector<HTMLElement>('[data-motion-note]');

/**
 * Pressed = motion is reduced. When the OS already reduces motion and the
 * footer choice is "system", the button can't change anything: it says so
 * through aria-disabled + the note (it stays focusable, so focus isn't lost).
 */
function setupToggle(env: MotionEnv) {
  if (!toggle) return;
  const byDevice = env.reducedMotion && getMotionPreference() !== 'reduced';
  toggle.setAttribute('aria-pressed', String(env.reducedMotion));
  if (byDevice) toggle.setAttribute('aria-disabled', 'true');
  else toggle.removeAttribute('aria-disabled');
  if (note) note.hidden = !byDevice;
}

toggle?.addEventListener('click', () => {
  if (toggle.getAttribute('aria-disabled') === 'true') return;
  // The crossing changes height between modes; keep the button where it was.
  const before = toggle.getBoundingClientRect().top;
  setMotionPreference(getMotionPreference() === 'reduced' ? 'system' : 'reduced');
  // Instant: base.css makes root scrolling smooth in full mode, and a glide
  // would both lag and read as real scroll speed to Velocity Width.
  scrollBy({ top: toggle.getBoundingClientRect().top - before, behavior: 'instant' });
});

let stopVelocity = noop;
let stopCrossing = noop;

function start(env: MotionEnv) {
  stopVelocity();
  stopCrossing();
  stopVelocity = velocityWidth([...document.querySelectorAll<HTMLElement>('[data-velocity]')], { env });
  stopCrossing = setupCrossing(env);
  setupToggle(env);
}

onMotionChange((env) => {
  // Ignition plays once per visit; a mode change must not replay it.
  root.dataset.ignited = '';
  start(env);
});
start(detectMotion());
