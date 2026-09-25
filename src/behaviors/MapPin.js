import { planeOf } from '../effectmaps/planes.js';

// `mapPin`: displaces each particle along the plane's normal at spawn, by a SIGNED amount
// read from an effect map.
//
//   new MapPin({ map: registry.get('0x6F3E772B') })
//
// In the traced galaxy graph 0x6F3E772B is (SG_galaxy_heights + (-0.5)) * 20, which is
// already a signed offset in world units -- the map arithmetic does the scaling, so this
// behavior only adds. See src/effectmaps/galaxyMaps.js for why the -0.5 is kept literal
// even though the texture's flat background is 0.4118 rather than 0.5.
//
// A Behavior rather than an emitter feature, for the same reason as MapColor: behaviors
// initialize at ParticleSystem.ts:911, AFTER the worldSpace transform at :897, so the
// displacement is applied along the world normal. Folding it into the shape would send it
// back through applyMatrix4 -- harmless while the galaxy sits axis-aligned at the origin,
// silently wrong the day anyone tilts it.
//
// initialize-only; update() is a no-op, so the offset is a spawn position, not a force.
export class MapPin {
  constructor({ map, plane = 'xz', scale = 1 }) {
    if (!map || !map.baked) {
      throw new Error('MapPin: map must be a baked EffectMap (did loadAll() run?)');
    }
    if (!Number.isFinite(scale)) {
      throw new Error(`MapPin: scale must be a finite number -- got ${scale}`);
    }
    this.type = 'MapPin';
    this.map = map;
    this.plane = plane;
    this.scale = scale;
    this._axes = planeOf(plane, 'MapPin');
    this.rect = map.rect.slice();
    this._out = new Float32Array(4);
  }

  initialize(particle) {
    const { u, v, n } = this._axes;
    const inside = this.map.sample(particle.position[u], particle.position[v], this.rect, this._out);
    if (!inside) return;
    particle.position[n] += this._out[0] * this.scale;
  }

  update() {}

  frameUpdate() {}

  reset() {}

  clone() {
    return new MapPin({ map: this.map, plane: this.plane, scale: this.scale });
  }

  toJSON() {
    throw new Error('MapPin.toJSON: not supported (runtime-only behavior)');
  }
}
