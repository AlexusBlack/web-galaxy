// One decoded effect-map image: pixels as floats, plus a box-filtered mip pyramid.
//
// WHY THERE IS A PYRAMID AT ALL. The Spore density masks are strictly BILEVEL -- 0x8E960553
// is 2048x2048 and contains exactly two values, 0 and 255, nothing between. They are
// halftone-dithered artwork, not grayscale density fields. Sampling one per-texel returns a
// coin flip on the dot screen's phase and discards 100% of the density information, which
// is also why the authored `-aboveHeight 0.1` and `0.2` in the source .pfx select the
// identical pixel set. The density signal lives entirely in LOCAL COVERAGE, so a consumer
// must box-filter before it thresholds. (The spec's S4.4 recommends nearest-neighbour "to
// match the dithered nature" -- that reasoning is exactly backwards.)
//
// Measured on 0x8E960553, fraction of cells strictly between 0 and 1: mip 2 -> 0.253,
// mip 3 -> 0.309, mip 4 -> 0.342, mip 5 -> 0.375. The on-pixel run length averages 3.4px,
// so the halftone screen period is ~8-10px and mip 3 sits right on it and aliases. Mip 4 is
// the first level that reliably recovers density; see defaultLevel() below.
export class EffectMapTexture {
  constructor(width, height, channels, level0) {
    this.width = width;
    this.height = height;
    this.channels = channels;
    // levels[0] is full resolution. Rows are stored BOTTOM-UP, so v = 0 is the first row
    // and sampling needs no flip; the flip happens once, at decode.
    this.levels = [level0];
    this.dims = [[width, height]];
  }

  // Decode 8-bit RGBA into floats. `kind` is the declaration keyword, and it is the one
  // place that distinction is load-bearing rather than cosmetic -- it is a COLOUR SPACE tag:
  //
  //   bitImage / monoImage -> DATA. Raw byte/255, no transfer function. These feed
  //     thresholds and -op arithmetic; an sRGB decode would silently reshape every density
  //     curve in the graph. Stored single-channel (from R) -- a quarter of the memory, and
  //     every consumer of them wants a scalar.
  //   image -> COLOUR. sRGB -> linear, because the result multiplies particle.startColor,
  //     which three r186 with ColorManagement treats as linear working space. Alpha is
  //     already linear and is never transferred.
  //
  // `rgba` must be NON-premultiplied. Canvas 2D stores RGBA premultiplied internally, so a
  // drawImage/getImageData round-trip quantises low-alpha pixels savagely -- and
  // SG_galaxy_arms_color is 85% alpha<0.2 with real non-black colour underneath. load()
  // below goes through createImageBitmap with premultiplyAlpha:'none' for exactly this.
  static fromPixels(width, height, rgba, kind = 'image') {
    // Validate here rather than letting a degenerate image propagate. Everything downstream
    // -- mip count, coverage, max -- silently becomes NaN on a 0x0 input, and the throw then
    // lands three files away from the actual mistake.
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`EffectMapTexture.fromPixels: bad dimensions ${width}x${height}`);
    }
    if (rgba.length !== width * height * 4) {
      throw new Error(
        `EffectMapTexture.fromPixels: ${width}x${height} needs ${width * height * 4} RGBA ` +
        `bytes, got ${rgba.length}`,
      );
    }
    const mono = kind === 'bitImage' || kind === 'monoImage';
    const channels = mono ? 1 : 4;
    const out = new Float32Array(width * height * channels);
    for (let y = 0; y < height; y++) {
      // Source row 0 is the TOP of the image; we store bottom-up.
      const src = (height - 1 - y) * width * 4;
      const dst = y * width * channels;
      for (let x = 0; x < width; x++) {
        const s = src + x * 4;
        if (mono) {
          out[dst + x] = rgba[s] / 255;
        } else {
          const d = dst + x * 4;
          out[d] = srgbToLinear(rgba[s] / 255);
          out[d + 1] = srgbToLinear(rgba[s + 1] / 255);
          out[d + 2] = srgbToLinear(rgba[s + 2] / 255);
          out[d + 3] = rgba[s + 3] / 255;
        }
      }
    }
    return new EffectMapTexture(width, height, channels, out);
  }

  static async load(url, kind = 'image') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EffectMapTexture.load: ${url} -- HTTP ${res.status}`);
    const bitmap = await createImageBitmap(await res.blob(), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    // Read the dimensions BEFORE close(). A closed ImageBitmap reports width and height 0,
    // so using bitmap.width afterwards decodes every map as 0x0 -- which then surfaces far
    // away as `levels[NaN] is undefined` inside EffectMap.bake().
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    // colorSpace:'srgb' stops the browser converting on read; we do our own transfer above.
    const img = ctx.getImageData(0, 0, width, height, { colorSpace: 'srgb' });
    bitmap.close();
    return EffectMapTexture.fromPixels(width, height, img.data, kind);
  }

  // Build the pyramid up to and including `maxLevel` by successive 2x2 box reduction.
  // Odd dimensions average whatever samples exist rather than dropping the last row/column.
  buildMips(maxLevel) {
    for (let l = this.levels.length; l <= maxLevel; l++) {
      const [pw, ph] = this.dims[l - 1];
      const prev = this.levels[l - 1];
      const w = Math.max(1, pw >> 1);
      const h = Math.max(1, ph >> 1);
      const c = this.channels;
      const next = new Float32Array(w * h * c);
      for (let y = 0; y < h; y++) {
        const y0 = y * 2;
        const y1 = Math.min(y0 + 1, ph - 1);
        for (let x = 0; x < w; x++) {
          const x0 = x * 2;
          const x1 = Math.min(x0 + 1, pw - 1);
          const a = (y0 * pw + x0) * c, b = (y0 * pw + x1) * c;
          const d = (y1 * pw + x0) * c, e = (y1 * pw + x1) * c;
          const o = (y * w + x) * c;
          for (let k = 0; k < c; k++) {
            next[o + k] = (prev[a + k] + prev[b + k] + prev[d + k] + prev[e + k]) * 0.25;
          }
        }
      }
      this.levels.push(next);
      this.dims.push([w, h]);
      if (w === 1 && h === 1) break;
    }
    return this;
  }

  // Is this a halftone-dithered mask -- only fully-off and fully-on texels, no shades?
  // Everything about mip selection below depends on the answer, so it is measured rather
  // than assumed from the declaration keyword.
  isBilevel() {
    const a = this.levels[0];
    const c = this.channels;
    for (let i = 0; i < a.length; i += c) {
      if (a[i] > 1e-6 && a[i] < 1 - 1e-6) return false;
    }
    return true;
  }

  // The mip level a consumer should sample, derived from how much averaging it takes to
  // turn this particular halftone into a usable density estimate.
  //
  // A level-L cell averages 4^L texels, each an independent-ish Bernoulli draw at the
  // local coverage c, so the estimate's relative standard error is
  // sqrt(c(1-c)/4^L) / c. Solving that for a target gives the level directly. This is a
  // statistical criterion rather than a tuned constant, and it does the right thing across
  // the set on its own: it asks for MORE averaging from sparser masks, which is exactly
  // where a fixed level would fail.
  //
  //   0x8E960553  8.48% coverage -> 4      0x1A4D48A7  42.79% -> 3
  //   0xDE12103B  2.34% coverage -> 5      0x9A76F5E7   2.32% -> 5
  //
  // A continuous map -- SG_galaxy_heights, or any -op result built from one -- has no
  // halftone to average out and returns 0: blurring it would only smear the height bulge.
  defaultLevel(relError = 0.25, maxLevel = 8) {
    if (!this.isBilevel()) return 0;
    const a = this.levels[0];
    const c = this.channels;
    let lit = 0, n = 0;
    for (let i = 0; i < a.length; i += c) { lit += a[i]; n++; }
    const p = lit / n;
    // `!(p > 0 && p < 1)` rather than `p <= 0 || p >= 1`, so a NaN returns 0 instead of
    // propagating out as a NaN mip level.
    if (!(p > 0 && p < 1)) return 0;
    const needed = (1 - p) / (p * relError * relError); // texels per cell
    const level = Math.ceil(Math.log2(needed) / 2);
    return Math.max(0, Math.min(maxLevel, level));
  }

  // Bilinear between cell centres at `level`, writing `channels` values into `out`.
  // Bilinear rather than nearest because at mip 4 a cell is ~15.6 world units while the
  // mean inter-particle spacing is ~10.6 -- nearest would show visible density plateaus.
  sample(u, v, level, out) {
    const [w, h] = this.dims[level];
    const a = this.levels[level];
    const c = this.channels;

    let x = u * w - 0.5;
    let y = v * h - 0.5;
    x = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
    y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;

    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1 < w ? x0 + 1 : x0;
    const y1 = y0 + 1 < h ? y0 + 1 : y0;
    const fx = x - x0, fy = y - y0;

    const i00 = (y0 * w + x0) * c, i10 = (y0 * w + x1) * c;
    const i01 = (y1 * w + x0) * c, i11 = (y1 * w + x1) * c;

    for (let k = 0; k < c; k++) {
      const top = a[i00 + k] + (a[i10 + k] - a[i00 + k]) * fx;
      const bot = a[i01 + k] + (a[i11 + k] - a[i01 + k]) * fx;
      out[k] = top + (bot - top) * fy;
    }
    return out;
  }
}

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
