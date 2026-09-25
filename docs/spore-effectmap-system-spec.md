# Spore `effectMap` System — Reference Spec for three.quarks Implementation

## 0. Purpose of this document

This is a reverse-engineered specification of Spore's `effectMap` system (part of the
Swarm effects engine), covering `effectMap` declarations and their three consumers —
`mapEmit`, `mapEmitColor`, and `mapPin` — as used to place, color, and displace
particles across a texture-driven density field (in this project: a galaxy's spiral
arms). It is written to be handed to an LLM coding agent (Claude Code) as the spec for
implementing an equivalent system with **custom emitters in three.quarks**, since
three.quarks' built-in emission shapes (point/sphere/cone/box/etc.) have no concept of
texture-weighted, thresholded, or color-sampled emission.

### Confidence legend

Every claim below is tagged so the implementer knows how much weight to put on it:

- **[CONFIRMED-DOC]** — verbatim or near-verbatim from the SporeModder-FX wiki
  (`Particles (Effects)`, `Distribute (Effects)` pages).
- **[CONFIRMED-PIXEL]** — verified by inspecting the actual extracted texture files.
- **[CONFIRMED-CHAIN]** — verified by tracing the actual `.pfx` source across multiple
  files and confirming the arithmetic/logic is internally consistent.
- **[INFERRED]** — a reasonable, structurally-supported conclusion, not directly stated
  by any source.
- **[SPECULATIVE]** — the wiki's own authors flag this section as untested/unconfirmed
  even by them. Treat as a starting hypothesis to validate visually, not ground truth.

The wiki's own words on the whole "Maps" section for particles: *"These features are
untested, so the following is just their specification; any indications about what
they do is pure speculation."* Keep that in mind throughout §3.

---

## 1. `effectMap` declaration syntax

**[CONFIRMED-DOC / CONFIRMED-CHAIN]**

```
effectMap <id> -channel <channelSpec> -rect (<x0>, <y0>, <x1>, <y1>) -worldSpace <source>
```

- **`<id>`** — a resource ID (hex hash or human-readable name) that other components
  reference to use this map. An `effectMap`'s own `<id>` is sometimes identical to the
  resource it wraps (e.g. `effectMap 0x625BB6AE ... -image 0x625BB6AE`), which simply
  means "this effectMap is a thin, unmodified wrapper around that one texture" — not a
  special case, just a 1:1 passthrough.
- **`-channel all`** — which image channel(s) this map exposes. Every example
  encountered uses `all`. **[SPECULATIVE]** what other values (`r`, `g`, `b`, `a`, or
  combinations) are legal, or how single-channel selection behaves — not observed in
  any source file examined.
- **`-rect (x0, y0, x1, y1) -worldSpace`** — **the critical attribute for
  reimplementation.** Defines the world-space bounding box that this map's texture is
  stretched across. Converting a world position to a UV lookup:
  ```
  u = (worldX - x0) / (x1 - x0)
  v = (worldZ - y0) / (y1 - y0)   // or worldY, depending on which plane the disc sits in
  ```
  **Different maps in the same effect can have different rects** — observed values in
  this project were both `(-1000,-1000,1000,1000)` (2000×2000 units) and
  `(-900,-900,900,900)` (1800×1800 units). **Always use each map's own declared rect**,
  never assume a single shared bounding box across all maps.

### 1.1 Source types (pick exactly one per `effectMap`)

- **`-image <resourceID>`** — a standard, typically full-color texture resource.
  **[CONFIRMED-PIXEL]** Observed example (`SG_galaxy_arms_color`) is a small,
  hand-painted, genuinely multi-hued image (blue/purple/pink arms, warm core) — used
  purely as a **color** source via `mapEmitColor`, never for emission gating.
- **`-bitImage <resourceID>`** — a distinct, apparently lower-precision/grayscale
  bitmap resource type. **[CONFIRMED-PIXEL]** Observed examples are grayscale spiral
  masks with visible dot-screen/halftone dithering, used purely as **density/shape**
  masks for `mapEmit`, never for color.
- **`-monoImage <resourceID>`** — another distinct source type, observed wrapping a
  greyscale heightmap-style texture (`SG_galaxy_heights`). **[CONFIRMED-PIXEL]** In the
  one observed example: uniform mid-gray (~0.5) everywhere *outside* the spiral arms,
  with dense per-pixel noise (both lighter and darker than the mid-gray baseline)
  *inside* the arm bands specifically. Distinguishing `-monoImage` from `-bitImage` by
  behavior alone wasn't possible from the sources examined — **[INFERRED]** the name
  suggests single-channel/grayscale-only interpretation, likely relevant for how the
  engine reads pixel bit-depth rather than a difference in downstream usage.
- **`-op <operator> <operandA> <operandB>`** — composite two inputs. Confirmed
  operators: **`multiply`** and **`add`** (the latter confirmed via an actual changelog
  entry: *"Fix `-op` in effect map when using vector values"*, and via the
  `SG_galaxy_heights` chain below). Each operand can be:
  - another `effectMap`'s `<id>` (sampled per-pixel at the same UV), or
  - a literal constant `Vector4`, e.g. `(20, 20, 20, 20)` or `(-0.5, -0.5, -0.5, -0.5)`
    — applied uniformly to every pixel, same value for all four channels in every
    example observed.

  **[CONFIRMED-CHAIN]** `-op` chains can be multiple levels deep — one map's output
  feeds into another map's `-op` as an operand. When implementing, treat this as a
  small **expression tree** to evaluate recursively, not a flat list.

---

## 2. Worked example: the galaxy's actual `effectMap` graph

This is real, fully traced source — use it as ground truth for testing your
implementation, not just as illustration.

### 2.1 Density / emission-location chain

```
0x8E960553  = bitImage(0x8E960553)                        [grayscale spiral, halftone-dithered]
0x9A76F5E7  = image(0x9A76F5E7)                            [small tileable dot-cluster pattern]
0x1A4D48A7  = image(0x1A4D48A7)                            [full-frame cellular/organic noise]

0xFF33EE2A  = 0x8E960553 × 0x9A76F5E7   (rect: -1000..1000)   → feeds distribute-72 (star clusters)
0x0A256562  = 0x8E960553 × 0x1A4D48A7   (rect: -1000..1000)   → feeds distribute-74 (diffuse haze)
                                                                → particles-2309 samples 0x8E960553 RAW (no multiply)
```

One shared coarse "spiral shape" mask (`0x8E960553`) is reused three times, each time
combined with a *different* fine-detail modulator (or none) depending on the visual
role of that layer:
- Tiled dot-cluster detail → discrete, clumpy star clusters (`distribute-72`)
- Cellular noise detail → mottled, diffuse haze (`distribute-74`)
- No detail modulation → the primary/dominant visible arm stars (`particles-2309`)

### 2.2 Color chain

```
0x625BB6AE  = image(0x625BB6AE)                [tiny radial warm glow, no spiral shape]
              → mapEmitColor for distribute-74

0x86601D55  = image(SG_galaxy_arms_color)      [hand-painted multi-hue spiral, low-res]
              → mapEmitColor for particles-2186 (dust cards)
```

Color and density are **fully independent maps** — one decides *where* a particle can
spawn (thresholded), a completely separate one decides *what color* it gets once it
has spawned there.

### 2.3 Height / positional-displacement chain

```
SG_galaxy_heights (raw texture)                [mid-gray ~0.5 outside arms; noisy inside arms]
        │
0xEF82F8CE  = monoImage(SG_galaxy_heights)                              (rect: -900..900)
        │
0x66BF605C  = 0xEF82F8CE + (-0.5,-0.5,-0.5,-0.5)                        (rect: -900..900)
              → recenters to ~0 outside arms, ± noise inside arms
        │
        ├─ 0x6F3E772B = 0x66BF605C × (20,20,20,20)  → mapPin (distribute-72)   range ≈ ±10 units
        └─ 0x082B9950 = 0x66BF605C × (10,10,10,10)  → mapPin (distribute-74)   range ≈ ±5 units
```

**Interpretation [INFERRED, well-supported]:** `mapPin` applies a **signed positional
offset** (most plausibly vertical/Y, or along the surface normal) to each particle
*after* `mapEmit` has already picked its horizontal position. The noise is spatially
confined to the arm regions specifically (flat/zero everywhere else), so displacement
only happens exactly where particles actually spawn — a cheap way to fake volumetric,
non-flat arm thickness without true 3D noise computed at runtime. The two different
scale factors (±10 vs ±5) are a deliberate art choice: the discrete-cluster layer gets
pushed around twice as aggressively as the softer diffuse-haze layer.

---

## 3. Consumer attributes

### 3.1 `mapEmit` — on `particles` components

**[CONFIRMED-DOC, wiki's own caveat: speculative/untested]**

```
mapEmit <resourceID> -belowHeight <float> -aboveHeight <float>
        -heightRange <float: aboveHeight> <float: belowHeight>
        -pinToSurface -density
```

> "Probably used to define from which parts of the source particles are emitted. For
> example, a galaxy effect can be done by using an emit map with the shape of a
> galaxy, therefore emitting stars at specific locations."

**[INFERRED]** `-aboveHeight <float>` acts as a **threshold**: only emit where the
sampled map value at the candidate position exceeds that cutoff. This is the mechanism
that turns a smooth grayscale density image into "emit only in the bright regions,
skip the dark gaps." Values observed in this project: `0.1` and `0.2`.

`-pinToSurface` and `-density` — **[SPECULATIVE]**, no further detail available.

### 3.2 `mapEmit` — on `distribute` components

**[CONFIRMED-DOC]** Signature differs slightly from the particles version — no
`-pinToSurface`/`-density` options:

```
mapEmit <resourceID> -belowHeight <float> -aboveHeight <float>
        -heightRange <float: aboveHeight> <float: belowHeight>
```

### 3.3 `mapEmitColor`

**[CONFIRMED-DOC (distribute), CONFIRMED-CHAIN (usage)]**

```
mapEmitColor <resourceID>
```

Samples the given map as a **color** at the same position `mapEmit` used, and assigns
it to the emitted particle's color/tint. Fully independent of `mapEmit`'s own map —
one map for "where," a separate map for "what color."

### 3.4 `mapPin`

**[CONFIRMED-DOC signature, INFERRED behavior — see §2.3]**

```
mapPin <resourceID>
```

Takes **only** a resource reference — no threshold/range options, unlike `mapEmit`.
Based on the traced chain in §2.3, this most plausibly reads as a **signed positional
displacement** applied to the particle after emission placement.

### 3.5 Other particle map attributes (not used in this project's `.pfx`, documented for completeness)

**[CONFIRMED-DOC signatures, SPECULATIVE behavior]** — all mutually exclusive with each
other:

```
mapCollide (<resourceID>) -pinToSurface -bounce <float> -killOutsideMap -death <float>
mapRepel (<resourceID>) <float: repulseHeight> <float: repulseStrength> -scout <float> -vertical <float> -killHeight <float> -killOutsideMap
mapAdvect <resourceID> -strength <float> -killOutsideMap
mapForce <resourceID> -strength <float> -killOutsideMap
```

Not needed for the galaxy effect examined, but include for completeness in case future
`.pfx` files reference them.

---

## 4. Implementation architecture for three.quarks

### 4.1 Why the built-ins don't fit

three.quarks' stock emission shapes (point, sphere, cone, box, donut, mesh-surface,
etc.) place particles by pure geometric sampling — none of them support:
- texture-weighted/thresholded spawn position selection,
- sampling a *second, independent* texture for color at the chosen position,
- sampling a *third* texture for a positional displacement at the chosen position.

All three of the above are needed to reproduce this system, so a **custom emission
shape/behavior** is required rather than composing built-ins.

### 4.2 Proposed module structure

```
src/vfx/effectmaps/
  EffectMapTexture.ts       — loads an image into an offscreen canvas, exposes
                              a sampling function over ImageData
  EffectMapNode.ts          — the expression-tree model from §1.1 (image / bitImage /
                              monoImage leaf nodes, op(add|multiply) composite nodes),
                              with a recursive `sample(u, v) -> Vector4` method
  EffectMapRegistry.ts      — resolves resourceID -> EffectMapNode, mirroring how the
                              .pfx forward-references map IDs across files
src/vfx/emitters/
  MapDrivenEmissionShape.ts — custom three.quarks emission shape implementing the
                              mapEmit + mapEmitColor + mapPin composition described
                              in §4.4 below
```

### 4.3 `EffectMapNode` — runtime model (pseudocode)

```ts
type EffectMapNode =
  | { kind: 'image'; texture: EffectMapTexture }
  | { kind: 'bitImage'; texture: EffectMapTexture }
  | { kind: 'monoImage'; texture: EffectMapTexture }
  | { kind: 'op'; op: 'add' | 'multiply'; a: EffectMapNode; b: EffectMapNode | Vector4 };

// rect and worldSpace live on the OUTERMOST node used for a given lookup —
// carry (x0, y0, x1, y1) alongside whichever node you're about to sample from.

function sampleNode(node: EffectMapNode, u: number, v: number): Vector4 {
  switch (node.kind) {
    case 'image':
    case 'bitImage':
    case 'monoImage':
      return node.texture.sample(u, v); // see 4.4 for sampling strategy
    case 'op': {
      const a = sampleNode(node.a, u, v);
      const b = node.b instanceof Vector4 ? node.b : sampleNode(node.b, u, v);
      return node.op === 'add' ? a.clone().add(b) : a.clone().multiply(b);
    }
  }
}

function worldToUV(worldX: number, worldZ: number, rect: [number, number, number, number]): [number, number] {
  const [x0, y0, x1, y1] = rect;
  return [(worldX - x0) / (x1 - x0), (worldZ - y0) / (y1 - y0)];
}
```

### 4.4 Texture sampling strategy

- Load each source PNG into an offscreen `<canvas>`, read `ImageData` once at startup
  (not per-frame/per-particle).
- **Sampling mode**: nearest-neighbor is simplest and matches the visibly
  dithered/noisy nature of these specific source textures reasonably well; bilinear
  would smooth out the halftone dithering on `0x8E960553` and might look better —
  **[unverified, worth A/B testing visually against reference footage]**.
- Precompute composite nodes (the `-op` chains) **once**, offline, into a single flat
  `Float32Array`/canvas per composite result — there's no need to re-evaluate the
  expression tree per particle spawn at runtime, since none of these maps are dynamic.

### 4.5 Weighted/thresholded spawn-position sampling

For `mapEmit`-driven emission (density mask + threshold):

```ts
// Build once, offline, from the composited density map:
function buildWeightedSampler(densityMap: Float32Array, width: number, height: number, aboveHeight: number) {
  const validIndices: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < densityMap.length; i++) {
    if (densityMap[i] > aboveHeight) {
      validIndices.push(i);
      weights.push(densityMap[i]); // weight by brightness for true density-proportional spawning
    }
  }
  return buildCumulativeDistribution(validIndices, weights); // returns a fast weighted-random-pick function
}
```

At emission time: pick a pixel index via the weighted sampler → convert pixel
coords to UV → convert UV to world position via the map's `rect`.

### 4.6 Full per-particle emission composition

```ts
function emitOne(config: GalaxyLayerConfig): { position: Vector3; color: Vector4 } {
  // 1. mapEmit: pick a spawn UV from the (possibly composited) density map
  const [u, v] = config.densitySampler.pick();
  const [worldX, worldZ] = uvToWorld(u, v, config.densityRect);

  // 2. mapEmitColor: sample an independent color map at the SAME uv
  const color = config.colorMap
    ? sampleNode(config.colorMap, u, v)
    : DEFAULT_COLOR;

  // 3. mapPin: sample the signed height/displacement map at the SAME uv, scale, apply
  const heightRaw = sampleNode(config.heightMap, u, v).x; // mono, so any channel works
  const yOffset = (heightRaw - 0.5) * config.heightScale; // 20 for clusters, 10 for haze — see §2.3

  return {
    position: new Vector3(worldX, config.baseY + yOffset, worldZ),
    color,
  };
}
```

### 4.7 Integration notes — things to verify against the actual installed three.quarks version

- The exact interface three.quarks expects for a **custom emission shape** (method
  name, whether it's called `initialize(particle)` and mutates in place vs. returns a
  value, whether it needs a `type`/serialization field like the `ColorGenerator`
  interface did). Inspect the installed package's public type exports before wiring
  `MapDrivenEmissionShape` in — same caution as with the earlier custom
  `RandomColorIndependent` generator: import only from the package's public entry
  point, not internal relative paths (blocked by its `exports` field).
- Whether three.quarks' particle system expects **world-space** or **local-space**
  positions from a custom emission shape, and adjust the `rect`-based world
  coordinates accordingly if the emitter's transform isn't at the origin.
- Confirm channel semantics for `-channel all` empirically once a first density mask
  is wired up and visibly rendering — if results look inverted or single-channel-only,
  revisit the "all channels" assumption in §1.

---

## 5. Asset reference table

| Resource ID | File | Role | Evidence |
|---|---|---|---|
| `0x8E960553` | grayscale spiral, halftone | Primary density mask | pixel |
| `0x9A76F5E7` | small tileable dot-cluster | Detail modulator (clusters) | pixel |
| `0x1A4D48A7` | full-frame cellular noise | Detail modulator (haze) | pixel |
| `0xDE12103B` | smoother grayscale spiral | Density mask (dust cards) | pixel |
| `0x625BB6AE` | small radial warm glow | Color (haze layer) | pixel |
| `SG_galaxy_arms_color` | small painted multi-hue spiral | Color (dust cards) | pixel |
| `SG_galaxy_heights` | mid-gray + arm-confined noise | Height/displacement source | pixel |
| `SG_galaxy_arms_colored2` | larger, more detailed, painted knots | **Unreferenced by this `.pfx`** — possibly an LOD-tier sibling asset; not wired into any traced chain | pixel, unconfirmed usage |

---

## 6. Appendix — verbatim source lines

```
effectMap 0xFF33EE2A -channel all -rect (-1000, -1000, 1000, 1000) -worldSpace -op multiply 0x9A76F5E7 0x8E960553
effectMap 0x6F3E772B -channel all -rect (-900, -900, 900, 900) -worldSpace -op multiply 0x66BF605C (20, 20, 20, 20)
effectMap 0x0A256562 -channel all -rect (-1000, -1000, 1000, 1000) -worldSpace -op multiply 0x1A4D48A7 0x8E960553
effectMap 0x625BB6AE -channel all -rect (-1000, -1000, 1000, 1000) -worldSpace -image 0x625BB6AE
effectMap 0x082B9950 -channel all -rect (-900, -900, 900, 900) -worldSpace -op multiply 0x66BF605C (10, 10, 10, 10)
effectMap 0x8E960553 -channel all -rect (-1000, -1000, 1000, 1000) -worldSpace -bitImage 0x8E960553
effectMap 0x86601D55 -channel all -rect (-1000, -1000, 1000, 1000) -worldSpace -image SG_galaxy_arms_color
effectMap 0xB6412D00 -channel all -rect (-1000, -1000, 1000, 1000) -worldSpace -bitImage 0xDE12103B
effectMap 0x66BF605C -channel all -rect (-900, -900, 900, 900) -worldSpace -op add 0xEF82F8CE (-0.5, -0.5, -0.5, -0.5)
effectMap 0xEF82F8CE -channel all -rect (-900, -900, 900, 900) -worldSpace -monoImage SG_galaxy_heights

distribute distribute-72
	density 10000
	source square
	material 0xB4078D0E
	color (0.8, 0.8, 3) -vary (0.1, 0.1, 0.1)
	alpha 1
	size 10 9.5 8 9 11 -vary 0.3
	mapEmit 0xFF33EE2A -aboveHeight 0.1
	mapPin 0x6F3E772B
end

distribute distribute-74
	density 5000
	source square
	material 0xEFE82D66
	color (1, 0.8784314, 0.6196079) (1, 0.7803922, 0.6156863) (1, 0.8901961, 0.5490196) (1, 0.6705883, 0.4784314) (0.9686275, 0.8509805, 0.6392157) -vary (0.25, 0.25, 0.25)
	alpha 1
	size 9 8 7 6 -vary 0.3
	mapEmit 0x0A256562 -aboveHeight 0.2
	mapEmitColor 0x625BB6AE
	mapPin 0x082B9950
end

particles particles-2309
	color (1, 0.3, 0.4) (1, 1, 1) -vary (0.6, 0.6, 0.6)
	alpha 0 0.5 2 1 0.8 0.6 0.4 0.2 0 -vary 0.5
	size 4 22 -vary 0.5
	rotate 1 -vary 1
	source -ellipse (2000, 2000, 15)
	emit -scaleExisting
	life 2 1 -preroll 2
	rate 3000 -loop 1
	material 0x223425FD -sortOffset -10
	mapEmit 0x8E960553 -aboveHeight 0.1
end

particles particles-2186
	color (0.7, 0.6, 1) -vary (0.2, 0.2, 0.2)
	alpha 0 0.5 0.5 0 -vary 0.3
	size 35 -vary 0.25
	rotate 1 -vary 1
	source -box (1, 1, 0.01)
	emit -scaleExisting
	life 5 2 -preroll 5
	maintain 400
	texture 0x352A75AF -sortOffset -0.4 -light -tile 8 4
	mapEmit 0xB6412D00 -aboveHeight 0.1
	mapEmitColor 0x86601D55
end
```
