# CHAINSAW MAN — Blood & Chains

A playable, offline third-person action **vertical slice** of the warehouse origin story. This is an unofficial fan project with original procedural artwork, animation, effects and synthesized audio.

## Play

On this computer, double-click `START_GAME.cmd`, then open **http://localhost:4317** in Chrome or Edge. Keep the server window open. Node.js 18 or newer is required for the local server; it is already installed on the development computer.

Alternatively, run `npm start` or `node server.cjs` from this folder. No installation step, account, API key, CDN, or internet connection is needed. The Three.js engine is included in `vendor/`. An occupied port can be changed with the `PORT` environment variable.

The entire game is available locally. A service worker also caches the game after a successful browser load, allowing subsequent offline reloads at the same address. Clearing the browser's site data removes the cache and local progress. The first load needs the local server to be running.

## Included

- One complete mission: short in-engine prologue, exploration with Pochita and a debt ledger, betrayal/contract, starter-cord transformation, two enemy waves, a two-phase Zombie Devil fight, and a Makima epilogue.
- Human and chainsaw Denji, Pochita, three zombie variants, Zombie Devil and Makima. The original models use shaped cross-section geometry and hierarchical articulated rigs, with procedural animation and moving saw chains.
- Light attack chains, buffered inputs, heavy attacks, a light-light-heavy launcher, follow-up hits on airborne enemies, directional dodge, perfect dodge, timed parry, counter openings, lock-on and a blood-powered area special.
- Enemy coordination, windups, damage reactions, blood recovery, boss slam/sweep/charge attacks and a faster second phase.
- Destructible crates and drums, pooled sparks/blood/slash effects, manga impact frames, cinematic camera shots, rain, industrial ambience and adaptive procedural music.
- A training room with active opponents and regenerating health/fuel; checkpoint continue/restart; local best rank, completed-mission trophies, two three-level upgrades and saved settings.
- Quality, difficulty, volume, camera sensitivity, shake and impact-flash settings.

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move relative to camera |
| Shift | Sprint |
| Mouse drag | Orbit camera |
| Middle mouse | Capture mouse for continuous camera control |
| Mouse wheel | Camera distance |
| Left mouse / J | Light attack |
| Right mouse / K | Heavy attack |
| Space | Directional dodge; uses last movement direction |
| Q | Parry; time it just before the strike |
| E | Talk or examine nearby object |
| R | First transformation when prompted |
| F | Rip & Tear: 35 blood, seven-second cooldown |
| C | Lock nearest enemy / return to free camera |
| Tab | Field manual |
| Escape | Pause / resume; leave mouse capture |
| Enter | Skip current cinematic |

Two lights followed by a heavy launch smaller enemies. Hits replenish fuel; kills replenish health and fuel. A perfect parry exposes an enemy to a counterattack. The boss takes increased damage while recovering; ordinary hits cannot indefinitely stun it. Red ground indicators show incoming attack areas. Beating the mission awards trophies that can be spent on increased blood recovery and engine efficiency.

## Scope and current limitations

This is one compact, playable warehouse mission, **not the full ten-mission Chapter One campaign or an AAA production**. The separate rainy-street mission, Public Safety exploration, Bat/Leech Devils, hotel/Eternity Devil, ambush, Kishibe training storyline, assault and Katana Man finale are not implemented. The story stops at the warehouse epilogue; no later arc appears.

Character motion is procedural articulated animation, not motion capture or a full authored skeletal-animation asset library. Dialogue has subtitles and sound design, but no recorded voice acting. The combat supports a launcher and airborne follow-up hits, but not a dedicated jump/free-flight moveset. Ragdolls, generalized building destruction, full key rebinding, gamepad and touch controls are not included. Desktop keyboard/mouse and WebGL 2 are required. Performance varies with browser, GPU and graphics settings.

Checkpoints restart an encounter with restored health; saves do not preserve an exact mid-fight snapshot. Trophies are banked on mission completion. Settings and progress are stored only in this browser and origin. Training cannot overwrite a story checkpoint.

## Source layout

| File | Responsibility |
|---|---|
| `src/main.js` | Mission flow, input, rendering, integration |
| `src/combat.js` | Independent simulation, AI, damage, defense, combo rules |
| `src/camera.js` | Follow/orbit/lock camera, collider avoidance, cinematic timeline |
| `src/models.js` | Original character geometry, rigs and animation |
| `src/world.js` | Warehouse, materials, lights and props |
| `src/effects.js` | Reusable particle, slash and shockwave pools |
| `src/audio.js` | Original Web Audio synthesis and adaptive score |
| `src/save.js` | Versioned, validated local persistence |
| `src/panels.js` | Menus, settings, result screens and upgrades |
| `sw.js` | Offline asset caching |

## Verification

`npm test` runs combat, save, simulation and lifecycle tests without additional packages. Browser QA additionally requires Google Chrome and Playwright: install Chrome, then run `npm install --no-save --package-lock=false playwright` in this folder. Start the local server in another terminal, then run `npm run test:browser`. These extra dependencies are only needed to run browser tests, not to play the game. The browser suite exercises UI input, a complete fight, death/retry, settings, upgrades, training and offline reload; it stores generated screenshots/results under the ignored `tests/artifacts/` directory.

`window.__bloodAndChains.state()` exposes a read-only diagnostic snapshot for local testing. There is no mutation/cheat endpoint.

See `ATTRIBUTION.md` and `vendor/THREE-LICENSE.txt` for credits.
