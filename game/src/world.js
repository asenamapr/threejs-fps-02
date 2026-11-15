// The map: Dustfall Yard, an original desert-industrial yard, 46 x 34 m. Two lanes
// (A west, B east), a mid connector under a watchtower, and the Relay pad at the north
// end where the charge is planted. Every box is a collider for players and bots and a
// surface a bullet stops on. Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint lanes, south (Vanguard) to north (Dustjack). Bots walk them in order.
export const LANES = {
  A: [[-16, 13], [-16, 6], [-15, -1], [-14, -7], [-10, -11], [-4, -11]],
  B: [[16, 13], [16, 6], [15, -1], [14, -7], [10, -11], [4, -11]],
  MID: [[-2, 13], [-2, 7], [0, 2], [0, -4], [0, -9], [0, -11]],
};

// Hold positions: defenders wait here, attackers clear them on the way in.
export const HOLDS = [
  [-10, -8], [10, -8], [-6, -4], [6, -4], [0, -6], [-14, 2], [14, 2],
];

export const SPAWNS = {
  vanguard: [[-6, 14], [-2, 14.5], [2, 14.5], [6, 14]],
  dustjack: [[-6, -14], [-2, -14.5], [2, -14.5], [6, -14]],
};

// The Relay: the objective pad. Planting happens inside this box.
export const SITE = { minX: -4.5, maxX: 4.5, minZ: -14.5, maxZ: -9.5 };

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' ? 0.5 : 0.94,
      metalness: name === 'steel' ? 0.45 : 0.02,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: sand floor with darker worn strips down each lane so the map reads at a glance.
  box(46.4, 0.4, 34.4, 0, -0.2, 0, 'sand');
  box(4.4, 0.06, 30, -14, 0.03, 0, 'rust');
  box(4.4, 0.06, 30, 14, 0.03, 0, 'rust');
  box(4.4, 0.06, 30, 0, 0.03, 0, 'dusk');
  box(11, 0.06, 6, 0, 0.03, -12, 'steel');

  // Perimeter: 5 m walls, open to the dusk sky so one directional light reaches every corner.
  box(0.6, 5, 34.4, -23.2, 2.5, 0, 'surface');
  box(0.6, 5, 34.4, 23.2, 2.5, 0, 'surface');
  box(46.4, 5, 0.6, 0, 2.5, -17.2, 'surface');
  box(46.4, 5, 0.6, 0, 2.5, 17.2, 'surface');

  // Lane A (west): container stack, sandbag wall, crate corner.
  box(6, 2.6, 2.4, -18.5, 1.3, -4, 'rust');
  box(6, 2.6, 2.4, -18.5, 3.9, -4, 'steel');
  box(4.4, 1.1, 1.2, -12, 0.55, 2, 'hairline');
  box(1.4, 1.4, 1.4, -10, 0.7, -8.5, 'sand');
  box(1.4, 1.4, 1.4, -8.6, 0.7, -8.5, 'sand');
  box(1.4, 1.4, 1.4, -9.3, 2.1, -8.5, 'sand');
  box(2.2, 2.2, 2.2, -17, 1.1, 8, 'surface');

  // Lane B (east): mirrored, different heights so the lanes play differently.
  box(6, 2.6, 2.4, 18.5, 1.3, -4, 'steel');
  box(4.4, 1.1, 1.2, 12, 0.55, 2, 'hairline');
  box(1.4, 1.4, 1.4, 10, 0.7, -8.5, 'sand');
  box(1.4, 1.4, 1.4, 8.6, 0.7, -8.5, 'sand');
  box(2.2, 2.2, 2.2, 17, 1.1, 8, 'surface');
  box(3, 1.2, 3, 15, 0.6, -11, 'hairline');

  // Mid: watchtower platform on four legs with a ramp of crates, and a central pillar.
  box(5, 0.4, 5, 0, 3.1, -1, 'surface');
  box(0.5, 3.1, 0.5, -2.2, 1.55, -3.2, 'hairline');
  box(0.5, 3.1, 0.5, 2.2, 1.55, -3.2, 'hairline');
  box(0.5, 3.1, 0.5, -2.2, 1.55, 1.2, 'hairline');
  box(0.5, 3.1, 0.5, 2.2, 1.55, 1.2, 'hairline');
  box(1.4, 1.4, 1.4, -4.5, 0.7, 3.5, 'sand');
  box(1.4, 1.4, 1.4, -4.5, 2.1, 3.5, 'sand');
  box(1.4, 1.4, 1.4, 4.5, 0.7, 3.5, 'sand');
  box(1.6, 3.4, 1.6, 0, 1.7, 5.5, 'hairline');

  // North end: the Relay mast on a raised pad, flanked by low walls.
  box(9, 0.5, 5, 0, 0.25, -12, 'surface');
  const mast = box(0.5, 6.5, 0.5, 0, 3.5, -12, 'ember');
  mast.material = materials.ember;
  box(0.9, 0.9, 0.9, 0, 6.9, -12, 'ember');
  box(3.6, 1.1, 1, -7.5, 0.55, -10, 'hairline');
  box(3.6, 1.1, 1, 7.5, 0.55, -10, 'hairline');
  box(1.6, 0.9, 1.6, -5, 0.45, -14.5, 'sand');
  box(1.6, 0.9, 1.6, 5, 0.45, -14.5, 'sand');

  // South end: spawn cover, low walls the attackers step out from behind.
  box(3.6, 1.1, 1, -8, 0.55, 11, 'hairline');
  box(3.6, 1.1, 1, 8, 0.55, 11, 'hairline');
  box(2, 1.6, 2, 0, 0.8, 15, 'surface');

  // Light: low dusk sun from the west, cool fill from the east, warm sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.sand), new THREE.Color(PALETTE.dusk), 1.15);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb36b), 2.8);
  sun.position.set(-18, 16, 10);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.steel), 0.5);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  // The Relay beacon: a slow pulsing point light so the objective reads from anywhere.
  const beacon = new THREE.PointLight(new THREE.Color(PALETTE.ember), 14, 22, 1.6);
  beacon.position.set(0, 6.4, -12);
  scene.add(beacon);

  return { colliders, shootables, group, beacon };
}
