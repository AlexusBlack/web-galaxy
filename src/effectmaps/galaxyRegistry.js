import { EffectMapRegistry } from './EffectMapRegistry.js';
import { GALAXY_MAPS } from './galaxyMaps.js';

// The one registry the galaxy's effects share. Declaring the maps is synchronous; decoding
// the textures is not, so main.js must await loadGalaxyMaps() BEFORE it constructs any
// effect. Emitters and behaviors throw if handed a map that has not baked, which turns a
// missed preload into an immediate error rather than a galaxy with no arms.
export const galaxyMaps = new EffectMapRegistry(GALAXY_MAPS);

let pending = null;

export function loadGalaxyMaps() {
  if (!pending) pending = galaxyMaps.loadAll();
  return pending;
}
