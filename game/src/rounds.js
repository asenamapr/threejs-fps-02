// Rounds and the economy. A match is a first-to-5, best of 9, between Vanguard
// (the player attacks) and the Dustjacks (defend the Relay). Each round: a buy phase,
// a live phase, then a result. Money is the tactics: kills pay, wins pay more, and a
// lost round still pays enough to re-arm. The charge, once planted, is a 30-second
// clock the defenders must beat.
import { WEAPONS, BUY_MENU, ARMOR_PRICE, FRAG_PRICE } from './weapons.js';
import { SITE } from './world.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const DETONATE_SECONDS = 30;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const ROUND_WIN = 3250;
const ROUND_LOSS = 1400;
const OBJECTIVE_REWARD = 300;

export function createRounds(hooks) {
  const state = {
    phase: 'buy',
    round: 1,
    wins: { vanguard: 0, dustjack: 0 },
    timeLeft: BUY_SECONDS,
    money: 800,
    armor: 0,
    frags: 0,
    chargePlanted: false,
    detonateLeft: 0,
    plantChannel: 0,
    defuseChannel: 0,
    banner: null,
    bannerUntil: 0,
    over: false,
    winner: null,
  };

  function setBanner(text, seconds, now) {
    state.banner = text;
    state.bannerUntil = now + seconds;
  }

  function startBuy(now) {
    state.phase = 'buy';
    state.timeLeft = BUY_SECONDS;
    state.chargePlanted = false;
    state.detonateLeft = 0;
    state.plantChannel = 0;
    state.defuseChannel = 0;
    hooks.onBuyPhase(state.round);
  }

  function startLive(now) {
    state.phase = 'live';
    state.timeLeft = ROUND_SECONDS;
    setBanner(`Round ${state.round} — take the Relay`, 2.5, now);
    hooks.onLivePhase(state.round);
  }

  function endRound(winner, reason, now) {
    state.phase = 'over';
    state.wins[winner] += 1;
    state.money += winner === 'vanguard' ? ROUND_WIN : ROUND_LOSS;
    const reasonText = {
      elimination: winner === 'vanguard' ? 'Dustjacks eliminated' : 'Vanguard eliminated',
      detonation: 'The charge detonated',
      defused: 'The charge was defused',
      time: 'Time expired — the Relay holds',
    }[reason] || reason;
    setBanner(`${winner === 'vanguard' ? 'Round won' : 'Round lost'} — ${reasonText}`, 3.5, now);
    hooks.onRoundEnd(winner, reason, { ...state.wins });
    if (state.wins.vanguard >= WIN_ROUNDS || state.wins.dustjack >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.over = true;
      state.winner = state.wins.vanguard > state.wins.dustjack ? 'vanguard' : 'dustjack';
      hooks.onMatchEnd(state.winner, { ...state.wins });
    } else {
      state.round += 1;
      startBuy(now);
    }
  }

  function step(dt, now, ctx) {
    if (state.over) return;
    if (state.phase === 'buy') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) startLive(now);
      return;
    }
    if (state.phase !== 'live') return;
    state.timeLeft -= dt;
    if (state.chargePlanted) {
      state.detonateLeft -= dt;
      if (state.detonateLeft <= 0) {
        endRound('vanguard', 'detonation', now);
        return;
      }
    }
    if (state.timeLeft <= 0) {
      endRound('dustjack', 'time', now);
      return;
    }
    const vanguardAlive = ctx.aliveCount('vanguard');
    const dustjackAlive = ctx.aliveCount('dustjack');
    // A planted charge still decides the round: attackers dead does not stop the clock,
    // and defenders dead means nobody can defuse it.
    if (vanguardAlive === 0 && !state.chargePlanted) endRound('dustjack', 'elimination', now);
    else if (dustjackAlive === 0) endRound('vanguard', 'elimination', now);
  }

  return {
    state,
    startBuy,
    startLive,
    endRound,
    step,
    plantCharge(now) {
      state.chargePlanted = true;
      state.detonateLeft = DETONATE_SECONDS;
      setBanner('Charge planted — 30 seconds to detonation', 3, now);
    },
    defuseCharge(now) {
      state.chargePlanted = false;
      state.detonateLeft = 0;
    },
    killReward(killerIsPlayer) {
      if (killerIsPlayer) state.money += KILL_REWARD;
    },
    objectiveReward() {
      state.money += OBJECTIVE_REWARD;
    },
    inSite(position) {
      return position.x > SITE.minX && position.x < SITE.maxX && position.z > SITE.minZ && position.z < SITE.maxZ;
    },
    buy(itemId) {
      if (state.phase !== 'buy') return { ok: false, reason: 'The buy phase is over' };
      if (itemId === 'armor') {
        if (state.armor >= 100) return { ok: false, reason: 'Vest already full' };
        if (state.money < ARMOR_PRICE) return { ok: false, reason: 'Not enough money' };
        state.money -= ARMOR_PRICE;
        state.armor = 100;
        return { ok: true };
      }
      if (itemId === 'frag') {
        if (state.frags >= 2) return { ok: false, reason: 'Carrying the maximum of 2' };
        if (state.money < FRAG_PRICE) return { ok: false, reason: 'Not enough money' };
        state.money -= FRAG_PRICE;
        state.frags += 1;
        return { ok: true };
      }
      const weapon = WEAPONS[itemId];
      if (!weapon) return { ok: false, reason: 'Unknown item' };
      if (hooks.hasWeapon(itemId)) return { ok: false, reason: 'Already owned' };
      if (state.money < weapon.price) return { ok: false, reason: 'Not enough money' };
      state.money -= weapon.price;
      hooks.giveWeapon(itemId);
      return { ok: true };
    },
    menu() {
      return BUY_MENU.map((item) => ({
        ...item,
        price: item.id === 'armor' ? ARMOR_PRICE : item.id === 'frag' ? FRAG_PRICE : WEAPONS[item.id].price,
        owned: item.id === 'armor' ? state.armor >= 100 : item.id === 'frag' ? state.frags >= 2 : hooks.hasWeapon(item.id),
      }));
    },
  };
}
