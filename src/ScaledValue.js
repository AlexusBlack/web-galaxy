// A ValueGenerator (type: 'value') that wraps another generator and multiplies its
// output by a live `scale` field.
//
//   ps.emissionOverTime = new ScaledValue(ps.emissionOverTime);
//   ...later...
//   ps.emissionOverTime.scale = 0.5;   // half the emission rate from the next frame
//
// Exists so Effect can drive emission per LOD band without swapping generators.
// Swapping matters: ParticleSystem.restart() calls startGen on emissionBursts[].count,
// and a stateful base generator (IntervalValue, ...) pushes a slot into the system's
// shared memory on every startGen -- repeatedly swapping would grow that array without
// bound. Installing this once and writing only `.scale` avoids that entirely.
//
// startGen/genValue are forwarded verbatim, so a stateful base keeps working: it still
// claims its own memory slot and still sees each call exactly once.
export class ScaledValue {
  constructor(base, scale = 1) {
    if (!base || typeof base.genValue !== 'function') {
      throw new Error('ScaledValue: base must be a ValueGenerator');
    }
    this.type = base.type; // 'value' or 'function' -- match what we wrap
    this.base = base;
    this.scale = scale;
  }

  startGen(memory) {
    this.base.startGen(memory);
  }

  // The second argument is only passed for FunctionValueGenerator bases; forwarding it
  // unconditionally is harmless for plain ValueGenerators, which ignore it.
  genValue(memory, t) {
    return this.base.genValue(memory, t) * this.scale;
  }

  toJSON() {
    throw new Error('ScaledValue.toJSON: not supported (runtime-only generator)');
  }

  clone() {
    return new ScaledValue(this.base.clone(), this.scale);
  }
}
