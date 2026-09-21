// A Behavior that applies an Effect's current LOD size and alpha multipliers to every
// live particle. Effect owns one of these per managed ParticleSystem and writes
// `sizeScale` / `alphaScale` on it whenever the LOD band changes; this behavior then
// applies them on the next update, to particles that are already alive.
//
// Must be appended LAST in the behaviors array -- after any SizeOverLife and after
// OpacityOverLife / ColorOverLife -- because those rewrite size and color.w from the
// particle's start snapshot every frame and would otherwise overwrite this.
//
// The two modes exist because multiplying in place is only safe when something upstream
// does rewrite the value from scratch each frame:
//
//   sizeMultiply / alphaMultiply = true   an upstream behavior owns the value; multiply
//                                          into what it just wrote
//   sizeMultiply / alphaMultiply = false  nothing upstream owns it (the value is only
//                                          set once at spawn), so derive it from the
//                                          start snapshot instead
//
// Either way the result is idempotent: running the same frame twice, or running 10000
// frames at a fixed scale, gives the same value. A plain `*=` with no upstream writer
// would compound and collapse to zero within a second.
//
// Alpha is deliberately not clamped. OpacityOverLife already clamps its curve to [0,1];
// the LOD scale is a multiplier on top of that, and under additive blending a result
// above 1 is a legitimate brightness boost.
export class LodScale {
  constructor({ sizeMultiply = false, alphaMultiply = false } = {}) {
    this.type = 'LodScale';
    this.sizeMultiply = sizeMultiply;
    this.alphaMultiply = alphaMultiply;
    this.sizeScale = 1;
    this.alphaScale = 1;
  }

  initialize() {}

  update(particle) {
    if (this.sizeMultiply) particle.size.multiplyScalar(this.sizeScale);
    else particle.size.copy(particle.startSize).multiplyScalar(this.sizeScale);

    if (this.alphaMultiply) particle.color.w *= this.alphaScale;
    else particle.color.w = particle.startColor.w * this.alphaScale;
  }

  frameUpdate() {}

  toJSON() {
    throw new Error('LodScale.toJSON: not supported (runtime-only behavior)');
  }

  clone() {
    const c = new LodScale({ sizeMultiply: this.sizeMultiply, alphaMultiply: this.alphaMultiply });
    c.sizeScale = this.sizeScale;
    c.alphaScale = this.alphaScale;
    return c;
  }

  reset() {}
}
