// The galaxy's effectMap graph, transcribed from the original Swarm source
// (docs/spore-effectmap-system-spec.md S6) so the declarations read next to the thing they
// came from and a mistyped id is a load-time throw rather than a blank galaxy.
//
// Verbatim source, for comparison:
//   effectMap 0xFF33EE2A -rect (-1000,-1000,1000,1000) -op multiply 0x9A76F5E7 0x8E960553
//   effectMap 0x0A256562 -rect (-1000,-1000,1000,1000) -op multiply 0x1A4D48A7 0x8E960553
//   effectMap 0x8E960553 -rect (-1000,-1000,1000,1000) -bitImage 0x8E960553
//   effectMap 0xB6412D00 -rect (-1000,-1000,1000,1000) -bitImage 0xDE12103B
//   effectMap 0x625BB6AE -rect (-1000,-1000,1000,1000) -image 0x625BB6AE
//   effectMap 0x86601D55 -rect (-1000,-1000,1000,1000) -image SG_galaxy_arms_color
//   effectMap 0xEF82F8CE -rect (-900,-900,900,900)     -monoImage SG_galaxy_heights
//   effectMap 0x66BF605C -rect (-900,-900,900,900)     -op add 0xEF82F8CE (-0.5,-0.5,-0.5,-0.5)
//   effectMap 0x6F3E772B -rect (-900,-900,900,900)     -op multiply 0x66BF605C (20,20,20,20)
//   effectMap 0x082B9950 -rect (-900,-900,900,900)     -op multiply 0x66BF605C (10,10,10,10)
//
// NOTE on 0x66BF605C's -0.5. SG_galaxy_heights' background is not 0.5 -- it is exactly
// 105/255 = 0.4118, flat, over 69% of the image. That is an authored value, not a
// colour-space artefact: sRGB-encoding linear 0.5 gives byte 188, and sRGB-decoding byte 105
// gives linear 0.141; the PNG carries no gamma or iCCP chunk. So the declared -0.5 leaves a
// baseline of (0.4118 - 0.5) * 20 = -1.76 world units. That is a RIGID TRANSLATION of the
// whole layer rather than a distortion, and invisible at the LOD distances in play, so we
// follow the declared graph literally rather than substituting a measured neutral.
const RECT_1000 = [-1000, -1000, 1000, 1000];
const RECT_900 = [-900, -900, 900, 900];

export const GALAXY_MAPS = [
  { id: '0x8E960553', rect: RECT_1000, kind: 'bitImage', src: '0x8E960553.png' },
  { id: '0x9A76F5E7', rect: RECT_1000, kind: 'bitImage', src: '0x9A76F5E7.png' },
  { id: '0x1A4D48A7', rect: RECT_1000, kind: 'bitImage', src: '0x1A4D48A7.png' },
  { id: '0xB6412D00', rect: RECT_1000, kind: 'bitImage', src: '0xDE12103B.png' },
  { id: '0x625BB6AE', rect: RECT_1000, kind: 'image', src: '0x625BB6AE.png' },
  { id: '0x86601D55', rect: RECT_1000, kind: 'image', src: 'SG_galaxy_arms_color.png' },
  { id: '0xEF82F8CE', rect: RECT_900, kind: 'monoImage', src: 'SG_galaxy_heights.png' },

  { id: '0xFF33EE2A', rect: RECT_1000, kind: 'op', op: 'multiply', a: '0x9A76F5E7', b: '0x8E960553' },
  { id: '0x0A256562', rect: RECT_1000, kind: 'op', op: 'multiply', a: '0x1A4D48A7', b: '0x8E960553' },
  { id: '0x66BF605C', rect: RECT_900, kind: 'op', op: 'add', a: '0xEF82F8CE', b: [-0.5, -0.5, -0.5, -0.5] },
  { id: '0x6F3E772B', rect: RECT_900, kind: 'op', op: 'multiply', a: '0x66BF605C', b: [20, 20, 20, 20] },
  { id: '0x082B9950', rect: RECT_900, kind: 'op', op: 'multiply', a: '0x66BF605C', b: [10, 10, 10, 10] },
];
