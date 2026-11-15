// Weapons: four hitscan guns, one state machine. The module owns the numbers, the view
// models and the reload; main.js owns the ray and the damage. Spread grows with movement
// and shrinks while aiming down sights, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Sidewinder P9', price: 0, magSize: 12, reserve: 48,
    damage: 26, headDamage: 78, fireGap: 0.16, reloadTime: 1.4,
    spreadStill: 0.004, spreadMoving: 0.03, zoom: 1.0, kick: 0.035, auto: true,
  },
  smg: {
    id: 'smg', name: 'Rattler SMG', price: 1500, magSize: 32, reserve: 96,
    damage: 26, headDamage: 78, fireGap: 0.07, reloadTime: 1.7,
    spreadStill: 0.006, spreadMoving: 0.034, zoom: 1.0, kick: 0.028, auto: true,
  },
  rifle: {
    id: 'rifle', name: 'Longhorn AR', price: 2500, magSize: 30, reserve: 90,
    damage: 34, headDamage: 100, fireGap: 0.096, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, zoom: 1.0, kick: 0.05, auto: true,
  },
  sniper: {
    id: 'sniper', name: 'Dunehawk DMR', price: 4750, magSize: 5, reserve: 15,
    damage: 88, headDamage: 220, fireGap: 1.1, reloadTime: 2.6,
    spreadStill: 0.0008, spreadMoving: 0.05, zoom: 0.45, kick: 0.11, auto: true,
  },
};

export const BUY_MENU = [
  { key: 'Digit1', id: 'pistol', label: 'Sidewinder P9 — pistol' },
  { key: 'Digit2', id: 'smg', label: 'Rattler SMG' },
  { key: 'Digit3', id: 'rifle', label: 'Longhorn AR' },
  { key: 'Digit4', id: 'sniper', label: 'Dunehawk DMR' },
  { key: 'Digit5', id: 'armor', label: 'Plated vest — absorbs half of damage' },
  { key: 'Digit6', id: 'frag', label: 'Dust frag grenade' },
];
export const ARMOR_PRICE = 650;
export const FRAG_PRICE = 300;

const GRIP = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
const BODY = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dusk), roughness: 0.45, metalness: 0.55 });
const DARK = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dusk), roughness: 0.6, metalness: 0.3 });
const ACCENT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.2,
  emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35,
});

function box(w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

function buildModel(id) {
  const model = new THREE.Group();
  if (id === 'pistol') {
    model.add(box(0.05, 0.09, 0.24, 0, 0, -0.1, BODY));
    model.add(box(0.045, 0.07, 0.1, 0, -0.07, 0.06, GRIP));
    model.add(box(0.052, 0.02, 0.1, 0, 0.045, -0.1, ACCENT));
  } else if (id === 'smg') {
    model.add(box(0.08, 0.09, 0.34, 0, 0, -0.08, BODY));
    model.add(box(0.04, 0.04, 0.26, 0, 0.02, -0.34, GRIP));
    model.add(box(0.06, 0.12, 0.08, 0, -0.08, 0.02, GRIP));
    model.add(box(0.082, 0.02, 0.2, 0, 0.05, -0.08, ACCENT));
  } else if (id === 'sniper') {
    model.add(box(0.07, 0.09, 0.62, 0, 0, -0.16, DARK));
    model.add(box(0.04, 0.04, 0.5, 0, 0.02, -0.5, GRIP));
    model.add(box(0.05, 0.05, 0.14, 0, 0.06, -0.12, BODY));
    model.add(box(0.07, 0.08, 0.2, 0, -0.02, 0.24, GRIP));
    model.add(box(0.072, 0.02, 0.3, 0, 0.05, -0.16, ACCENT));
  } else {
    model.add(box(0.09, 0.1, 0.42, 0, 0, -0.05, BODY));
    model.add(box(0.045, 0.045, 0.4, 0, 0.025, -0.42, GRIP));
    model.add(box(0.075, 0.08, 0.22, 0, -0.02, 0.26, GRIP));
    model.add(box(0.092, 0.02, 0.24, 0, 0.055, -0.05, ACCENT));
  }
  // Big, low and angled toward the crosshair, so the gun reads in the lower right.
  model.position.set(0.26, -0.23, -0.5);
  model.rotation.y = 0.12;
  model.scale.setScalar(1.25);
  return model;
}

export function createWeapons(camera) {
  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    models[id] = buildModel(id);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.21, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.19, -0.7);
  camera.add(flashLight);

  const owned = {
    pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve },
  };
  const state = {
    current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, switching: 0,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.switching = Math.max(0, state.switching - dt);
    const model = models[state.current];
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = owned[state.current];
        const need = def().magSize - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    def,
    step,
    current() {
      return state.current;
    },
    ammo() {
      const slot = owned[state.current];
      return { mag: slot.mag, reserve: slot.reserve, name: def().name };
    },
    ready() {
      const slot = owned[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switching === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = 0.06;
      state.kick = def().kick;
    },
    takeRound() {
      const slot = owned[state.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const slot = owned[state.current];
      if (state.reloadLeft > 0 || slot.mag === def().magSize || slot.reserve === 0) return;
      state.reloadLeft = def().reloadTime;
    },
    spread(speed, aiming) {
      const d = def();
      const base = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMoving;
      return aiming ? base * 0.45 : base;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserve };
      return true;
    },
    has(id) {
      return Boolean(owned[id]);
    },
    switchTo(id) {
      if (!owned[id] || id === state.current || state.reloadLeft > 0) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.switching = 0.25;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    refillAll() {
      for (const id of Object.keys(owned)) {
        owned[id].mag = WEAPONS[id].magSize;
        owned[id].reserve = WEAPONS[id].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
