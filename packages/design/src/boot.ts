import { MOTION_PREF_KEY } from './motion.ts';

/**
 * Inline <head> script that sets the same attributes as
 * `applyMotionAttributes(detectMotion())` before first paint, so a saved
 * "reduce motion" choice never flashes animation. Kept in sync with
 * detectMotion by test/motion.test.ts. Its own module so the string stays
 * out of client bundles that import motion.ts.
 */
export const motionBootScript =
  `(function(){var d=document.documentElement,n=navigator,c=n.connection,m=window.matchMedia,` +
  `r=!!m&&m("(prefers-reduced-motion: reduce)").matches;` +
  `try{r=r||localStorage.getItem(${JSON.stringify(MOTION_PREF_KEY)})==="reduced"}catch(e){}` +
  `if(r)d.dataset.motion="reduced";` +
  `if(c&&(c.saveData===true||c.effectiveType==="2g"||c.effectiveType==="slow-2g")||n.deviceMemory<=2)d.dataset.lite=""})()`;
