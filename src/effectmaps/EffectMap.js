import { EffectMapTexture } from './EffectMapTexture.js';

// One node of a Spore effectMap expression tree.
//
//   effectMap 0x8E960553 -rect (-1000,-1000,1000,1000) -bitImage 0x8E960553
//   effectMap 0x66BF605C -rect (-900,-900,900,900)     -op add 0xEF82F8CE (-0.5,-0.5,-0.5,-0.5)
//   effectMap 0xFF33EE2A -rect (-1000,-1000,1000,1000) -op multiply 0x9A76F5E7 0x8E960553
//
// Leaves wrap a texture; operators combine two operands, each either another map or a
// literal Vector4. EVERY NODE CARRIES ITS OWN RECT and never inherits one -- the traced
// galaxy graph really does mix -1000..1000 with -900..900, which is why the height map's
// footprint does not register with the arms. The rect is what maps a world position to uv,
// so an operand is always evaluated through ITS OWN rect at the world position under the
// output pixel, not by index-aligning two grids.
//
// The authored rect is frozen. Nodes are shared -- 0x8E960553 feeds three consumers,
// 0x66BF605C feeds two mapPin chains at different scales -- so a consumer that needs to
// scale its rect for LOD holds a private copy. See MapFilteredEmitter.
export class EffectMap {
  constructor({ id, rect, kind, src, op, a, b }) {
    this.id = id;
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) {
      throw new Error(`EffectMap ${id}: rect must be four finite numbers [x0, y0, x1, y1]`);
    }
    this.rect = Object.freeze(rect.slice());
    this.kind = kind;     // 'image' | 'bitImage' | 'monoImage' | 'op'
    this.src = src;       // leaf: image filename
    this.op = op;         // 'multiply' | 'add'
    this.a = a;           // operand: map id string, or [x, y, z, w]
    this.b = b;

    this.texture = null;  // leaf: the decoded source
    this.baked = null;    // the evaluated composite, with its own mip pyramid
    this.level = 0;       // mip level consumers sample at
    this.max = 1;         // max over the baked grid at `level`; rejection normalises by it
  }

  get isLeaf() {
    return this.kind !== 'op';
  }

  // Operand ids, for the registry's dependency ordering.
  get dependsOn() {
    return this.isLeaf ? [] : [this.a, this.b].filter((o) => typeof o === 'string');
  }

  // Evaluate the whole subtree ONCE into a flat grid, then mip THAT.
  //
  // Two reasons, and the second is the one someone will try to "optimise" away:
  //   1. Per-particle cost becomes a single lookup regardless of graph depth. initialize()
  //      is hot, and prewarm re-enters it (ParticleSystem.ts:990-996).
  //   2. filter(A x B) != filter(A) x filter(B). Mipping the operands first and multiplying
  //      after would smear one halftone against another and destroy the interference
  //      structure that makes the arm clusters clumpy. The multiply MUST happen at full
  //      resolution.
  //
  // `resolve` maps an operand id to an already-baked EffectMap.
  bake(resolve, { level = null, relError = 0.25 } = {}) {
    if (this.baked) return this;

    if (this.isLeaf) {
      if (!this.texture) throw new Error(`EffectMap ${this.id}: bake() before the texture loaded`);
      this.baked = this.texture;
    } else {
      const ops = [this.a, this.b].map((o) => (typeof o === 'string' ? resolve(o) : o));
      const maps = ops.filter((o) => o instanceof EffectMap);
      if (maps.length === 0) throw new Error(`EffectMap ${this.id}: -op with no map operand`);

      let w = 1, h = 1, channels = 1;
      for (const m of maps) {
        w = Math.max(w, m.baked.width);
        h = Math.max(h, m.baked.height);
        channels = Math.max(channels, m.baked.channels);
      }

      const out = new Float32Array(w * h * channels);
      const [x0, y0, x1, y1] = this.rect;
      const va = new Float32Array(4), vb = new Float32Array(4);
      const combine = this.op === 'multiply'
        ? (p, q) => p * q
        : this.op === 'add'
          ? (p, q) => p + q
          : (() => { throw new Error(`EffectMap ${this.id}: unknown -op ${this.op}`); })();

      for (let y = 0; y < h; y++) {
        const wy = y0 + ((y + 0.5) / h) * (y1 - y0);
        for (let x = 0; x < w; x++) {
          const wx = x0 + ((x + 0.5) / w) * (x1 - x0);
          readOperand(ops[0], wx, wy, va);
          readOperand(ops[1], wx, wy, vb);
          const o = (y * w + x) * channels;
          for (let k = 0; k < channels; k++) out[o + k] = combine(va[k], vb[k]);
        }
      }
      this.baked = new EffectMapTexture(w, h, channels, out);
    }

    this.level = level !== null ? level : this.baked.defaultLevel(relError);
    this.baked.buildMips(this.level);

    // Drop full resolution once the sampled level exists -- 0x8E960553 alone is 16MB at
    // level 0. Keep it only if that IS the level we sample.
    if (this.level > 0) {
      this.baked.levels[0] = null;
    }

    const a = this.baked.levels[this.level];
    let max = 0;
    for (let i = 0; i < a.length; i += this.baked.channels) if (a[i] > max) max = a[i];
    // A map that is uniformly zero would make every acceptance test divide by zero.
    this.max = max > 0 ? max : 1;
    return this;
  }

  // Sample at a world position, through `rect` (the caller's, possibly LOD-scaled, copy of
  // this node's rect). Writes `baked.channels` values into `out` and returns whether the
  // position was inside the rect; outside, `out` holds the clamped edge value, which the
  // caller is expected to ignore.
  sample(wx, wy, rect, out) {
    const [x0, y0, x1, y1] = rect;
    const u = (wx - x0) / (x1 - x0);
    const v = (wy - y0) / (y1 - y0);
    this.baked.sample(u, v, this.level, out);
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }
}

const _scratch = new Float32Array(4);

function readOperand(o, wx, wy, out) {
  if (o instanceof EffectMap) {
    const inside = o.sample(wx, wy, o.rect, _scratch);
    // Outside a map's own rect it contributes nothing. For a multiply that zeroes the
    // product, which is what "the arms stop where the map stops" means; for an add it is a
    // no-op. Both are the behaviour the traced graph implies.
    for (let k = 0; k < 4; k++) out[k] = inside ? _scratch[Math.min(k, o.baked.channels - 1)] : 0;
  } else {
    for (let k = 0; k < 4; k++) out[k] = o[k];
  }
}
