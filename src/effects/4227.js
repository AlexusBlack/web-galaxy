import { Effect } from '../Effect.js';
import { Particles_2309 } from '../particles/2309.js';

export function Effect_4227() {
  return new Effect({
    name: 'effect-4227',
    lodDistances: [69, 70, 300, 500, 600, 3000, 6000, 8500],
    particles: [
      { system: Particles_2309(), lodRange: [3, 8], alphaScale: [0, 1, 1, 1, 1, 1] },
    ],
  });
}
