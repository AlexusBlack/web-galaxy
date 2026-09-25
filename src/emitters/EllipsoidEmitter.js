import { EmitterBase } from './EmitterBase.js';

// Emits from a solid ellipsoid (or an ellipsoidal shell), uniform per unit VOLUME.
//
//   new EllipsoidEmitter({ radius: [1000, 1000, 200] })   // a flattened blob
//   new EllipsoidEmitter({ radius: 800, thickness: 0.2 }) // a sphere, outer 20% only
//
// `radius` accepts a number, [x, y, z], {x, y, z} or a Vector3; it always reads back as a
// Vector3 (the accessor lives on EmitterBase). thickness 1 fills the body, 0 is the
// surface. `arc` limits the longitude sweep.
//
// Uniformity is free: the unit-sphere sample is scaled componentwise, and an affine map has
// a constant Jacobian, so it carries a uniform distribution to a uniform one. That holds at
// every thickness, shells included.
//
// CAVEAT -- uniform by volume is not uniform by area, in two distinct ways.
//
//   1. A thin shell is geometrically thicker at the rim than at the poles (t*1000 vs t*200
//      for 1000/1000/200), so a thin crust reads as a denser rim: measured ~4.6x the
//      per-area density of the poles for that shape.
//   2. Even at thickness 1, the marginal density PROJECTED onto the wide plane is not flat.
//      It follows the chord length through the body, sqrt(1 - rho^2) in the normalised disc
//      radius -- the flattening factors out entirely. Measured relative areal density:
//      1.000 / 0.954 / 0.866 / 0.714 / 0.656 at rho = 0 / 0.3 / 0.5 / 0.7 / 0.755. That is
//      a 34% falloff at the rim, which reads as a vignette.
//
// Both are correct behaviour for a class that promises volume-uniformity. If you want a
// flat disc, use DiscEmitter -- it samples the plane directly and its marginal IS flat.
// Dividing acceptance by sqrt(1 - rho^2) to undo (2) is not an option: it diverges at the
// rim.
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
    super({ radius, thickness, arc });
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
