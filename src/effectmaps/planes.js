// Which two position axes a map's rect spans, and which axis is left over as the normal.
//
// The galaxy lies in XZ with Y flattened -- three.js is Y-up and src/particles/2309.js uses
// a disc radius of [1000, 7.5, 1000] -- so 'xz' is the default everywhere. Spore's own maps
// are authored in its 2D galactic plane; this is the adapter.
export const PLANES = {
  xz: { u: 'x', v: 'z', n: 'y' },
  xy: { u: 'x', v: 'y', n: 'z' },
  yz: { u: 'y', v: 'z', n: 'x' },
};

export function planeOf(name, who) {
  const p = PLANES[name];
  if (!p) throw new Error(`${who}: plane must be one of ${Object.keys(PLANES).join(', ')} -- got ${name}`);
  return p;
}
