// The tracking page's only script: the title entrance (once), the footer
// motion toggle (pattern copied from the storefront) and the demo Call note.
// The route line draw is pure CSS.
import { detectMotion, getMotionPreference, onMotionChange, setMotionPreference, type MotionEnv } from '@100kmph/design/motion';
import { settleWidth } from '@100kmph/design/velocity-width';

const toggle = document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
const note = document.querySelector<HTMLElement>('[data-motion-note]');

/** Pressed = motion is reduced. If the OS already reduces it, the button is inert (aria-disabled) and says so. */
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
  setMotionPreference(getMotionPreference() === 'reduced' ? 'system' : 'reduced');
});

onMotionChange(setupToggle);
const env = detectMotion();
setupToggle(env);

// Page title enters at wdth 125 and settles to 100, once per page load.
const title = document.querySelector<HTMLElement>('h1[data-settle]');
if (title) settleWidth(title, env);

// Prototype only: no number exists in the page and nothing is dialled.
const call = document.querySelector<HTMLButtonElement>('[data-call]');
const callNote = document.querySelector<HTMLElement>('[data-call-note]');
call?.addEventListener('click', () => {
  if (call.getAttribute('aria-disabled') === 'true' || !callNote) return;
  callNote.hidden = false;
});
