// A FunctionValueGenerator (type: 'function') that samples a monotone cubic Hermite
// spline (Fritsch-Carlson) through a set of keyframes. Monotone cubic is used rather
// than Catmull-Rom because it provably never overshoots: a flat run of repeated
// values stays exactly flat instead of bulging past it.
//
//   new Keyframes([0, 0.5, 1, 1, 0.5, 0])      -> evenly spaced over t in [0, 1]
//   new Keyframes([[0, 0], [0.2, 1], [1, 0]])  -> explicit [t, value] pairs
//   new Keyframes([0, 1, 1, 0], { mode: 'linear' })
//
// Implements the stock three.quarks FunctionValueGenerator interface, so it also works
// with SizeOverLife / RotationOverLife / SpeedOverLife / OrbitOverLife.
// It does NOT work with FrameOverLife, which only accepts a PiecewiseBezier.
export class Keyframes {
  constructor(points, { mode = 'monotone' } = {}) {
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error('Keyframes: points must be a non-empty array');
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
    this.ts = ts;
    this.vs = vs;
    this.n = ts.length;

    // uniform spacing lets genValue index in O(1) instead of binary searching
    const step = this.n > 1 ? 1 / (this.n - 1) : 0;
    this.uniform = this.n < 2 || ts.every((t, i) => Math.abs(t - i * step) < 1e-9);

    if (this.n > 2 && mode === 'monotone') this._computeTangents();
  }

  _computeTangents() {
    const { ts, vs, n } = this;
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

    this.m = m;
  }

  startGen(_memory) {}

  genValue(_memory, t) {
    const { ts, vs, n } = this;
    if (n === 1) return vs[0];
    if (!(t > ts[0])) return vs[0]; // also catches NaN
    if (t >= ts[n - 1]) return vs[n - 1];

    const i = this.uniform ? Math.min(n - 2, Math.floor(t * (n - 1))) : this._findSegment(t);

    const t0 = ts[i];
    const h = ts[i + 1] - t0;
    const s = (t - t0) / h;

    if (this.mode === 'linear' || n < 3) return vs[i] + (vs[i + 1] - vs[i]) * s;

    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * vs[i] +
      (s3 - 2 * s2 + s) * h * this.m[i] +
      (-2 * s3 + 3 * s2) * vs[i + 1] +
      (s3 - s2) * h * this.m[i + 1]
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
      { mode: this.mode }
    );
  }
}
