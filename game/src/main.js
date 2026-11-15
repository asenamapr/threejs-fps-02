// DUSTFALL LINE — boot, loop and wiring. The simulation is a fixed step at 120 Hz;
// rendering follows the frame clock. Everything the player can do lives here: shoot,
// reload, buy, throw, plant, restart. Everything the bots do is reported back through
// the combat hook and the round hooks, so this file is the only place game state changes.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeapons, WEAPONS, BUY_MENU } from './weapons.js';
import { createCombat, createGrenade } from './combat.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createRounds } from './rounds.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '20261115', 10) || 20261115;
const shotMode = params.get('shot') || null;
const rng = mulberry32(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x191512);
scene.fog = new THREE.Fog(0x191512, 38, 78);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const grenade = createGrenade(scene, world, rng);
const hud = createHud((itemId) => buyItem(itemId));

const playerState = player.state;
let playerHp = 100;
let playerAlive = true;
let now = 0;
let message = '';
let messageUntil = 0;
let buyOpen = false;
let frozen = false;
let framesRendered = 0;

const playerEntity = {
  isPlayer: true,
  name: 'You',
  team: 'vanguard',
  get alive() {
    return playerAlive;
  },
  position: playerState.position,
  groundSpeed: () => player.groundSpeed(),
};

function showMessage(text, seconds = 2.5) {
  message = text;
  messageUntil = now + seconds;
}

// Every shot in the game, player or bot, resolves here: tracer, damage, sounds,
// killfeed, money, hearing. One path, no special cases.
function onShot(result) {
  const { origin, tracerFrom, end, hit, weapon, shooter } = result;
  const isPlayerShot = shooter && shooter.isPlayer;
  effects.spawnTracer(tracerFrom, end);
  if (isPlayerShot) audio.shot(weapons.current());
  else if (shooter && playerState.position.distanceTo(origin) < 30) audio.shot(shooter.weapon);

  if (hit) {
    if (hit.kind === 'world') {
      effects.spawnImpact(hit.point);
    } else if (hit.kind === 'bot') {
      const damage = weapon.headDamage && hit.part === 'head' ? weapon.headDamage : weapon.damage;
      effects.spawnImpact(hit.point);
      const killed = window.__bots.damage(hit.bot, damage, hit.part);
      if (isPlayerShot) {
        hud.hitmarker(now, killed);
        audio.hit(hit.part === 'head');
        if (killed) {
          audio.kill();
          hud.addKillfeed('You', hit.bot.name, hit.part === 'head', true);
          window.__rounds.killReward(true);
        }
      } else if (killed) {
        hud.addKillfeed(shooter.name, hit.bot.name, hit.part === 'head', false);
      }
    } else if (hit.kind === 'player' && playerAlive) {
      const damage = weapon.headDamage && hit.part === 'head' ? weapon.headDamage : weapon.damage;
      hurtPlayer(damage, shooter);
    }
  }
  const team = isPlayerShot ? 'vanguard' : shooter.team;
  window.__bots.hearShot(origin, team, now);
}

const combat = createCombat(scene, world, { onShot });
const bots = createBots(scene, world, rng, combat);
combat.registerBots(bots);
window.__bots = bots;

const rounds = createRounds({
  hasWeapon: (id) => weapons.has(id),
  giveWeapon: (id) => weapons.buy(id),
  onBuyPhase(roundNumber) {
    bots.resetRound(roundNumber);
    respawnPlayer();
    weapons.refillAll();
    buyOpen = true;
    showMessage(`Round ${roundNumber} — buy phase. B opens the buy menu.`, 4);
  },
  onLivePhase() {
    buyOpen = false;
  },
  onRoundEnd(winner) {
    if (winner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    buyOpen = false;
  },
  onMatchEnd(winner) {
    buyOpen = false;
    const el = document.getElementById('end-screen');
    el.querySelector('h2').textContent = winner === 'vanguard' ? 'Vanguard takes Dustfall Yard' : 'The Dustjacks hold the yard';
    el.querySelector('p').textContent = `Final score — Vanguard ${rounds.state.wins.vanguard} · Dustjacks ${rounds.state.wins.dustjack}. Press R to play again.`;
    el.classList.add('show');
  },
});
window.__rounds = rounds;

function respawnPlayer() {
  playerState.position.set(-2, 0, 14);
  playerState.velocity.set(0, 0, 0);
  playerState.yaw = 0;
  playerState.pitch = 0;
  playerHp = 100;
  playerAlive = true;
  combat.updatePlayerHit(playerState.position, playerState.eye);
}

function hurtPlayer(damage, shooter) {
  if (!playerAlive) return;
  let left = damage;
  if (rounds.state.armor > 0) {
    const absorbed = Math.min(rounds.state.armor, left * 0.5);
    rounds.state.armor -= absorbed;
    left -= absorbed;
  }
  playerHp -= left;
  hud.damage(now);
  audio.hurt();
  if (playerHp <= 0) {
    playerHp = 0;
    playerAlive = false;
    combat.hidePlayerHit();
    hud.addKillfeed(shooter.name, 'You', false, false);
    showMessage('You are down — your team fights on.', 4);
  }
}

function resetMatch() {
  rounds.state.round = 1;
  rounds.state.wins = { vanguard: 0, dustjack: 0 };
  rounds.state.money = 800;
  rounds.state.armor = 0;
  rounds.state.frags = 0;
  rounds.state.over = false;
  rounds.state.winner = null;
  document.getElementById('end-screen').classList.remove('show');
  weapons.owned.pistol = { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve };
  for (const id of Object.keys(weapons.owned)) {
    if (id !== 'pistol') delete weapons.owned[id];
  }
  weapons.switchTo('pistol');
  rounds.startBuy(now);
}

// --- Player actions -------------------------------------------------------

function playerFire() {
  if (!weapons.ready()) {
    if (weapons.ammo().mag === 0) audio.dryFire();
    return;
  }
  if (!weapons.takeRound()) return;
  weapons.pullTrigger();
  const spread = weapons.spread(player.groundSpeed(), playerState.aiming);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += (rng() * 2 - 1) * spread;
  dir.y += (rng() * 2 - 1) * spread;
  dir.z += (rng() * 2 - 1) * spread;
  dir.normalize();
  const eye = new THREE.Vector3(playerState.position.x, playerState.position.y + playerState.eye, playerState.position.z);
  const weapon = weapons.def();
  // The visible streak starts at the muzzle, not the eye: forward 0.7 m, right 0.26 m, down 0.2 m.
  const muzzle = eye.clone().addScaledVector(dir, 0.7);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  muzzle.addScaledVector(right, 0.26);
  muzzle.y -= 0.2;
  combat.fire(eye, dir, { damage: weapon.damage, headDamage: weapon.headDamage }, playerEntity, muzzle);
  player.recoil(weapon.kick * 0.55, (rng() * 2 - 1) * weapon.kick * 0.3);
}

function throwGrenade() {
  if (rounds.state.phase !== 'live' || !playerAlive) return;
  if (rounds.state.frags <= 0) {
    showMessage('No grenades — buy one in the next buy phase (300).');
    audio.denied();
    return;
  }
  rounds.state.frags -= 1;
  const eye = new THREE.Vector3(playerState.position.x, playerState.position.y + playerState.eye, playerState.position.z);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  grenade.throwFrom(eye, dir, playerEntity);
  audio.reload();
}

function buyItem(itemId) {
  const result = rounds.buy(itemId);
  if (result.ok) {
    audio.buy();
    if (itemId === 'armor') showMessage('Plated vest equipped.');
    else if (itemId === 'frag') showMessage('Frag grenade added.');
    else showMessage(`${WEAPONS[itemId].name} bought.`);
  } else {
    audio.denied();
    showMessage(result.reason || 'Cannot buy that.');
  }
}

// --- Bots -----------------------------------------------------------------

bots.spawn('vanguard', 0, 'A', true);
bots.spawn('vanguard', 1, 'MID', true);
bots.spawn('vanguard', 2, 'B', true);
bots.spawn('dustjack', 0, null, false);
bots.spawn('dustjack', 1, null, false);
bots.spawn('dustjack', 2, null, false);
bots.spawn('dustjack', 3, null, false);

function enemiesOf(bot) {
  const list = [];
  if (bot.team === 'vanguard') {
    for (const enemy of bots.bots) if (enemy.team === 'dustjack' && enemy.alive) list.push(enemy);
  } else {
    for (const enemy of bots.bots) if (enemy.team === 'vanguard' && enemy.alive) list.push(enemy);
    if (playerAlive) list.push(playerEntity);
  }
  return list;
}

const botContext = {
  get phase() {
    return rounds.state.phase;
  },
  get chargePlanted() {
    return rounds.state.chargePlanted;
  },
  enemiesOf,
  onChannelDone(bot, kind) {
    if (kind === 'plant') {
      rounds.plantCharge(now);
      audio.plantDone();
      showMessage(`${bot.name} planted the charge — 30 seconds.`, 3);
    } else {
      rounds.defuseCharge(now);
      audio.defuseDone();
      rounds.endRound('dustjack', 'defused', now);
    }
  },
};

// --- Input ----------------------------------------------------------------

const input = createInput(canvas, (locked) => {
  document.getElementById('title-screen').classList.toggle('hidden', locked || shotMode === 'play' || shotMode === 'buy' || shotMode === 'end');
  if (!locked && rounds.state.phase === 'live' && playerAlive && !shotMode) {
    document.getElementById('title-screen').classList.remove('hidden');
  }
});

canvas.addEventListener('click', () => {
  audio.unlock();
  if (!input.state.locked && !shotMode) input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Shot staging ---------------------------------------------------------

function setupShot(name) {
  document.getElementById('title-screen').classList.add('hidden');
  if (name === 'start') {
    document.getElementById('title-screen').classList.remove('hidden');
    rounds.state.phase = 'buy';
    rounds.state.round = 1;
    rounds.state.timeLeft = 15;
    bots.resetRound(1);
    respawnPlayer();
    playerState.yaw = 0.15;
    playerState.pitch = -0.04;
    return;
  }
  if (name === 'buy') {
    rounds.state.round = 2;
    rounds.state.wins = { vanguard: 1, dustjack: 0 };
    rounds.state.money = 3250;
    rounds.state.phase = 'buy';
    rounds.state.timeLeft = 12;
    bots.resetRound(2);
    respawnPlayer();
    weapons.buy('rifle');
    weapons.buy('smg');
    weapons.switchTo('rifle');
    weapons.refillAll();
    buyOpen = true;
    return;
  }
  if (name === 'end') {
    rounds.state.round = 3;
    rounds.state.wins = { vanguard: 2, dustjack: 1 };
    rounds.state.phase = 'over';
    rounds.state.banner = 'Round won — Dustjacks eliminated';
    rounds.state.bannerUntil = 999999;
    bots.resetRound(3);
    respawnPlayer();
    // Stand south-east of the Relay and look north-west (yaw +0.5), so the mast sits
    // just left of centre and the fallen Dustjacks lie in the open ground ahead.
    playerState.position.set(5, 0, -5);
    playerState.yaw = 0.5;
    playerState.pitch = -0.05;
    const fallen = bots.bots.filter((b) => b.team === 'dustjack');
    for (const bot of fallen.slice(0, 2)) {
      bot.alive = false;
      bot.fall = 1;
      bot.group.rotation.x = -1.45;
      // Lying in the open sand in front of the camera, where the light catches them.
      bot.group.position.set(bot === fallen[0] ? 2 : 4, 0, bot === fallen[0] ? -8.5 : -9.5);
    }
    const standing = fallen.slice(2);
    standing[0].position.set(-4, 0, -13);
    standing[0].yaw = Math.PI;
    standing[0].state = 'hold';
    standing[1].position.set(6, 0, -13);
    standing[1].yaw = Math.PI;
    standing[1].state = 'hold';
    return;
  }
  // play: mid-round, two enemies in the open, one shot already in the air.
  rounds.state.round = 2;
  rounds.state.wins = { vanguard: 1, dustjack: 1 };
  rounds.state.money = 3250;
  rounds.state.phase = 'live';
  rounds.state.timeLeft = 62;
  bots.resetRound(2);
  respawnPlayer();
  weapons.buy('rifle');
  weapons.switchTo('rifle');
  weapons.refillAll();
  playerState.position.set(-2, 0, 10);
  const dustjacks = bots.bots.filter((b) => b.team === 'dustjack');
  // Clear of the mid pillar (1.6 m wide at x=0, z=5.5), so both enemies are in the open.
  dustjacks[0].position.set(2.5, 0, 3.5);
  dustjacks[0].yaw = Math.PI;
  dustjacks[0].state = 'hold';
  dustjacks[1].position.set(-4, 0, 3);
  dustjacks[1].yaw = Math.PI * 0.85;
  dustjacks[1].state = 'hold';
  const ally = bots.bots.find((b) => b.team === 'vanguard');
  ally.position.set(-5.5, 0, 6);
  ally.yaw = 0.3;
  // Let the bots settle into their stances, then put them back exactly where the
  // frame wants them: the pre-sim may have moved a bot that spotted an enemy.
  for (let i = 0; i < 90; i++) bots.step(1 / 60, i / 60, botContext);
  dustjacks[0].position.set(2.5, 0, 3.5);
  dustjacks[0].yaw = Math.PI;
  dustjacks[1].position.set(-4, 0, 3);
  dustjacks[1].yaw = Math.PI * 0.85;
  ally.position.set(-5.5, 0, 6);
  ally.yaw = 0.3;
  playerHp = 100;
  // Aim straight at the nearer Dustjack so the staged shot flies at him.
  playerState.yaw = Math.atan2(-(2.5 - -2), -(3.5 - 10));
  playerState.pitch = -0.06;
  camera.position.set(playerState.position.x, playerState.position.y + playerState.eye, playerState.position.z);
  camera.rotation.set(playerState.pitch, playerState.yaw, 0);
  // The weapon switch leaves a 0.25 s cooldown that only weapons.step decays;
  // decay it here or the staged shot never leaves the barrel. Clear the pre-sim
  // tracers so the frame holds exactly one streak: the player's.
  weapons.step(1);
  effects.reset();
  playerFire();
  frozen = true;
}

if (shotMode) setupShot(shotMode);
else rounds.startBuy(0);

// Debug handle for automated checks (screenshots, grading probes): read-only
// access to the live game objects. The game never reads it back.
window.__game = { weapons, camera, player: playerState, bots, rounds, world, renderer };

// --- Loop -----------------------------------------------------------------

const STEP = 1 / 120;
let accumulator = 0;
let lastFrame = performance.now();
let plantChannel = 0;

function step(dt) {
  now += dt;
  const r = rounds.state;

  if (!shotMode) {
    const look = input.takeLook();
    if (look.x || look.y) player.look(look.x, look.y);
  }
  playerState.aiming = input.state.aiming && playerAlive && !buyOpen;

  if (input.wasPressed('KeyB') && r.phase === 'buy') {
    buyOpen = !buyOpen;
    audio.unlock();
  }
  if (r.phase === 'buy') {
    for (const item of BUY_MENU) {
      if (input.wasPressed(item.key)) buyItem(item.id);
    }
  } else if (playerAlive) {
    const slotKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    const slotIds = ['pistol', 'smg', 'rifle', 'sniper'];
    slotKeys.forEach((key, i) => {
      if (input.wasPressed(key) && weapons.has(slotIds[i])) weapons.switchTo(slotIds[i]);
    });
  }
  if (input.wasPressed('KeyR')) {
    if (r.over) resetMatch();
    else if (playerAlive) {
      weapons.reload();
      audio.reload();
    }
  }
  if (input.wasPressed('KeyG')) throwGrenade();

  if (r.phase === 'live' && playerAlive) {
    player.step(dt, input.state.keys);
    if (input.state.firing && !buyOpen) playerFire();
  } else if (r.phase === 'buy' && playerAlive) {
    player.step(dt, input.state.keys);
  }

  // Plant: hold E inside the Relay while the charge is not yet planted.
  if (r.phase === 'live' && playerAlive && !r.chargePlanted && rounds.inSite(playerState.position)) {
    if (input.state.keys.has('KeyE')) {
      plantChannel += dt;
      if (plantChannel >= 3.5) {
        plantChannel = 0;
        rounds.plantCharge(now);
        rounds.objectiveReward();
        audio.plantDone();
      }
    } else plantChannel = 0;
  } else plantChannel = 0;

  bots.step(dt, now, botContext);
  rounds.step(dt, now, {
    aliveCount: (team) => bots.aliveCount(team) + (team === 'vanguard' && playerAlive ? 1 : 0),
  });

  const explosion = grenade.step(dt);
  if (explosion) {
    effects.spawnExplosion(explosion.point);
    audio.explosion();
    const throwerTeam = explosion.thrower && explosion.thrower.isPlayer ? 'vanguard' : explosion.thrower.team;
    bots.hearShot(explosion.point, throwerTeam, now);
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const dist = bot.position.distanceTo(explosion.point);
      if (dist < 6) {
        const killed = bots.damage(bot, Math.max(20, 100 - dist * 13), 'torso');
        if (killed) hud.addKillfeed(explosion.thrower.name, bot.name, false, explosion.thrower.isPlayer);
      }
    }
    if (playerAlive) {
      const dist = playerState.position.distanceTo(explosion.point);
      if (dist < 6) hurtPlayer(Math.max(20, 100 - dist * 13), explosion.thrower);
    }
  }

  weapons.step(dt);
  effects.step(dt);
  if (playerAlive) combat.updatePlayerHit(playerState.position, playerState.eye);

  // Camera: eyes, with a field of view that narrows while aiming down sights.
  camera.position.set(playerState.position.x, playerState.position.y + playerState.eye, playerState.position.z);
  camera.rotation.set(playerState.pitch, playerState.yaw, 0);
  const targetFov = playerState.aiming ? 75 * weapons.def().zoom : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
  if (world.beacon) world.beacon.intensity = 12 + Math.sin(now * 2) * 4;
  input.drainPressed();
}

function frame(frameNow) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (frameNow - lastFrame) / 1000);
  lastFrame = frameNow;
  if (!frozen) {
    accumulator += frameDt;
    let guard = 0;
    while (accumulator >= STEP && guard < 40) {
      step(STEP);
      accumulator -= STEP;
      guard += 1;
    }
    if (guard >= 40) accumulator = 0;
  }
  renderer.render(scene, camera);
  framesRendered += 1;
  const r = rounds.state;
  hud.render({
    rounds: r,
    now,
    hp: playerHp,
    armor: r.armor,
    money: r.money,
    ammo: weapons.ammo(),
    frags: r.frags,
    aliveV: bots.aliveCount('vanguard') + (playerAlive ? 1 : 0),
    aliveD: bots.aliveCount('dustjack'),
    message: now < messageUntil ? message : '',
    channel: plantChannel > 0 ? { kind: 'plant', progress: plantChannel / 3.5 } : null,
    buyOpen,
    menu: rounds.menu(),
    spread: weapons.spread(player.groundSpeed(), playerState.aiming),
    aiming: playerState.aiming,
  });
  if (shotMode && framesRendered >= 2 && !window.__shotReady) window.__shotReady = true;
}

requestAnimationFrame(frame);
