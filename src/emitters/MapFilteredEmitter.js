import * as THREE from 'three';
import { planeOf } from '../effectmaps/planes.js';

// `mapEmit`: gates an emitter's output through an effect map by REJECTION. The inner
// emitter proposes a point exactly as it would alone, the map is read at that point, and
// the sample is kept with probability proportional to the map's value there.
//
//   new MapFilteredEmitter({
//     inner: new DiscEmitter({ radius: [1000, 7.5, 1000] }),
//     map: registry.get('0x8E960553'),
//     aboveHeight: 0.1,
//   })
//
// WHY A DECORATOR RATHER THAN A HOOK ON EmitterBase. UniformSphereEmitter's numeric output
// is asserted bit-identical to the standalone class it replaced, which holds only while its
// RNG stream is exactly three draws in the order theta, phi, shell. Wrapping from outside
// touches zero lines of EmitterBase/EllipsoidEmitter/DiscEmitter, so that invariant is
// preserved by construction instead of by inspection. The price is re-running the inner
// place() on each rejected attempt; at ~10 attempts that is nothing.
//
// Rejection also keeps the inner shape's own knobs -- thickness, arc, the disc's
// half-thickness -- meaningful, which sampling the texture directly would not.
//
// ACCEPTANCE is `value >= aboveHeight && random() * max < value`.
//
// `aboveHeight` defaults to 0 because the authored 0.1 and 0.2 in the Spore source are
// very nearly no-ops, for a reason worth recording: at native resolution these masks are
// BILEVEL, so `value >= 0.1` selects exactly the lit pixels -- and uniform sampling over
// lit pixels already IS density-proportional sampling of the underlying coverage field.
// Threshold and density-weight are the same operation on this data, which is why 0.1 and
// 0.2 are indistinguishable in the original. At the mip level we actually sample they
// diverge slightly -- over 2309's disc, acceptance is 0.1080 / 0.0997 / 0.0904 at
// aboveHeight 0 / 0.1 / 0.2, an 8% mass change confined to the faintest fringe cells -- so
// the gate stays available to cull speckle.
//
// `max` comes from the baked grid rather than being assumed 1.0: a map whose peak is 0.6
// would otherwise throw away 40% of its throughput for nothing.
export class MapFilteredEmitter {
  type = 'mapFiltered';

  // BUDGET 128, not 64. Acceptance against 0x8E960553 over 2309's disc measures 0.0997
  // (confirmed against a direct quadrature of the baked field, which gives 0.09969), so
  // (1-p)^64 = 1.2e-3 would fall back on ~3.6 particles of every 3000-burst and trip the
  // canary below on a correctly configured emitter. At 128 it is 1.5e-6, or one fallback
  // every ~250 bursts. The extra headroom costs nothing: the budget is only ever reached
  // on the proposals that were going to fail anyway.
  constructor({ inner, map, aboveHeight = 0, budget = 128, plane = 'xz', origin = null }) {
    if (!inner || typeof inner.initialize !== 'function') {
      throw new Error('MapFilteredEmitter: inner must be an emitter shape');
    }
    if (!map || !map.baked) {
      throw new Error('MapFilteredEmitter: map must be a baked EffectMap (did loadAll() run?)');
    }
    if (!Number.isFinite(aboveHeight) || aboveHeight < 0) {
      throw new Error(`MapFilteredEmitter: aboveHeight must be a finite number >= 0 -- got ${aboveHeight}`);
    }
    if (!Number.isInteger(budget) || budget < 1) {
      throw new Error(`MapFilteredEmitter: budget must be a positive integer -- got ${budget}`);
    }
    this.inner = inner;
    this.map = map;
    this.aboveHeight = aboveHeight;
    this.budget = budget;
    this.plane = plane;
    this._axes = planeOf(plane, this.constructor.name);

    // An explicit emitter origin rather than an assumption that everything sits at (0,0,0).
    // Positions written in initialize() are emitter-LOCAL -- ParticleSystem applies the
    // worldSpace transform afterwards, at ParticleSystem.ts:897 -- so a map rect expressed
    // in world coordinates needs the offset subtracted here. Three lines, versus a comment
    // that silently stops being true the day someone moves the galaxy.
    this.origin = origin ? origin.clone() : new THREE.Vector3();

    // A PRIVATE copy of the authored rect. EffectMap.rect is frozen and shared -- 0x8E960553
    // feeds three consumers -- so LOD scaling must never write through to the node.
    this.rect = map.rect.slice();

    this._out = new Float32Array(4);
    this._attempts = 0;
    this._exhausted = 0;
    this._warned = false;
    this._acceptance = null;
  }

  // The fraction of the inner emitter's proposals this map keeps -- equivalently, the mean
  // of the gated, max-normalised field over the inner shape's support.
  //
  // WHY A CONSUMER NEEDS THIS. Swarm's mapEmit is a one-shot CULL: the emitter proposes at
  // its authored rate and a failing proposal simply never becomes a particle, so the map
  // divides the effective rate. We resample instead, which gives the identical spatial
  // distribution (a uniform proposal survives with probability proportional to the map
  // either way) but leaves the rate untouched. The two differ ONLY in count, by exactly
  // this factor -- so an authored Swarm rate must be multiplied by it to match. For 2309
  // that is 3000 * 0.0997 = 299, against a hand-tuned 300.
  //
  // Measured rather than integrated because only `inner` knows its own support, and it may
  // be any shape. 50k trials puts the relative standard error at ~1.3%, i.e. +/-4 particles
  // on a 300-particle rate -- far below anything visible, and it costs a few ms once.
  get acceptance() {
    if (this._acceptance === null) this._acceptance = this._measureAcceptance(50000);
    return this._acceptance;
  }

  _measureAcceptance(trials) {
    const probe = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), startSpeed: 0 };
    let kept = 0;
    for (let i = 0; i < trials; i++) {
      this.inner.initialize(probe);
      if (this._accept(probe.position)) kept++;
    }
    return kept / trials;
  }

  initialize(particle, emissionState) {
    let i = 0;
    for (; i < this.budget; i++) {
      this.inner.initialize(particle, emissionState);
      if (this._accept(particle.position)) break;
    }
    this._attempts += i + 1;

    if (i === this.budget) {
      // Budget exhausted: keep the LAST proposal, unconditionally.
      //
      // Deliberately not the best-scoring candidate seen. A max-of-budget order statistic
      // concentrates hard on the map's brightest cells, so a misconfigured rect would fail
      // TOWARD bright clumps -- structured, obvious, wrong. Keeping the last proposal
      // degrades into a faint uniform haze instead, which reads as background stars.
      this._exhausted++;
      if (!this._warned && this._exhausted > 8 && this._exhausted > 0.001 * this._attempts) {
        this._warned = true;
        console.warn(
          `MapFilteredEmitter: map ${this.map.id} exhausted its ${this.budget}-attempt budget on ` +
          `${this._exhausted} of ${this._attempts} proposals. The emitter probably overhangs the ` +
          `map rect [${this.rect.join(', ')}] -- check the emitter radius against it.`
        );
      }
    }
  }

  _accept(position) {
    const { u, v } = this._axes;
    const inside = this.map.sample(
      position[u] + this.origin[u],
      position[v] + this.origin[v],
      this.rect,
      this._out,
    );
    if (!inside) return false;
    const value = this._out[0];
    if (value < this.aboveHeight) return false;
    return Math.random() * this.map.max < value;
  }

  update(system, delta) {
    this.inner.update(system, delta);
  }

  // The Effect size seam (src/Effect.js:165, :248). The rect scales WITH the shape: for a
  // map-driven emitter the map is the shape, so holding the rect fixed while shrinking the
  // disc would sample only the map's centre and collapse the galaxy into a core blob at
  // distance -- an LOD that changes the silhouette, which is the one thing LOD must not do.
  //
  // Both members of the snapshot must be copies: Effect calls this once and keeps the
  // result for the life of the effect, re-applying it on every band change.
  sizeSnapshot() {
    return { radius: this.inner.sizeSnapshot(), rect: this.rect.slice() };
  }

  applySizeScale(base, scale) {
    this.inner.applySizeScale(base.radius, scale);
    // Valid because these rects are origin-centred, so scaling all four corners is a scale
    // about the rect's centre. An off-centre rect would need its centre held explicitly.
    for (let i = 0; i < 4; i++) this.rect[i] = base.rect[i] * scale;
  }

  // Everything mutable is fresh; the baked Float32Array inside `map` is immutable and large
  // and is deliberately shared. Without this a cloned ParticleSystem would write LOD rect
  // changes into its sibling (ParticleSystem.clone() calls emitterShape.clone()).
  clone() {
    const c = new MapFilteredEmitter({
      inner: this.inner.clone(),
      map: this.map,
      aboveHeight: this.aboveHeight,
      budget: this.budget,
      plane: this.plane,
      origin: this.origin,
    });
    c.rect = this.rect.slice();
    return c;
  }

  toJSON() {
    throw new Error("MapFilteredEmitter.toJSON: not supported (no EmitterShapes loader for 'mapFiltered')");
  }
}
