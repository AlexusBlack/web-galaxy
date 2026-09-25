import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as QUARKS from 'three.quarks';
import { Effect_4227 } from './effects/4227.js';
import { Effect_4228 } from './effects/4228.js';
import { Effect_4229 } from './effects/4229.js';
import { loadGalaxyMaps } from './effectmaps/galaxyRegistry.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// far has to clear the effect's last LOD distance (10000) or the outer bands are never
// reachable -- you would fly out of the far plane before reaching them.
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 30000 );
const renderer = new THREE.WebGLRenderer();
const controls = new OrbitControls(camera, renderer.domElement);
// Start in LOD band 2 (500..1000). Band 1 draws nothing: effect-4228 gives the star
// fields alphaScale 0 there and holds the nebula clouds back until band 2.
camera.position.set(0, 400, 600);

renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// Create a batched renderer for efficient particle rendering
const batchedRenderer = new QUARKS.BatchedRenderer();
scene.add(batchedRenderer);

// The effect map textures must be decoded and baked before any effect is constructed --
// emitters and behaviors resolve their maps in their constructors and throw if a map has
// not baked yet.
//
// Deliberately an async main() rather than a top-level await: TLA in an entry module needs
// build.target 'esnext', and `vite build` on the defaults fails with "Top-level await is not
// available in the configured target environment". This costs one function and no config.
async function main() {
  await loadGalaxyMaps();

  // One effect owns all four particle systems and scales them by camera distance.
  const effect = Effect_4227().addTo(scene, batchedRenderer);
  // const effect = Effect_4228().addTo(scene, batchedRenderer);
  // const effect = Effect_4229().addTo(scene, batchedRenderer);

  controls.update();
  function animate() {
    requestAnimationFrame( animate );

    const lod = effect.lod;
    effect.update(camera); // recompute the LOD band from the camera
    if (effect.lod !== lod) console.log(`effect-4227 LOD ${lod} -> ${effect.lod}`);

    batchedRenderer.update(0.016); // Update the batched renderer with a fixed delta time (16ms for ~60fps)
    controls.update();

    renderer.render( scene, camera );
  }

  animate();
}

main();
