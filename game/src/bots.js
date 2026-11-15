// Bots: four Dustjacks and three Vanguard teammates. Each bot has one job per step:
// see, decide, move, shoot. They walk waypoint lanes, hold angles, strafe when they
// fight, react to what they see and hear, and play the objective: attackers push the
// Relay and plant, defenders hold it and defuse. No bot knows anything the player
// cannot know: sight is a raycast, hearing is a radius, aim error grows with distance.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { LANES, HOLDS, SPAWNS, SITE } from './world.js';
import { range } from './rng.js';

const BOT_NAMES = {
  vanguard: ['Rook', 'Sable', 'Iris'],
  dustjack: ['Vex', 'Marrow', 'Hollow', 'Grit'],
};
const TEAM_COLOR = { vanguard: PALETTE.accent, dustjack: PALETTE.ember };
const REACT_MIN = 0.35;
const REACT_MAX = 0.7;
const SIGHT_RANGE = 46;
const HEAR_RANGE = 26;
const BOT_SPEED = 3.4;
const BOT_PUSH_SPEED = 4.3;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 4;

function buildBody(team) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM_COLOR[team]), roughness: 0.65, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dusk), roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.32), cloth);
  torso.position.y = 1.05;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.62;
  head.userData.part = 'head';
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, 1.1), dark);
  helmet.position.y = 1.66;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), dark);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.18, 1.15, -0.25);
  group.add(torso, head, helmet, legL, legR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head, legL, legR, gun };
}

function moveAABB(position, velocity, dt, colliders, radius, height) {
  const probe = new THREE.Box3();
  function blocked(x, y, z) {
    probe.min.set(x - radius, y + 0.04, z - radius);
    probe.max.set(x + radius, y + height - 0.04, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }
  const nx = position.x + velocity.x * dt;
  if (!blocked(nx, position.y, position.z)) position.x = nx;
  else velocity.x = 0;
  const nz = position.z + velocity.z * dt;
  if (!blocked(position.x, position.y, nz)) position.z = nz;
  else velocity.z = 0;
}

export function createBots(scene, world, rng, combat) {
  const bots = [];
  const tmp = new THREE.Vector3();
  const eye = new THREE.Vector3();

  function spawn(team, index, lane, isPlayerTeam) {
    const name = BOT_NAMES[team][index];
    const visual = buildBody(team);
    const home = SPAWNS[team][index];
    visual.group.position.set(home[0], 0, home[1]);
    scene.add(visual.group);
    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      isPlayerTeam,
      group: visual.group,
      torso: visual.torso,
      head: visual.head,
      legL: visual.legL,
      legR: visual.legR,
      gun: visual.gun,
      position: visual.group.position,
      yaw: team === 'vanguard' ? 0 : Math.PI,
      hp: 100,
      armor: 0,
      alive: true,
      weapon: team === 'vanguard' ? 'rifle' : rng() < 0.5 ? 'rifle' : 'smg',
      mag: 30,
      reserve: 90,
      cooldown: 0,
      reloadLeft: 0,
      state: 'route',
      lane: lane ? LANES[lane] : null,
      laneName: lane,
      waypoint: 0,
      holdPoint: null,
      target: null,
      lastSeen: null,
      reactAt: 0,
      burstLeft: 0,
      burstGap: 0,
      pauseLeft: 0,
      strafeDir: 1,
      strafeAt: 0,
      scanDir: 1,
      hearAt: 0,
      hearPos: null,
      channel: 0,
      channelKind: null,
      fall: 0,
      walkPhase: rng() * 6,
      thinkAt: rng() * 0.15,
    };
    visual.torso.userData.bot = bot;
    visual.head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function resetRound(roundNumber) {
    const lanes = ['A', 'MID', 'B'];
    let vi = 0;
    let di = 0;
    for (const bot of bots) {
      const home = SPAWNS[bot.team][bot.id.endsWith('0') ? 0 : bot.id.endsWith('1') ? 1 : bot.id.endsWith('2') ? 2 : 3];
      bot.position.set(home[0], 0, home[1]);
      bot.yaw = bot.team === 'vanguard' ? 0 : Math.PI;
      bot.hp = 100;
      bot.armor = bot.team === 'dustjack' && roundNumber > 1 && rng() < 0.5 ? 50 : 0;
      bot.alive = true;
      bot.mag = 30;
      bot.reserve = 90;
      bot.cooldown = 0;
      bot.reloadLeft = 0;
      bot.state = 'route';
      bot.target = null;
      bot.lastSeen = null;
      bot.channel = 0;
      bot.channelKind = null;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.y = 0;
      bot.group.visible = true;
      if (bot.team === 'vanguard') {
        bot.laneName = lanes[vi % 3];
        bot.lane = LANES[bot.laneName];
        vi += 1;
      } else {
        bot.holdPoint = HOLDS[di % HOLDS.length];
        // Defenders walk to their hold point at the start of the round.
        bot.lane = [[home[0], home[1]], bot.holdPoint];
        di += 1;
      }
      bot.waypoint = 0;
    }
  }

  function aimError(bot, targetPos, targetSpeed) {
    const dist = bot.position.distanceTo(targetPos);
    return 0.018 + dist * 0.0009 + targetSpeed * 0.004 + (bot.moving ? 0.02 : 0);
  }

  function faceToward(bot, x, z, dt, rate = 7) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function stepBot(bot, dt, time, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    // Outside live play the bots stand where the round put them: no walking, no
    // seeing, no shooting during the buy phase or after the match ends.
    if (ctx.phase !== 'live') return;
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
    if (bot.reloadLeft === 0 && bot.mag === 0 && bot.reserve > 0) {
      bot.reloadLeft = 1.9;
      const take = Math.min(30, bot.reserve);
      bot.mag = take;
      bot.reserve -= take;
    }

    // Think on a stagger so seven bots never raycast on the same frame.
    bot.thinkAt -= dt;
    if (bot.thinkAt <= 0) {
      bot.thinkAt = 0.15;
      think(bot, time, ctx);
    }

    const moving = bot.state === 'route' || bot.state === 'investigate' || bot.state === 'push';
    bot.moving = moving;
    const speed = bot.state === 'push' ? BOT_PUSH_SPEED : BOT_SPEED;
    const vel = new THREE.Vector3();
    if (bot.state === 'route' && bot.lane) {
      const wp = bot.lane[bot.waypoint];
      if (wp) {
        tmp.set(wp[0] - bot.position.x, 0, wp[1] - bot.position.z);
        if (tmp.length() < 0.9) bot.waypoint += 1;
        else {
          tmp.normalize().multiplyScalar(speed);
          vel.copy(tmp);
          faceToward(bot, wp[0], wp[1], dt, 5);
        }
      } else {
        bot.state = bot.team === 'vanguard' ? 'push' : 'hold';
      }
    } else if (bot.state === 'push') {
      tmp.set(0 - bot.position.x, 0, -11 - bot.position.z);
      if (tmp.length() > 1.2) {
        tmp.normalize().multiplyScalar(speed);
        vel.copy(tmp);
        faceToward(bot, 0, -11, dt, 5);
      } else if (bot.team === 'vanguard' && ctx.chargePlanted === false && ctx.phase === 'live') {
        bot.state = 'plant';
        bot.channel = 0;
        bot.channelKind = 'plant';
      } else {
        bot.state = 'hold';
        bot.holdPoint = [bot.position.x + range(rng, -3, 3), bot.position.z + range(rng, -3, 3)];
      }
    } else if (bot.state === 'investigate' && bot.hearPos) {
      tmp.set(bot.hearPos.x - bot.position.x, 0, bot.hearPos.z - bot.position.z);
      if (tmp.length() < 1) {
        bot.state = 'hold';
        bot.holdPoint = [bot.position.x, bot.position.z];
      } else {
        tmp.normalize().multiplyScalar(speed);
        vel.copy(tmp);
        faceToward(bot, bot.hearPos.x, bot.hearPos.z, dt, 5);
      }
    } else if (bot.state === 'engage' && bot.target) {
      if (time > bot.strafeAt) {
        bot.strafeDir *= -1;
        bot.strafeAt = time + range(rng, 0.8, 1.6);
      }
      const to = tmp.set(bot.target.position.x - bot.position.x, 0, bot.target.position.z - bot.position.z);
      const dist = to.length();
      const side = new THREE.Vector3(-to.z, 0, to.x).normalize().multiplyScalar(bot.strafeDir * 1.6);
      if (dist > 14) vel.copy(to.normalize().multiplyScalar(2.2)).add(side);
      else if (dist < 5) vel.copy(to.normalize().multiplyScalar(-1.6)).add(side);
      else vel.copy(side);
      faceToward(bot, bot.target.position.x, bot.target.position.z, dt, 9);
    } else if (bot.state === 'hold') {
      bot.scanDir = Math.sin(time * 0.5 + bot.walkPhase) > 0 ? 1 : -1;
      bot.yaw += bot.scanDir * dt * 0.4;
    }

    if (bot.state === 'plant' || bot.state === 'defuse') {
      vel.set(0, 0, 0);
      bot.channel += dt;
      const need = bot.channelKind === 'plant' ? PLANT_SECONDS : DEFUSE_SECONDS;
      if (bot.channel >= need) {
        ctx.onChannelDone(bot, bot.channelKind);
        bot.channel = 0;
        bot.state = 'hold';
        bot.holdPoint = [bot.position.x, bot.position.z];
      }
    }

    moveAABB(bot.position, vel, dt, world.colliders, 0.34, 1.72);
    bot.group.rotation.y = bot.yaw;
    bot.walkPhase += dt * (vel.lengthSq() > 0.1 ? 9 : 0);
    bot.legL.rotation.x = Math.sin(bot.walkPhase) * 0.5 * (vel.lengthSq() > 0.1 ? 1 : 0);
    bot.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.5 * (vel.lengthSq() > 0.1 ? 1 : 0);

    // Fight: bursts with pauses, only once the reaction delay has passed.
    if (bot.state === 'engage' && bot.target && bot.target.alive !== false && time >= bot.reactAt) {
      if (bot.pauseLeft > 0) bot.pauseLeft -= dt;
      else if (bot.burstLeft > 0) {
        bot.burstGap -= dt;
        if (bot.burstGap <= 0 && bot.cooldown === 0 && bot.reloadLeft === 0) {
          bot.burstGap = 0.11;
          bot.burstLeft -= 1;
          fireBot(bot, time);
          if (bot.burstLeft === 0) bot.pauseLeft = range(rng, 0.5, 0.9);
        }
      } else {
        bot.burstLeft = 3 + Math.floor(rng() * 3);
        bot.burstGap = 0;
      }
    }
  }

  function think(bot, time, ctx) {
    // Charge planted: defenders rush the site, attackers hold it.
    if (ctx.chargePlanted && bot.team === 'dustjack' && bot.state !== 'defuse' && bot.state !== 'engage') {
      const inSite = bot.position.x > SITE.minX && bot.position.x < SITE.maxX && bot.position.z > SITE.minZ && bot.position.z < SITE.maxZ;
      if (inSite && ctx.defuseOpen !== false) {
        bot.state = 'defuse';
        bot.channel = 0;
        bot.channelKind = 'defuse';
      } else if (bot.state !== 'route') {
        bot.state = 'route';
        bot.lane = [[bot.position.x, bot.position.z], [0, -11]];
        bot.waypoint = 1;
      }
    }
    if (ctx.chargePlanted && bot.team === 'vanguard' && bot.state === 'route') {
      bot.state = 'hold';
      bot.holdPoint = [range(rng, -6, 6), -11 + range(rng, -2, 2)];
    }

    // Sight: nearest living enemy with a clear ray and inside the view cone.
    let best = null;
    let bestDist = Infinity;
    eye.set(bot.position.x, 1.55, bot.position.z);
    for (const enemy of ctx.enemiesOf(bot)) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - bot.position.x;
      const dz = enemy.position.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SIGHT_RANGE || dist >= bestDist) continue;
      const ang = Math.atan2(-dx, -dz);
      let diff = ang - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.1 && dist > 4) continue;
      tmp.set(enemy.position.x, enemy.position.y + 1.2, enemy.position.z);
      if (combat.los(eye, tmp)) {
        best = enemy;
        bestDist = dist;
      }
    }
    if (best) {
      if (bot.target !== best) {
        bot.target = best;
        bot.reactAt = time + range(rng, REACT_MIN, REACT_MAX);
        bot.burstLeft = 0;
        bot.pauseLeft = 0;
      }
      bot.lastSeen = { x: best.position.x, z: best.position.z };
      if (bot.state !== 'plant' && bot.state !== 'defuse') bot.state = 'engage';
    } else if (bot.target) {
      bot.target = null;
      if (bot.state === 'engage') {
        bot.state = bot.lastSeen ? 'investigate' : 'hold';
        if (bot.lastSeen) bot.hearPos = { x: bot.lastSeen.x, z: bot.lastSeen.z };
        bot.hearAt = time;
      }
    }

    // Hearing expires: give up the search after a few seconds.
    if (bot.state === 'investigate' && time - bot.hearAt > 4) {
      bot.state = 'hold';
      bot.holdPoint = [bot.position.x, bot.position.z];
    }

    // Defenders drift between holds so the site is never watched from one angle all round.
    if (bot.team === 'dustjack' && bot.state === 'hold' && ctx.phase === 'live' && time > 25 && rng() < 0.02) {
      bot.holdPoint = HOLDS[Math.floor(rng() * HOLDS.length)];
      bot.state = 'route';
      bot.lane = [[bot.position.x, bot.position.z], bot.holdPoint];
      bot.waypoint = 1;
    }
  }

  function fireBot(bot, time) {
    if (bot.mag <= 0) return;
    bot.mag -= 1;
    const target = bot.target;
    if (!target) return;
    const speed = target.groundSpeed ? target.groundSpeed() : 0;
    const err = aimError(bot, target.position, speed);
    eye.set(bot.position.x, 1.5, bot.position.z);
    const chest = tmp.set(target.position.x, target.position.y + 1.25, target.position.z);
    const dir = new THREE.Vector3().subVectors(chest, eye).normalize();
    dir.x += (rng() * 2 - 1) * err;
    dir.y += (rng() * 2 - 1) * err;
    dir.z += (rng() * 2 - 1) * err;
    dir.normalize();
    const weapon = bot.weapon === 'smg'
      ? { damage: 26, headDamage: 78 }
      : { damage: 34, headDamage: 100 };
    combat.fire(eye, dir, weapon, bot);
  }

  function hearShot(position, team, time) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      const dist = Math.hypot(bot.position.x - position.x, bot.position.z - position.z);
      if (dist < HEAR_RANGE && bot.state !== 'engage' && bot.state !== 'plant' && bot.state !== 'defuse') {
        bot.state = 'investigate';
        bot.hearPos = { x: position.x, z: position.z };
        bot.hearAt = time;
      }
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    let left = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, left * 0.5);
      bot.armor -= absorbed;
      left -= absorbed;
    }
    bot.hp -= left;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.fall = 0;
      return true;
    }
    return false;
  }

  return {
    bots,
    spawn,
    resetRound,
    hearShot,
    damage,
    step(dt, time, ctx) {
      for (const bot of bots) stepBot(bot, dt, time, ctx);
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) meshes.push(bot.torso, bot.head);
      return meshes;
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    reset() {
      for (const bot of bots) {
        bot.group.visible = true;
        bot.group.rotation.set(0, bot.yaw, 0);
      }
    },
  };
}
