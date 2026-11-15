// HUD: all DOM, no canvas drawing. One render(snapshot) per frame keeps the bars,
// the timer, the ammo and the killfeed in step with the simulation. The buy menu is
// built once and refreshed when it opens; clicks call back into the game.
export function createHud(onBuy) {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'),
    timer: $('timer'),
    score: $('score'),
    alive: $('alive'),
    objective: $('objective'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    armorFill: $('armor-fill'),
    armorText: $('armor-text'),
    money: $('money'),
    ammo: $('ammo'),
    weapon: $('weapon-name'),
    frags: $('frags'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    message: $('message'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('vignette'),
    channel: $('channel'),
    channelFill: $('channel-fill'),
    channelLabel: $('channel-label'),
    buy: $('buy-menu'),
    buyItems: $('buy-items'),
    buyMoney: $('buy-money'),
  };
  const feed = [];
  let lastDamageAt = -10;
  let hitAt = -10;
  let hitKill = false;

  function render(snapshot) {
    const r = snapshot.rounds;
    els.timer.textContent = r.phase === 'over' ? '—' : `${Math.max(0, Math.ceil(r.timeLeft))}s`;
    els.timer.classList.toggle('urgent', r.phase === 'live' && r.timeLeft <= 15);
    els.score.textContent = `Vanguard ${r.wins.vanguard} — ${r.wins.dustjack} Dustjacks · Round ${r.round}/9`;
    els.alive.textContent = `Alive — Vanguard ${snapshot.aliveV} · Dustjacks ${snapshot.aliveD}`;
    els.objective.textContent = r.chargePlanted
      ? `Charge planted — detonates in ${Math.max(0, Math.ceil(r.detonateLeft))}s`
      : r.phase === 'buy'
        ? 'Buy phase — B opens the buy menu'
        : 'Objective: plant the charge at the Relay (north)';
    els.healthFill.style.width = `${Math.max(0, snapshot.hp)}%`;
    els.healthText.textContent = `${Math.max(0, Math.ceil(snapshot.hp))}`;
    els.armorFill.style.width = `${Math.max(0, snapshot.armor)}%`;
    els.armorText.textContent = `${Math.max(0, Math.ceil(snapshot.armor))}`;
    els.money.textContent = `$${snapshot.money}`;
    els.ammo.textContent = snapshot.ammo.mag === 0 && snapshot.ammo.reserve === 0 ? '—' : `${snapshot.ammo.mag} / ${snapshot.ammo.reserve}`;
    els.weapon.textContent = snapshot.ammo.name;
    els.frags.textContent = snapshot.frags > 0 ? `Grenades: ${snapshot.frags} (G)` : '';
    els.crosshair.style.setProperty('--spread', `${4 + snapshot.spread * 900}px`);
    els.crosshair.classList.toggle('ads', snapshot.aiming);

    if (r.banner && snapshot.now < r.bannerUntil) {
      els.banner.textContent = r.banner;
      els.banner.classList.add('show');
    } else {
      els.banner.classList.remove('show');
    }
    els.message.textContent = snapshot.message || '';

    if (snapshot.channel) {
      els.channel.classList.add('show');
      els.channelFill.style.width = `${Math.round(snapshot.channel.progress * 100)}%`;
      els.channelLabel.textContent = snapshot.channel.kind === 'plant' ? 'Planting the charge…' : 'Defusing the charge…';
    } else {
      els.channel.classList.remove('show');
    }

    const sinceDamage = snapshot.now - lastDamageAt;
    els.vignette.style.opacity = sinceDamage < 0.6 ? String(0.55 * (1 - sinceDamage / 0.6)) : '0';
    const sinceHit = snapshot.now - hitAt;
    els.hitmarker.classList.toggle('show', sinceHit < 0.15);
    els.hitmarker.classList.toggle('kill', hitKill && sinceHit < 0.15);

    els.buy.classList.toggle('show', snapshot.buyOpen);
    if (snapshot.buyOpen) {
      els.buyMoney.textContent = `Money: $${snapshot.money}`;
      const html = snapshot.menu.map((item) => {
        const price = item.owned ? 'owned' : `$${item.price}`;
        const afford = !item.owned && snapshot.money < item.price ? ' · too expensive' : '';
        return `<button data-item="${item.id}" class="buy-item${item.owned ? ' owned' : ''}${snapshot.money < item.price && !item.owned ? ' poor' : ''}">
          <span class="buy-key">${item.key.replace('Digit', '')}</span>
          <span class="buy-label">${item.label}</span>
          <span class="buy-price">${price}${afford}</span>
        </button>`;
      }).join('');
      if (els.buyItems.dataset.html !== html) {
        els.buyItems.innerHTML = html;
        els.buyItems.dataset.html = html;
        for (const button of els.buyItems.querySelectorAll('button')) {
          button.addEventListener('click', () => onBuy(button.dataset.item));
        }
      }
    }
  }

  function addKillfeed(killer, victim, headshot, killerIsPlayer) {
    feed.unshift({ killer, victim, headshot, killerIsPlayer, at: performance.now() });
    while (feed.length > 5) feed.pop();
    els.killfeed.innerHTML = feed.map((entry) => (
      `<div class="feed-line${entry.killerIsPlayer ? ' me' : ''}">
        <span>${entry.killer}</span>
        <span class="feed-skull">${entry.headshot ? '◉' : '✕'}</span>
        <span>${entry.victim}</span>
      </div>`
    )).join('');
  }

  function damage(now) {
    lastDamageAt = now;
  }

  function hitmarker(now, kill) {
    hitAt = now;
    hitKill = kill;
  }

  return { render, addKillfeed, damage, hitmarker };
}
