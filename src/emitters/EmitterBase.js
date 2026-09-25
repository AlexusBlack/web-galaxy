import * as THREE from 'three';

// Shared half of our custom emitter shapes. We keep writing these because the stock
// three.quarks shapes have limitations we care about -- SphereEmitter samples
// r = R * random(), which piles particles at the centre -- and because everything in
// src/emitters/ grows shared features that must not be implemented twice.
//
// A three.quarks EmitterShape is a duck-typed five-member interface
// (quarks.core/src/shape/EmitterUtil.ts:72): `type`, initialize(particle, emissionState),
// update(system, delta), toJSON(), clone(). ParticleSystem.spawn() calls initialize()
// AFTER particle.startSpeed has been resolved, and never applies that speed itself -- the
// shape must write `velocity = direction * startSpeed` or the startSpeed generator
// silently does nothing. emissionState only matters for the EmitterMode loop/ping-pong
// walk, which none of our shapes implement, so the template ignores it.
//
// SUBCLASSING. The common case is to implement place(particle, dir, r) and nothing else:
// the template draws a direction and a shell fraction, the subclass decides where that
// lands and what velocity it implies. A shape whose natural parameterisation is not
// "direction on a sphere times a radius" -- DiscEmitter -- overrides initialize() instead
// and uses the module-scope samplers directly. Both keep the three-draw budget.
//
// DENSITY MAPS do NOT live here. They wrap an emitter from outside, via
// MapFilteredEmitter, so that this file and its subclasses stay untouched and
// UniformSphereEmitter's bit-exactness is preserved by construction rather than by
// inspection. See MapFilteredEmitter.js.
//
// Two JS ordering hazards dictate the shapes here and in the subclasses:
//   - A subclass class field is installed AFTER super() returns, so a base constructor
//     reading this.type would see the base's value. Error messages use
//     this.constructor.name, and no logic in this file branches on `type`.
//   - An instance field shadows a same-named prototype accessor, leaving the accessor's
//     backing store untouched. So `radius` is never a class field anywhere in this
//     directory -- only `type` appears in a class body.
export class EmitterBase {
  constructor({ radius = 10, thickness = 1, arc = 2 * Math.PI } = {}) {
    const who = this.constructor.name;
    if (!Number.isFinite(thickness) || thickness < 0 || thickness > 1) {
      throw new Error(`${who}: thickness must be a finite number in [0, 1] -- got ${thickness}`);
    }
    if (!Number.isFinite(arc) || arc <= 0) {
      throw new Error(`${who}: arc must be a finite number > 0 -- got ${arc}`);
    }
    this.thickness = thickness;
    this.arc = arc;
    this._radius = new THREE.Vector3();
    this.radius = radius; // through the coercing setter below
  }

  // Every shape we have is parameterised by a per-axis radius, so the accessor and the
  // Effect size seam live here rather than on any one shape.
  //
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
      // 0 is legal -- it flattens the shape to a disc or a line.
      if (!Number.isFinite(r) || r < 0) {
        throw new Error(`${who}: radius.${axis} must be a finite number >= 0 -- got ${r}`);
      }
    }
    this._radius.set(x, y, z);
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

  // The size seam Effect drives emitterScale through (src/Effect.js:165, :248). A snapshot
  // must be a COPY -- Effect keeps it for the life of the effect and re-applies it on every
  // band change -- and applySizeScale must write from that snapshot rather than multiply in
  // place, or repeated band changes compound.
  sizeSnapshot() {
    return this._radius.clone();
  }

  applySizeScale(base, scale) {
    this._radius.copy(base).multiplyScalar(scale);
  }

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

// The 2D counterpart: radial fraction in [1 - thickness, 1], uniform per unit AREA across
// that annulus. Same construction as sampleShellFraction with the exponent dropped from 3
// to 2 -- the square root is what makes a disc's density flat rather than peaked at the
// centre, exactly as the cube root does for a ball. Exactly one draw.
export function sampleAnnulusFraction(thickness) {
  const inner = 1 - thickness;
  return Math.sqrt(inner ** 2 + (1 - inner ** 2) * Math.random());
}

const _dir = new THREE.Vector3(); // scratch; initialize() runs once per spawned particle
