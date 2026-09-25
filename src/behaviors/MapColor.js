import { planeOf } from '../effectmaps/planes.js';

// `mapEmitColor`: tints each particle at spawn by an effect map read at its position.
//
//   new MapColor({ map: registry.get('0x86601D55') })
//
// WHY A BEHAVIOR AND NOT PART OF THE EMITTER. ParticleSystem.spawn() runs
// emitterShape.initialize() at ParticleSystem.ts:889, applies the worldSpace transform at
// :897-909, and only then calls behaviors[j].initialize() at :911. So a Behavior reads the
// genuine WORLD position -- which is exactly what a `-worldSpace` map rect wants -- with no
// origin assumption at all. Doing it in the shape would mean working in emitter-local space
// and hoping the emitter never moves. (Caching the emitter matrix in the shape's update()
// is not an escape: update() runs AFTER emit() at :1012, so the cache is a frame stale
// always and undefined on the very first frame -- which is the frame 2309's burst fires.)
//
// WHAT IT WRITES. startColor RGB and color RGB, and neither alpha.
//   - Both, because :828 copies startColor into color BEFORE initialize() and nothing
//     re-copies RGB afterwards -- OpacityOverLife (src/OpacityOverLife.js:35) and LodScale
//     write only .w -- so tinting startColor alone would leave frame one untinted.
//   - Not alpha, because startColor.w is the per-particle base that OpacityOverLife
//     multiplies its curve against. Clobbering it silently rescales the whole alpha curve.
//
// THE MAP'S OWN ALPHA IS A MASK, NOT AN OPACITY. SG_galaxy_arms_color is 85% alpha < 0.2,
// and the RGB under those transparent pixels is neither black nor meaningful -- it includes
// fully saturated strays that would splat as unexplained bright dots if alpha were ignored.
// So the tint is blended toward white by the map's alpha: transparent means "no tint here",
// opaque means "take the map's colour". Outside the rect is likewise no tint.
export class MapColor {
  constructor({ map, plane = 'xz', strength = 1 }) {
    if (!map || !map.baked) {
      throw new Error('MapColor: map must be a baked EffectMap (did loadAll() run?)');
    }
    if (map.baked.channels !== 4) {
      throw new Error(`MapColor: map ${map.id} baked ${map.baked.channels}-channel; a colour map must be -image`);
    }
    this.type = 'MapColor';
    this.map = map;
    this.plane = plane;
    this.strength = strength;
    this._axes = planeOf(plane, 'MapColor');
    this.rect = map.rect.slice();
    this._out = new Float32Array(4);
  }

  initialize(particle) {
    const { u, v } = this._axes;
    const inside = this.map.sample(particle.position[u], particle.position[v], this.rect, this._out);
    if (!inside) return;

    // mask = how much of this map's colour applies here.
    const mask = this._out[3] * this.strength;
    if (mask <= 0) return;

    const r = 1 + (this._out[0] - 1) * mask;
    const g = 1 + (this._out[1] - 1) * mask;
    const b = 1 + (this._out[2] - 1) * mask;

    particle.startColor.x *= r;
    particle.startColor.y *= g;
    particle.startColor.z *= b;
    particle.color.x = particle.startColor.x;
    particle.color.y = particle.startColor.y;
    particle.color.z = particle.startColor.z;
  }

  update() {}

  frameUpdate() {}

  reset() {}

  clone() {
    return new MapColor({ map: this.map, plane: this.plane, strength: this.strength });
  }

  toJSON() {
    throw new Error('MapColor.toJSON: not supported (runtime-only behavior)');
  }
}
