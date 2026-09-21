import * as THREE from 'three';
import { LodScale } from './LodScale.js';
import { ScaledValue } from './ScaledValue.js';

// Groups several three.quarks ParticleSystems into one effect with distance-based LOD,
// a functional equivalent of Spore's swarm effect blocks:
//
//   effect effect-4228 -noAutoStop
//       lodDistances 10 500 1000 2000 2500 10000
//       particles particles-3818 -lodRange 1 6 -alphaScale 0 1 1 1 1 1
//       particles particles-3816 -lodRange 2 6 -alphaScale 0 0.5 0.5 0.5 0.5
//
// becomes
//
//   new Effect({
//     lodDistances: [10, 500, 1000, 2000, 2500, 10000],
//     particles: [
//       { system: Particles_3818(), lodRange: [1, 6], alphaScale: [0, 1, 1, 1, 1, 1] },
//       { system: Particles_3816(), lodRange: [2, 6], alphaScale: [0, .5, .5, .5, .5] },
//     ],
//   }).addTo(scene, batchedRenderer);
//
// then call effect.update(camera) once per frame.
//
// LOD BANDS. lodDistances are boundaries, so N distances define N+1 bands:
//
//   lodDistances:        10      500     1000    2000    2500    10000
//   band:            0  |   1   |   2   |   3   |   4   |   5   |   6
//
// lod = how many lodDistances are <= the camera distance, i.e. 0..N. That is what makes
// the Spore example consistent: -lodRange 1 6 covers bands 1-6 and its scale arrays have
// six entries; -lodRange 2 6 covers bands 2-6 and has five. A scale array must be exactly
// (hi - lo + 1) long, and this class throws if it is not -- that mismatch is the easiest
// mistake to make when porting an effect by hand.
//
// Transitions are discrete, as in Spore: values snap at a boundary, they are not blended
// across it. A small hysteresis margin stops a camera parked on a boundary from flickering
// between bands every frame.
//
// WHAT APPLIES WHEN. alphaScale and sizeScale go through a LodScale behavior and take
// effect immediately, on particles that are already alive. emitterScale and emissionScale
// can only affect particles that have yet to spawn: an emitter's radius is read inside
// initialize(), and a burst's count is evaluated only when that burst fires. A system that
// emits one burst at t=0 of a 30s loop therefore will not show a change to those two
// channels until the next loop wrap.
//
// SCENE GRAPH. The effect owns a THREE.Group and reparents each emitter under it. That
// group must stay in the scene: ParticleSystem.update walks up from the emitter and, if
// the root is not a Scene, disposes itself. Detaching the group to hide the effect would
// permanently destroy every system in it -- use the LOD range, or emitter.visible.
export class Effect {
  constructor({ lodDistances, particles, hysteresis = 0.02, name = '' } = {}) {
    if (!Array.isArray(lodDistances) || lodDistances.length === 0) {
      throw new Error('Effect: lodDistances must be a non-empty array');
    }
    for (let i = 0; i < lodDistances.length; i++) {
      if (!Number.isFinite(lodDistances[i]) || lodDistances[i] < 0) {
        throw new Error(`Effect: lodDistances[${i}] must be a finite number >= 0`);
      }
      if (i > 0 && lodDistances[i] <= lodDistances[i - 1]) {
        throw new Error('Effect: lodDistances must be strictly increasing');
      }
    }
    if (!Array.isArray(particles) || particles.length === 0) {
      throw new Error('Effect: particles must be a non-empty array');
    }
    if (!Number.isFinite(hysteresis) || hysteresis < 0 || hysteresis >= 1) {
      throw new Error('Effect: hysteresis must be a finite number in [0, 1)');
    }

    this.name = name;
    this.lodDistances = lodDistances.slice();
    this.maxLod = lodDistances.length; // bands are 0..maxLod inclusive
    this.hysteresis = hysteresis;

    this.group = new THREE.Group();
    this.group.name = name || 'Effect';

    this.attached = false;
    this._renderer = null;
    this._lod = -1; // -1 = not evaluated yet, so the first update always applies
    this._cameraPos = new THREE.Vector3();
    this._groupPos = new THREE.Vector3();

    this.entries = particles.map((p, i) => this._makeEntry(p, i));
  }

  _makeEntry(p, i) {
    const where = `Effect: particles[${i}]`;
    if (!p || !p.system || !p.system.emitter) {
      throw new Error(`${where} must have a \`system\` (a three.quarks ParticleSystem)`);
    }

    const lodRange = p.lodRange ?? [0, this.maxLod];
    if (!Array.isArray(lodRange) || lodRange.length !== 2) {
      throw new Error(`${where}.lodRange must be a [lo, hi] pair`);
    }
    const [lo, hi] = lodRange;
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
      throw new Error(`${where}.lodRange values must be integers`);
    }
    if (lo < 0 || hi > this.maxLod || lo > hi) {
      throw new Error(
        `${where}.lodRange [${lo}, ${hi}] is out of bounds -- bands are 0..${this.maxLod}`
      );
    }

    const span = hi - lo + 1;
    const channel = (name) => {
      const a = p[name];
      if (a === undefined) return new Array(span).fill(1);
      if (!Array.isArray(a) || a.length !== span) {
        throw new Error(
          `${where}.${name} must have ${span} entries, one per band in lodRange ` +
            `[${lo}, ${hi}] -- got ${Array.isArray(a) ? a.length : typeof a}`
        );
      }
      for (const v of a) {
        if (!Number.isFinite(v) || v < 0) {
          throw new Error(`${where}.${name} values must be finite numbers >= 0`);
        }
      }
      return a.slice();
    };

    return {
      system: p.system,
      lo,
      hi,
      alphaScale: channel('alphaScale'),
      sizeScale: channel('sizeScale'),
      emitterScale: channel('emitterScale'),
      emissionScale: channel('emissionScale'),
      // filled in by addTo()
      scaler: null,
      baseShape: null,
      emissionGens: [],
      // explicit overrides for the upstream-writer detection in addTo()
      sizeMultiply: p.sizeMultiply,
      alphaMultiply: p.alphaMultiply,
    };
  }

  // Parent every emitter under this effect's group, register the systems with the batched
  // renderer, and install the runtime hooks the LOD channels drive.
  addTo(scene, batchedRenderer) {
    if (this.attached) throw new Error('Effect: already attached');
    scene.add(this.group);

    for (const e of this.entries) {
      const ps = e.system;

      // Multiply-in-place is only safe when an upstream behavior rewrites the value from
      // the particle's start snapshot every frame. Detect that, unless told otherwise.
      const types = ps.behaviors.map((b) => b.type);
      const sizeMultiply =
        e.sizeMultiply ?? types.some((t) => t === 'SizeOverLife' || t === 'SizeBySpeed');
      const alphaMultiply =
        e.alphaMultiply ??
        types.some((t) => t === 'OpacityOverLife' || t === 'ColorOverLife' || t === 'ColorBySpeed');

      e.scaler = new LodScale({ sizeMultiply, alphaMultiply });
      ps.behaviors.push(e.scaler); // last: after every size and alpha writer

      e.baseShape = captureShapeSize(ps.emitterShape);

      // Install the emission wrappers once; from here only their .scale is written.
      e.emissionGens = [];
      ps.emissionOverTime = new ScaledValue(ps.emissionOverTime);
      e.emissionGens.push(ps.emissionOverTime);
      for (const burst of ps.emissionBursts) {
        burst.count = new ScaledValue(burst.count);
        e.emissionGens.push(burst.count);
      }

      this.group.add(ps.emitter);
      batchedRenderer.addSystem(ps);
    }

    this._renderer = batchedRenderer;
    this.attached = true;
    return this;
  }

  get lod() {
    return this._lod;
  }

  // Distance from the camera to this effect's origin, in world space.
  distanceTo(camera) {
    camera.getWorldPosition(this._cameraPos);
    this.group.getWorldPosition(this._groupPos);
    return this._cameraPos.distanceTo(this._groupPos);
  }

  // Band for a distance, ignoring hysteresis: how many boundaries it has passed.
  bandFor(distance) {
    const ts = this.lodDistances;
    let lod = 0;
    while (lod < ts.length && distance >= ts[lod]) lod++;
    return lod;
  }

  // Band for a distance given the band we are currently in. A boundary must be crossed by
  // the hysteresis margin before the band changes, so a camera hovering on a threshold
  // does not flicker.
  bandFrom(current, distance) {
    if (current < 0) return this.bandFor(distance);
    const ts = this.lodDistances;
    const h = this.hysteresis;
    let lod = current;
    while (lod < ts.length && distance >= ts[lod] * (1 + h)) lod++;
    while (lod > 0 && distance < ts[lod - 1] * (1 - h)) lod--;
    return lod;
  }

  // Call once per frame. Recomputes the band from the camera and, if it changed, pushes
  // the new scales to every member system.
  update(camera) {
    if (!this.attached) throw new Error('Effect: update() before addTo()');
    const lod = this.bandFrom(this._lod, this.distanceTo(camera));
    if (lod === this._lod) return lod;
    this._lod = lod;
    this.applyLod(lod);
    return lod;
  }

  // Force a band, bypassing the camera. Useful for testing and for debug UI.
  applyLod(lod) {
    this._lod = lod;
    for (const e of this.entries) {
      const inRange = lod >= e.lo && lod <= e.hi;
      const ps = e.system;

      if (!inRange) {
        // Hidden and not emitting, but still registered and still simulating, so coming
        // back into range resumes instantly with no re-batch and no re-burst.
        ps.emitter.visible = false;
        for (const g of e.emissionGens) g.scale = 0;
        continue;
      }

      const i = lod - e.lo;
      ps.emitter.visible = true;
      e.scaler.alphaScale = e.alphaScale[i];
      e.scaler.sizeScale = e.sizeScale[i];
      for (const g of e.emissionGens) g.scale = e.emissionScale[i];
      applyShapeSize(ps.emitterShape, e.baseShape, e.emitterScale[i]);
    }
  }

  // Destroy every member system and detach the group. ParticleSystem.dispose() also
  // unregisters from the batched renderer.
  dispose() {
    for (const e of this.entries) e.system.dispose();
    this.group.removeFromParent();
    this.attached = false;
    this._renderer = null;
  }
}

// The size-ish fields of each emitter shape, so emitterScale can drive any of them.
// Matches the shapes in quarks.core/src/shape/ plus our own UniformSphereEmitter, which
// reports type 'sphere'.
const SHAPE_SIZE_FIELDS = {
  sphere: ['radius'],
  hemisphere: ['radius'],
  circle: ['radius'],
  cone: ['radius'],
  donut: ['radius', 'donutRadius'],
  rectangle: ['width', 'height'],
  grid: ['width', 'height'],
  point: [],
};

function sizeFieldsOf(shape) {
  // Unknown shape: scale whichever of the known field names it happens to have, rather
  // than throwing -- a custom shape with a `radius` should still work.
  return (
    SHAPE_SIZE_FIELDS[shape.type] ??
    ['radius', 'donutRadius', 'width', 'height'].filter((f) => typeof shape[f] === 'number')
  );
}

function captureShapeSize(shape) {
  const base = {};
  for (const f of sizeFieldsOf(shape)) base[f] = shape[f];
  return base;
}

function applyShapeSize(shape, base, scale) {
  for (const f of Object.keys(base)) shape[f] = base[f] * scale;
}
