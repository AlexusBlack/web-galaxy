import { Effect } from '../Effect.js';
import { Particles_3820 } from '../particles/3820.js';
import { Particles_3821 } from '../particles/3821.js';

export function Effect_4229() {
  return new Effect({
    name: 'effect-4229',
    lodDistances: [100, 200, 500, 1000],
    particles: [
      { system: Particles_3821(), lodRange: [2, 4], alphaScale: [0, 1, 1] },
      { system: Particles_3820(), lodRange: [2, 4], alphaScale: [0, 1, 1] },
    ],
  });
}
