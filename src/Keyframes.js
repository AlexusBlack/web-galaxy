// A FunctionValueGenerator (type: 'function') that samples a monotone cubic Hermite
// spline (Fritsch-Carlson) through a set of keyframes. Monotone cubic is used rather
// than Catmull-Rom because it provably never overshoots: a flat run of repeated
// values stays exactly flat instead of bulging past it.
//
//   new Keyframes([0, 0.5, 1, 1, 0.5, 0])      -> evenly spaced over t in [0, 1]
//   new Keyframes([[0, 0], [0.2, 1], [1, 0]])  -> explicit [t, value] pairs
//   new Keyframes([0, 1, 1, 0], { mode: 'linear' })
//
// Optional per-particle variability:
//
//   new Keyframes([0, 0.25, 0.3, 0.25, 0], { vary: 0.25 })
//   new Keyframes([0, 0.25, 0.3, 0.25, 0], 0.25)   // shorthand for the same
//
// `vary` jitters EVERY keyframe independently, once per particle at spawn, by a
// RELATIVE amount: v * (1 + random(-vary, +vary)). So particles differ in curve
// *shape*, not just in overall scale, and a keyframe of exactly 0 stays exactly 0 --
// fades in and out stay clean whatever `vary` is. Each particle keeps its own curve
// for its whole life (state lives in the particle's GeneratorMemory).
//
// Implements the stock three.quarks FunctionValueGenerator interface, so it also works
// with SizeOverLife / RotationOverLife / SpeedOverLife / OrbitOverLife.
// It does NOT work with FrameOverLife, which only accepts a PiecewiseBezier.
export class Keyframes {
  constructor(points, options = {}) {
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error('Keyframes: points must be a non-empty array');
    }

    const { mode = 'monotone', vary = 0 } =
      typeof options === 'number' ? { vary: options } : options;

    if (!Number.isFinite(vary) || vary < 0) {
      throw new Error('Keyframes: vary must be a finite number >= 0');
    }

    let ts, vs;
    if (Array.isArray(points[0])) {
      const pairs = points.map(([t, v]) => [Number(t), Number(v)]).sort((a, b) => a[0] - b[0]);
      ts = [];
      vs = [];
      for (const [t, v] of pairs) {
        if (!Number.isFinite(t) || !Number.isFinite(v)) {
          throw new Error('Keyframes: keyframe t and value must be finite numbers');
        }
        if (ts.length > 0 && ts[ts.length - 1] === t) {
          vs[vs.length - 1] = v; // duplicate t: last one wins
        } else {
          ts.push(t);
          vs.push(v);
        }
      }
    } else {
      vs = points.map(Number);
      if (vs.some((v) => !Number.isFinite(v))) {
        throw new Error('Keyframes: values must be finite numbers');
      }
      const n = vs.length;
      ts = n === 1 ? [0] : vs.map((_, i) => i / (n - 1));
    }

    this.type = 'function';
    this.mode = mode;
    this.vary = vary;
    this.ts = ts;
    this.vs = vs;
    this.n = ts.length;

    // GeneratorMemory slot index, claimed in startGen. -1 = not claimed yet.
    // Same convention as the library's IntervalValue.
    this.indexCount = -1;

    // uniform spacing lets genValue index in O(1) instead of binary searching
    const step = this.n > 1 ? 1 / (this.n - 1) : 0;
    this.uniform = this.n < 2 || ts.every((t, i) => Math.abs(t - i * step) < 1e-9);

    this.m = this._hermite() ? this._tangentsFor(vs) : null;
  }

  // Hermite tangents are only meaningful for 3+ keys in monotone mode; the other
  // cases evaluate linearly.
  _hermite() {
    return this.n > 2 && this.mode === 'monotone';
  }

  // Fritsch-Carlson monotone tangents for `vs` over this curve's `ts`. Pure: takes
  // a values array and returns a tangents array, so the shared base curve and each
  // particle's jittered curve share one implementation.
  _tangentsFor(vs) {
    const { ts, n } = this;
    const d = new Array(n - 1); // secant slopes
    for (let i = 0; i < n - 1; i++) {
      const dt = ts[i + 1] - ts[i];
      d[i] = dt > 0 ? (vs[i + 1] - vs[i]) / dt : 0;
    }

    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) {
        m[i] = 0; // local extremum / plateau edge -> flat, no overshoot
      } else {
        const w1 = 2 * (ts[i + 1] - ts[i]) + (ts[i] - ts[i - 1]);
        const w2 = (ts[i + 1] - ts[i]) + 2 * (ts[i] - ts[i - 1]);
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); // weighted harmonic mean
      }
    }

    // Fritsch-Carlson monotonicity clamp
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i];
        m[i + 1] = tau * b * d[i];
      }
    }

    return m;
  }

  // Roll this particle's own curve once at spawn and park it in its memory, the way
  // IntervalValue parks its lerp factor. Values AND tangents are stored: the
  // monotonicity clamp is non-linear, so jittered keys need their own tangents and
  // they cannot be derived from the shared ones. Doing it here keeps genValue O(1).
  //
  // Two small arrays are allocated per spawn. Irrelevant for burst emission; if a
  // system ever spawns thousands of particles per second, pool them on the instance.
  startGen(memory) {
    if (!this.vary) return; // stateless fast path: claim no slot, allocate nothing
    const vs = this.vs.map((v) => v * (1 + (Math.random() * 2 - 1) * this.vary));
    this.indexCount = memory.length;
    memory.push({ vs, m: this._hermite() ? this._tangentsFor(vs) : null });
  }

  genValue(memory, t) {
    let { vs, m } = this;
    if (this.vary) {
      if (this.indexCount === -1 && memory) this.startGen(memory);
      const own = memory && memory[this.indexCount];
      // No memory at all (e.g. sampling the curve directly in a test) falls back to
      // the shared, unjittered curve rather than throwing.
      if (own) ({ vs, m } = own);
    }

    const { ts, n } = this;
    if (n === 1) return vs[0];
    if (!(t > ts[0])) return vs[0]; // also catches NaN
    if (t >= ts[n - 1]) return vs[n - 1];

    const i = this.uniform ? Math.min(n - 2, Math.floor(t * (n - 1))) : this._findSegment(t);

    const t0 = ts[i];
    const h = ts[i + 1] - t0;
    const s = (t - t0) / h;

    if (!m) return vs[i] + (vs[i + 1] - vs[i]) * s;

    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * vs[i] +
      (s3 - 2 * s2 + s) * h * m[i] +
      (-2 * s3 + 3 * s2) * vs[i + 1] +
      (s3 - s2) * h * m[i + 1]
    );
  }

  _findSegment(t) {
    let lo = 0;
    let hi = this.n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.ts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  toJSON() {
    throw new Error('Keyframes.toJSON: not supported (runtime-only generator)');
  }

  clone() {
    return new Keyframes(
      this.ts.map((t, i) => [t, this.vs[i]]),
      { mode: this.mode, vary: this.vary }
    );
  }
}
