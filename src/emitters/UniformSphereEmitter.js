import { EllipsoidEmitter } from './EllipsoidEmitter.js';

// A sphere emitter with genuinely uniform volume density, replacing three.quarks'
// SphereEmitter -- which samples r = R * random() and so piles particles at the centre.
//
//   new UniformSphereEmitter({ radius: 1000, thickness: 1 })
//
// thickness 1 fills the ball, 0 emits from the surface, 0.2 fills the outer 20% of the
// radius. Velocity is radial, scaled by the particle's startSpeed.
//
// This is the degenerate rx = ry = rz case of EllipsoidEmitter and inherits all of its
// sampling; it exists as its own class because `radius` is a plain number here and because
// 'sphere' is a type the three.quarks registry can actually load. Its numeric output is
// bit-for-bit identical to the standalone version that preceded the refactor.
export class UniformSphereEmitter extends EllipsoidEmitter {
  type = 'sphere';

  constructor({ radius = 10, thickness = 1, arc = 2 * Math.PI } = {}) {
    super({ radius, thickness, arc }); // the ellipsoid's setter coerces the scalar
  }

  // A settable number, as before. Must stay an accessor: a class field of the same name
  // would shadow the inherited one and leave _radius stale.
  get radius() {
    return this._radius.x;
  }

  set radius(v) {
    super.radius = v;
  }

  // Round-trips into the stock SphereEmitter, which samples the radius linearly -- so the
  // uniformity is lost on reload. That is the pre-existing behaviour, and 'sphere' is at
  // least a registered type. EllipsoidEmitter.toJSON() throws for want of even that.
  toJSON() {
    return { type: 'sphere', radius: this.radius, thickness: this.thickness, arc: this.arc };
  }
}
