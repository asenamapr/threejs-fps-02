# Dustfall Line — a three.js tactical FPS

A complete, original, round-based tactical FPS that runs offline from static files.
You are Vanguard: four agents against four Dustjacks on an original desert-industrial
yard, Dustfall Yard. Win rounds by eliminating the Dustjacks or by planting the charge
at the Relay (north end) and holding it for thirty seconds. Money from kills and rounds
buys rifles, armour and grenades in the buy phase between rounds. First to five rounds,
best of nine, takes the yard.

## How to play

Serve the game locally and open it in a browser:

```sh
node serve.ts
# open http://localhost:8123
```

Click to play (pointer lock). The game needs no network: three.js 0.187.0 is vendored
in `game/vendor/`, and every sound is synthesized with WebAudio.

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Left click | Fire |
| Right click | Aim down sights |
| R | Reload |
| G | Throw a frag grenade |
| E (hold) | Plant the charge at the Relay |
| B | Buy menu (buy phase) |
| 1–4 | Switch weapon |
| Space | Jump |
| Ctrl / C | Crouch |

## The game

- **Map** — Dustfall Yard, 46 × 34 m, built from plain geometry: two lanes (A west,
  B east), a mid connector under a watchtower, and the Relay pad at the north end.
  Every wall and crate is a collider and a surface a bullet stops on.
- **Bots** — seven of them. Three Vanguard teammates walk lanes with you; four
  Dustjacks hold angles, rotate between holds, and push the Relay. They see with a
  raycast (limited range and view cone), hear gunfire inside 26 m, react after a
  human delay, fire in bursts with aim error that grows with distance, strafe while
  fighting, and play the objective: attackers plant, defenders defuse.
- **Combat** — hitscan guns with spread that grows with movement and shrinks while
  aiming, headshots at 3× damage, armour that absorbs half, tracers, impact sparks
  and a bouncing frag grenade with radius damage.
- **Economy** — $800 to start, $300 a kill, $3,250 a round win, $1,400 a round loss.
  Buy menu: Sidewinder P9 ($0), Rattler SMG ($1,500), Longhorn AR ($2,500),
  Dunehawk DMR ($4,750), plated vest ($650), frag grenade ($300, max 2).
- **Rounds** — 15 s buy phase, 100 s live, first to 5 (best of 9). A planted charge
  is a 30-second clock the defenders must beat by defusing it.

## Files

```
main.ts            entrypoint: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts           dev server (node serve.ts)
game/
  index.html       page + HUD
  vendor/          three.js 0.187.0 (vendored, byte-identical to the kit)
  src/
    main.js        boot, fixed-step loop, player actions, shot staging
    world.js       the map, colliders, lanes, spawns, the Relay
    player.js      movement, crouch, jump, aim
    input.js       keyboard, mouse, pointer lock
    weapons.js     four guns, view models, reload, buy catalogue
    bots.js        bot agents: sight, hearing, lanes, bursts, plant/defuse
    combat.js      hitscan raycast, line of sight, grenade physics
    effects.js     tracers, impact sparks, explosions (pooled)
    audio.js       synthesized WebAudio sounds
    rounds.js      round state machine and the economy
    hud.js         DOM HUD: health, ammo, money, timer, killfeed, buy menu
    palette.js     the colour plan
    rng.js         one seeded random source (mulberry32)
screenshots/     4 staged captures (start, play, buy, end)
shots.json       captions for the 4 screenshots
LICENSE            MIT
README.md          this file
```

## Captures

The four screenshots are staged with `?shot=start|play|buy|end` — the same game,
run deterministically from a seed, frozen on the frame that shows each moment:
the title screen, a mid-round firefight with a tracer in the air, the buy menu,
and a round won at the Relay.

## License

MIT — see LICENSE.
