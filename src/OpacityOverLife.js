// Drives particle alpha (color.w) over lifetime from a FunctionValueGenerator,
// leaving RGB completely alone. Fills the gap left by three.quarks' ColorOverLife,
// which always writes all four RGBA channels from a single generator.
//
//   new OpacityOverLife(new Keyframes([0, 0.5, 1, 1, 0.5, 0]))
//
// The curve MULTIPLIES the alpha the colour generator produced at spawn, so a
// per-particle random alpha (e.g. RandomColor with a 0.15-0.375 alpha range) survives
// as the per-particle base and the curve scales it. The alpha is recomputed from
// startColor.w every frame rather than multiplied into color.w in place:
// particle.color is only copied from startColor at spawn and is never reset, so a
// per-frame `*=` would compound and collapse alpha to zero within a second.
//
// Place this last among the alpha writers: ColorOverLife, if you ever add one, also
// writes .w and would clobber this. Behaviors run in array order. Effect appends its
// LodScale after this one, which is intended -- LodScale multiplies the alpha this
// behavior just wrote.
//
// Note on additive blending: these systems use THREE.AdditiveBlending
// (blendSrc=SrcAlpha, blendDst=One), so the contribution is srcRGB * srcAlpha + dst.
// Alpha reads as BRIGHTNESS, not occlusion -- 0 is invisible, and overlapping
// particles keep accumulating.
export class OpacityOverLife {
  constructor(opacity) {
    this.type = 'OpacityOverLife';
    this.opacity = opacity;
  }

  initialize(particle) {
    this.opacity.startGen(particle.memory);
  }

  update(particle) {
    const k = this.opacity.genValue(particle.memory, particle.age / particle.life);
    particle.color.w = particle.startColor.w * Math.min(1, Math.max(0, k));
  }

  frameUpdate(_delta) {}

  toJSON() {
    throw new Error('OpacityOverLife.toJSON: not supported (runtime-only behavior)');
  }

  clone() {
    return new OpacityOverLife(this.opacity.clone());
  }

  reset() {}
}
