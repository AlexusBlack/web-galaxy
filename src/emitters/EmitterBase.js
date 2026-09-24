import * as THREE from 'three';

// Shared half of our custom emitter shapes. We keep writing these because the stock
// three.quarks shapes have limitations we care about -- SphereEmitter samples
// r = R * random(), which piles particles at the centre -- and because everything in
// src/emitters/ will grow shared features (emitter/density maps are next) that must not
// be implemented twice.
//
// A three.quarks EmitterShape is a duck-typed five-member interface
// (quarks.core/src/shape/EmitterUtil.ts:72): `type`, initialize(particle, emissionState),
// update(system, delta), toJSON(), clone(). ParticleSystem.spawn() calls initialize()
// AFTER particle.startSpeed has been resolved, and never applies that speed itself -- the
// shape must write `velocity = direction * startSpeed` or the startSpeed generator
// silently does nothing. emissionState only matters for the EmitterMode loop/ping-pong
// walk, which none of our shapes implement, so the template ignores it.
//
// SUBCLASSING. Implement place(particle, dir, r) and nothing else: the template draws a
// direction and a shell fraction, the subclass decides where that lands and what velocity
// it implies. When density maps arrive, initialize() below is the single place that wraps
// or rejects the sample, for every shape at once.
//
// Two JS ordering hazards dictate the shapes here and in the subclasses:
//   - A subclass class field is installed AFTER super() returns, so a base constructor
//     reading this.type would see the base's value. Error messages use
//     this.constructor.name, and no logic in this file branches on `type`.
//   - An instance field shadows a same-named prototype accessor, leaving the accessor's
//     backing store untouched. So `radius` is never a class field anywhere in this
//     directory -- only `type` appears in a class body.
export class EmitterBase {
  constructor({ thickness = 1, arc = 2 * Math.PI } = {}) {
    const who = this.constructor.name;
    if (!Number.isFinite(thickness) || thickness < 0 || thickness > 1) {
      throw new Error(`${who}: thickness must be a finite number in [0, 1] -- got ${thickness}`);
    }
    if (!Number.isFinite(arc) || arc <= 0) {
      throw new Error(`${who}: arc must be a finite number > 0 -- got ${arc}`);
    }
    this.thickness = thickness;
    this.arc = arc;
  }

  initialize(particle) {
    sampleUnitDirection(_dir, this.arc);
    this.place(particle, _dir, sampleShellFraction(this.thickness));
  }

  // Write particle.position and particle.velocity from a unit direction and a radial
  // fraction in [1 - thickness, 1]. `dir` is shared scratch: read it, never keep it.
  place() {
    throw new Error(`${this.constructor.name}: place(particle, dir, r) not implemented`);
  }

  update() {}

  // Every emitter's constructor destructures option names its instances also expose, so
  // this needs no options() hook. Same idiom as the hand-written clone it replaces.
  clone() {
    return new this.constructor(this);
  }

  // No toJSON() here on purpose: a generic default would quietly emit a shape the
  // three.quarks EmitterShapes registry cannot load. Each subclass decides.
}

// Uniform on the unit sphere, or on the wedge of it swept by `arc` radians of longitude.
//
// The draw order -- theta, then phi -- is part of the contract, not an implementation
// detail: UniformSphereEmitter's output is bit-identical to the standalone class it
// replaced only while the RNG stream is unchanged. Exactly two draws.
export function sampleUnitDirection(out, arc) {
  const theta = Math.random() * arc;
  const phi = Math.acos(2 * Math.random() - 1);
  const sinPhi = Math.sin(phi);
  return out.set(sinPhi * Math.cos(theta), sinPhi * Math.sin(theta), Math.cos(phi));
}

// Radial fraction in [1 - thickness, 1], distributed so the result is uniform per unit
// VOLUME across that shell rather than per unit radius (the cbrt is what stock
// SphereEmitter is missing). thickness 1 fills the solid body; thickness 0 is the surface.
// Exactly one draw.
export function sampleShellFraction(thickness) {
  const inner = 1 - thickness;
  return Math.cbrt(inner ** 3 + (1 - inner ** 3) * Math.random());
}

const _dir = new THREE.Vector3(); // scratch; initialize() runs once per spawned particle
