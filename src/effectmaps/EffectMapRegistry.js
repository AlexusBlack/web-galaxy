import { EffectMap } from './EffectMap.js';
import { EffectMapTexture } from './EffectMapTexture.js';

// id -> EffectMap, with one async preload that resolves every leaf texture and then bakes
// every tree in dependency order.
//
// Lookups of an unknown or unbaked id THROW. A registry that returned a neutral 1.0 instead
// would render as a perfectly working galaxy with no arms -- indistinguishable from a
// correct build, and the hardest possible bug to see. Fail loudly at load.
export class EffectMapRegistry {
  constructor(declarations, { basePath = 'images/', loadTexture = EffectMapTexture.load } = {}) {
    this.basePath = basePath;
    this.loadTexture = loadTexture;
    this.maps = new Map();
    this.loaded = false;
    for (const d of declarations) {
      if (this.maps.has(d.id)) throw new Error(`EffectMapRegistry: duplicate map id ${d.id}`);
      this.maps.set(d.id, new EffectMap(d));
    }
    for (const m of this.maps.values()) {
      for (const dep of m.dependsOn) {
        if (!this.maps.has(dep)) throw new Error(`EffectMap ${m.id}: operand ${dep} is not declared`);
      }
    }
  }

  get(id) {
    const m = this.maps.get(id);
    if (!m) throw new Error(`EffectMapRegistry: no map declared with id ${id}`);
    if (!m.baked) throw new Error(`EffectMapRegistry: map ${id} used before loadAll() completed`);
    return m;
  }

  async loadAll(levels = {}) {
    const leaves = [...this.maps.values()].filter((m) => m.isLeaf);
    await Promise.all(leaves.map(async (m) => {
      m.texture = await this.loadTexture(this.basePath + m.src, m.kind);
    }));

    const resolve = (id) => {
      const m = this.maps.get(id);
      if (!m.baked) throw new Error(`EffectMapRegistry: ${id} baked out of dependency order`);
      return m;
    };
    for (const m of this.order()) {
      m.bake(resolve, { level: m.id in levels ? levels[m.id] : null });
    }
    this.loaded = true;
    return this;
  }

  // Depth-first topological order, so every operand is baked before the node that reads it.
  order() {
    const out = [];
    const state = new Map();
    const visit = (id) => {
      const s = state.get(id);
      if (s === 'done') return;
      if (s === 'open') throw new Error(`EffectMapRegistry: cycle through map ${id}`);
      state.set(id, 'open');
      const m = this.maps.get(id);
      for (const dep of m.dependsOn) visit(dep);
      state.set(id, 'done');
      out.push(m);
    };
    for (const id of this.maps.keys()) visit(id);
    return out;
  }
}
