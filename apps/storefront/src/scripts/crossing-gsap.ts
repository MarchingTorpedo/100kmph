// GSAP fallback for the crossing scene, for browsers without CSS scroll-driven
// animations. Loaded on demand by landing.ts after `load`. Mirrors the CSS in
// styles/crossing.css: same 150vh scrub window, starting when the section's
// top is 45% down the viewport (CSS: cover 55vh). Pinning stays CSS sticky.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function crossingScrub(section: HTMLElement): () => void {
  const track = section.querySelector<HTMLElement>('.crossing__track')!;
  const vehicle = section.querySelector<HTMLElement>('.crossing__vehicle')!;
  const streaks = section.querySelector<SVGElement>('.crossing__streaks')!;
  const numeral = section.querySelector<HTMLElement>('.crossing__numeral')!;

  // GSAP drives `transform`; drop the CSS `translate` parking so they don't add up.
  vehicle.style.translate = 'none';

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: section,
      start: 'top 45%',
      end: () => `+=${window.innerHeight * 1.5}`,
      scrub: true,
      invalidateOnRefresh: true,
    },
  });

  tl.fromTo(vehicle, { xPercent: -100, x: 0 }, { xPercent: 0, x: () => track.clientWidth, duration: 1 }, 0)
    .fromTo(streaks, { opacity: 0.9 }, { opacity: 0.5, duration: 0.6 }, 0)
    .to(streaks, { opacity: 0, duration: 0.4 }, 0.6)
    .fromTo(numeral, { fontStretch: '100%' }, { fontStretch: '125%', duration: 0.5 }, 0)
    .to(numeral, { fontStretch: '100%', duration: 0.5 }, 0.5);

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set([vehicle, streaks, numeral], { clearProps: 'all' });
  };
}
