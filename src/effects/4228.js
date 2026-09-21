import { Effect } from '../Effect.js';
import { Particles_3816 } from '../particles/3816.js';
import { Particles_3817 } from '../particles/3817.js';
import { Particles_3818 } from '../particles/3818.js';
import { Particles_3819 } from '../particles/3819.js';

// Port of the Spore swarm effect:
//
//   effect effect-4228 -noAutoStop
//       lodDistances 10 500 1000 2000 2500 10000
//       particles particles-3818 -lodRange 1 6 -emitScale 1 1 1 1 1 1 -sizeScale 1 1 1 1 1 1 -alphaScale 0 1 1 1 1 1
//       particles particles-3819 -lodRange 1 6 -emitScale 1 1 1 1 1 1 -sizeScale 1 1 1 1 1 1 -alphaScale 0 1 1 1 1 1
//       particles particles-3816 -lodRange 2 6 -emitScale 1 1 1 1 1 -sizeScale 1 1 1 1 1 -alphaScale 0 0.5 0.5 0.5 0.5
//       particles particles-3817 -lodRange 2 6 -emitScale 1 1 1 1 1 -sizeScale 1 1 1 1 1 -alphaScale 0 0.5 0.5 0.5 0.5
//
// -noAutoStop needs no mapping: ParticleSystem.autoDestroy already defaults to false and
// all four systems are looping.
//
// Spore's single -emitScale is split into two unambiguous channels here, because it is
// not clear which it meant: `emitterScale` multiplies the emitter shape's radius, and
// `emissionScale` multiplies the emission rate and burst counts. Both default to all-1s
// when omitted, as do sizeScale and alphaScale, so the two identity rows above are left
// out rather than written as [1, 1, 1, 1, 1, 1].
//
// Note the alphaScale first entries: everything fades to nothing in its nearest in-range
// band, and bands below that are outside lodRange entirely. Close up, this effect is
// meant to be invisible -- you are inside the galaxy looking out.
export function Effect_4228() {
  return new Effect({
    name: 'effect-4228',
    lodDistances: [10, 500, 1000, 2000, 2500, 10000],
    particles: [
      // inner and outer star fields
      { system: Particles_3818(), lodRange: [1, 6], alphaScale: [0, 1, 1, 1, 1, 1] },
      { system: Particles_3819(), lodRange: [1, 6], alphaScale: [0, 1, 1, 1, 1, 1] },
      // nebula clouds, held back until band 2 and at half alpha
      { system: Particles_3816(), lodRange: [2, 6], alphaScale: [0, 0.5, 0.5, 0.5, 0.5] },
      { system: Particles_3817(), lodRange: [2, 6], alphaScale: [0, 0.5, 0.5, 0.5, 0.5] },
    ],
  });
}
