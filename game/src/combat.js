// Combat: one raycaster answers every ballistic question. A shot is a ray from the
// shooter's eye: the first thing it meets decides the result — wall, bot torso or head,
// or the player's hitbox. Line of sight is the same ray against the world only.
// Grenades are the one projectile: an arc, one bounce, a timed fuse, radius damage.
import * as THREE from 'three';

const MAX_RANGE = 80;

export function createCombat(scene, world, hooks = {}) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = MAX_RANGE;
  const playerHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.7, 0.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  playerHit.userData.part = 'torso';
  playerHit.userData.isPlayer = true;
  scene.add(playerHit);
  let botsRef = null;

  function targets() {
    const list = world.shootables.slice();
    if (botsRef) list.push(...botsRef.hitMeshes());
    list.push(playerHit);
    return list;
  }

  function los(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    raycaster.set(from, dir.normalize());
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0;
  }

  // Fires one shot. Returns the endpoint for the tracer and what it hit, if anything.
  // The onShot hook owns the consequences: damage, sounds, effects and the killfeed.
  // tracerFrom is where the visible streak starts (a gun muzzle, not the eye).
  function fire(origin, direction, weapon, shooter, tracerFrom) {
    raycaster.set(origin, direction);
    raycaster.far = MAX_RANGE;
    // A shooter never hits their own body: the player's ray starts inside their hitbox.
    const targetsList = targets();
    const excluded = shooter && shooter.isPlayer
      ? [playerHit]
      : shooter && shooter.torso
        ? [shooter.torso, shooter.head]
        : [];
    const hits = raycaster.intersectObjects(targetsList.filter((t) => !excluded.includes(t)), false);
    const hit = hits[0] || null;
    const end = hit ? hit.point.clone() : origin.clone().addScaledVector(direction, MAX_RANGE);
    const streakFrom = tracerFrom ? tracerFrom.clone() : origin.clone();
    let result = { origin: origin.clone(), tracerFrom: streakFrom, end, hit: null, weapon, shooter };
    if (!hit) {
      if (hooks.onShot) hooks.onShot(result);
      return result;
    }
    if (hit.object.userData.isPlayer) {
      result = { origin: origin.clone(), tracerFrom: streakFrom, end, hit: { kind: 'player', part: hit.object.userData.part, point: hit.point, shooter }, weapon, shooter };
    } else {
      const bot = hit.object.userData.bot;
      if (bot) {
        result = { origin: origin.clone(), tracerFrom: streakFrom, end, hit: { kind: 'bot', bot, part: hit.object.userData.part, point: hit.point, shooter }, weapon, shooter };
      } else {
        result = { origin: origin.clone(), tracerFrom: streakFrom, end, hit: { kind: 'world', point: hit.point, normal: hit.face ? hit.face.normal : null, shooter }, weapon, shooter };
      }
    }
    if (hooks.onShot) hooks.onShot(result);
    return result;
  }

  function damageFor(weapon, part) {
    return part === 'head' ? weapon.headDamage : weapon.damage;
  }

  return {
    fire,
    los,
    damageFor,
    registerBots(bots) {
      botsRef = bots;
    },
    updatePlayerHit(position, eyeHeight) {
      playerHit.position.set(position.x, position.y + eyeHeight * 0.55, position.z);
      playerHit.visible = true;
    },
    hidePlayerHit() {
      playerHit.visible = false;
    },
  };
}

// A frag grenade: thrown with an arc, bounces once off the world, explodes after its
// fuse. Damage falls off with distance; the thrower is not immune.
export function createGrenade(scene, world, rng) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2622), roughness: 0.5, metalness: 0.4 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  const state = {
    active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    fuse: 0, bounced: false, thrower: null,
  };
  const probe = new THREE.Box3();

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  return {
    state,
    mesh,
    throwFrom(origin, direction, thrower) {
      state.active = true;
      state.position.copy(origin);
      state.velocity.copy(direction).multiplyScalar(14);
      state.velocity.y += 4.5;
      state.fuse = 1.6;
      state.bounced = false;
      state.thrower = thrower;
      mesh.visible = true;
      mesh.position.copy(origin);
    },
    // Returns the explosion point when the fuse ends, otherwise null.
    step(dt) {
      if (!state.active) return null;
      state.fuse -= dt;
      state.velocity.y -= 14 * dt;
      const next = state.position.clone().addScaledVector(state.velocity, dt);
      if (overlaps(next.x, next.y, next.z)) {
        if (!state.bounced) {
          state.bounced = true;
          state.velocity.multiplyScalar(0.45);
          state.velocity.y = Math.abs(state.velocity.y) * 0.5 + 1.5;
        } else {
          state.velocity.multiplyScalar(0.3);
        }
      } else {
        state.position.copy(next);
      }
      if (state.position.y < 0.09) {
        state.position.y = 0.09;
        state.velocity.y = Math.abs(state.velocity.y) * 0.4;
        state.velocity.x *= 0.7;
        state.velocity.z *= 0.7;
      }
      mesh.position.copy(state.position);
      if (state.fuse <= 0) {
        state.active = false;
        mesh.visible = false;
        return { point: state.position.clone(), thrower: state.thrower };
      }
      return null;
    },
  };
}
