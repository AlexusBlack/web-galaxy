import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as QUARKS from 'three.quarks';
import { RandomColorIndependent } from './RandomColorIndependent.ts';
import { Particles_3816 } from './particles/3816.js';
import { Particles_3817 } from './particles/3817.js';
import { Particles_3818 } from './particles/3818.js';
import { Particles_3819 } from './particles/3819.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 5000 );
const renderer = new THREE.WebGLRenderer();
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(0, 100, 100);

renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// Create a batched renderer for efficient particle rendering
const batchedRenderer = new QUARKS.BatchedRenderer();
scene.add(batchedRenderer);

const particles_3816 = Particles_3816();
const particles_3817 = Particles_3817();
const particles_3818 = Particles_3818();
const particles_3819 = Particles_3819();

// Add the particle system to the scene
scene.add(particles_3816.emitter);
scene.add(particles_3817.emitter);
scene.add(particles_3818.emitter);
scene.add(particles_3819.emitter);

// Add the particle system to the batched renderer
batchedRenderer.addSystem(particles_3816);
batchedRenderer.addSystem(particles_3817);
batchedRenderer.addSystem(particles_3818);
batchedRenderer.addSystem(particles_3819);

controls.update();
function animate() {
  requestAnimationFrame( animate );

  batchedRenderer.update(0.016); // Update the batched renderer with a fixed delta time (16ms for ~60fps)
  controls.update();

  renderer.render( scene, camera );
}

animate();
