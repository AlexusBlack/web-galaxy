import * as THREE from 'three';
import { EmitterBase } from './EmitterBase.js';

// Emits from a solid ellipsoid (or an ellipsoidal shell), uniform per unit VOLUME.
//
//   new EllipsoidEmitter({ radius: [1000, 1000, 200] })   // a flattened galaxy disc
//   new EllipsoidEmitter({ radius: 800, thickness: 0.2 }) // a sphere, outer 20% only
//
// `radius` accepts a number, [x, y, z], {x, y, z} or a Vector3; it always reads back as a
// Vector3. thickness 1 fills the body, 0 is the surface. `arc` limits the longitude sweep.
//
// Uniformity is free: the unit-sphere sample is scaled componentwise, and an affine map has
// a constant Jacobian, so it carries a uniform distribution to a uniform one. That holds at
// every thickness, shells included.
//
// CAVEAT -- uniform by volume is not uniform by area. On a flattened ellipsoid a thin shell
// is geometrically thicker at the rim than at the poles (t*1000 vs t*200 for 1000/1000/200),
// so a thin crust reads as a denser rim: measured ~4.6x the per-area density of the poles
// for that shape. This class promises volume-uniformity and delivers it; an area-uniform
// crust needs rejection sampling in the spawn path (acceptance ~0.55 for that disc) and
// would belong in a future `distribution: 'surface'` option, not here.
//
// Velocity is RADIAL FROM THE CENTRE -- position normalised -- not the true surface normal,
// which on an ellipsoid points elsewhere. That matches the sphere behaviour this
// generalises -- including at radius 0, where the position collapses to the origin but the
// sampled direction is still well defined and velocity stays radial. The one case that
// could divide by zero, an origin sample with unequal radii, yields zero velocity rather
// than NaN: Vector3.normalize() divides by `length() || 1`
// (three/src/math/Vector3.js:792).
export class EllipsoidEmitter extends EmitterBase {
  type = 'ellipsoid';

  constructor({ radius = 10, thickness = 1, arc = 2 * Math.PI } = {}) {
    super({ thickness, arc });
    this._radius = new THREE.Vector3();
    this.radius = radius; // through the coercing setter below
  }

  // An accessor, not a field, so a runtime `shape.radius = [1, 2, 3]` is coerced and
  // validated instead of silently replacing the Vector3 with an array.
  get radius() {
    return this._radius;
  }

  set radius(v) {
    const who = this.constructor.name;
    let x, y, z;
    if (typeof v === 'number') {
      x = y = z = v;
    } else if (Array.isArray(v)) {
      if (v.length !== 3) throw new Error(`${who}: radius array must have 3 entries -- got ${v.length}`);
      [x, y, z] = v;
    } else if (v && typeof v === 'object') {
      ({ x, y, z } = v);
    } else {
      throw new Error(`${who}: radius must be a number, [x, y, z], {x, y, z} or a Vector3`);
    }
    for (const [axis, r] of [['x', x], ['y', y], ['z', z]]) {
      // 0 is legal -- it flattens the ellipsoid to a disc or a line.
      if (!Number.isFinite(r) || r < 0) {
        throw new Error(`${who}: radius.${axis} must be a finite number >= 0 -- got ${r}`);
      }
    }
    this._radius.set(x, y, z);
  }

  place(particle, dir, r) {
    const { x: rx, y: ry, z: rz } = this._radius;

    // One scalar per axis. Written as `dir.x * (rx * r)` rather than scaling the vector by
    // the radii and then by r: the latter computes (dir.x * rx) * r, which rounds ~1 ULP
    // differently and would break UniformSphereEmitter's bit-for-bit equivalence with the
    // standalone class it replaced.
    particle.position.set(dir.x * (rx * r), dir.y * (ry * r), dir.z * (rz * r));

    if (rx === ry && ry === rz) {
      // Isotropic: the scaled point's direction IS `dir`, exactly and for free. Branch on
      // the radii, never on the scaled components -- at r === 0 all three are 0 and the
      // anisotropic case would wrongly take this path.
      particle.velocity.copy(dir).multiplyScalar(particle.startSpeed);
    } else {
      particle.velocity.copy(particle.position).normalize().multiplyScalar(particle.startSpeed);
    }
  }

  // The size seam Effect drives emitterScale through (src/Effect.js). A snapshot must be a
  // COPY -- Effect keeps it for the life of the effect and re-applies it on every band
  // change -- and applySizeScale must write from that snapshot rather than multiply in
  // place, or repeated band changes compound.
  sizeSnapshot() {
    return this._radius.clone();
  }

  applySizeScale(base, scale) {
    this._radius.copy(base).multiplyScalar(scale);
  }

  // Throws, like our other runtime-only classes (Keyframes, LodScale, ScaledValue,
  // OpacityOverLife). 'ellipsoid' is not in the three.quarks EmitterShapes registry
  // (quarks.core/src/shape/EmitterShape.ts:21), so emitting it would turn an authoring
  // mistake into a file that throws on load; emitting 'sphere' when the radii happen to be
  // equal would make the output format depend on runtime values. If we ever need this,
  // loadPlugin (quarks.core/src/Plugin.ts:13) registers a loader in ~15 lines.
  toJSON() {
    throw new Error("EllipsoidEmitter.toJSON: not supported (no EmitterShapes loader for 'ellipsoid')");
  }
}
